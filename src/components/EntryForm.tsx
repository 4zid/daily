import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import type { CategoryId, Entry, Mood } from '../types';
import { CATEGORIES } from '../lib/categories';
import { actions } from '../lib/store';
import { MoodPicker } from './common';

interface Draft {
  start: string;
  end: string;
  activity: string;
  category: CategoryId;
  mood: Mood | undefined;
  notes: string;
}

const EMPTY: Draft = { start: '', end: '', activity: '', category: 'otro', mood: undefined, notes: '' };

function fromEntry(e: Entry): Draft {
  return {
    start: e.start,
    end: e.end ?? '',
    activity: e.activity,
    category: e.category,
    mood: e.mood,
    notes: e.notes ?? '',
  };
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
      mood: draft.mood,
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
    <form className="card entry-form" onSubmit={submit} aria-label={editing ? 'Editar actividad' : 'Nueva actividad'}>
      <div className="entry-form-row">
        <label className="field">
          <span>Inicio</span>
          <input
            className="input"
            type="time"
            required
            value={draft.start}
            onChange={(e) => set('start', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Fin (opcional)</span>
          <input className="input" type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} />
        </label>
        <label className="field field-activity">
          <span>¿Qué hiciste?</span>
          <input
            className="input"
            type="text"
            required
            maxLength={200}
            placeholder="Ej.: Desayuné con mi hermana"
            value={draft.activity}
            onChange={(e) => set('activity', e.target.value)}
          />
        </label>
        <label className="field field-category">
          <span>Categoría</span>
          <select
            className="select"
            value={draft.category}
            onChange={(e) => set('category', e.target.value as CategoryId)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="entry-form-row2">
        <label className="field">
          <span>Notas: qué sentiste o pensaste (opcional)</span>
          <input
            className="input"
            type="text"
            maxLength={1000}
            placeholder="Ej.: Me costó arrancar, después me sentí mejor"
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>
        <div className="field">
          <span>¿Cómo te sentiste?</span>
          <MoodPicker size="sm" label="Ánimo en esta actividad" value={draft.mood} onChange={(m) => set('mood', m)} />
        </div>
      </div>
      <div className="entry-form-foot">
        <p className="hint">Sin hora de fin, cuenta hasta la siguiente actividad (si empieza dentro de las 4 h).</p>
        <div className="row">
          {editing && (
            <button type="button" className="btn" onClick={onDone}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {editing ? <Check /> : <Plus />}
            {editing ? 'Guardar cambios' : 'Agregar actividad'}
          </button>
        </div>
      </div>
    </form>
  );
}
