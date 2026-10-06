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

/** Promedio de los valores presentes, o null si no hay ninguno. */
export function average(values: (number | undefined | null)[]): number | null {
  const present = values.filter((v): v is number => typeof v === 'number');
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export interface RatedEntry {
  date: string;
  entry: Entry;
}

export interface WeekStats {
  dates: string[];
  daysWithEntries: number;
  totalEntries: number;
  totalMinutes: number;
  /** Ánimo general de cada día (1–5), si se cargó. */
  moodByDay: { date: string; mood: number | null }[];
  avgMood: number | null;
  /** Promedios de placer y control (1–10) por día. */
  ratingsByDay: { date: string; pleasure: number | null; control: number | null; rated: number }[];
  avgPleasure: number | null;
  avgControl: number | null;
  /** Actividades con más placer y con más control de la semana. */
  topPleasure: RatedEntry[];
  topControl: RatedEntry[];
  minutesByCategory: {
    id: CategoryId;
    minutes: number;
    count: number;
    pleasure: number | null;
    control: number | null;
  }[];
}

const TOP_COUNT = 3;

function topBy(list: RatedEntry[], key: 'pleasure' | 'control'): RatedEntry[] {
  return list
    .filter((r) => r.entry[key])
    .sort((a, b) => b.entry[key]! - a.entry[key]! || a.date.localeCompare(b.date))
    .slice(0, TOP_COUNT);
}

export function weekStats(days: Record<string, DayLog>, monday: string): WeekStats {
  const dates = weekDays(monday);
  let totalEntries = 0;
  let totalMinutes = 0;
  let daysWithEntries = 0;
  const all: RatedEntry[] = [];
  const byCategory = new Map<CategoryId, { minutes: number; count: number; entries: Entry[] }>();

  for (const date of dates) {
    const entries = days[date]?.entries ?? [];
    if (entries.length) daysWithEntries += 1;
    totalEntries += entries.length;
    for (const e of withDurations(entries)) {
      all.push({ date, entry: e });
      const bucket = byCategory.get(e.category) ?? { minutes: 0, count: 0, entries: [] };
      bucket.count += 1;
      bucket.entries.push(e);
      if (e.minutes) {
        bucket.minutes += e.minutes;
        totalMinutes += e.minutes;
      }
      byCategory.set(e.category, bucket);
    }
  }

  const moodByDay = dates.map((date) => ({ date, mood: days[date]?.mood ?? null }));
  const ratingsByDay = dates.map((date) => {
    const entries = days[date]?.entries ?? [];
    return {
      date,
      pleasure: average(entries.map((e) => e.pleasure)),
      control: average(entries.map((e) => e.control)),
      rated: entries.filter((e) => e.pleasure || e.control).length,
    };
  });

  const minutesByCategory = CATEGORIES.flatMap((c) => {
    const b = byCategory.get(c.id);
    if (!b) return [];
    return [
      {
        id: c.id,
        minutes: b.minutes,
        count: b.count,
        pleasure: average(b.entries.map((e) => e.pleasure)),
        control: average(b.entries.map((e) => e.control)),
      },
    ];
  }).sort((a, b) => b.minutes - a.minutes);

  return {
    dates,
    daysWithEntries,
    totalEntries,
    totalMinutes,
    moodByDay,
    avgMood: average(moodByDay.map((d) => d.mood)),
    ratingsByDay,
    avgPleasure: average(all.map((r) => r.entry.pleasure)),
    avgControl: average(all.map((r) => r.entry.control)),
    topPleasure: topBy(all, 'pleasure'),
    topControl: topBy(all, 'control'),
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
