import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ChartColumn,
  Eye,
  EyeOff,
  Link2,
  LockKeyhole,
  Mail,
  MailCheck,
  NotebookPen,
  Sparkles,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { lookupInvitation } from '../lib/cloud';
import { EMAIL_SENDER, LEGAL_EMAIL, consentKinds, type ConsentKind } from '../lib/legal';
import { navigate } from '../lib/route';
import { markOnboardingSeen } from '../lib/store';
import { authErrorMessage } from '../lib/supabase';
import { Brand, Initials, useCooldown } from './common';
import { LegalLink, LegalOwner } from './Legal';

type Mode = 'login' | 'signup' | 'forgot' | 'sent' | 'confirm';
export type Role = 'therapist' | 'patient';

interface InviteInfo {
  status: 'idle' | 'loading' | 'valid' | 'invalid' | 'error';
  therapistName?: string;
}

const MIN_PASSWORD = 8;
// Supabase deja pasar un minuto entre un email y otro a la misma persona.
export const RESEND_SECONDS = 60;

const POINTS: Record<Role, [LucideIcon, string][]> = {
  patient: [
    [NotebookPen, 'Registrá tus actividades con placer y control, del 1 al 10.'],
    [Sparkles, 'Si preferís, contale tu día a la IA y lo ordena por vos.'],
    [LockKeyhole, 'Ningún otro usuario de daily ve tus registros: solo vos y tu terapeuta.'],
  ],
  therapist: [
    [Link2, 'Invitá a tus pacientes con un link: su cuenta queda vinculada a la tuya.'],
    [ChartColumn, 'Mirá cada semana: actividades, placer, control y ánimo.'],
    [LockKeyhole, 'Tus notas de sesión son privadas: tu paciente no las ve en la app.'],
  ],
};

const HEADINGS: Record<Role, ReactNode> = {
  patient: (
    <>
      Tu día, ordenado. <b>Tu terapeuta, al tanto.</b>
    </>
  ),
  therapist: (
    <>
      El registro de tus pacientes, <b>semana a semana.</b>
    </>
  ),
};

/** Acepta el código solo o el link entero pegado en el campo. */
function cleanCode(value: string): string {
  const fromLink = /invitacion\/([A-Za-z0-9]+)/.exec(value)?.[1];
  return (fromLink ?? value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 32);
}

export function AuthScreen({
  inviteCode,
  recovery,
  initialMode = 'login',
  fromConfirmLink = false,
}: {
  inviteCode: string | null;
  recovery: boolean;
  /** Pantalla pedida por la ruta ("#/ingresar" o "#/crear-cuenta"); sin ruta, el ingreso. */
  initialMode?: 'login' | 'signup';
  /** Llegó con un link de siempre de Supabase que no se pudo usar acá (por ejemplo, abierto en
   *  otro navegador): si era el de confirmar el email, la cuenta ya quedó confirmada. */
  fromConfirmLink?: boolean;
}) {
  const auth = useAuth();
  const ids = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(inviteCode ? 'signup' : (initialMode ?? 'login'));
  const [role, setRole] = useState<Role>(inviteCode ? 'patient' : 'therapist');
  const [code, setCode] = useState(inviteCode ?? '');
  const [fromLink, setFromLink] = useState(Boolean(inviteCode));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Una casilla por consentimiento (ver consentKinds en lib/legal.ts). Empiezan sin marcar y
  // se desmarcan si cambia lo aceptado: el rol o la invitación.
  const [consent, setConsent] = useState<Partial<Record<ConsentKind, boolean>>>({});
  const [consentError, setConsentError] = useState(false);
  const consentRefs = useRef<Partial<Record<ConsentKind, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // "Reenviar el email" en "Confirmá tu email": cuándo se puede y si ya salió.
  const resendWait = useCooldown();
  const [resent, setResent] = useState(false);
  const [invite, setInvite] = useState<InviteInfo>({ status: 'idle' });
  // Sube para volver a buscar la invitación si falló la conexión.
  const [lookupTry, setLookupTry] = useState(0);

  // Quien llega al ingreso ya no necesita la presentación (por ejemplo, desde una
  // invitación): así, después de crear la cuenta, no aparece en lugar del aviso.
  useEffect(() => {
    markOnboardingSeen();
  }, []);

  // "#/ingresar" y "#/crear-cuenta" cambian de pantalla aunque ya esté abierta.
  // Solo cuando la ruta pide una pantalla: así no pisa "Confirmá tu email" ni la recuperación.
  useEffect(() => {
    if (!inviteCode && initialMode) go(initialMode);
  }, [initialMode]);

  // Si se abre otro link de invitación con la pantalla abierta.
  useEffect(() => {
    if (!inviteCode) return;
    setCode(inviteCode);
    setFromLink(true);
    setRole('patient');
    setMode('signup');
    setConsent({});
  }, [inviteCode]);

  // Muestra de quién es la invitación antes de crear la cuenta.
  useEffect(() => {
    if (role !== 'patient' || code.length < 8) {
      setInvite({ status: 'idle' });
      return;
    }
    let active = true;
    setInvite({ status: 'loading' });
    const t = window.setTimeout(() => {
      lookupInvitation(code)
        .then((info) => {
          if (!active) return;
          setInvite(
            info?.valid ? { status: 'valid', therapistName: info.therapistName } : { status: 'invalid' },
          );
        })
        .catch(() => active && setInvite({ status: 'error' }));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [code, role, lookupTry]);

  function go(next: Mode) {
    setMode(next);
    setError('');
    setConsentError(false);
    setShowPassword(false);
    setResent(false);
    // El email de confirmación acaba de salir: el próximo, en un minuto.
    if (next === 'confirm') resendWait.start(RESEND_SECONDS);
  }

  function resendConfirmation() {
    if (busy || resendWait.left > 0) return;
    setResent(false);
    void run(async () => {
      try {
        await auth.resendConfirmation(email);
      } catch (e) {
        if (/only request this after/i.test(e instanceof Error ? e.message : '')) resendWait.start(RESEND_SECONDS);
        throw e;
      }
      resendWait.start(RESEND_SECONDS);
      setResent(true);
    });
  }

  /** "Usé otro email" (terapeutas): vuelve al alta con todo lo demás completo, para corregir el
   *  email. Al paciente no se le ofrece: su invitación ya quedó usada con el email anterior. */
  function editEmail() {
    go('signup');
    requestAnimationFrame(() => {
      emailRef.current?.focus();
      emailRef.current?.select();
    });
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (recovery) {
      void run(() => auth.updatePassword(password));
      return;
    }
    if (mode === 'login') {
      void run(() => auth.signIn(email, password));
    } else if (mode === 'forgot') {
      void run(async () => {
        await auth.requestPasswordReset(email);
        go('sent');
      });
    } else if (mode === 'signup') {
      // Sin todas las casillas marcadas no se crea la cuenta: el aviso queda junto a ellas.
      const missing = consentKinds(role).filter((kind) => !consent[kind]);
      if (missing.length) {
        setConsentError(true);
        consentRefs.current[missing[0]]?.focus();
        return;
      }
      if (role === 'therapist') {
        void run(async () => {
          const { needsConfirmation } = await auth.signUpTherapist({ name, email, password, consent: true });
          if (needsConfirmation) go('confirm');
        });
        return;
      }
      void run(async () => {
        const { needsConfirmation } = await auth.signUpPatient({ name, email, password, code, consent: true });
        // La invitación ya se usó: la URL deja de apuntar a ella.
        if (inviteCode) navigate('registro', true);
        if (needsConfirmation) go('confirm');
      });
    }
  }

  // El alta y su "Confirmá tu email" siguen con el color del rol elegido.
  const accentRole: Role = mode === 'signup' || mode === 'confirm' ? role : 'patient';
  const therapistName = invite.status === 'valid' ? invite.therapistName?.trim() : '';
  const heading =
    therapistName && mode === 'signup' ? (
      <>
        <b>{therapistName}</b> te invitó a llevar tu registro diario.
      </>
    ) : (
      HEADINGS[accentRole]
    );

  const passwordField = (label: string, autoComplete: string, hint?: string) => (
    <div className="field">
      <label htmlFor={`${ids}-password`}>{label}</label>
      <div className="password-field">
        <input
          id={`${ids}-password`}
          className="input"
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={hint ? `${ids}-password-hint` : undefined}
        />
        <button
          type="button"
          className="circle-btn ghost sm"
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {hint && (
        <small id={`${ids}-password-hint`} className="form-hint">
          {hint}
        </small>
      )}
    </div>
  );

  const emailField = (
    <div className="field">
      <label htmlFor={`${ids}-email`}>Email</label>
      <input
        ref={emailRef}
        id={`${ids}-email`}
        className="input"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  );

  // Sin título: la pantalla es un resultado (AuthResult), con su propio título.
  let title: string | null;
  let sub: ReactNode;
  let body: ReactNode;
  let foot: ReactNode;

  if (recovery) {
    title = 'Elegí una contraseña nueva';
    sub = 'Con esta vas a ingresar de ahora en más.';
    body = (
      <>
        {passwordField('Contraseña nueva', 'new-password', `Al menos ${MIN_PASSWORD} caracteres.`)}
        <SubmitButton busy={busy}>Guardar contraseña</SubmitButton>
      </>
    );
    foot = (
      <button type="button" className="link-btn" onClick={() => void auth.signOut()}>
        Cancelar
      </button>
    );
  } else if (mode === 'sent') {
    title = null;
    sub = null;
    body = (
      <AuthResult icon={MailCheck} title="Revisá tu email">
        <p>
          Si hay una cuenta con <b className="auth-result-email">{email}</b>{' '}
          te llega un link para elegir una contraseña nueva.
        </p>
        <p className="auth-result-hint">Si no lo ves en unos minutos, revisá Spam o Promociones.</p>
        <div className="auth-result-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={() => go('login')}>
            Ir a ingresar
          </button>
        </div>
      </AuthResult>
    );
    foot = null;
  } else if (mode === 'confirm') {
    title = null;
    sub = null;
    body = (
      <AuthResult icon={Mail} title="Confirmá tu email">
        <p>
          Te mandamos un email a <b className="auth-result-email">{email}</b>{' '}
          Abrilo y tocá <b>«Confirmar mi email»</b>.
        </p>
        <p className="auth-result-hint">
          Podés abrirlo en el celular. Si no lo ves en unos minutos, revisá Spam o Promociones.
        </p>
        <div className="auth-result-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={() => go('login')}>
            Ya lo confirmé · Ingresar
            <ArrowRight aria-hidden />
          </button>
          {/* aria-disabled y no disabled: así el botón no pierde el foco durante la espera. */}
          <button
            type="button"
            className={`btn btn-block${resendWait.left > 0 ? ' is-waiting' : ''}`}
            aria-disabled={busy || resendWait.left > 0}
            aria-busy={busy}
            onClick={resendConfirmation}
          >
            {busy ? 'Un momento…' : resendWait.left > 0 ? `Reenviar el email en ${resendWait.left} s` : 'Reenviar el email'}
          </button>
        </div>
        {resent && (
          <p className="form-note" role="status">
            Listo, te lo mandamos de nuevo. Puede tardar unos minutos.
          </p>
        )}
      </AuthResult>
    );
    // La invitación del paciente ya quedó usada con este email: para corregirlo hace falta otra.
    foot =
      role === 'patient' ? (
        <p className="auth-foot-note">
          ¿Escribiste mal tu email? Pedile a tu terapeuta un link de invitación nuevo y creá la cuenta otra vez con
          el email correcto.
        </p>
      ) : (
        <button type="button" className="link-btn" onClick={editEmail}>
          Usé otro email
        </button>
      );
  } else if (mode === 'forgot') {
    title = 'Recuperá tu contraseña';
    sub = 'Te mandamos un link para elegir una nueva.';
    body = (
      <>
        {emailField}
        <SubmitButton busy={busy}>Enviar link</SubmitButton>
      </>
    );
    foot = (
      <>
        <span>¿Te acordaste?</span>
        <button type="button" className="link-btn" onClick={() => go('login')}>
          Ingresá
        </button>
      </>
    );
  } else if (mode === 'login') {
    title = 'Ingresá';
    sub = inviteCode
      ? 'Después de ingresar vas a poder aceptar la invitación.'
      : 'Con el email y la contraseña de tu cuenta.';
    body = (
      <>
        {fromConfirmLink && (
          <p className="form-note">
            Si venías de confirmar tu email, ya quedó confirmado: ingresá con tu email y contraseña.
          </p>
        )}
        {emailField}
        {passwordField('Contraseña', 'current-password')}
        <button type="button" className="link-btn forgot" onClick={() => go('forgot')}>
          ¿Olvidaste tu contraseña?
        </button>
        <SubmitButton busy={busy}>Ingresar</SubmitButton>
      </>
    );
    foot = (
      <>
        <span>¿No tenés cuenta?</span>
        <button type="button" className="link-btn" onClick={() => go('signup')}>
          Creá una
        </button>
      </>
    );
  } else {
    title = 'Creá tu cuenta';
    sub = role === 'therapist' ? 'Gratis. Después invitás a tus pacientes.' : 'Tu cuenta queda vinculada a tu terapeuta.';
    body = (
      <>
        {!fromLink && (
          <div className="role-pick" role="radiogroup" aria-label="Tipo de cuenta">
            {(
              [
                ['therapist', Stethoscope, 'Soy terapeuta', 'Invito a mis pacientes'],
                ['patient', UserRound, 'Soy paciente', 'Tengo una invitación'],
              ] as const
            ).map(([value, Icon, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                className="role-option"
                onClick={() => {
                  if (value !== role) setConsent({});
                  setRole(value);
                  setError('');
                  setConsentError(false);
                }}
              >
                <Icon aria-hidden />
                <span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        {role === 'patient' && (
          <InviteBlock
            code={code}
            fromLink={fromLink}
            invite={invite}
            inputId={`${ids}-code`}
            onCode={(value) => {
              setCode(cleanCode(value));
              setFromLink(false);
              setConsent({});
            }}
            onRetry={() => setLookupTry((n) => n + 1)}
          />
        )}

        <div className="field">
          <label htmlFor={`${ids}-name`}>{role === 'therapist' ? 'Tu nombre profesional' : 'Tu nombre'}</label>
          <input
            id={`${ids}-name`}
            className="input"
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            placeholder={role === 'therapist' ? 'Lic. Ana Pérez' : 'Nombre y apellido'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {emailField}
        {passwordField('Contraseña', 'new-password', `Al menos ${MIN_PASSWORD} caracteres.`)}

        <div className="consent-field">
          {/* Lo que pide el art. 6 de la Ley 25.326 antes de recolectar los datos, en corto. */}
          <p className="consent-notice">
            Responsable de tus datos: <LegalOwner />, <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. Los usamos para{' '}
            {role === 'patient'
              ? 'llevar tu registro y compartirlo con tu terapeuta'
              : 'manejar tu cuenta, guardar tus notas de sesión y mostrarte el informe de tus pacientes'}
            ; los guardan y procesan {consentProviders('vos')}. Son obligatorios el email, la contraseña, el nombre
            {role === 'patient' ? ' y el código de invitación' : ''}: sin ellos no se puede crear la cuenta. Podés pedir
            acceso, corrección o supresión de tus datos por email. Detalles en la{' '}
            <LegalLink page="privacidad" newTab>
              Política de privacidad
            </LegalLink>
            .
          </p>
          {/* Una casilla por consentimiento, cada una con lo que se acepta destacado (art. 5).
              Sin "required": la validación del navegador taparía el aviso en castellano de abajo.
              Los links abren otra pestaña para no perder lo que ya se completó. */}
          {consentKinds(role).map((kind) => (
            <label key={kind} className="check-field">
              <input
                ref={(el) => {
                  consentRefs.current[kind] = el;
                }}
                type="checkbox"
                checked={consent[kind] ?? false}
                onChange={(e) => {
                  const next = { ...consent, [kind]: e.target.checked };
                  setConsent(next);
                  if (consentKinds(role).every((k) => next[k])) setConsentError(false);
                }}
                aria-invalid={(consentError && !consent[kind]) || undefined}
                aria-describedby={consentError && !consent[kind] ? `${ids}-consent-error` : undefined}
              />
              <span>
                {kind === 'terminos' ? (
                  <>
                    Soy mayor de 18 años y acepto los{' '}
                    <LegalLink page="terminos" newTab className="link-btn">
                      Términos
                    </LegalLink>{' '}
                    y la{' '}
                    <LegalLink page="privacidad" newTab className="link-btn">
                      Política de privacidad
                    </LegalLink>
                    .
                  </>
                ) : kind === 'salud' ? (
                  <>
                    <b>Consiento que daily trate mis datos de salud</b> (lo que cargue en mi registro y las notas de sesión
                    que mi terapeuta escriba sobre mí) <b>y que {therapistName || 'mi terapeuta'} vea mi registro</b>.
                  </>
                ) : (
                  <>
                    <b>Acepto que mis datos se guarden en Brasil y se procesen en EE. UU.</b> ({consentProviders('yo')}),
                    países que la autoridad argentina no considera con un nivel de protección adecuado.
                  </>
                )}
              </span>
            </label>
          ))}
          {consentError && (
            <p id={`${ids}-consent-error`} className="form-error" role="alert">
              Para crear la cuenta tenés que marcar las {consentKinds(role).length === 3 ? 'tres' : 'dos'} casillas.
            </p>
          )}
        </div>

        {/* El paciente crea la cuenta solo con la invitación verificada: así la casilla de salud
            nombra a quién va a ver su registro. */}
        <SubmitButton busy={busy} disabled={role === 'patient' && invite.status !== 'valid'}>
          Crear cuenta
        </SubmitButton>
      </>
    );
    foot = (
      <>
        <span>¿Ya tenés cuenta?</span>
        <button type="button" className="link-btn" onClick={() => go('login')}>
          Ingresá
        </button>
      </>
    );
  }

  return (
    <AuthLayout role={accentRole} heading={heading}>
      <div className="tray auth-tray">
        <form className="tray-card auth-form" onSubmit={submit} noValidate={false}>
          {title && (
            <header className="auth-head">
              <h1>{title}</h1>
              {sub && <p className="sub">{sub}</p>}
            </header>
          )}
          {body}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
        {foot && <div className="tray-foot auth-foot">{foot}</div>}
      </div>
      {/* Mientras espera el email, la pantalla queda solo con lo que hay que hacer. */}
      {!inviteCode && !recovery && mode !== 'confirm' && mode !== 'sent' && (
        <div className="auth-demo">
          <span className="auth-demo-text">
            <b>¿Querés ver cómo funciona?</b> Probala con datos de ejemplo, sin cuenta.
          </span>
          <span className="auth-demo-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('demo/paciente')}>
              Probar la demo
              <ArrowRight aria-hidden />
            </button>
            <button type="button" className="link-btn" onClick={() => navigate('bienvenida')}>
              Ver la presentación
            </button>
          </span>
        </div>
      )}
    </AuthLayout>
  );
}

/** El marco de las pantallas de cuenta: el panel con la marca y lo que ofrece daily para cada
 *  rol (en el celular no está) y la columna con la pantalla y los links legales. */
export function AuthLayout({ role, heading, children }: { role: Role; heading?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth" data-role={role}>
      <aside className="auth-aside">
        <svg className="auth-art" viewBox="0 0 400 600" aria-hidden preserveAspectRatio="xMidYMax slice">
          <circle cx="360" cy="560" r="240" />
          <circle cx="360" cy="560" r="160" />
          <circle cx="60" cy="40" r="120" />
          <circle className="fill" cx="300" cy="120" r="3" />
          <circle className="fill" cx="350" cy="470" r="3" />
        </svg>
        <Brand />
        <div className="auth-pitch">
          <p className="auth-title">{heading ?? HEADINGS[role]}</p>
          <ul className="auth-points">
            {POINTS[role].map(([Icon, text]) => (
              <li key={text}>
                <span className="auth-point-icon">
                  <Icon aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-foot">Acompaña la terapia, no la reemplaza.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        {children}
        <nav className="auth-legal" aria-label="Legal">
          <LegalLink page="privacidad" newTab>
            Privacidad
          </LegalLink>
          <LegalLink page="terminos" newTab>
            Términos
          </LegalLink>
          <a href={`mailto:${LEGAL_EMAIL}`}>Contacto</a>
        </nav>
      </main>
    </div>
  );
}

/** Una pantalla de resultado (email enviado, link confirmado o vencido): ícono, título, texto
 *  y acciones, centrados. `tone` pinta el ícono: con el acento del rol o neutro. */
export function AuthResult({
  icon: Icon,
  tone = 'accent',
  title,
  children,
}: {
  icon: LucideIcon;
  tone?: 'accent' | 'neutral';
  title: string;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Si el botón que tenía el foco desapareció (por ejemplo, "Crear cuenta" al pasar a
  // "Confirmá tu email"), el foco pasa al título: así el teclado y el lector de pantalla
  // siguen desde acá y no desde el principio de la página.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) titleRef.current?.focus();
  }, [title]);

  return (
    <div className="auth-result" data-tone={tone}>
      <span className="auth-result-icon">
        <Icon aria-hidden />
      </span>
      <h1 ref={titleRef} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </div>
  );
}

/** Quién guarda y procesa los datos, para el aviso y la casilla de la transferencia. */
function consentProviders(voice: 'vos' | 'yo'): string {
  const list = ['Supabase', 'Vercel', ...(EMAIL_SENDER ? [EMAIL_SENDER.name] : [])];
  return `${list.join(', ')} y, si ${voice === 'vos' ? 'usás' : 'uso'} el chat, Groq`;
}

function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={busy || disabled} aria-busy={busy}>
      {busy ? 'Un momento…' : children}
      {!busy && <ArrowRight aria-hidden />}
    </button>
  );
}

function InviteBlock({
  code,
  fromLink,
  invite,
  inputId,
  onCode,
  onRetry,
}: {
  code: string;
  fromLink: boolean;
  invite: InviteInfo;
  inputId: string;
  onCode: (value: string) => void;
  onRetry: () => void;
}) {
  const showInput = !fromLink || invite.status === 'invalid';
  return (
    <div className="invite-block">
      {showInput && (
        <div className="field">
          <label htmlFor={inputId}>Código de invitación</label>
          <input
            id={inputId}
            className="input code-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            placeholder="Te lo da tu terapeuta"
            value={code}
            onChange={(e) => onCode(e.target.value)}
          />
        </div>
      )}
      {invite.status === 'loading' && <p className="form-hint">Buscando la invitación…</p>}
      {invite.status === 'valid' && (
        <div className="invite-card">
          <Initials name={invite.therapistName || 'T'} />
          <span>
            <small>Te invitó</small>
            <b>{invite.therapistName || 'Tu terapeuta'}</b>
          </span>
          <span className="soft-pill">Vigente</span>
        </div>
      )}
      {invite.status === 'invalid' && (
        <p className="form-error">
          Esta invitación no es válida, venció o ya se usó. Pedile a tu terapeuta un link nuevo.
        </p>
      )}
      {invite.status === 'error' && (
        <p className="form-error">
          No pude verificar la invitación. Revisá tu conexión y{' '}
          <button type="button" className="link-btn" onClick={onRetry}>
            probá de nuevo
          </button>
          .
        </p>
      )}
      {invite.status === 'idle' && !fromLink && (
        <p className="form-hint">Si tu terapeuta te mandó un link, abrilo y el código se completa solo.</p>
      )}
    </div>
  );
}
