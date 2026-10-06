import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CategoryId, DayLog, Entry, Mood, Rating } from '../types';
import { addDays, weekStart } from './date';
import { newId, sortEntries } from './store';
import { supabase } from './supabase';

// ─────────── Mapeo entre la base y la app ───────────

interface EntryRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  activity: string;
  category: CategoryId;
  pleasure: number | null;
  control: number | null;
  notes: string | null;
  source: 'manual' | 'ia';
}

interface DayRow {
  date: string;
  mood: number | null;
  reflection: string | null;
}

const ENTRY_COLUMNS = 'id, date, start_time, end_time, activity, category, pleasure, control, notes, source';

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
    source: e.source ?? 'manual',
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

export interface WeekSummary {
  week: string;
  entries: number;
}

const weeks = new Map<string, WeekState>();
const weekLists = new Map<string, WeekSummary[]>();
const listeners = new Set<() => void>();
let version = 0;

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
  const key = keyOf(patientId, monday);
  const sunday = addDays(monday, 6);
  const quiet = background && weeks.get(key)?.status === 'ready';
  if (!quiet) {
    weeks.set(key, { status: 'loading', days: weeks.get(key)?.days ?? {} });
    emit();
  }
  const [e, d] = await Promise.all([
    supabase.from('entries').select(ENTRY_COLUMNS).eq('patient_id', patientId).gte('date', monday).lte('date', sunday),
    supabase.from('day_logs').select('date, mood, reflection').eq('patient_id', patientId).gte('date', monday).lte('date', sunday),
  ]);
  if (e.error || d.error) {
    if (quiet) return;
    weeks.set(key, { status: 'error', days: weeks.get(key)?.days ?? {} });
  } else {
    weeks.set(key, { status: 'ready', days: buildDays(e.data as EntryRow[], d.data as DayRow[]) });
  }
  emit();
}

async function fetchWeekList(patientId: string) {
  const { data, error } = await supabase.rpc('patient_weeks', { p_patient: patientId });
  if (!error && data) {
    weekLists.set(
      patientId,
      (data as { week: string; entries: number }[]).map((w) => ({ week: w.week, entries: Number(w.entries) })),
    );
    emit();
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

/** Olvida todo lo cargado (al cerrar sesión). */
export function resetCloudCache() {
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

function refreshWeekList() {
  if (currentPatient) void fetchWeekList(currentPatient);
}

const SAVE_ERROR = 'No se pudo guardar. Revisá tu conexión y probá de nuevo.';

export const actions = {
  addEntries(date: string, entries: Omit<Entry, 'id'>[]) {
    const patient = currentPatient;
    if (!patient || !entries.length) return;
    const added = entries.map((e) => ({ ...e, id: newId() }));
    const snap = mutateDay(date, (day) => ({ ...day, entries: sortEntries([...day.entries, ...added]) }));
    if (!snap) return;
    void supabase
      .from('entries')
      .insert(added.map((e) => toRow(patient, date, e)))
      .then(({ error }) => (error ? rollback(date, snap, SAVE_ERROR) : refreshWeekList()));
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
    void supabase
      .from('entries')
      .update(row)
      .eq('id', entry.id)
      .then(({ error }) => error && rollback(date, snap, SAVE_ERROR));
  },
  removeEntry(date: string, id: string) {
    const snap = mutateDay(date, (day) => ({ ...day, entries: day.entries.filter((e) => e.id !== id) }));
    if (!snap) return;
    void supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .then(({ error }) => (error ? rollback(date, snap, 'No se pudo borrar. Probá de nuevo.') : refreshWeekList()));
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
  void supabase
    .from('day_logs')
    .upsert(
      { patient_id: patient, date, mood: next.mood ?? null, reflection: next.reflection ?? null },
      { onConflict: 'patient_id,date' },
    )
    .then(({ error }) => (error ? rollback(date, snap, SAVE_ERROR) : refreshWeekList()));
}

// ─────────── Notas de sesión (terapeuta) ───────────

export function useSessionNote(patientId: string | null, monday: string) {
  const [note, setNote] = useState<{ key: string; text: string } | null>(null);
  const key = patientId ? keyOf(patientId, monday) : '';

  useEffect(() => {
    if (!patientId) return;
    let active = true;
    void supabase
      .from('therapist_notes')
      .select('note')
      .eq('patient_id', patientId)
      .eq('week', monday)
      .maybeSingle()
      .then(({ data }) => active && setNote({ key, text: (data?.note as string | undefined) ?? '' }));
    return () => {
      active = false;
    };
  }, [patientId, monday, key]);

  const save = useCallback(
    async (text: string) => {
      if (!patientId) return;
      const { error } = await supabase
        .from('therapist_notes')
        .upsert({ patient_id: patientId, week: monday, note: text }, { onConflict: 'therapist_id,patient_id,week' });
      if (error) reportError('No se pudo guardar la nota.');
      else setNote({ key, text });
    },
    [patientId, monday, key],
  );

  return { loaded: note?.key === key, text: note?.key === key ? note.text : '', save };
}

// ─────────── Vínculos e invitaciones ───────────

export interface PatientSummary {
  id: string;
  name: string;
  since: string;
}

export async function fetchMyPatients(): Promise<PatientSummary[]> {
  const { data, error } = await supabase
    .from('care_links')
    .select('patient_id, created_at, patient:profiles!care_links_patient_id_fkey(full_name)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as { patient_id: string; created_at: string; patient: { full_name: string } | null }[]).map(
    (r) => ({ id: r.patient_id, name: r.patient?.full_name || 'Paciente', since: r.created_at }),
  );
}

/** Nombre del terapeuta vinculado, '' si no cargó su nombre, o null si no hay vínculo. */
export async function fetchMyTherapist(patientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('care_links')
    .select('therapist:profiles!care_links_therapist_id_fkey(full_name)')
    .eq('patient_id', patientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (data as unknown as { therapist: { full_name: string } | null }).therapist?.full_name ?? '';
}

export interface Invitation {
  code: string;
  patient_label: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export async function fetchInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('code, patient_label, created_at, expires_at, used_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Invitation[];
}

export async function createInvitation(label: string): Promise<Invitation> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({ patient_label: label.trim().slice(0, 120) })
    .select('code, patient_label, created_at, expires_at, used_at')
    .single();
  if (error) throw error;
  return data as Invitation;
}

export async function deleteInvitation(code: string) {
  const { error } = await supabase.from('invitations').delete().eq('code', code);
  if (error) throw error;
}

export async function lookupInvitation(code: string): Promise<{ therapistName: string; valid: boolean } | null> {
  const { data, error } = await supabase.rpc('get_invitation', { p_code: code });
  if (error) throw error;
  const row = (data as { therapist_name: string; valid: boolean }[] | null)?.[0];
  return row ? { therapistName: row.therapist_name, valid: row.valid } : null;
}

export async function acceptInvitation(code: string) {
  const { error } = await supabase.rpc('accept_invitation', { p_code: code });
  if (error) throw error;
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/#/invitacion/${code}`;
}

/** Termina el vínculo paciente–terapeuta (lo puede pedir cualquiera de los dos). */
export async function endCareLink(patientId: string) {
  const { error } = await supabase.rpc('end_care_link', { p_patient: patientId });
  if (error) throw error;
  resetCloudCache();
}

/** Borra la cuenta y todos sus datos. */
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

// ─────────── Migración y respaldo ───────────

/** Sube los registros guardados en el navegador a la cuenta del paciente. */
export async function importDays(patientId: string, days: Record<string, DayLog>) {
  const list = Object.values(days);
  const entryRows = list.flatMap((d) => d.entries.map((e) => toRow(patientId, d.date, { ...e, id: newId() })));
  const dayRows = list
    .filter((d) => d.mood || d.reflection)
    .map((d) => ({ patient_id: patientId, date: d.date, mood: d.mood ?? null, reflection: d.reflection ?? null }));
  for (let i = 0; i < entryRows.length; i += 500) {
    const { error } = await supabase.from('entries').insert(entryRows.slice(i, i + 500));
    if (error) throw error;
  }
  if (dayRows.length) {
    const { error } = await supabase.from('day_logs').upsert(dayRows, { onConflict: 'patient_id,date' });
    if (error) throw error;
  }
  resetCloudCache();
}

/** Todos los registros de un paciente (para descargar un respaldo). */
export async function fetchAllDays(patientId: string): Promise<Record<string, DayLog>> {
  const entries: EntryRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('entries')
      .select(ENTRY_COLUMNS)
      .eq('patient_id', patientId)
      .order('date')
      .range(from, from + 999);
    if (error) throw error;
    entries.push(...(data as EntryRow[]));
    if (data.length < 1000) break;
  }
  const { data, error } = await supabase.from('day_logs').select('date, mood, reflection').eq('patient_id', patientId);
  if (error) throw error;
  return buildDays(entries, data as DayRow[]);
}
