import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { CategoryId, Entry, Rating } from '../types';
import { CATEGORIES, categoryColorVar } from '../lib/categories';
import { addMinutes, formatDuration, nowRounded, timeToMinutes } from '../lib/date';
import { actions } from '../lib/cloud';
import { RatingScale } from './common';
import { TimeSelect, type TimeShortcut } from './TimeSelect';

/** Duraciones rápidas para completar la hora de fin con un toque. */
const QUICK_DURATIONS = [30, 60, 90, 120, 180];

interface Draft {
  start: string;
  end: string;
  activity: string;
  category: CategoryId;
  pleasure: Rating | undefined;
  control: Rating | undefined;
  notes: string;
}

const EMPTY: Draft = {
  start: '',
  end: '',
  activity: '',
  category: 'otro',
  pleasure: undefined,
  control: undefined,
  notes: '',
};

function fromEntry(e: Entry): Draft {
  return {
    start: e.start,
    end: e.end ?? '',
    activity: e.activity,
    category: e.category,
    pleasure: e.pleasure,
    control: e.control,
    notes: e.notes ?? '',
  };
}

function durationLabel(start: string, end: string): string {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null) return 'Elegí el horario';
  if (b === null) return 'Hasta la siguiente';
  return formatDuration(b >= a ? b - a : b + 24 * 60 - a);
}

export function EntryForm({
  date,
  editing,
  entries,
  isToday,
  onDone,
}: {
  date: string;
  editing: Entry | null;
  /** Actividades ya cargadas en el día, ordenadas por hora. */
  entries: Entry[];
  isToday: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // Mientras no se toque el inicio, sigue la sugerencia (fin de la última actividad).
  const [startTouched, setStartTouched] = useState(false);
  const activityRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const lastEnd = entries.at(-1)?.end ?? '';

  useEffect(() => {
    setDraft(editing ? fromEntry(editing) : { ...EMPTY, start: lastEnd });
    setStartTouched(false);
    // Solo al cambiar de día o de actividad en edición.
  }, [editing, date]);

  useEffect(() => {
    if (!editing && !startTouched) setDraft((d) => ({ ...d, start: lastEnd }));
  }, [lastEnd, editing, startTouched]);

  // En el celular las categorías se desplazan: deja visible la elegida.
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && chipsRef.current && chipsRef.current.scrollWidth > chipsRef.current.clientWidth) {
      chipsRef.current.scrollLeft = el.offsetLeft - 18;
    }
  }, [draft.category, date]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setStart = (value: string) => {
    setStartTouched(true);
    set('start', value);
  };
  const canSave = draft.start !== '' && draft.activity.trim() !== '';

  const startMin = timeToMinutes(draft.start);
  const next = entries.find((e) => e.id !== editing?.id && startMin !== null && (timeToMinutes(e.start) ?? -1) > startMin);

  const startShortcuts: TimeShortcut[] = [];
  if (isToday) startShortcuts.push({ label: 'Ahora', value: nowRounded() });
  if (lastEnd) startShortcuts.push({ label: 'Fin anterior', value: lastEnd });

  const endShortcuts: TimeShortcut[] = next ? [{ label: 'Hasta la siguiente', value: next.start }] : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const entry = {
      start: draft.start,
      end: draft.end || undefined,
      activity: draft.activity.trim(),
      category: draft.category,
      pleasure: draft.pleasure,
      control: draft.control,
      notes: draft.notes.trim() || undefined,
    };
    if (editing) {
      actions.updateEntry(date, { ...editing, ...entry });
    } else {
      actions.addEntries(date, [{ ...entry, source: 'manual' }]);
      activityRef.current?.focus();
    }
    // La próxima actividad arranca donde terminó esta.
    setDraft({ ...EMPTY, start: draft.end || '' });
    setStartTouched(Boolean(draft.end));
    onDone();
  }

  return (
    <form className="tray entry-tray" onSubmit={submit} aria-label={editing ? 'Editar actividad' : 'Nueva actividad'}>
      <div className="tray-card entry-card">
        <div className="time-block">
          <div className="time-row">
            <div className="time-field">
              <span className="lbl">Inicio</span>
              <TimeSelect label="Inicio" value={draft.start} onChange={setStart} shortcuts={startShortcuts} />
            </div>
            <div className="time-field is-end">
              <span className="lbl">
                Fin <em>opcional</em>
              </span>
              <TimeSelect
                label="Fin"
                value={draft.end}
                onChange={(v) => set('end', v)}
                align="end"
                shortcuts={endShortcuts}
                clearLabel="Sin hora de fin"
              />
            </div>
          </div>
          {draft.start && (
            <div className="quick-durations" role="group" aria-label="Duración rápida">
              <span className="lbl">Duró</span>
              {QUICK_DURATIONS.map((minutes) => {
                const end = addMinutes(draft.start, minutes)!;
                return (
                  <button
                    key={minutes}
                    type="button"
                    className="chip chip-sm"
                    aria-pressed={draft.end === end}
                    onClick={() => set('end', draft.end === end ? '' : end)}
                  >
                    {formatDuration(minutes)}
                  </button>
                );
              })}
            </div>
          )}
          <span className="duration-pill" aria-live="polite">
            {durationLabel(draft.start, draft.end)}
          </span>
        </div>

        <label className="activity-field">
          <span className="lbl">¿Qué hiciste?</span>
          <input
            ref={activityRef}
            className="big-input"
            type="text"
            required
            maxLength={200}
            placeholder="Desayuné con mi hermana"
            value={draft.activity}
            onChange={(e) => set('activity', e.target.value)}
          />
        </label>

        <div className="chip-scroll" role="radiogroup" aria-label="Categoría" ref={chipsRef}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={draft.category === c.id}
              className="chip"
              onClick={() => set('category', c.id)}
            >
              <span className="dot" style={{ background: categoryColorVar(c.id) }} aria-hidden />
              {c.label}
            </button>
          ))}
        </div>

        <div className="ratings">
          <RatingScale scale="pleasure" value={draft.pleasure} onChange={(v) => set('pleasure', v)} />
          <RatingScale scale="control" value={draft.control} onChange={(v) => set('control', v)} />
        </div>

        <input
          className="soft-input"
          type="text"
          maxLength={1000}
          aria-label="Notas: qué sentiste o pensaste"
          placeholder="Notas: qué sentiste o pensaste (opcional)"
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="tray-foot">
        <div className="tray-foot-start">
          <span className="lbl">Puntuá placer y control del 1 (nada) al 10 (muchísimo).</span>
        </div>
        <div className="tray-foot-end">
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={onDone}>
              Cancelar
            </button>
          )}
          <button type="submit" className="go-btn" disabled={!canSave}>
            {editing ? 'Guardar' : 'Agregar'}
            {editing ? <Check aria-hidden /> : <ArrowRight aria-hidden />}
          </button>
        </div>
      </div>
    </form>
  );
}
