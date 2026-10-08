import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Check, LifeBuoy, Mic, PenLine, Plus, Sparkles, X } from 'lucide-react';
import type { DayLog } from '../types';
import { getCategory, moodInfo } from '../lib/categories';
import { longDate, parseISODate, weekdayLong, weekdayShort } from '../lib/date';
import { organizeDay, type ChatTurn, type OrganizeResult } from '../lib/organize';
import { actions } from '../lib/cloud';
import { newId } from '../lib/store';
import { CategoryAvatar, Menu, MoodIcon, RoundCheck } from './common';
import { LegalLink } from './Legal';

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      result: OrganizeResult;
      status: 'pending' | 'added' | 'discarded' | 'replaced';
      selected: boolean[];
      applyMood: boolean;
      applyReflection: boolean;
    }
  | { id: string; role: 'error'; text: string };

// Mismos límites que valida el servidor (api/organize.ts).
const MAX_HISTORY_TURNS = 30;
const MAX_MESSAGE_LENGTH = 8000;

const EXAMPLES = [
  {
    label: 'Día con horarios',
    hint: 'Con horas de inicio y fin',
    text: 'A las 8 desayuné, placer 6, control 7. De 9 a 13 trabajé, me costó concentrarme: placer 3, control 4. A las 18 fui al gimnasio, placer 8, control 8.',
  },
  {
    label: 'Día sin horarios',
    hint: 'La IA estima las horas',
    text: 'A la mañana limpié la casa, a la tarde fui a terapia y a la noche cené con amigos, lo disfruté muchísimo.',
  },
  {
    label: 'Día difícil',
    hint: 'Con emociones y pensamientos',
    text: 'Dormí mal y me levanté tarde, tipo 11. Me angustié después de hablar con mi mamá, a la tarde salí a caminar y me ayudó un poco.',
  },
];

function toHistory(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  messages.forEach((m, i) => {
    // Un mensaje que falló no se manda: la persona lo vuelve a contar (por ejemplo, en partes).
    if (m.role === 'user' && messages[i + 1]?.role !== 'error') turns.push({ role: 'user', content: m.text });
    if (m.role === 'assistant' && m.result.mode === 'ia') {
      // Solo la propuesta pendiente va completa: lo guardado ya va entre las actividades
      // guardadas, y lo descartado o reemplazado no hay que volver a proponerlo.
      const { reply, entries, dayMood, reflection, supportNote } = m.result;
      const day =
        m.status === 'pending'
          ? { reply, entries, dayMood, reflection, supportNote }
          : { reply, entries: [], dayMood: null, reflection: null, supportNote: null };
      turns.push({ role: 'assistant', content: JSON.stringify(day) });
    }
  });
  return turns.slice(-MAX_HISTORY_TURNS);
}

// Dictado por voz del navegador (Chrome, Edge, Safari). Si no existe, el botón no aparece.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssistantChat({
  date,
  day,
  messages,
  onMessages,
  onClose,
  onAdded,
}: {
  date: string;
  day: DayLog | undefined;
  messages: ChatMessage[];
  onMessages: (update: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onClose?: () => void;
  onAdded: (count: number) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const SpeechRecognition = getRecognition();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function send(message = text) {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    recognitionRef.current?.stop();
    const history = toHistory(messages);
    onMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }]);
    setText('');
    setLoading(true);
    try {
      const result = await organizeDay({
        date,
        dateLabel: longDate(date),
        history,
        message: trimmed,
        existing: (day?.entries ?? []).map((e) => ({ start: e.start, end: e.end, activity: e.activity })),
      });
      onMessages((prev) => [
        // Una propuesta nueva reemplaza a las anteriores que no se guardaron. Una del modo
        // básico no reemplaza a una de la IA (solo leyó el último mensaje, no la corrige).
        ...prev.map((m) =>
          m.role === 'assistant' && m.status === 'pending' && (result.mode === 'ia' || m.result.mode === 'basico')
            ? { ...m, status: 'replaced' as const }
            : m,
        ),
        {
          id: newId(),
          role: 'assistant',
          result,
          status: result.entries.length || result.dayMood || result.reflection ? 'pending' : 'discarded',
          selected: result.entries.map(() => true),
          applyMood: !!result.dayMood && !day?.mood,
          applyReflection: !!result.reflection && !day?.reflection,
        },
      ]);
    } catch (error) {
      onMessages((prev) => [
        ...prev,
        { id: newId(), role: 'error', text: error instanceof Error ? error.message : 'Algo salió mal.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function update(id: string, patch: Partial<Extract<ChatMessage, { role: 'assistant' }>>) {
    onMessages((prev) => prev.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, ...patch } : m)));
  }

  function apply(m: Extract<ChatMessage, { role: 'assistant' }>) {
    const chosen = m.result.entries.filter((_, i) => m.selected[i]);
    if (chosen.length) actions.addEntries(date, chosen);
    if (m.applyMood && m.result.dayMood) actions.setDayMood(date, m.result.dayMood);
    if (m.applyReflection && m.result.reflection) {
      const current = day?.reflection?.trim();
      actions.setReflection(date, current ? `${current}\n\n${m.result.reflection}` : m.result.reflection);
    }
    update(m.id, { status: 'added' });
    onAdded(chosen.length);
  }

  function toggleDictation() {
    if (!SpeechRecognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = false;
    const base = text ? `${text.trimEnd()} ` : '';
    let finalText = '';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      setText((base + finalText.trim()).slice(0, MAX_MESSAGE_LENGTH));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const touch = window.matchMedia('(hover: none)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const dayName = weekdayLong(date).toLowerCase();
  const dayChip = `${weekdayShort(date)} ${parseISODate(date).getDate()}`;

  return (
    <div className="assistant">
      <div className="assistant-head">
        <span className="assistant-icon" aria-hidden>
          <Sparkles />
        </span>
        <div>
          <h2>Contale tu día</h2>
          <p>
            Lo ordeno en actividades y vos revisás antes de guardar.{' '}
            {/* Aviso en el momento: qué pasa con lo que se escribe acá (otra pestaña: el chat no se pierde). */}
            <LegalLink page="privacidad" section="ia" newTab className="assistant-privacy">
              Privacidad
            </LegalLink>
          </p>
        </div>
        {onClose && (
          <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Cerrar chat">
            <X />
          </button>
        )}
      </div>

      <div className="messages" ref={listRef} aria-live="polite">
        <div className="msg msg-assistant">
          <div className="msg-bubble">
            Hola 👋 {SpeechRecognition ? 'Escribime o dictame' : 'Escribime'} qué hiciste el {dayName}, más o menos a
            qué hora y cómo te sentiste. No hace falta que esté ordenado.
          </div>
        </div>

        {messages.map((m) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="msg msg-user">
                {m.text}
              </div>
            );
          }
          if (m.role === 'error') {
            return (
              <div key={m.id} className="msg msg-error" role="alert">
                {m.text}
              </div>
            );
          }
          return <Proposal key={m.id} message={m} onUpdate={(patch) => update(m.id, patch)} onApply={() => apply(m)} />;
        })}

        {loading && (
          <div className="typing" aria-label="Ordenando tu día">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <div className="composer">
        <div className="tray">
          <div className="tray-card composer-card">
            <textarea
              ref={inputRef}
              rows={2}
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={listening ? 'Te escucho…' : `¿Cómo fue tu ${dayName}?`}
              aria-label="Contale tu día a la IA"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="tray-foot">
            <Menu
              label="Ejemplos para empezar"
              triggerClassName="circle-btn"
              trigger={<Plus aria-hidden />}
              align="start"
              placement="top"
              items={EXAMPLES.map((ex) => ({
                label: ex.label,
                hint: ex.hint,
                selected: text === ex.text,
                onSelect: () => {
                  setText(ex.text);
                  inputRef.current?.focus();
                },
              }))}
            />
            {SpeechRecognition && (
              <button
                type="button"
                className={`chip${listening ? ' is-live' : ''}`}
                onClick={toggleDictation}
                aria-pressed={listening}
              >
                {listening ? <span className="live-dot" aria-hidden /> : <Mic aria-hidden />}
                {listening ? 'Escuchando' : 'Dictar'}
              </button>
            )}
            <span className="chip chip-static">{dayChip}</span>
            <span className="spacer" />
            <button
              type="button"
              className="send-btn"
              onClick={() => void send()}
              disabled={!text.trim() || loading}
              aria-label="Enviar"
            >
              <ArrowUp />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Proposal({
  message: m,
  onUpdate,
  onApply,
}: {
  message: Extract<ChatMessage, { role: 'assistant' }>;
  onUpdate: (patch: Partial<Extract<ChatMessage, { role: 'assistant' }>>) => void;
  onApply: () => void;
}) {
  const { result } = m;
  const count = m.selected.filter(Boolean).length;
  const mood = moodInfo(result.dayMood);
  const hasContent = result.entries.length > 0 || mood || result.reflection;
  const canApply = count > 0 || (m.applyMood && mood) || (m.applyReflection && result.reflection);

  return (
    <div className="msg msg-assistant">
      {result.supportNote && (
        <div className="support-note" role="note">
          <LifeBuoy aria-hidden />
          <span>{result.supportNote}</span>
        </div>
      )}
      <div className="msg-bubble">{result.reply}</div>
      {result.notice && <p className="msg-notice">{result.notice}</p>}

      {hasContent && (
        <div className={`proposal${m.status === 'discarded' || m.status === 'replaced' ? ' is-faded' : ''}`}>
          {result.entries.length > 0 && (
            <ul className="proposal-list">
              {result.entries.map((e, i) => (
                <li key={i}>
                  <label className="proposal-item">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={m.selected[i]}
                      disabled={m.status !== 'pending'}
                      onChange={(ev) =>
                        onUpdate({ selected: m.selected.map((s, j) => (j === i ? ev.target.checked : s)) })
                      }
                    />
                    <CategoryAvatar id={e.category} />
                    <span className="what">
                      <span className="what-title">{e.activity}</span>
                      <small>
                        <span className="tabular">
                          {e.start}
                          {e.end ? ` – ${e.end}` : ''}
                        </span>
                        {' · '}
                        {getCategory(e.category).label}
                        {e.pleasure ? ` · Placer ${e.pleasure}` : ''}
                        {e.control ? ` · Control ${e.control}` : ''}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </small>
                    </span>
                    <RoundCheck checked={m.selected[i]} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          {(mood || result.reflection) && (
            <div className="proposal-extra">
              {mood && (
                <label className="proposal-item">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={m.applyMood}
                    disabled={m.status !== 'pending'}
                    onChange={(e) => onUpdate({ applyMood: e.target.checked })}
                  />
                  <span className="avatar avatar-plain" aria-hidden>
                    <MoodIcon value={mood.value} />
                  </span>
                  <span className="what">
                    <span className="what-title">Ánimo del día</span>
                    <small>{mood.label}</small>
                  </span>
                  <RoundCheck checked={m.applyMood} />
                </label>
              )}
              {result.reflection && (
                <label className="proposal-item">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={m.applyReflection}
                    disabled={m.status !== 'pending'}
                    onChange={(e) => onUpdate({ applyReflection: e.target.checked })}
                  />
                  <span className="avatar avatar-plain" aria-hidden>
                    <PenLine />
                  </span>
                  <span className="what">
                    <span className="what-title">Reflexión</span>
                    <small>“{result.reflection}”</small>
                  </span>
                  <RoundCheck checked={m.applyReflection} />
                </label>
              )}
            </div>
          )}
          {m.status === 'pending' ? (
            <div className="proposal-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUpdate({ status: 'discarded' })}>
                Descartar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onApply} disabled={!canApply}>
                <Check aria-hidden />
                {count > 0 ? `Agregar ${count} al día` : 'Guardar en el día'}
              </button>
            </div>
          ) : (
            <div className="proposal-status">
              {m.status === 'added' ? (
                <>
                  <RoundCheck checked /> Guardado en el día
                </>
              ) : m.status === 'replaced' ? (
                'Reemplazada por la propuesta nueva'
              ) : (
                'Descartada'
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
