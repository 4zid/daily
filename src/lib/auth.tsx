import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type Session, type User } from '@supabase/supabase-js';
import { hasAuthCode, startupLink, type EmailLinkType, type StartupLink } from './emailLink';
import { consentMetadata } from './legal';
import { authRedirectUrl, supabase, type Profile } from './supabase';

// Con la confirmación de email prendida, si el email ya tiene cuenta Supabase responde como si
// la creara (para no revelar quién está registrado) pero no manda ningún email: devuelve el
// usuario sin identidades. Sin esto, la pantalla pediría confirmar un email que nunca llega.
function assertNewAccount(user: User | null) {
  if (user && user.identities?.length === 0) throw new Error('User already registered');
}

type Status = 'loading' | 'signed-out' | 'signed-in' | 'no-profile' | 'recovery';

/** Lo que pasó con el link de un email con el que se abrió la app (ver lib/emailLink.ts). */
export type EmailLinkState =
  // Verificando el token del link.
  | { step: 'checking' }
  // Email confirmado al crear la cuenta: quedó la sesión iniciada, también en otro dispositivo.
  | { step: 'confirmed' }
  // Cambio de email completo, o confirmado solo desde una de las dos direcciones.
  | { step: 'email-changed' }
  | { step: 'email-change-half' }
  // Vencido, ya usado o roto (`type`: de qué era el link, si se sabe).
  | { step: 'invalid'; type: EmailLinkType | null }
  // Sin conexión al verificar: se puede probar de nuevo.
  | { step: 'offline' };

interface AuthValue {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  // `consent: true` obliga a quien crea la cuenta a haber aceptado los Términos y la Política
  // de privacidad (y, el paciente, el uso de sus datos de salud): cualquier alta nueva, por
  // ejemplo con otro proveedor de ingreso, tiene que pedirlo antes de empezar.
  signUpTherapist: (input: { name: string; email: string; password: string; consent: true }) => Promise<{ needsConfirmation: boolean }>;
  signUpPatient: (input: {
    name: string;
    email: string;
    password: string;
    code: string;
    consent: true;
  }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  /** Vuelve a mandar el email para confirmar la cuenta (si todavía no está confirmada). */
  resendConfirmation: (email: string) => Promise<void>;
  emailLink: EmailLinkState | null;
  /** Cierra la pantalla del link y deja pasar a la app (o al ingreso). */
  dismissEmailLink: () => void;
  /** Vuelve a verificar el link después de un error de conexión. */
  retryEmailLink: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

type TokenLink = Extract<StartupLink, { kind: 'token' }>;

// El token del link sirve una sola vez: se verifica una única vez por carga, aunque el efecto
// corra dos veces (modo estricto de React). Solo un error de conexión permite reintentarlo.
let verification: Promise<{ session: Session | null; error: unknown }> | null = null;

function verifyLink(link: TokenLink) {
  verification ??= supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type }).then(
    ({ data, error }) => ({ session: data.session, error }),
    (error: unknown) => ({ session: null, error }),
  );
  return verification;
}

function initialLinkState(): EmailLinkState | null {
  if (startupLink?.kind === 'token') return { step: 'checking' };
  if (startupLink?.kind === 'invalid') return { step: 'invalid', type: startupLink.type };
  return null;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id, role, full_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [emailLink, setEmailLink] = useState<EmailLinkState | null>(initialLinkState);
  // Un link de siempre de Supabase ("?code="): si Supabase lo canjea (lo saca de la dirección)
  // y entra sin pasar por la recuperación de contraseña, era el de confirmar el email.
  const codeLinkRef = useRef(startupLink?.kind === 'code');
  // Entró con el link de "olvidé mi contraseña": hasta elegir una nueva, no pasa a la app
  // (aunque otros eventos de sesión lleguen después).
  const recoveryRef = useRef(false);
  // Solo vale el último cambio de sesión: uno anterior que termina tarde no lo pisa.
  const seqRef = useRef(0);

  const applySession = useCallback(async (next: Session | null, recovery = false) => {
    const seq = ++seqRef.current;
    if (recovery) recoveryRef.current = true;
    setSession(next);
    if (!next) {
      recoveryRef.current = false;
      setProfile(null);
      setStatus('signed-out');
      return;
    }
    if (recoveryRef.current) {
      setStatus('recovery');
      return;
    }
    try {
      const p = await loadProfile(next.user.id);
      if (seq !== seqRef.current) return;
      setProfile(p);
      setStatus(p ? 'signed-in' : 'no-profile');
    } catch {
      if (seq !== seqRef.current) return;
      setProfile(null);
      setStatus('no-profile');
    }
  }, []);

  // Verifica el link de un email (`current`: la sesión que ya había en este navegador, que
  // sigue si el link no sirve). Con el link de recuperación pasa a elegir la contraseña.
  const checkLink = useCallback(
    async (link: TokenLink, current: Session | null) => {
      setEmailLink({ step: 'checking' });
      const { session, error } = await verifyLink(link);
      if (error) {
        const offline = isAuthRetryableFetchError(error);
        if (offline) verification = null;
        setEmailLink(offline ? { step: 'offline' } : { step: 'invalid', type: link.type });
        await applySession(current);
      } else if (link.type === 'recovery') {
        setEmailLink(null);
        await applySession(session, true);
      } else if (link.type === 'email_change') {
        // Con el cambio seguro de email, el primero de los dos links no inicia sesión.
        setEmailLink({ step: session ? 'email-changed' : 'email-change-half' });
        await applySession(session ?? current);
      } else {
        // "email" es el de confirmar la cuenta (y el del link mágico, si algún día se usa:
        // también confirma el email y entra igual).
        setEmailLink({ step: 'confirmed' });
        await applySession(session);
      }
    },
    [applySession],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (startupLink?.kind === 'token') void checkLink(startupLink, data.session);
      else void applySession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        codeLinkRef.current = false;
        void applySession(next, true);
      } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        if (event === 'SIGNED_IN' && codeLinkRef.current && !hasAuthCode()) {
          codeLinkRef.current = false;
          setEmailLink({ step: 'confirmed' });
        }
        // Evita llamar a Supabase dentro del callback (puede bloquear la sesión).
        setTimeout(() => active && void applySession(next), 0);
      } else if (event === 'TOKEN_REFRESHED') setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySession, checkLink]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      session,
      profile,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },
      async signUpTherapist({ name, email, password }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // El consentimiento queda en los datos de la cuenta (ver consentMetadata en lib/legal.ts).
          options: {
            data: { role: 'therapist', full_name: name.trim(), ...consentMetadata('therapist') },
            emailRedirectTo: authRedirectUrl(),
          },
        });
        if (error) throw error;
        assertNewAccount(data.user);
        return { needsConfirmation: !data.session };
      },
      async signUpPatient({ name, email, password, code }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              role: 'patient',
              full_name: name.trim(),
              invite_code: code.trim().toUpperCase(),
              ...consentMetadata('patient'),
            },
            emailRedirectTo: authRedirectUrl(),
          },
        });
        if (error) throw error;
        assertNewAccount(data.user);
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
        if (error) throw error;
      },
      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: authRedirectUrl() },
        });
        if (error) throw error;
      },
      emailLink,
      dismissEmailLink() {
        setEmailLink(null);
      },
      async retryEmailLink() {
        if (startupLink?.kind !== 'token') return;
        const { data } = await supabase.auth.getSession();
        await checkLink(startupLink, data.session);
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        // Sale del modo recuperación y carga el perfil.
        recoveryRef.current = false;
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
      },
      async updateName(name) {
        if (!session) return;
        const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session.user.id);
        if (error) throw error;
        setProfile((p) => (p ? { ...p, full_name: name.trim() } : p));
      },
      async reloadProfile() {
        setStatus('loading');
        await applySession(session);
      },
    }),
    [status, session, profile, emailLink, applySession, checkLink],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

/** Token de la sesión actual, para llamar a la API propia (IA). */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
