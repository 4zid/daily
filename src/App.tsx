import { useEffect } from 'react';
import { useAuth } from './lib/auth';
import { resetCloudCache } from './lib/cloud';
import { inviteCodeFrom, navigate, useHashPath } from './lib/route';
import { hasSeenOnboarding, markOnboardingSeen, useLocal } from './lib/store';
import { AuthScreen } from './components/AuthScreen';
import { DemoApp } from './components/DemoApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './components/Landing';
import { Onboarding } from './components/Onboarding';
import { PatientApp } from './components/PatientApp';
import { TherapistApp } from './components/TherapistApp';
import { Brand } from './components/common';

// Rutas: "/" sin sesión es la landing; "#/bienvenida" (presentación), "#/demo/…" (demo como
// invitado), "#/ingresar", "#/crear-cuenta", "#/invitacion/CÓDIGO", y las de la app.

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
    if (path === 'ingresar' || path === 'crear-cuenta') navigate('', true);
  }, [signedIn, path]);

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
    // La puerta de entrada pública: quien llega sin sesión ve la landing.
    if (path === '' && auth.status === 'signed-out') return <Landing />;
    const inviteCode = inviteCodeFrom(path);
    const explicit = path === 'ingresar' || path === 'crear-cuenta';
    if (!inviteCode && !explicit && auth.status === 'signed-out' && !hasSeenOnboarding()) return <Onboarding />;
    return (
      <AuthScreen
        inviteCode={inviteCode}
        recovery={auth.status === 'recovery'}
        initialMode={path === 'crear-cuenta' ? 'signup' : path === 'ingresar' ? 'login' : undefined}
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
