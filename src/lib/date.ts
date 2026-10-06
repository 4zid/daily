const LOCALE = 'es-AR';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local en formato "YYYY-MM-DD". */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Lunes de la semana a la que pertenece la fecha. */
export function weekStart(iso: string): string {
  const d = parseISODate(iso);
  const offset = (d.getDay() + 6) % 7; // lunes = 0 … domingo = 6
  d.setDate(d.getDate() - offset);
  return toISODate(d);
}

/** Las 7 fechas de la semana, de lunes a domingo. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Número de semana ISO-8601. */
export function isoWeekNumber(iso: string): number {
  const d = parseISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

const fmtWeekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const fmtWeekdayLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
const fmtDayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

function clean(s: string): string {
  return s.replace(/\.$/, '');
}

export function weekdayShort(iso: string): string {
  const s = clean(fmtWeekdayShort.format(parseISODate(iso)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayLong(iso: string): string {
  const s = fmtWeekdayLong.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayMonth(iso: string): string {
  return clean(fmtDayMonth.format(parseISODate(iso)));
}

export function longDate(iso: string): string {
  const s = fmtLong.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5 – 11 oct" o "29 sept – 5 oct". */
export function weekRangeLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const a = parseISODate(monday);
  const b = parseISODate(sunday);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${clean(fmtMonth.format(b))}`;
  }
  return `${dayMonth(monday)} – ${dayMonth(sunday)}`;
}

/** Convierte "HH:MM" a minutos desde medianoche, o null si es inválida. */
export function timeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Normaliza "9:5", "9.30", "930" o "21" a "HH:MM". */
export function normalizeTime(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase().replace(/\s*(hs|h)\.?$/, '').replace('.', ':');
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s) ?? /^(\d{1,2})()$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 24 || min > 59) return undefined;
  return `${pad(h % 24)}:${pad(min)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} h`;
}
