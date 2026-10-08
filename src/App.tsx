import { useEffect, useRef } from 'react';
import { useAuth } from './lib/auth';
import { resetCloudCache } from './lib/cloud';
import { hasAuthCode, startupLink } from './lib/emailLink';
import { inviteCodeFrom, navigate, useHashPath } from './lib/route';
import { hadSessionHere, hasSeenOnboarding, markHadSession, markOnboardingSeen, useLocal } from './lib/store';
import { AuthScreen } from './components/AuthScreen';
import { DemoApp } from './components/DemoApp';
import { EmailLinkScreen } from './components/EmailLinkScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './components/Landing';
import { LegalPage } from './components/Legal';
import { Onboarding } from './components/Onboarding';
import { PatientApp } from './components/PatientApp';
import { TherapistApp } from './components/TherapistApp';
import { Brand } from './components/common';

// Rutas: "/" sin sesión es la landing; "#/bienvenida" (presentación), "#/demo/…" (demo como
// invitado), "#/ingresar", "#/crear-cuenta", "#/invitacion/CÓDIGO", "#/privacidad" y
// "#/terminos" (páginas legales, para todos), y las de la app. Los links de los emails de la
// cuenta llegan a "/?token_hash=…" (ver lib/emailLink.ts).

export default function App() {
  const path = useHashPath();
  // Si una pantalla falla, se muestra un aviso para reintentar (y al cambiar de ruta se reintenta sola).
  return (
    <ErrorBoundary resetKey={path}>
      <Screens path={path} />
    </ErrorBoundary>
  );
}

function Screens({ path }: { path: string }) {
  const auth = useAuth();
  const { theme } = useLocal();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  // Al cerrar sesión no queda nada de la cuenta anterior en memoria.
  useEffect(() => {
    if (auth.status === 'signed-out') resetCloudCache();
  }, [auth.status]);

  const signedIn = auth.status === 'signed-in';

  // Quien ya tiene cuenta no necesita la presentación al cerrar sesión, y al entrar
  // la ruta de ingreso o alta deja lugar a la de la app.
  useEffect(() => {
    if (!signedIn) return;
    markOnboardingSeen();
    markHadSession();
    if (path === 'ingresar' || path === 'crear-cuenta') navigate('', true);
  }, [signedIn, path]);

  // La pantalla del link de un email se cierra si la persona se va a otra ruta (por ejemplo,
  // escribe otra dirección): no queda trabada ahí.
  const lastPath = useRef(path);
  const { emailLink, dismissEmailLink } = auth;
  useEffect(() => {
    if (path === lastPath.current) return;
    lastPath.current = path;
    if (emailLink && emailLink.step !== 'checking') dismissEmailLink();
  }, [path, emailLink, dismissEmailLink]);

  // Las páginas legales son públicas: se ven con o sin sesión, mientras carga la cuenta, en la
  // recuperación de contraseña y sin perfil. Van antes que cualquier redirección.
  if (path === 'privacidad' || path === 'terminos') return <LegalPage key={path} page={path} />;

  // Llegó con el link de un email (confirmar la cuenta o el cambio de email, o uno que ya no
  // sirve): esa pantalla va antes que la app hasta que la persona sigue. El de recuperar la
  // contraseña pasa directo a elegir una nueva.
  const link = auth.emailLink;
  if (link && auth.status !== 'recovery') {
    if (link.step === 'checking' || auth.status === 'loading') {
      return (
        <div className="splash" role="status" aria-label="Abriendo el link">
          <Brand />
        </div>
      );
    }
    return <EmailLinkScreen state={link} />;
  }

  if (auth.status === 'loading') {
    return (
      <div className="splash" role="status" aria-label="Cargando">
        <Brand />
      </div>
    );
  }

  // La demo y la presentación se pueden ver con o sin sesión (por ejemplo, para mostrarlas).
  if (path === 'demo' || path.startsWith('demo/')) return <DemoApp path={path} signedIn={signedIn} />;
  if (path === 'bienvenida' && auth.status !== 'recovery') return <Onboarding signedIn={signedIn} />;

  if (auth.status === 'signed-out' || auth.status === 'recovery') {
    // La puerta de entrada pública: quien llega sin sesión ve la landing. Quien ya usó una
    // cuenta en este navegador (cerró sesión o se le venció) o vuelve desde un link de email
    // de confirmación o recuperación va directo al ingreso.
    const fromAuthLink = /[?&](code|error)=/.test(window.location.search);
    if (path === '' && auth.status === 'signed-out' && !hadSessionHere() && !fromAuthLink) return <Landing />;
    const inviteCode = inviteCodeFrom(path);
    const explicit = path === 'ingresar' || path === 'crear-cuenta' || fromAuthLink;
    if (!inviteCode && !explicit && auth.status === 'signed-out' && !hasSeenOnboarding()) return <Onboarding />;
    return (
      <AuthScreen
        inviteCode={inviteCode}
        recovery={auth.status === 'recovery'}
        initialMode={path === 'crear-cuenta' ? 'signup' : path === 'ingresar' ? 'login' : undefined}
        fromConfirmLink={startupLink?.kind === 'code' && hasAuthCode()}
      />
    );
  }

  if (auth.status === 'no-profile' || !auth.profile) {
    return (
      <div className="splash">
        <Brand />
        <div className="tray splash-card">
          <div className="tray-card auth-form">
            <header className="auth-head">
              <h1>No pudimos cargar tu cuenta</h1>
              <p className="sub">
                Puede ser un problema de conexión. Si sigue pasando, cerrá sesión y volvé a ingresar.
              </p>
            </header>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void auth.reloadProfile()}>
                Reintentar
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void auth.signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return auth.profile.role === 'therapist' ? (
    <TherapistApp key={auth.profile.id} profile={auth.profile} path={path} />
  ) : (
    <PatientApp key={auth.profile.id} profile={auth.profile} path={path} />
  );
}
