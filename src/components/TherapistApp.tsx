import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Ellipsis, Settings, UserPlus } from 'lucide-react';
import type { Profile } from '../lib/supabase';
import { addDays, todayISO, weekStart } from '../lib/date';
import { countWeekEntries } from '../lib/stats';
import {
  configureCloud,
  endCareLink,
  fetchMyPatients,
  useSessionNote,
  useWeek,
  useWeekList,
  type PatientSummary,
} from '../lib/cloud';
import { inviteCodeFrom, navigate } from '../lib/route';
import { InviteDialog, SettingsDialog, type DemoControls } from './Dialogs';
import { TherapistView } from './TherapistView';
import { WeekList, mergeWeeks } from './WeekList';
import { Brand, Initials, Menu, Toast, type ToastState } from './common';

const SELECTED_KEY = 'daily.paciente';

function readSelected(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function TherapistApp({
  profile,
  path,
  onNavigate = navigate,
  demo,
  initialWeek,
}: {
  profile: Profile;
  path: string;
  /** Cambia de ruta (en la demo, las rutas llevan el prefijo de la demo). */
  onNavigate?: (path: string, replace?: boolean) => void;
  demo?: DemoControls;
  /** Semana con la que abre cada paciente (por defecto, la actual). */
  initialWeek?: string;
}) {
  const thisWeek = weekStart(todayISO());
  const inviteCode = inviteCodeFrom(path);

  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // En la demo no se recuerda el paciente elegido: no pisa el de la cuenta real.
  const [selectedId, setSelectedId] = useState<string | null>(() => (demo ? null : readSelected()));
  const startWeek = initialWeek ?? thisWeek;
  const [week, setWeek] = useState(startWeek);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((text: string, action?: ToastState['action']) => {
    setToast({ id: Date.now(), text, action });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  // El terapeuta solo lee: sin paciente activo, las acciones de escritura no hacen nada.
  useEffect(() => configureCloud(null, notify), [notify]);

  const loadPatients = useCallback(async () => {
    try {
      setPatients(await fetchMyPatients());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const selected = patients?.find((p) => p.id === selectedId) ?? patients?.[0] ?? null;
  const patientId = selected?.id ?? null;
  const weekState = useWeek(patientId, week);
  const weekList = useWeekList(patientId);
  const note = useSessionNote(patientId, week);

  // Al volver a la pestaña, trae los pacientes nuevos y lo último que se cargó.
  const { refresh } = weekState;
  useEffect(() => {
    const onFocus = () => {
      void loadPatients();
      refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadPatients, refresh]);

  // Un terapeuta que abre un link de invitación: es para pacientes.
  useEffect(() => {
    if (!inviteCode) return;
    notify('Ese link es para que un paciente cree su cuenta. Mandáselo a tu paciente.');
    onNavigate('informe', true);
  }, [inviteCode, notify]);

  function selectPatient(id: string) {
    setSelectedId(id);
    setWeek(startWeek);
    if (demo) return;
    try {
      sessionStorage.setItem(SELECTED_KEY, id);
    } catch {
      // Sin almacenamiento: se elige el primero la próxima vez.
    }
  }

  async function unlink(patient: PatientSummary) {
    const ok = window.confirm(
      `¿Desvincular a ${patient.name}? Vas a dejar de ver sus registros y se borran tus notas de sesión sobre este paciente. Sus registros no se borran.`,
    );
    if (!ok) return;
    try {
      await endCareLink(patient.id);
      setSelectedId(null);
      await loadPatients();
      notify(`Desvinculaste a ${patient.name}.`);
    } catch {
      notify('No pude desvincular al paciente. Probá de nuevo.');
    }
  }

  const weeks = useMemo(
    () =>
      mergeWeeks(
        weekList,
        { week: thisWeek, entries: 0 },
        { week, entries: weekState.status === 'ready' ? countWeekEntries(weekState.days, week) : 0 },
      ),
    [weekList, thisWeek, week, weekState.status, weekState.days],
  );

  const firstName = profile.full_name.trim().split(/\s+/).find((w) => !/^(lic|dr|dra|psic|ps)\.?$/i.test(w)) ?? '';

  const patientMenu = selected && (
    <Menu
      label={`Opciones de ${selected.name}`}
      triggerClassName="circle-btn"
      trigger={<Ellipsis aria-hidden />}
      items={[
        {
          label: 'Invitar a otro paciente',
          hint: 'Crear un link de invitación',
          onSelect: () => setInviteOpen(true),
        },
        {
          label: `Desvincular a ${selected.name}`,
          hint: 'Dejás de ver sus registros',
          danger: true,
          onSelect: () => void unlink(selected),
        },
      ]}
    />
  );

  let content;
  if (patients === null) {
    content = loadError ? (
      <div className="main-inner">
        <div className="notice is-error" role="alert">
          <span>No pude cargar tus pacientes. Revisá tu conexión.</span>
          <button type="button" className="btn btn-sm" onClick={() => void loadPatients()}>
            Reintentar
          </button>
        </div>
      </div>
    ) : (
      <div className="main-inner is-loading" aria-busy>
        <p className="empty-line">Cargando pacientes…</p>
      </div>
    );
  } else if (!selected) {
    content = (
      <div className="main-inner">
        <header className="page-head">
          <div>
            <p className="kicker">{firstName ? <>Hola, <b>{firstName}</b></> : 'Hola'}</p>
            <h1 className="display">Tus pacientes</h1>
          </div>
        </header>
        <section className="card welcome-card">
          <span className="empty-icon">
            <UserPlus aria-hidden />
          </span>
          <h2 className="h2">Invitá a tu primer paciente</h2>
          <ol className="steps">
            <li>
              <b>1</b>
              <span>Creá un link de invitación.</span>
            </li>
            <li>
              <b>2</b>
              <span>Mandáselo por WhatsApp o email.</span>
            </li>
            <li>
              <b>3</b>
              <span>Cuando cree su cuenta, vas a ver su registro acá.</span>
            </li>
          </ol>
          <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Crear invitación
          </button>
        </section>
      </div>
    );
  } else {
    content = (
      <TherapistView
        days={weekState.days}
        status={weekState.status}
        patientName={selected.name}
        week={week}
        mode="therapist"
        notes={note}
        actions={patientMenu}
        onWeekStep={(step) => setWeek(addDays(week, step * 7))}
        onRetry={weekState.reload}
      />
    );
  }

  return (
    <div className="app" data-view="informe" data-role="therapist">
      <header className="mobile-bar">
        <Brand />
        {patients && patients.length > 0 ? (
          <Menu
            label={`Paciente: ${selected?.name ?? ''}. Cambiar`}
            triggerClassName="btn patient-switch"
            align="end"
            trigger={
              <>
                <span>{selected?.name}</span>
                <ChevronDown aria-hidden />
              </>
            }
            items={[
              ...patients.map((p) => ({
                id: p.id,
                label: p.name,
                selected: p.id === patientId,
                onSelect: () => selectPatient(p.id),
              })),
              { id: 'invitar', label: 'Invitar paciente', hint: 'Crear un link', onSelect: () => setInviteOpen(true) },
            ]}
          />
        ) : (
          <span />
        )}
        <button type="button" className="circle-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
          <Settings />
        </button>
      </header>

      <aside className="sidebar" aria-label="Navegación">
        <Brand />
        <nav className="sidebar-nav">
          <p className="nav-label">Pacientes</p>
          {patients && patients.length > 0 ? (
            <ul className="nav-list">
              {patients.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="nav-item"
                    aria-current={p.id === patientId ? 'page' : undefined}
                    onClick={() => selectPatient(p.id)}
                  >
                    <Initials name={p.name} />
                    <span className="nav-text">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nav-empty">{patients ? 'Todavía no tenés pacientes.' : 'Cargando…'}</p>
          )}

          {selected && (
            <>
              <p className="nav-label">Semanas de {selected.name.split(/\s+/)[0]}</p>
              <WeekList weeks={weeks} current={week} thisWeek={thisWeek} onSelect={setWeek} />
            </>
          )}

          <p className="nav-label">General</p>
          <ul className="nav-list">
            <li>
              <button type="button" className="nav-item" onClick={() => setSettingsOpen(true)}>
                <Settings aria-hidden />
                <span className="nav-text">Ajustes</span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="promo">
          <span className="promo-icon" aria-hidden>
            <UserPlus />
          </span>
          <p className="promo-title">
            <b>Invitá</b> a un paciente
          </p>
          <p className="promo-text">Le mandás un link y su cuenta queda vinculada a la tuya.</p>
          <button type="button" className="promo-btn" onClick={() => setInviteOpen(true)}>
            Crear invitación
          </button>
        </div>
      </aside>

      <main className="main">{content}</main>

      <InviteDialog
        open={inviteOpen}
        demo={Boolean(demo)}
        therapistName={profile.full_name}
        onClose={() => {
          setInviteOpen(false);
          void loadPatients();
        }}
        onToast={notify}
      />
      <SettingsDialog
        open={settingsOpen}
        profile={profile}
        demo={demo}
        onClose={() => setSettingsOpen(false)}
        onToast={notify}
      />
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
