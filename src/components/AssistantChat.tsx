import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Check, LifeBuoy, Mic, MicOff, Sparkles, X } from 'lucide-react';
import type { DayLog } from '../types';
import { getCategory, moodInfo } from '../lib/categories';
import { longDate, weekdayLong } from '../lib/date';
import { organizeDay, type ChatTurn, type OrganizeResult } from '../lib/organize';
import { actions, newId } from '../lib/store';

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
  'Me levanté a las 8 y desayuné. De 9 a 13 trabajé, me costó concentrarme.',
  'A la tarde fui al gimnasio y a la noche cené con amigos, me sentí bien.',
];

function toHistory(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text });
    if (m.role === 'assistant' && m.result.mode === 'ia') {
      const { reply, entries, dayMood, reflection, supportNote } = m.result;
      turns.push({ role: 'assistant', content: JSON.stringify({ reply, entries, dayMood, reflection, supportNote }) });
    }
  }
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
  accessCode,
  onClose,
  onAdded,
}: {
  date: string;
  day: DayLog | undefined;
  messages: ChatMessage[];
  onMessages: (update: (prev: ChatMessage[]) => ChatMessage[]) => void;
  accessCode: string;
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
      const result = await organizeDay(
        {
          date,
          dateLabel: longDate(date),
          history,
          message: trimmed,
          existing: (day?.entries ?? []).map((e) => ({ start: e.start, end: e.end, activity: e.activity })),
        },
        accessCode,
      );
      onMessages((prev) => [
        // Una propuesta nueva reemplaza a las anteriores que no se guardaron.
        ...prev.map((m) => (m.role === 'assistant' && m.status === 'pending' ? { ...m, status: 'replaced' as const } : m)),
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

  return (
    <div className="assistant">
      <div className="assistant-head">
        <div>
          <h2>
            <Sparkles aria-hidden />
            Contale tu día
          </h2>
          <p>
            Contá cómo fue tu {dayName} con tus palabras y lo ordeno en actividades. Vos revisás antes de guardar.
          </p>
        </div>
        {onClose && (
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Cerrar chat">
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
        {messages.length === 0 && !text && (
          <div className="suggestions" aria-label="Ejemplos">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)}>
                {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
              </button>
            ))}
          </div>
        )}
        <div className="composer-box">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={listening ? 'Te escucho…' : `¿Cómo fue tu ${dayName}?`}
            aria-label="Contale tu día a la IA"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {SpeechRecognition && (
              <button
                type="button"
                className="icon-btn"
                onClick={toggleDictation}
                aria-pressed={listening}
                aria-label={listening ? 'Detener dictado' : 'Dictar por voz'}
                style={listening ? { color: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
              >
                {listening ? <MicOff /> : <Mic />}
              </button>
            )}
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
        <div className="proposal" style={m.status === 'discarded' || m.status === 'replaced' ? { opacity: 0.55 } : undefined}>
          {result.entries.length > 0 && (
            <ul className="proposal-list">
              {result.entries.map((e, i) => (
                <li key={i}>
                  <label className="proposal-item">
                    <input
                      type="checkbox"
                      checked={m.selected[i]}
                      disabled={m.status !== 'pending'}
                      onChange={(ev) =>
                        onUpdate({ selected: m.selected.map((s, j) => (j === i ? ev.target.checked : s)) })
                      }
                    />
                    <span className="time">
                      {e.start}
                      {e.end && (
                        <>
                          <br />
                          <small className="muted">{e.end}</small>
                        </>
                      )}
                    </span>
                    <span className="what">
                      <span>
                        {e.activity} {moodInfo(e.mood)?.emoji}
                      </span>
                      <small>
                        {getCategory(e.category).label}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {(mood || result.reflection) && (
            <div className="proposal-extra">
              {mood && (
                <label>
                  <input
                    type="checkbox"
                    checked={m.applyMood}
                    disabled={m.status !== 'pending'}
                    onChange={(e) => onUpdate({ applyMood: e.target.checked })}
                  />
                  <span>
                    Ánimo del día: {mood.emoji} {mood.label}
                  </span>
                </label>
              )}
              {result.reflection && (
                <label>
                  <input
                    type="checkbox"
                    checked={m.applyReflection}
                    disabled={m.status !== 'pending'}
                    onChange={(e) => onUpdate({ applyReflection: e.target.checked })}
                  />
                  <span>Reflexión: “{result.reflection}”</span>
                </label>
              )}
            </div>
          )}
          {m.status === 'pending' ? (
            <div className="proposal-foot">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onUpdate({ status: 'discarded' })}>
                Descartar
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={onApply} disabled={!canApply}>
                <Check />
                {count > 0 ? `Agregar ${count} al día` : 'Guardar en el día'}
              </button>
            </div>
          ) : (
            <div className="proposal-status">
              {m.status === 'added' ? (
                <>
                  <Check aria-hidden /> Guardado en el día
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
