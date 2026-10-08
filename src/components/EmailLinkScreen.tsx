import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, CircleCheck, Link2Off, MailCheck, WifiOff } from 'lucide-react';
import { useAuth, type EmailLinkState } from '../lib/auth';
import { navigate } from '../lib/route';
import { authErrorMessage } from '../lib/supabase';
import { AuthLayout, AuthResult, RESEND_SECONDS, type Role } from './AuthScreen';
import { useCooldown } from './common';

/** Lo que se ve al abrir el link de un email de la cuenta (ver lib/emailLink.ts): email
 *  confirmado, cambio de email, link vencido o sin conexión. */
export function EmailLinkScreen({ state }: { state: Exclude<EmailLinkState, { step: 'checking' }> }) {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in' || auth.status === 'no-profile';
  const metaRole = auth.session?.user.user_metadata?.role;
  const role: Role | null = auth.profile?.role ?? (metaRole === 'therapist' || metaRole === 'patient' ? metaRole : null);
  const email = auth.session?.user.email ?? '';

  /** Sigue a la app con la sesión que dejó el link, o al ingreso si no hay. */
  function proceed() {
    auth.dismissEmailLink();
    navigate(signedIn ? '' : 'ingresar', true);
  }

  let tray: ReactNode;
  if (state.step === 'confirmed') {
    tray = (
      <AuthResult icon={CircleCheck} title="¡Listo, confirmaste tu email!">
        <p>
          {role === 'therapist'
            ? 'Tu cuenta ya está activa. Desde tu panel invitás a tus pacientes con un link.'
            : role === 'patient'
              ? 'Tu cuenta ya está activa. Cargá tu día cuando quieras: tu terapeuta lo ve en su panel.'
              : 'Tu cuenta ya está activa.'}
        </p>
        {signedIn && email && (
          <p className="auth-result-hint">
            Entraste como <b>{email}</b>.
          </p>
        )}
        <Actions>
          <button type="button" className="btn btn-primary btn-block" onClick={proceed}>
            {!signedIn ? 'Ingresar' : role === 'therapist' ? 'Ir a mi panel' : 'Empezar mi registro'}
            <ArrowRight aria-hidden />
          </button>
        </Actions>
      </AuthResult>
    );
  } else if (state.step === 'email-changed') {
    tray = (
      <AuthResult icon={CircleCheck} title="Tu nuevo email quedó confirmado">
        <p>
          {email ? (
            <>
              Desde ahora ingresás con <b>{email}</b>.
            </>
          ) : (
            'Desde ahora ingresás con tu email nuevo.'
          )}
        </p>
        <Actions>
          <button type="button" className="btn btn-primary btn-block" onClick={proceed}>
            {signedIn ? 'Ir a daily' : 'Ingresar'}
            <ArrowRight aria-hidden />
          </button>
        </Actions>
      </AuthResult>
    );
  } else if (state.step === 'email-change-half') {
    tray = (
      <AuthResult icon={MailCheck} tone="neutral" title="Falta confirmar desde el otro email">
        <p>
          Por seguridad, el cambio se completa cuando lo confirmás desde las dos direcciones. Abrí el email que te
          llegó a la otra y tocá <b>«Confirmar mi nuevo email»</b>.
        </p>
        <Actions>
          <button type="button" className="btn btn-primary btn-block" onClick={proceed}>
            Entendido
          </button>
        </Actions>
      </AuthResult>
    );
  } else if (state.step === 'offline') {
    tray = <OfflineResult />;
  } else {
    tray = <InvalidResult type={state.type} signedIn={signedIn} onProceed={proceed} />;
  }

  return (
    <AuthLayout role={role ?? 'patient'}>
      <div className="tray auth-tray">
        <div className="tray-card auth-form">{tray}</div>
      </div>
    </AuthLayout>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="auth-result-actions">{children}</div>;
}

function OfflineResult() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <AuthResult icon={WifiOff} tone="neutral" title="No pudimos abrir el link">
      <p>Parece que no hay conexión. Revisá internet y probá de nuevo.</p>
      <Actions>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            void auth.retryEmailLink().finally(() => setBusy(false));
          }}
        >
          {busy ? 'Un momento…' : 'Probar de nuevo'}
        </button>
      </Actions>
    </AuthResult>
  );
}

/** Por qué el link ya no sirve y qué hacer. Con la sesión abierta no se ofrece otro email:
 *  la cuenta ya está confirmada y la contraseña se cambia desde Ajustes. */
function invalidText(type: Extract<EmailLinkState, { step: 'invalid' }>['type'], signedIn: boolean): string {
  const expiry = 'vencen en poco tiempo y sirven una sola vez.';
  if (type === 'recovery') {
    return signedIn
      ? `Los links para elegir una contraseña nueva ${expiry} Como ya estás en tu cuenta, podés cambiarla desde Ajustes.`
      : `Los links para elegir una contraseña nueva ${expiry} Pedí otro y abrilo apenas te llegue.`;
  }
  if (type === 'email_change') {
    return `Los links de los emails ${expiry} Si todavía querés cambiar tu email, pedilo de nuevo.`;
  }
  return signedIn
    ? `Los links de los emails ${expiry} Ya estás en tu cuenta: no hace falta hacer nada más.`
    : `Los links de los emails ${expiry} Si ya confirmaste tu email, ingresá con tu contraseña; si no, te mandamos otro.`;
}

/** Link vencido, ya usado o roto. Sin sesión, ofrece mandar otro email (el de confirmar la
 *  cuenta o, si era de la contraseña, el de elegir una nueva). */
function InvalidResult({
  type,
  signedIn,
  onProceed,
}: {
  type: Extract<EmailLinkState, { step: 'invalid' }>['type'];
  signedIn: boolean;
  onProceed: () => void;
}) {
  const auth = useAuth();
  const ids = useId();
  const forPassword = type === 'recovery';
  const canResend = !signedIn && type !== 'email_change';
  const account = signedIn ? (auth.session?.user.email ?? '') : '';
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const wait = useCooldown();

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || wait.left > 0) return;
    setBusy(true);
    setError('');
    setSentTo('');
    try {
      if (forPassword) await auth.requestPasswordReset(email);
      else await auth.resendConfirmation(email);
      setSentTo(email.trim());
      wait.start(RESEND_SECONDS);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/only request this after/i.test(message)) wait.start(RESEND_SECONDS);
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthResult icon={Link2Off} tone="neutral" title="Este link ya no sirve">
      <p>{invalidText(type, signedIn)}</p>
      {account && (
        <p className="auth-result-hint">
          Estás en la cuenta de <b>{account}</b>.
        </p>
      )}
      <Actions>
        <button type="button" className="btn btn-primary btn-block" onClick={onProceed}>
          {signedIn ? 'Ir a daily' : 'Ingresar'}
          <ArrowRight aria-hidden />
        </button>
        {canResend && !asking && (
          <button type="button" className="btn btn-block" onClick={() => setAsking(true)}>
            Mandarme otro email
          </button>
        )}
      </Actions>
      {canResend && asking && (
        <form className="auth-resend" onSubmit={send}>
          <div className="field">
            <label htmlFor={`${ids}-email`}>Tu email</label>
            <input
              id={`${ids}-email`}
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {/* aria-disabled y no disabled: así el botón no pierde el foco durante la espera. */}
          <button
            type="submit"
            className={`btn btn-block${wait.left > 0 ? ' is-waiting' : ''}`}
            aria-disabled={busy || wait.left > 0}
            aria-busy={busy}
          >
            {busy ? 'Un momento…' : wait.left > 0 ? `Mandar otro en ${wait.left} s` : 'Mandarme otro email'}
          </button>
          {sentTo && (
            <p className="form-note" role="status">
              {forPassword ? (
                <>
                  Listo. Si hay una cuenta con <b>{sentTo}</b>, te llega un link nuevo en unos minutos.
                </>
              ) : (
                <>
                  Listo. Si la cuenta de <b>{sentTo}</b> todavía no está confirmada, te llega un email nuevo en unos
                  minutos. Si ya estaba confirmada, ingresá con tu contraseña.
                </>
              )}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </AuthResult>
  );
}
