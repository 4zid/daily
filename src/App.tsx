import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Settings, Sparkles, Stethoscope, User } from 'lucide-react';
import type { Entry, PatientDataset } from './types';
import { addDays, todayISO, weekStart } from './lib/date';
import { decodeWeek, buildShareUrl } from './lib/share';
import { weeksWithData } from './lib/stats';
import { actions, parseBackup, useStore } from './lib/store';
import { AssistantChat, type ChatMessage } from './components/AssistantChat';
import { SettingsDialog, ShareDialog } from './components/Dialogs';
import { PatientView } from './components/PatientView';
import { TherapistView, type DataSource } from './components/TherapistView';
import { WeekList } from './components/WeekList';
import { Toast, type ToastState } from './components/common';

type View = 'paciente' | 'terapeuta';

function parseHash(): { view: View; token?: string } {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return {
    view: path === 'terapeuta' ? 'terapeuta' : 'paciente',
    token: new URLSearchParams(query).get('semana') ?? undefined,
  };
}

function setHash(view: View) {
  window.location.hash = `/${view}`;
}

export default function App() {
  const data = useStore();
  const today = todayISO();
  const thisWeek = weekStart(today);

  const [route, setRoute] = useState(parseHash);
  const [week, setWeek] = useState(thisWeek);
  const [selectedDate, setSelectedDate] = useState(today);
  const [source, setSource] = useState<DataSource>('local');
  const [linkData, setLinkData] = useState<PatientDataset | null>(null);
  const [fileData, setFileData] = useState<PatientDataset | null>(null);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [share, setShare] = useState<{ open: boolean; url: string | null }>({ open: false, url: null });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string, action?: ToastState['action']) => {
    setToast({ id: Date.now(), text, action });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Un link compartido trae la semana adentro: se decodifica y se muestra en la vista de terapeuta.
  useEffect(() => {
    if (!route.token) return;
    let cancelled = false;
    decodeWeek(route.token)
      .then((shared) => {
        if (cancelled) return;
        setLinkData(shared);
        setSource('link');
        setWeek(shared.week);
      })
      .catch((error) => {
        if (cancelled) return;
        const unsupported = error instanceof Error && error.message.startsWith('Este navegador');
        notify(unsupported ? error.message : 'El link compartido no es válido o está incompleto.');
      });
    return () => {
      cancelled = true;
    };
  }, [route.token, notify]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);

  const view = route.view;
  const dataset: PatientDataset =
    source === 'link' && linkData
      ? linkData
      : source === 'file' && fileData
        ? fileData
        : { patientName: data.patientName, days: data.days };

  const weeks = useMemo(() => {
    const days = view === 'terapeuta' ? dataset.days : data.days;
    const set = new Set(weeksWithData(days, weekStart));
    if (view === 'paciente' || source === 'local') set.add(thisWeek);
    set.add(week);
    return [...set].sort().reverse();
  }, [view, dataset.days, data.days, source, thisWeek, week]);

  function goToWeek(monday: string) {
    setWeek(monday);
    setSelectedDate(monday === thisWeek ? today : monday);
  }

  function stepWeek(step: number) {
    setWeek(addDays(week, step * 7));
    setSelectedDate(addDays(selectedDate, step * 7));
  }

  function backToLocal() {
    setSource('local');
    history.replaceState(null, '', '#/terapeuta');
    setRoute({ view: 'terapeuta' });
  }

  async function openShare() {
    setShare({ open: true, url: null });
    try {
      setShare({ open: true, url: await buildShareUrl(data.patientName, week, data.days) });
    } catch {
      setShare({ open: false, url: null });
      notify('No pude generar el link. Probá descargando el archivo desde Ajustes.');
    }
  }

  async function openPatientFile(file: File) {
    try {
      const backup = parseBackup(await file.text());
      setFileData(backup);
      setSource('file');
      const latest = weeksWithData(backup.days, weekStart)[0];
      if (latest) goToWeek(latest);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pude leer el archivo.');
    }
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

  const noteKey = `${dataset.patientName.trim() || 'paciente'}|${week}`;
  const onNote = useCallback((note: string) => actions.setTherapistNote(noteKey, note), [noteKey]);

  const chatMessages = chats[selectedDate] ?? [];
  const onMessages = useCallback(
    (update: (prev: ChatMessage[]) => ChatMessage[]) =>
      setChats((prev) => ({ ...prev, [selectedDate]: update(prev[selectedDate] ?? []) })),
    [selectedDate],
  );

  return (
    <div data-view={view}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 17h14M8 13a4 4 0 0 1 8 0" />
            </svg>
          </span>
          <span>
            daily <small>· registro</small>
          </span>
        </div>

        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'paciente'} onClick={() => setHash('paciente')}>
            <User aria-hidden />
            Paciente
          </button>
          <button type="button" aria-pressed={view === 'terapeuta'} onClick={() => setHash('terapeuta')}>
            <Stethoscope aria-hidden />
            Terapeuta
          </button>
        </div>

        <div className="topbar-end">
          {view === 'paciente' && (
            <button type="button" className="who btn-ghost" onClick={() => setSettingsOpen(true)} style={{ border: 0, background: 'none' }}>
              {data.patientName || 'Agregá tu nombre'}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <Settings />
          </button>
        </div>
      </header>

      <div className={`layout${view === 'terapeuta' ? ' no-assistant' : ''}`}>
        <aside className="sidebar" aria-label="Semanas">
          <div className="sidebar-section weeks">
            <h2 className="eyebrow">{view === 'paciente' ? 'Tus semanas' : 'Semanas'}</h2>
            <WeekList
              weeks={weeks}
              current={week}
              thisWeek={thisWeek}
              days={view === 'terapeuta' ? dataset.days : data.days}
              onSelect={goToWeek}
            />
          </div>
          <div className="sidebar-section">
            {view === 'paciente' ? (
              <p className="sidebar-note">
                Tus registros se guardan solo en este navegador. Descargá un respaldo desde{' '}
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  style={{ border: 0, padding: 0, background: 'none', color: 'var(--accent)', fontSize: 'inherit' }}
                >
                  Ajustes
                </button>
                .
              </p>
            ) : (
              <>
                <button type="button" className="btn" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
                  <FileUp />
                  Abrir archivo del paciente
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void openPatientFile(file);
                    e.target.value = '';
                  }}
                />
                <p className="sidebar-note" style={{ marginTop: 10 }}>
                  También podés abrir el link que te comparta tu paciente.
                </p>
              </>
            )}
          </div>
        </aside>

        <main className="main">
          {view === 'paciente' ? (
            <PatientView
              days={data.days}
              week={week}
              selectedDate={selectedDate}
              onWeekStep={stepWeek}
              onToday={() => goToWeek(thisWeek)}
              onSelectDate={setSelectedDate}
              onShare={() => void openShare()}
              onDeleted={onDeleted}
            />
          ) : (
            <TherapistView
              dataset={dataset}
              source={source}
              week={week}
              note={data.therapistNotes[noteKey] ?? ''}
              onNote={onNote}
              onWeekStep={stepWeek}
              onBackToLocal={backToLocal}
            />
          )}
        </main>

        {view === 'paciente' && (
          <>
            <div className={`sheet-backdrop${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} />
            <aside className={`assistant-col${sheetOpen ? ' open' : ''}`} aria-label="Asistente">
              <AssistantChat
                key={selectedDate}
                date={selectedDate}
                day={data.days[selectedDate]}
                messages={chatMessages}
                onMessages={onMessages}
                accessCode={data.settings.accessCode}
                onClose={sheetOpen ? () => setSheetOpen(false) : undefined}
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
      </div>

      <SettingsDialog open={settingsOpen} data={data} onClose={() => setSettingsOpen(false)} onToast={notify} />
      <ShareDialog
        open={share.open}
        url={share.url}
        week={week}
        data={data}
        onClose={() => setShare({ open: false, url: null })}
        onPreview={() => {
          if (share.url) window.location.href = share.url;
          setShare({ open: false, url: null });
        }}
        onToast={notify}
      />
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
