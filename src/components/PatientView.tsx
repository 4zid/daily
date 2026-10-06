import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Ellipsis, NotebookPen, Send, Sparkles } from 'lucide-react';
import type { DayLog, Entry } from '../types';
import { getCategory, moodInfo } from '../lib/categories';
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
import { average, withDurations } from '../lib/stats';
import { CategoryAvatar, Menu, MoodPicker, Scores } from './common';
import { EntryForm } from './EntryForm';

export function PatientView({
  days,
  week,
  selectedDate,
  patientName,
  onWeekStep,
  onToday,
  onSelectDate,
  onShare,
  onDeleted,
}: {
  days: Record<string, DayLog>;
  week: string;
  selectedDate: string;
  patientName: string;
  onWeekStep: (step: number) => void;
  onToday: () => void;
  onSelectDate: (date: string) => void;
  onShare: () => void;
  onDeleted: (date: string, entry: Entry) => void;
}) {
  const today = todayISO();
  const dates = weekDays(week);
  const firstName = patientName.trim().split(/\s+/)[0];

  return (
    <div className="main-inner">
      <header className="page-head">
        <div>
          <p className="kicker">
            {firstName ? (
              <>
                Hola, <b>{firstName}</b> ·{' '}
              </>
            ) : null}
            Semana <b>{isoWeekNumber(week)}</b> · {parseISODate(week).getFullYear()}
          </p>
          <h1 className="display">{weekRangeLabel(week)}</h1>
        </div>
        <div className="page-actions">
          <div className="arrows">
            <button type="button" className="circle-btn" onClick={() => onWeekStep(-1)} aria-label="Semana anterior">
              <ChevronLeft />
            </button>
            <button type="button" className="circle-btn" onClick={() => onWeekStep(1)} aria-label="Semana siguiente">
              <ChevronRight />
            </button>
          </div>
          <button type="button" className="btn" onClick={onToday}>
            Hoy
          </button>
          <button type="button" className="btn btn-primary" onClick={onShare}>
            <Send aria-hidden />
            Compartir
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
                {mood && <span aria-hidden>{mood.emoji}</span>}
                {count > 0 ? <span>{count}</span> : <span className="day-tile-empty" aria-hidden />}
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
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  const dayPleasure = average(entries.map((e) => e.pleasure));
  const dayControl = average(entries.map((e) => e.control));

  return (
    <section className="day-panel" aria-labelledby="day-title">
      <div className="section-head">
        <h2 id="day-title" className="h2">
          {longDate(date)}
        </h2>
        <div className="section-head-end">
          <span className="lbl">¿Cómo estuvo el día?</span>
          <MoodPicker label="Ánimo general del día" value={day?.mood} onChange={(m) => actions.setDayMood(date, m)} />
        </div>
      </div>

      <EntryForm
        date={date}
        editing={editing}
        entries={day?.entries ?? []}
        isToday={date === todayISO()}
        onDone={() => setEditingId(null)}
      />

      <section className="card list-card" aria-labelledby="activities-title">
        <header className="card-head">
          <div>
            <h3 id="activities-title" className="h3">
              Actividades
            </h3>
            <p className="sub">
              {entries.length === 0
                ? 'Todavía no cargaste nada'
                : `${entries.length} registrada${entries.length === 1 ? '' : 's'}${totalMinutes ? ` · ${formatDuration(totalMinutes)}` : ''}`}
            </p>
          </div>
          {(dayPleasure || dayControl) && (
            <div className="head-scores" aria-label="Promedios del día">
              <span className="lbl">Promedio</span>
              <Scores pleasure={dayPleasure} control={dayControl} />
            </div>
          )}
        </header>

        {entries.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <NotebookPen aria-hidden />
            </span>
            <p>Cargá tu primera actividad arriba o contale a la IA cómo fue tu día.</p>
          </div>
        ) : (
          <ul className="items">
            {entries.map((e) => {
              return (
                <li key={e.id} className={`item${e.id === editingId ? ' is-editing' : ''}`}>
                  <CategoryAvatar id={e.category} />
                  <div className="item-main">
                    <p className="item-title">
                      {e.activity}
                      {e.source === 'ia' && (
                        <span className="ia-mark" title="Ordenada con la IA">
                          <Sparkles aria-hidden />
                          <span className="sr-only">Ordenada con la IA</span>
                        </span>
                      )}
                    </p>
                    <p className="item-sub">
                      <span className="tabular">
                        {e.start}
                        {e.end ? ` – ${e.end}` : ''}
                      </span>
                      {!e.end && e.minutes ? (
                        <span title="Hasta la siguiente actividad"> · ≈ {formatDuration(e.minutes)}</span>
                      ) : null}
                      <span> · {getCategory(e.category).label}</span>
                      {e.notes ? <span className="item-notes"> · {e.notes}</span> : null}
                    </p>
                  </div>
                  <span className="item-scores">
                    <Scores pleasure={e.pleasure} control={e.control} />
                  </span>
                  <Menu
                    label={`Opciones de ${e.activity}`}
                    triggerClassName="circle-btn ghost sm"
                    trigger={<Ellipsis aria-hidden />}
                    items={[
                      {
                        label: 'Editar',
                        hint: 'Horario, categoría, placer, control o notas',
                        onSelect: () => {
                          setEditingId(e.id);
                          document.getElementById('day-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        },
                      },
                      {
                        label: 'Borrar',
                        hint: 'Podés deshacerlo enseguida',
                        danger: true,
                        onSelect: () => {
                          if (editingId === e.id) setEditingId(null);
                          actions.removeEntry(date, e.id);
                          onDeleted(date, e);
                        },
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
    <section className="tray">
      <div className="tray-card note-card">
        <label htmlFor="reflection" className="h3">
          Reflexión del día
        </label>
        <textarea
          id="reflection"
          className="note-input"
          rows={3}
          maxLength={4000}
          placeholder="¿Qué te gustaría contarle a tu terapeuta sobre este día?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && actions.setReflection(date, text)}
        />
      </div>
      <div className="tray-foot">
        <span className="lbl">Se guarda solo mientras escribís.</span>
      </div>
    </section>
  );
}
