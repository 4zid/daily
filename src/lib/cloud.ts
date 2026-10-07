import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { DayLog, Entry, Mood, Rating } from '../types';
import { addDays, weekStart } from './date';
import { newId, sortEntries } from './store';
import {
  supabaseBackend,
  type Backend,
  type DayRow,
  type EntryRow,
  type Invitation,
  type PatientSummary,
  type WeekSummary,
} from './backend';

export type { Invitation, PatientSummary, WeekSummary } from './backend';

// ─────────── Origen de los datos ───────────

let backend: Backend = supabaseBackend;

/** Cambia de dónde salen los datos (la demo usa una base en memoria) y olvida lo cargado. */
export function setBackend(next: Backend) {
  if (backend === next) return;
  backend = next;
  resetCloudCache();
}

export function isDemoBackend(): boolean {
  return backend.kind === 'demo';
}

// ─────────── Mapeo entre la base y la app ───────────

function fromRow(r: EntryRow): Entry {
  return {
    id: r.id,
    start: r.start_time,
    end: r.end_time ?? undefined,
    activity: r.activity,
    category: r.category,
    pleasure: (r.pleasure ?? undefined) as Rating | undefined,
    control: (r.control ?? undefined) as Rating | undefined,
    notes: r.notes ?? undefined,
    source: r.source,
  };
}

function toRow(patientId: string, date: string, e: Entry) {
  return {
    id: e.id,
    patient_id: patientId,
    date,
    start_time: e.start,
    end_time: e.end ?? null,
    activity: e.activity,
    category: e.category,
    pleasure: e.pleasure ?? null,
    control: e.control ?? null,
    notes: e.notes ?? null,
    source: e.source ?? ('manual' as const),
  };
}

function buildDays(entries: EntryRow[], dayRows: DayRow[]): Record<string, DayLog> {
  const days: Record<string, DayLog> = {};
  const get = (date: string) => (days[date] ??= { date, entries: [] });
  for (const d of dayRows) {
    const day = get(d.date);
    day.mood = (d.mood ?? undefined) as Mood | undefined;
    day.reflection = d.reflection ?? undefined;
  }
  for (const r of entries) get(r.date).entries.push(fromRow(r));
  for (const day of Object.values(days)) day.entries = sortEntries(day.entries);
  return days;
}

// ─────────── Caché de semanas ───────────

export interface WeekState {
  status: 'loading' | 'ready' | 'error';
  days: Record<string, DayLog>;
}

const weeks = new Map<string, WeekState>();
const weekLists = new Map<string, WeekSummary[]>();
const listeners = new Set<() => void>();
let version = 0;
// Cambia al vaciar la caché: una respuesta que llega después (de otra cuenta o de
// la demo) se descarta.
let generation = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const keyOf = (patientId: string, monday: string) => `${patientId}|${monday}`;

/** Con `background`, actualiza sin mostrar la carga y sin pisar los datos si falla. */
async function fetchWeek(patientId: string, monday: string, background = false) {
  const gen = generation;
  const key = keyOf(patientId, monday);
  const quiet = background && weeks.get(key)?.status === 'ready';
  if (!quiet) {
    weeks.set(key, { status: 'loading', days: weeks.get(key)?.days ?? {} });
    emit();
  }
  try {
    const rows = await backend.weekRows(patientId, monday, addDays(monday, 6));
    if (gen !== generation) return;
    weeks.set(key, { status: 'ready', days: buildDays(rows.entries, rows.days) });
  } catch {
    if (gen !== generation || quiet) return;
    weeks.set(key, { status: 'error', days: weeks.get(key)?.days ?? {} });
  }
  emit();
}

async function fetchWeekList(patientId: string) {
  const gen = generation;
  try {
    const list = await backend.weekList(patientId);
    if (gen !== generation) return;
    weekLists.set(patientId, list);
    emit();
  } catch {
    // Sin la lista, el menú muestra igual la semana actual.
  }
}

const EMPTY_WEEK: WeekState = { status: 'loading', days: {} };

/** Días de una semana de un paciente; los pide a la base la primera vez. */
export function useWeek(
  patientId: string | null,
  monday: string,
): WeekState & { reload: () => void; refresh: () => void } {
  useSyncExternalStore(subscribe, () => version);
  const key = patientId ? keyOf(patientId, monday) : '';
  // También vuelve a pedirla si se vació la caché (por ejemplo, después de importar).
  const cached = weeks.has(key);
  useEffect(() => {
    if (patientId && !weeks.has(key)) void fetchWeek(patientId, monday);
  }, [patientId, monday, key, cached]);
  const reload = useCallback(() => {
    if (patientId) void fetchWeek(patientId, monday);
  }, [patientId, monday]);
  // Para el terapeuta: trae lo último que cargó el paciente sin parpadeos.
  const refresh = useCallback(() => {
    if (patientId) {
      void fetchWeek(patientId, monday, true);
      void fetchWeekList(patientId);
    }
  }, [patientId, monday]);
  return { ...(weeks.get(key) ?? EMPTY_WEEK), reload, refresh };
}

/** Semanas con registros de un paciente, de la más reciente a la más vieja. */
export function useWeekList(patientId: string | null): WeekSummary[] {
  useSyncExternalStore(subscribe, () => version);
  const cached = patientId ? weekLists.has(patientId) : false;
  useEffect(() => {
    if (patientId && !weekLists.has(patientId)) void fetchWeekList(patientId);
  }, [patientId, cached]);
  return (patientId && weekLists.get(patientId)) || [];
}

/** Olvida todo lo cargado (al cerrar sesión o al entrar y salir de la demo). */
export function resetCloudCache() {
  generation += 1;
  weeks.clear();
  weekLists.clear();
  emit();
}

// ─────────── Escritura del paciente (optimista) ───────────

let currentPatient: string | null = null;
let reportError: (message: string) => void = () => {};

export function configureCloud(patientId: string | null, onError: (message: string) => void) {
  currentPatient = patientId;
  reportError = onError;
}

function mutateDay(date: string, change: (day: DayLog) => DayLog): { before: DayLog | undefined; key: string } | null {
  if (!currentPatient) return null;
  const key = keyOf(currentPatient, weekStart(date));
  const week = weeks.get(key) ?? { status: 'ready' as const, days: {} };
  const before = week.days[date];
  const next = change(before ?? { date, entries: [] });
  weeks.set(key, { ...week, days: { ...week.days, [date]: next } });
  emit();
  return { before, key };
}

function rollback(date: string, snapshot: { before: DayLog | undefined; key: string }, message: string) {
  const week = weeks.get(snapshot.key);
  if (week) {
    const days = { ...week.days };
    if (snapshot.before) days[date] = snapshot.before;
    else delete days[date];
    weeks.set(snapshot.key, { ...week, days });
    emit();
  }
  reportError(message);
}

/** Guarda en segundo plano; si falla, deshace el cambio optimista. */
function persist(
  date: string,
  snap: { before: DayLog | undefined; key: string },
  task: Promise<void>,
  errorMessage = SAVE_ERROR,
) {
  const patient = currentPatient;
  // Si mientras tanto se cambió de origen de datos (por ejemplo, se salió de la
  // demo), lo pendiente ya no corresponde: ni se refresca ni se deshace.
  const gen = generation;
  task.then(
    () => gen === generation && patient && void fetchWeekList(patient),
    () => gen === generation && rollback(date, snap, errorMessage),
  );
}

const SAVE_ERROR = 'No se pudo guardar. Revisá tu conexión y probá de nuevo.';

export const actions = {
  addEntries(date: string, entries: Omit<Entry, 'id'>[]) {
    const patient = currentPatient;
    if (!patient || !entries.length) return;
    const added = entries.map((e) => ({ ...e, id: newId() }));
    const snap = mutateDay(date, (day) => ({ ...day, entries: sortEntries([...day.entries, ...added]) }));
    if (!snap) return;
    persist(date, snap, backend.insertEntries(added.map((e) => toRow(patient, date, e))));
  },
  updateEntry(date: string, entry: Entry) {
    const patient = currentPatient;
    if (!patient) return;
    const snap = mutateDay(date, (day) => ({
      ...day,
      entries: sortEntries(day.entries.map((e) => (e.id === entry.id ? entry : e))),
    }));
    if (!snap) return;
    const { id: _id, patient_id: _p, ...row } = toRow(patient, date, entry);
    persist(date, snap, backend.updateEntry(entry.id, row));
  },
  removeEntry(date: string, id: string) {
    const snap = mutateDay(date, (day) => ({ ...day, entries: day.entries.filter((e) => e.id !== id) }));
    if (!snap) return;
    persist(date, snap, backend.deleteEntry(id), 'No se pudo borrar. Probá de nuevo.');
  },
  setDayMood(date: string, mood: Mood | undefined) {
    saveDay(date, (day) => ({ ...day, mood }));
  },
  setReflection(date: string, reflection: string) {
    saveDay(date, (day) => ({ ...day, reflection: reflection || undefined }));
  },
};

function saveDay(date: string, change: (day: DayLog) => DayLog) {
  const patient = currentPatient;
  if (!patient) return;
  let next: DayLog | undefined;
  const snap = mutateDay(date, (day) => (next = change(day)));
  if (!snap || !next) return;
  persist(
    date,
    snap,
    backend.upsertDays([{ patient_id: patient, date, mood: next.mood ?? null, reflection: next.reflection ?? null }]),
  );
}

// ─────────── Notas de sesión (terapeuta) ───────────

export function useSessionNote(patientId: string | null, monday: string) {
  const [note, setNote] = useState<{ key: string; text: string } | null>(null);
  const key = patientId ? keyOf(patientId, monday) : '';

  useEffect(() => {
    if (!patientId) return;
    let active = true;
    backend
      .getNote(patientId, monday)
      .catch(() => '')
      .then((text) => active && setNote({ key, text }));
    return () => {
      active = false;
    };
  }, [patientId, monday, key]);

  const save = useCallback(
    async (text: string) => {
      if (!patientId) return;
      try {
        await backend.saveNote(patientId, monday, text);
        setNote({ key, text });
      } catch {
        reportError('No se pudo guardar la nota.');
      }
    },
    [patientId, monday, key],
  );

  return { loaded: note?.key === key, text: note?.key === key ? note.text : '', save };
}

// ─────────── Vínculos e invitaciones ───────────

export function fetchMyPatients(): Promise<PatientSummary[]> {
  return backend.patients();
}

/** Nombre del terapeuta vinculado, '' si no cargó su nombre, o null si no hay vínculo. */
export function fetchMyTherapist(patientId: string): Promise<string | null> {
  return backend.therapistOf(patientId);
}

export function fetchInvitations(): Promise<Invitation[]> {
  return backend.invitations();
}

export function createInvitation(label: string): Promise<Invitation> {
  return backend.createInvitation(label);
}

export function deleteInvitation(code: string): Promise<void> {
  return backend.deleteInvitation(code);
}

export function lookupInvitation(code: string): Promise<{ therapistName: string; valid: boolean } | null> {
  return backend.lookupInvitation(code);
}

export function acceptInvitation(code: string): Promise<void> {
  return backend.acceptInvitation(code);
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/#/invitacion/${code}`;
}

/** Termina el vínculo paciente–terapeuta (lo puede pedir cualquiera de los dos). */
export async function endCareLink(patientId: string) {
  await backend.endCareLink(patientId);
  resetCloudCache();
}

/** Borra la cuenta y todos sus datos. */
export function deleteMyAccount(): Promise<void> {
  return backend.deleteMyAccount();
}

// ─────────── Migración y respaldo ───────────

/** Sube los registros guardados en el navegador a la cuenta del paciente. */
export async function importDays(patientId: string, days: Record<string, DayLog>) {
  const list = Object.values(days);
  const entryRows = list.flatMap((d) => d.entries.map((e) => toRow(patientId, d.date, { ...e, id: newId() })));
  const dayRows = list
    .filter((d) => d.mood || d.reflection)
    .map((d) => ({ patient_id: patientId, date: d.date, mood: d.mood ?? null, reflection: d.reflection ?? null }));
  await backend.insertEntries(entryRows);
  await backend.upsertDays(dayRows);
  resetCloudCache();
}

/** Todos los registros de un paciente (para descargar un respaldo). */
export async function fetchAllDays(patientId: string): Promise<Record<string, DayLog>> {
  const rows = await backend.allRows(patientId);
  return buildDays(rows.entries, rows.days);
}
