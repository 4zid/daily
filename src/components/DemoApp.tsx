import { useCallback, useId, useLayoutEffect, useState } from 'react';
import { RotateCcw, Stethoscope, UserRound, X } from 'lucide-react';
import { DEMO_PATIENT, DEMO_THERAPIST, demoReportWeek, enterDemo, exitDemo, resetDemo } from '../lib/demo';
import { navigate } from '../lib/route';
import { markOnboardingSeen } from '../lib/store';
import type { DemoControls } from './Dialogs';
import { PatientApp } from './PatientApp';
import { TherapistApp } from './TherapistApp';

// Rutas de la demo: "#/demo" o "#/demo/paciente" (registro), "#/demo/paciente/informe"
// y "#/demo/terapeuta". Se pueden mandar como link a quien quiera probarla.

type Role = 'patient' | 'therapist';

function parse(path: string): { role: Role; view: 'registro' | 'informe' } {
  if (path.startsWith('demo/terapeuta')) return { role: 'therapist', view: 'informe' };
  return { role: 'patient', view: path === 'demo/paciente/informe' ? 'informe' : 'registro' };
}

export function DemoApp({ path, signedIn }: { path: string; signedIn: boolean }) {
  const { role, view } = parse(path);
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  // Pista de qué probar: abierta al entrar; se vuelve a abrir tocando "Demo".
  const [hint, setHint] = useState(true);

  // Antes que las pantallas pidan datos (sus efectos corren después de este).
  useLayoutEffect(() => {
    enterDemo();
    markOnboardingSeen();
    setReady(true);
    return () => exitDemo();
  }, []);

  const onNavigate = useCallback(
    (next: string, replace?: boolean) => {
      const target =
        role === 'therapist' ? 'demo/terapeuta' : next === 'informe' ? 'demo/paciente/informe' : 'demo/paciente';
      navigate(target, replace);
    },
    [role],
  );

  const reset = useCallback(() => {
    resetDemo();
    setRound((r) => r + 1);
  }, []);

  // Sin sesión, "/" es la landing de donde vino; con sesión, su app.
  const exit = useCallback(() => navigate(''), []);

  const controls: DemoControls = {
    onReset: reset,
    onExit: exit,
    exitLabel: signedIn ? 'Volver a mi cuenta' : 'Salir de la demo',
    signedIn,
  };

  if (!ready) return null;

  return (
    <div className={`demo-root${hint ? ' has-hint' : ''}`}>
      <DemoDock
        role={role}
        signedIn={signedIn}
        hint={hint}
        onHint={setHint}
        onReset={reset}
        onExit={exit}
      />
      {role === 'patient' ? (
        <PatientApp
          key={`p${round}`}
          profile={DEMO_PATIENT}
          path={view}
          onNavigate={onNavigate}
          demo={controls}
        />
      ) : (
        <TherapistApp
          key={`t${round}`}
          profile={DEMO_THERAPIST}
          path="informe"
          onNavigate={onNavigate}
          demo={controls}
          initialWeek={demoReportWeek()}
        />
      )}
    </div>
  );
}

function DemoDock({
  role,
  signedIn,
  hint,
  onHint,
  onReset,
  onExit,
}: {
  role: Role;
  signedIn: boolean;
  hint: boolean;
  onHint: (open: boolean) => void;
  onReset: () => void;
  onExit: () => void;
}) {
  const hintId = useId();
  return (
    <div className="demo-dock-wrap">
      <div className="demo-dock" role="region" aria-label="Demo">
        <button
          type="button"
          className="demo-badge"
          aria-expanded={hint}
          aria-controls={hintId}
          title="Qué probar en la demo"
          onClick={() => onHint(!hint)}
        >
          <span className="live-dot" aria-hidden />
          <span className="demo-badge-text">Demo</span>
        </button>
        <div className="segmented demo-roles" role="group" aria-label="Ver como">
          <button
            type="button"
            aria-pressed={role === 'patient'}
            onClick={() => navigate('demo/paciente')}
          >
            <UserRound aria-hidden />
            Paciente
          </button>
          <button
            type="button"
            aria-pressed={role === 'therapist'}
            onClick={() => navigate('demo/terapeuta')}
          >
            <Stethoscope aria-hidden />
            Terapeuta
          </button>
        </div>
        <button type="button" className="demo-icon-btn" onClick={onReset} aria-label="Reiniciar la demo" title="Reiniciar la demo">
          <RotateCcw />
        </button>
        {!signedIn && (
          <button type="button" className="demo-cta" onClick={() => navigate('crear-cuenta')}>
            Crear cuenta
          </button>
        )}
        <button
          type="button"
          className="demo-icon-btn"
          onClick={onExit}
          aria-label={signedIn ? 'Volver a mi cuenta' : 'Salir de la demo'}
          title={signedIn ? 'Volver a mi cuenta' : 'Salir de la demo'}
        >
          <X />
        </button>
      </div>
      {hint && (
        <div className="demo-hint" id={hintId}>
          <span>
            {role === 'patient'
              ? 'Datos de ejemplo. Cargá algo y pasá a Terapeuta para ver cómo le llega.'
              : 'Datos de ejemplo. Elegí un paciente, o pasá a Paciente para cargar algo.'}
          </span>
          <button type="button" className="demo-hint-close" onClick={() => onHint(false)} aria-label="Cerrar la pista">
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
