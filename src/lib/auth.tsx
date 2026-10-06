import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './supabase';

type Status = 'loading' | 'signed-out' | 'signed-in' | 'no-profile' | 'recovery';

interface AuthValue {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUpTherapist: (input: { name: string; email: string; password: string }) => Promise<{ needsConfirmation: boolean }>;
  signUpPatient: (input: { name: string; email: string; password: string; code: string }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id, role, full_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
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

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void applySession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') void applySession(next, true);
      else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Evita llamar a Supabase dentro del callback (puede bloquear la sesión).
        setTimeout(() => active && void applySession(next), 0);
      } else if (event === 'TOKEN_REFRESHED') setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySession]);

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
          options: { data: { role: 'therapist', full_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      async signUpPatient({ name, email, password, code }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { role: 'patient', full_name: name.trim(), invite_code: code.trim().toUpperCase() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
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
    [status, session, profile, applySession],
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
