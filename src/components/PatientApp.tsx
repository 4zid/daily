import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartColumn, NotebookPen, Settings, Sparkles, UserRound } from 'lucide-react';
import type { Entry } from '../types';
import type { Profile } from '../lib/supabase';
import { addDays, todayISO, weekStart } from '../lib/date';
import { countWeekEntries } from '../lib/stats';
import {
  acceptInvitation,
  actions,
  configureCloud,
  endCareLink,
  fetchMyTherapist,
  importDays,
  lookupInvitation,
  useWeek,
  useWeekList,
} from '../lib/cloud';
import { local, useLocal } from '../lib/store';
import { inviteCodeFrom, navigate } from '../lib/route';
import { AssistantChat, type ChatMessage } from './AssistantChat';
import { SettingsDialog, type DemoControls } from './Dialogs';
import { PatientView } from './PatientView';
import { TherapistView } from './TherapistView';
import { WeekList, mergeWeeks } from './WeekList';
import { Brand, Modal, Toast, type ToastState } from './common';

export function PatientApp({
  profile,
  path,
  onNavigate = navigate,
  demo,
}: {
  profile: Profile;
  path: string;
  /** Cambia de ruta (en la demo, las rutas llevan el prefijo de la demo). */
  onNavigate?: (path: string, replace?: boolean) => void;
  demo?: DemoControls;
}) {
  const today = todayISO();
  const thisWeek = weekStart(today);
  const view = path === 'informe' ? 'informe' : 'registro';
  const inviteCode = inviteCodeFrom(path);

  const [week, setWeek] = useState(thisWeek);
  const [selectedDate, setSelectedDate] = useState(today);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  // El asistente de IA es opcional: se oculta desde su panel o en Ajustes (queda guardado en este navegador).
  const assistant = useLocal().assistant;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  // undefined: cargando; null: sin terapeuta; '' : terapeuta sin nombre cargado.
  const [therapist, setTherapist] = useState<string | null | undefined>(undefined);
  const [invite, setInvite] = useState<{ code: string; therapistName: string } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [importing, setImporting] = useState(false);

  const notify = useCallback((text: string, action?: ToastState['action']) => {
    setToast({ id: Date.now(), text, action });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    configureCloud(profile.id, notify);
    return () => configureCloud(null, () => {});
  }, [profile.id, notify]);

  // Cada vista arranca desde arriba.
  // Con llaves: en Chrome nuevo scrollTo devuelve una promesa, y un efecto que
  // devuelve algo que no es una función rompe la pantalla al cambiar de vista.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const weekState = useWeek(profile.id, week);
  const weekList = useWeekList(profile.id);

  const loadTherapist = useCallback(() => {
    fetchMyTherapist(profile.id)
      .then(setTherapist)
      .catch(() => setTherapist(undefined));
  }, [profile.id]);
  useEffect(() => {
    loadTherapist();
  }, [loadTherapist]);

  // Link de invitación abierto con la sesión iniciada: vincularse (o cambiar) de terapeuta.
  useEffect(() => {
    if (!inviteCode) return;
    let active = true;
    lookupInvitation(inviteCode)
      .then((info) => {
        if (!active) return;
        if (info?.valid) {
          setInvite({ code: inviteCode, therapistName: info.therapistName });
        } else {
          notify('Esa invitación no es válida, venció o ya se usó.');
          onNavigate('registro', true);
        }
      })
      .catch(() => {
        if (!active) return;
        notify('No pude abrir la invitación. Probá de nuevo.');
        onNavigate('registro', true);
      });
    return () => {
      active = false;
    };
  }, [inviteCode, notify]);

  function closeInvite() {
    setInvite(null);
    onNavigate('registro', true);
  }

  async function confirmInvite() {
    if (!invite) return;
    setAccepting(true);
    try {
      await acceptInvitation(invite.code);
      loadTherapist();
      notify(`Listo: compartís tu registro con ${invite.therapistName || 'tu terapeuta'}.`);
      closeInvite();
    } catch {
      notify('No pude aceptar la invitación. Puede que ya se haya usado.');
    } finally {
      setAccepting(false);
    }
  }

  // Registros que quedaron en el navegador de antes de tener cuenta.
  const localDays = useLocal().days;
  const localCount = Object.keys(localDays).length;

  async function importLocal() {
    setImporting(true);
    try {
      await importDays(profile.id, localDays);
      local.clearDays();
      notify(`Subiste ${localCount} día${localCount === 1 ? '' : 's'} a tu cuenta.`);
    } catch {
      notify('No pude subir los registros. Probá de nuevo.');
    } finally {
      setImporting(false);
    }
  }

  function discardLocal() {
    if (window.confirm('¿Descartar los registros guardados en este navegador? No se suben a tu cuenta y no se pueden recuperar.')) {
      local.clearDays();
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

  function goToWeek(monday: string) {
    setWeek(monday);
    setSelectedDate(monday === thisWeek ? today : monday);
  }

  function stepWeek(step: number) {
    setWeek(addDays(week, step * 7));
    setSelectedDate(addDays(selectedDate, step * 7));
  }

  const onDeleted = useCallback(
    (date: string, entry: Entry) => {
      notify(`Borraste “${entry.activity}”`, {
        label: 'Deshacer',
        run: () => {
          const { id: _id, ...rest } = entry;
          actions.addEntries(date, [rest]);
        },
      });
    },
    [notify],
  );

  const chatMessages = chats[selectedDate] ?? [];
  const onMessages = useCallback(
    (update: (prev: ChatMessage[]) => ChatMessage[]) =>
      setChats((prev) => ({ ...prev, [selectedDate]: update(prev[selectedDate] ?? []) })),
    [selectedDate],
  );

  // Alguna propuesta de la IA sin guardar, o un pedido todavía en camino (el último mensaje es del paciente).
  const pendingProposal = Object.values(chats).some(
    (list) => list.some((m) => m.role === 'assistant' && m.status === 'pending') || list[list.length - 1]?.role === 'user',
  );

  /** Muestra u oculta el asistente. Si hay una propuesta sin guardar, pregunta antes de ocultarlo. */
  function setAssistant(shown: boolean): boolean {
    if (shown === assistant) return true;
    if (
      !shown &&
      pendingProposal &&
      !window.confirm('Tenés una propuesta de la IA sin guardar. Si ocultás el asistente, no se agrega a tu día. ¿Ocultarlo igual?')
    ) {
      return false;
    }
    setSheetOpen(false);
    local.setAssistant(shown);
    return true;
  }

  function hideAssistant() {
    const wasOpen = sheetOpen;
    if (!setAssistant(false)) return;
    // El botón se va con el panel: el foco pasa al día elegido, en la columna principal.
    const tile = document.querySelector<HTMLElement>('.day-tile[aria-pressed="true"]');
    tile?.focus({ preventScroll: true });
    // Con teclado, que el foco quede a la vista (con mouse la página no salta).
    if (tile?.matches(':focus-visible')) tile.scrollIntoView({ block: 'center' });
    notify('Ocultaste el asistente.', {
      label: 'Deshacer',
      run: () => {
        local.setAssistant(true);
        setSheetOpen(wasOpen);
        // El panel vuelve: el foco va a su botón de ocultar.
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('.assistant-col [aria-label="Ocultar asistente"]')?.focus(),
        );
      },
    });
  }

  const banner =
    localCount > 0 && !demo ? (
      <div className="notice">
        <span className="notice-text">
          Tenés <b>{localCount} día{localCount === 1 ? '' : 's'}</b> guardado{localCount === 1 ? '' : 's'} en este navegador
          de antes de tu cuenta.
        </span>
        <span className="notice-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={discardLocal} disabled={importing}>
            Descartar
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void importLocal()} disabled={importing}>
            {importing ? 'Subiendo…' : 'Subir a mi cuenta'}
          </button>
        </span>
      </div>
    ) : null;

  const therapistLabel = therapist || 'tu terapeuta';

  return (
    <div className="app" data-view={view} data-role="patient">
      <header className="mobile-bar">
        <Brand />
        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'registro'} onClick={() => onNavigate('registro')}>
            Registro
          </button>
          <button type="button" aria-pressed={view === 'informe'} onClick={() => onNavigate('informe')}>
            Informe
          </button>
        </div>
        <button type="button" className="circle-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
          <Settings />
        </button>
      </header>

      <aside className="sidebar" aria-label="Navegación">
        <Brand />
        <nav className="sidebar-nav">
          <p className="nav-label">Menú</p>
          <ul className="nav-list">
            <li>
              <button
                type="button"
                className="nav-item"
                aria-current={view === 'registro' ? 'page' : undefined}
                onClick={() => onNavigate('registro')}
              >
                <NotebookPen aria-hidden />
                <span className="nav-text">Mi registro</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="nav-item"
                aria-current={view === 'informe' ? 'page' : undefined}
                onClick={() => onNavigate('informe')}
              >
                <ChartColumn aria-hidden />
                <span className="nav-text">Informe semanal</span>
              </button>
            </li>
          </ul>

          <p className="nav-label">Semanas</p>
          <WeekList weeks={weeks} current={week} thisWeek={thisWeek} onSelect={goToWeek} />

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
            <UserRound />
          </span>
          {therapist === null ? (
            <>
              <p className="promo-title">
                <b>Sin terapeuta</b> vinculado
              </p>
              <p className="promo-text">Pedile a tu terapeuta un link de invitación para compartir tu registro.</p>
            </>
          ) : (
            <>
              <p className="promo-title">
                Compartís con <b>{therapist === undefined ? 'tu terapeuta' : therapistLabel}</b>
              </p>
              <p className="promo-text">Ve tus registros a medida que los cargás. Nadie más tiene acceso.</p>
              <button
                type="button"
                className="promo-btn"
                onClick={() => onNavigate(view === 'informe' ? 'registro' : 'informe')}
              >
                {view === 'informe' ? 'Volver al registro' : 'Ver mi informe'}
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        {view === 'registro' ? (
          <PatientView
            days={weekState.days}
            status={weekState.status}
            week={week}
            selectedDate={selectedDate}
            patientName={profile.full_name}
            onWeekStep={stepWeek}
            onToday={() => goToWeek(thisWeek)}
            onSelectDate={setSelectedDate}
            onOpenReport={() => onNavigate('informe')}
            onRetry={weekState.reload}
            onDeleted={onDeleted}
            banner={banner}
            assistant={assistant}
          />
        ) : (
          <TherapistView
            days={weekState.days}
            status={weekState.status}
            patientName={profile.full_name}
            week={week}
            mode="patient"
            therapistName={therapist}
            onWeekStep={stepWeek}
            onRetry={weekState.reload}
          />
        )}
      </main>

      {view === 'registro' && assistant && (
        <>
          <div className={`sheet-backdrop${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} />
          <aside className={`assistant-col${sheetOpen ? ' open' : ''}`} aria-label="Asistente">
            <AssistantChat
              key={selectedDate}
              date={selectedDate}
              day={weekState.days[selectedDate]}
              messages={chatMessages}
              onMessages={onMessages}
              onClose={sheetOpen ? () => setSheetOpen(false) : undefined}
              onHide={hideAssistant}
              onAdded={(count) =>
                notify(count ? `Agregaste ${count} actividad${count === 1 ? '' : 'es'} al día.` : 'Guardado en el día.')
              }
            />
          </aside>
          {!sheetOpen && (
            <button type="button" className="fab" onClick={() => setSheetOpen(true)}>
              <Sparkles aria-hidden />
              Contale tu día
            </button>
          )}
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        profile={profile}
        demo={demo}
        therapistName={therapist}
        onEndLink={async () => {
          await endCareLink(profile.id);
          setTherapist(null);
          notify('Dejaste de compartir tu registro.');
        }}
        onAssistant={setAssistant}
        onClose={() => setSettingsOpen(false)}
        onToast={notify}
      />

      <Modal open={invite !== null} title="Nueva invitación" onClose={closeInvite}>
        {invite && (
          <div className="modal-section">
            <p className="modal-lead">
              <b>{invite.therapistName || 'Un terapeuta'}</b> te invitó a compartir tu registro diario.
            </p>
            <p>
              Va a poder ver tus actividades, puntajes y reflexiones, pero no cambiarlos.
              {therapist && therapist !== invite.therapistName ? (
                <>
                  {' '}
                  Vas a dejar de compartirlo con <b>{therapist}</b>.
                </>
              ) : null}
            </p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void confirmInvite()} disabled={accepting}>
                {accepting ? 'Aceptando…' : 'Aceptar invitación'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closeInvite}>
                Ahora no
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
