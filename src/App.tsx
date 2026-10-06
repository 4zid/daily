import { useEffect } from 'react';
import { useAuth } from './lib/auth';
import { resetCloudCache } from './lib/cloud';
import { inviteCodeFrom, useHashPath } from './lib/route';
import { useLocal } from './lib/store';
import { AuthScreen } from './components/AuthScreen';
import { PatientApp } from './components/PatientApp';
import { TherapistApp } from './components/TherapistApp';
import { Brand } from './components/common';

export default function App() {
  const auth = useAuth();
  const { theme } = useLocal();
  const path = useHashPath();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  // Al cerrar sesión no queda nada de la cuenta anterior en memoria.
  useEffect(() => {
    if (auth.status === 'signed-out') resetCloudCache();
  }, [auth.status]);

  if (auth.status === 'loading') {
    return (
      <div className="splash" role="status" aria-label="Cargando">
        <Brand />
      </div>
    );
  }

  if (auth.status === 'signed-out' || auth.status === 'recovery') {
    return <AuthScreen inviteCode={inviteCodeFrom(path)} recovery={auth.status === 'recovery'} />;
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
