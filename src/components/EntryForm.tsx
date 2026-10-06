import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { CategoryId, Entry, Rating } from '../types';
import { CATEGORIES, categoryColorVar } from '../lib/categories';
import { formatDuration, timeToMinutes } from '../lib/date';
import { actions } from '../lib/store';
import { RatingScale } from './common';

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
  suggestedStart,
  onDone,
}: {
  date: string;
  editing: Entry | null;
  suggestedStart: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    setDraft(editing ? fromEntry(editing) : { ...EMPTY, start: suggestedStart });
    // suggestedStart cambia al agregar; solo se usa al empezar un borrador nuevo.
  }, [editing, date]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const canSave = draft.start !== '' && draft.activity.trim() !== '';

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
    }
    setDraft({ ...EMPTY, start: draft.end || '' });
    onDone();
  }

  return (
    <form className="tray entry-tray" onSubmit={submit} aria-label={editing ? 'Editar actividad' : 'Nueva actividad'}>
      <div className="tray-card entry-card">
        <div className="time-row">
          <label className="time-field">
            <span className="lbl">Inicio</span>
            <input
              className={`time-input${draft.start ? '' : ' is-empty'}`}
              type="time"
              required
              value={draft.start}
              onChange={(e) => set('start', e.target.value)}
            />
          </label>
          <span className="duration-pill" aria-live="polite">
            {durationLabel(draft.start, draft.end)}
          </span>
          <label className="time-field is-end">
            <span className="lbl">
              Fin <em>opcional</em>
            </span>
            <input
              className={`time-input${draft.end ? '' : ' is-empty'}`}
              type="time"
              value={draft.end}
              onChange={(e) => set('end', e.target.value)}
            />
          </label>
        </div>

        <label className="activity-field">
          <span className="lbl">¿Qué hiciste?</span>
          <input
            className="big-input"
            type="text"
            required
            maxLength={200}
            placeholder="Desayuné con mi hermana"
            value={draft.activity}
            onChange={(e) => set('activity', e.target.value)}
          />
        </label>

        <div className="chip-scroll" role="radiogroup" aria-label="Categoría">
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
