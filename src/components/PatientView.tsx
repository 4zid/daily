import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, NotebookPen, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import type { DayLog, Entry } from '../types';
import { categoryColorVar, moodInfo } from '../lib/categories';
import {
  formatDuration,
  isoWeekNumber,
  longDate,
  parseISODate,
  todayISO,
  weekDays,
  weekRangeLabel,
  weekdayShort,
} from '../lib/date';
import { actions } from '../lib/store';
import { withDurations } from '../lib/stats';
import { CategoryLabel, MoodPicker } from './common';
import { EntryForm } from './EntryForm';

export function PatientView({
  days,
  week,
  selectedDate,
  onWeekStep,
  onToday,
  onSelectDate,
  onShare,
  onDeleted,
}: {
  days: Record<string, DayLog>;
  week: string;
  selectedDate: string;
  onWeekStep: (step: number) => void;
  onToday: () => void;
  onSelectDate: (date: string) => void;
  onShare: () => void;
  onDeleted: (date: string, entry: Entry) => void;
}) {
  const today = todayISO();
  const dates = weekDays(week);

  return (
    <div className="main-inner">
      <header className="week-header">
        <div>
          <p className="eyebrow">
            Semana {isoWeekNumber(week)} · {parseISODate(week).getFullYear()}
          </p>
          <div className="week-title">
            <h1>{weekRangeLabel(week)}</h1>
            <button type="button" className="icon-btn" onClick={() => onWeekStep(-1)} aria-label="Semana anterior">
              <ChevronLeft />
            </button>
            <button type="button" className="icon-btn" onClick={() => onWeekStep(1)} aria-label="Semana siguiente">
              <ChevronRight />
            </button>
          </div>
        </div>
        <div className="week-actions">
          <button type="button" className="btn" onClick={onToday}>
            <CalendarDays />
            Hoy
          </button>
          <button type="button" className="btn" onClick={onShare}>
            <Send />
            <span>
              Compartir<span className="label-long"> con mi terapeuta</span>
            </span>
          </button>
        </div>
      </header>

      <nav className="day-strip" aria-label="Días de la semana">
        {dates.map((date) => {
          const day = days[date];
          const count = day?.entries.length ?? 0;
          const mood = moodInfo(day?.mood);
          return (
            <button
              key={date}
              type="button"
              className={`day-tile${date === today ? ' is-today' : ''}`}
              aria-pressed={date === selectedDate}
              aria-label={`${longDate(date)}: ${count} actividades`}
              onClick={() => onSelectDate(date)}
            >
              <span className="day-tile-name">{weekdayShort(date)}</span>
              <span className="day-tile-num">{parseISODate(date).getDate()}</span>
              <span className="day-tile-meta">
                {mood ? <span aria-hidden>{mood.emoji}</span> : null}
                {count > 0 ? <span>{count}</span> : <span aria-hidden>·</span>}
              </span>
              <span className="day-tile-bars" aria-hidden>
                {day?.entries.slice(0, 10).map((e) => (
                  <span key={e.id} style={{ background: categoryColorVar(e.category) }} />
                ))}
              </span>
            </button>
          );
        })}
      </nav>

      <DayPanel key={selectedDate} date={selectedDate} day={days[selectedDate]} onDeleted={onDeleted} />
    </div>
  );
}

function DayPanel({
  date,
  day,
  onDeleted,
}: {
  date: string;
  day: DayLog | undefined;
  onDeleted: (date: string, entry: Entry) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const entries = useMemo(() => withDurations(day?.entries ?? []), [day?.entries]);
  const editing = day?.entries.find((e) => e.id === editingId) ?? null;
  const last = day?.entries[day.entries.length - 1];

  return (
    <section className="day-panel" aria-labelledby="day-title">
      <div className="day-head">
        <h2 id="day-title">{longDate(date)}</h2>
        <div className="mood-picker-wrap" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="mood-label">¿Cómo estuvo el día?</span>
          <MoodPicker label="Ánimo general del día" value={day?.mood} onChange={(m) => actions.setDayMood(date, m)} />
        </div>
      </div>

      <EntryForm
        date={date}
        editing={editing}
        suggestedStart={last?.end ?? ''}
        onDone={() => setEditingId(null)}
      />

      <div className="card section-card">
        {entries.length === 0 ? (
          <div className="empty">
            <NotebookPen aria-hidden />
            <p>Todavía no hay actividades este día.</p>
            <p className="hint">
              Cargalas arriba o <Sparkles aria-hidden style={{ width: 14, height: 14, verticalAlign: -2 }} /> contale a la IA
              cómo fue tu día y ella las ordena.
            </p>
          </div>
        ) : (
          <ol className="timeline">
            {entries.map((e) => {
              const mood = moodInfo(e.mood);
              return (
                <li key={e.id} className={`timeline-item${e.id === editingId ? ' is-editing' : ''}`}>
                  <div className="timeline-time">
                    <strong>{e.start}</strong>
                    {e.end ? (
                      <span>a {e.end}</span>
                    ) : e.minutes ? (
                      <span title="Calculado hasta la siguiente actividad">≈ {formatDuration(e.minutes)}</span>
                    ) : null}
                  </div>
                  <div className="timeline-rail" aria-hidden>
                    <span className="dot" style={{ background: categoryColorVar(e.category) }} />
                  </div>
                  <div className="timeline-body">
                    <div className="timeline-title">
                      <span>{e.activity}</span>
                      {mood && (
                        <span title={mood.label} aria-label={`Ánimo: ${mood.label}`}>
                          {mood.emoji}
                        </span>
                      )}
                    </div>
                    <div className="timeline-meta">
                      <CategoryLabel id={e.category} />
                      {e.source === 'ia' && (
                        <span className="chip" title="Ordenada con la IA">
                          <Sparkles style={{ width: 12, height: 12 }} aria-hidden /> IA
                        </span>
                      )}
                    </div>
                    {e.notes && <p className="timeline-notes">{e.notes}</p>}
                  </div>
                  <div className="timeline-actions">
                    <button
                      type="button"
                      className="icon-btn sm"
                      aria-label={`Editar ${e.activity}`}
                      onClick={() => {
                        setEditingId(e.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      className="icon-btn sm"
                      aria-label={`Borrar ${e.activity}`}
                      onClick={() => {
                        if (editingId === e.id) setEditingId(null);
                        actions.removeEntry(date, e.id);
                        onDeleted(date, e);
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Reflection date={date} value={day?.reflection ?? ''} />
    </section>
  );
}

function Reflection({ date, value }: { date: string; value: string }) {
  const [text, setText] = useState(value);

  // Si la IA agrega una reflexión, se refleja en el campo.
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => actions.setReflection(date, text), 500);
    return () => window.clearTimeout(t);
  }, [text, value, date]);

  return (
    <div className="card reflection">
      <label htmlFor="reflection">Reflexión del día</label>
      <p className="hint">¿Qué te gustaría contarle a tu terapeuta sobre este día? Se guarda solo.</p>
      <textarea
        id="reflection"
        className="textarea"
        rows={3}
        maxLength={4000}
        placeholder="Ej.: A la tarde me angustié después de la llamada, pero salir a caminar me ayudó."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && actions.setReflection(date, text)}
      />
    </div>
  );
}
