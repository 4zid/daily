import { useSyncExternalStore } from 'react';
import type { DayLog, Entry, Mood, StoreData } from '../types';
import { isCategoryId, isMood, isRating } from './categories';
import { normalizeTime, timeToMinutes } from './date';

const STORAGE_KEY = 'daily.registro.v1';

function emptyStore(): StoreData {
  return {
    version: 1,
    patientName: '',
    days: {},
    therapistNotes: {},
    settings: { theme: 'system', accessCode: '' },
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));
}

/** Valida y limpia un día que viene de localStorage, de un archivo o de un link. */
export function sanitizeDay(raw: unknown, date: string): DayLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const entries: Entry[] = [];
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as Record<string, unknown>[]) {
      const start = normalizeTime(typeof e?.start === 'string' ? e.start : undefined);
      const activity = typeof e?.activity === 'string' ? e.activity.trim() : '';
      if (!start || !activity) continue;
      entries.push({
        id: typeof e.id === 'string' ? e.id : newId(),
        start,
        end: normalizeTime(typeof e.end === 'string' ? e.end : undefined),
        activity,
        category: isCategoryId(e.category) ? e.category : 'otro',
        pleasure: isRating(e.pleasure) ? e.pleasure : undefined,
        control: isRating(e.control) ? e.control : undefined,
        notes: typeof e.notes === 'string' && e.notes.trim() ? e.notes.trim() : undefined,
        source: e.source === 'ia' ? 'ia' : 'manual',
      });
    }
  }
  return {
    date,
    entries: sortEntries(entries),
    mood: isMood(r.mood) ? r.mood : undefined,
    reflection: typeof r.reflection === 'string' && r.reflection.trim() ? r.reflection : undefined,
  };
}

export function sanitizeDays(raw: unknown): Record<string, DayLog> {
  const days: Record<string, DayLog> = {};
  if (!raw || typeof raw !== 'object') return days;
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const day = sanitizeDay(value, date);
    if (day) days[date] = day;
  }
  return days;
}

function load(): StoreData {
  const base = emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      ...base,
      patientName: typeof parsed.patientName === 'string' ? parsed.patientName : '',
      days: sanitizeDays(parsed.days),
      therapistNotes:
        parsed.therapistNotes && typeof parsed.therapistNotes === 'object' ? parsed.therapistNotes : {},
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return base;
  }
}

let state: StoreData = load();
const listeners = new Set<() => void>();

function setState(next: StoreData) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento disponible (modo privado, cuota llena): la app sigue en memoria.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Mantiene sincronizadas varias pestañas abiertas.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
}

export function useStore(): StoreData {
  return useSyncExternalStore(subscribe, () => state);
}

function getDay(date: string): DayLog {
  return state.days[date] ?? { date, entries: [] };
}

function putDay(day: DayLog) {
  setState({ ...state, days: { ...state.days, [day.date]: day } });
}

export const actions = {
  addEntries(date: string, entries: Omit<Entry, 'id'>[]) {
    const day = getDay(date);
    const added = entries.map((e) => ({ ...e, id: newId() }));
    putDay({ ...day, entries: sortEntries([...day.entries, ...added]) });
  },
  updateEntry(date: string, entry: Entry) {
    const day = getDay(date);
    putDay({ ...day, entries: sortEntries(day.entries.map((e) => (e.id === entry.id ? entry : e))) });
  },
  removeEntry(date: string, id: string) {
    const day = getDay(date);
    putDay({ ...day, entries: day.entries.filter((e) => e.id !== id) });
  },
  setDayMood(date: string, mood: Mood | undefined) {
    putDay({ ...getDay(date), mood });
  },
  setReflection(date: string, reflection: string) {
    putDay({ ...getDay(date), reflection: reflection || undefined });
  },
  setPatientName(name: string) {
    setState({ ...state, patientName: name });
  },
  setTherapistNote(weekKey: string, note: string) {
    setState({ ...state, therapistNotes: { ...state.therapistNotes, [weekKey]: note } });
  },
  setSettings(settings: Partial<StoreData['settings']>) {
    setState({ ...state, settings: { ...state.settings, ...settings } });
  },
  /** Reemplaza los días incluidos en el respaldo; conserva el resto. */
  importBackup(data: { patientName?: string; days: Record<string, DayLog> }) {
    setState({
      ...state,
      patientName: state.patientName || data.patientName || '',
      days: { ...state.days, ...data.days },
    });
  },
  clearAll() {
    setState({ ...emptyStore(), settings: state.settings });
  },
};

export function exportBackup(data: StoreData) {
  return {
    app: 'daily-registro',
    version: 1,
    exportedAt: new Date().toISOString(),
    patientName: data.patientName,
    days: data.days,
  };
}

export function parseBackup(text: string): { patientName: string; days: Record<string, DayLog> } {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || !parsed.days) {
    throw new Error('El archivo no parece un respaldo de Daily.');
  }
  return {
    patientName: typeof parsed.patientName === 'string' ? parsed.patientName : '',
    days: sanitizeDays(parsed.days),
  };
}
