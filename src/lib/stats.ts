import type { CategoryId, DayLog, Entry } from '../types';
import { CATEGORIES } from './categories';
import { timeToMinutes, weekDays } from './date';

/** Sin hora de fin, una actividad dura hasta la siguiente solo si esta empieza dentro de este margen. */
export const MAX_INFERRED_MINUTES = 4 * 60;

export interface TimedEntry extends Entry {
  /** Duración en minutos, o null si no se puede saber (última actividad sin hora de fin). */
  minutes: number | null;
  /** true si la duración se dedujo de la siguiente actividad. */
  inferred: boolean;
}

/**
 * Calcula la duración de cada actividad. Si no tiene hora de fin, dura hasta
 * que empieza la siguiente (si es dentro de MAX_INFERRED_MINUTES; si no, se
 * desconoce). Si la hora de fin es menor que la de inicio,
 * se asume que cruza la medianoche (ej. dormir 23:30–07:30).
 */
export function withDurations(entries: Entry[]): TimedEntry[] {
  return entries.map((entry, i) => {
    const start = timeToMinutes(entry.start);
    const end = timeToMinutes(entry.end);
    if (start !== null && end !== null) {
      const minutes = end >= start ? end - start : end + 24 * 60 - start;
      return { ...entry, minutes, inferred: false };
    }
    const next = entries.slice(i + 1).find((e) => (timeToMinutes(e.start) ?? -1) > (start ?? 0));
    const nextStart = timeToMinutes(next?.start);
    if (start !== null && nextStart !== null && nextStart - start <= MAX_INFERRED_MINUTES) {
      return { ...entry, minutes: nextStart - start, inferred: true };
    }
    return { ...entry, minutes: null, inferred: false };
  });
}

export interface WeekStats {
  dates: string[];
  daysWithEntries: number;
  totalEntries: number;
  totalMinutes: number;
  avgMood: number | null;
  /** Ánimo por día: el general del día o, si falta, el promedio de las actividades. */
  moodByDay: { date: string; mood: number | null; fromEntries: boolean }[];
  minutesByCategory: { id: CategoryId; minutes: number; count: number }[];
}

export function weekStats(days: Record<string, DayLog>, monday: string): WeekStats {
  const dates = weekDays(monday);
  let totalEntries = 0;
  let totalMinutes = 0;
  let daysWithEntries = 0;
  const byCategory = new Map<CategoryId, { minutes: number; count: number }>();

  const moodByDay = dates.map((date) => {
    const day = days[date];
    const entries = day?.entries ?? [];
    if (entries.length) daysWithEntries += 1;
    totalEntries += entries.length;
    for (const e of withDurations(entries)) {
      const bucket = byCategory.get(e.category) ?? { minutes: 0, count: 0 };
      bucket.count += 1;
      if (e.minutes) {
        bucket.minutes += e.minutes;
        totalMinutes += e.minutes;
      }
      byCategory.set(e.category, bucket);
    }
    if (day?.mood) return { date, mood: day.mood, fromEntries: false };
    const moods = entries.map((e) => e.mood).filter((m): m is NonNullable<typeof m> => !!m);
    if (moods.length) {
      return { date, mood: moods.reduce((a, b) => a + b, 0) / moods.length, fromEntries: true };
    }
    return { date, mood: null, fromEntries: false };
  });

  const moods = moodByDay.map((d) => d.mood).filter((m): m is number => m !== null);
  const minutesByCategory = CATEGORIES.map((c) => ({ id: c.id, ...(byCategory.get(c.id) ?? { minutes: 0, count: 0 }) }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.minutes - a.minutes);

  return {
    dates,
    daysWithEntries,
    totalEntries,
    totalMinutes,
    avgMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    moodByDay,
    minutesByCategory,
  };
}

/** Semanas (lunes) que tienen al menos un registro, de la más reciente a la más vieja. */
export function weeksWithData(days: Record<string, DayLog>, weekStartOf: (iso: string) => string): string[] {
  const set = new Set<string>();
  for (const day of Object.values(days)) {
    if (day.entries.length || day.reflection || day.mood) set.add(weekStartOf(day.date));
  }
  return [...set].sort().reverse();
}

export function countWeekEntries(days: Record<string, DayLog>, monday: string): number {
  return weekDays(monday).reduce((sum, d) => sum + (days[d]?.entries.length ?? 0), 0);
}
