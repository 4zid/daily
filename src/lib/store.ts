import { useSyncExternalStore } from 'react';
import type { DayLog, Entry } from '../types';
import { isCategoryId, isMood, isRating } from './categories';
import { normalizeTime, timeToMinutes } from './date';

// Datos que quedan en el navegador: las preferencias y, si los hay, los
// registros cargados antes de tener cuenta (para subirlos a la nube).

const STORAGE_KEY = 'daily.registro.v1';

export type Theme = 'system' | 'light' | 'dark';

interface LocalData {
  days: Record<string, DayLog>;
  theme: Theme;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Respaldo para contextos sin crypto.randomUUID: UUID v4 con Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));
}

/** Valida y limpia un día que viene de localStorage o de un archivo. */
export function sanitizeDay(raw: unknown, date: string): DayLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const entries: Entry[] = [];
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as Record<string, unknown>[]) {
      const start = normalizeTime(typeof e?.start === 'string' ? e.start : undefined);
      const activity = typeof e?.activity === 'string' ? e.activity.trim().slice(0, 200) : '';
      if (!start || !activity) continue;
      entries.push({
        id: typeof e.id === 'string' ? e.id : newId(),
        start,
        end: normalizeTime(typeof e.end === 'string' ? e.end : undefined),
        activity,
        category: isCategoryId(e.category) ? e.category : 'otro',
        pleasure: isRating(e.pleasure) ? e.pleasure : undefined,
        control: isRating(e.control) ? e.control : undefined,
        notes: typeof e.notes === 'string' && e.notes.trim() ? e.notes.trim().slice(0, 1000) : undefined,
        source: e.source === 'ia' ? 'ia' : 'manual',
      });
    }
  }
  return {
    date,
    entries: sortEntries(entries),
    mood: isMood(r.mood) ? r.mood : undefined,
    reflection: typeof r.reflection === 'string' && r.reflection.trim() ? r.reflection.slice(0, 4000) : undefined,
  };
}

export function sanitizeDays(raw: unknown): Record<string, DayLog> {
  const days: Record<string, DayLog> = {};
  if (!raw || typeof raw !== 'object') return days;
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const day = sanitizeDay(value, date);
    if (day && (day.entries.length || day.mood || day.reflection)) days[date] = day;
  }
  return days;
}

function load(): LocalData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { days: {}, theme: 'system' };
    const parsed = JSON.parse(raw) as { days?: unknown; settings?: { theme?: Theme } };
    const theme = parsed.settings?.theme;
    return {
      days: sanitizeDays(parsed.days),
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    };
  } catch {
    return { days: {}, theme: 'system' };
  }
}

let state: LocalData = load();
const listeners = new Set<() => void>();

function setState(next: LocalData) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, days: next.days, settings: { theme: next.theme } }));
  } catch {
    // Sin almacenamiento disponible (modo privado): la app sigue en memoria.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocal(): LocalData {
  return useSyncExternalStore(subscribe, () => state);
}

export const local = {
  setTheme(theme: Theme) {
    setState({ ...state, theme });
  },
  /** Borra los registros del navegador (después de subirlos a la cuenta). */
  clearDays() {
    setState({ ...state, days: {} });
  },
};

export function buildBackup(patientName: string, days: Record<string, DayLog>) {
  return {
    app: 'daily-registro',
    version: 1,
    exportedAt: new Date().toISOString(),
    patientName,
    days,
  };
}

export function parseBackup(text: string): { patientName: string; days: Record<string, DayLog> } {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || !parsed.days) {
    throw new Error('El archivo no parece un respaldo de daily.');
  }
  return {
    patientName: typeof parsed.patientName === 'string' ? parsed.patientName : '',
    days: sanitizeDays(parsed.days),
  };
}

// ─────────── Presentación (onboarding) ───────────

const ONBOARDING_KEY = 'daily.presentacion.v1';
// Respaldo para cuando el navegador no deja guardar: vale mientras la página siga abierta.
let seenInMemory = false;

/** Si en este navegador ya se vio la presentación. */
export function hasSeenOnboarding(): boolean {
  if (seenInMemory) return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen() {
  seenInMemory = true;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // Sin almacenamiento: la presentación vuelve a aparecer la próxima vez.
  }
}
