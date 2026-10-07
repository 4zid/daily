import type { CategoryId } from '../types';
import { supabase } from './supabase';

// De dónde salen y adónde van los datos. La app usa Supabase; la demo usa una
// base en memoria con la misma forma (src/lib/demo.ts). Así las pantallas son
// las mismas en los dos casos.

export interface EntryRow {
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

export type NewEntryRow = EntryRow & { patient_id: string };

export interface DayRow {
  date: string;
  mood: number | null;
  reflection: string | null;
}

export type DayUpsert = DayRow & { patient_id: string };

export interface WeekSummary {
  week: string;
  entries: number;
}

export interface PatientSummary {
  id: string;
  name: string;
  since: string;
}

export interface Invitation {
  code: string;
  patient_label: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export interface Rows {
  entries: EntryRow[];
  days: DayRow[];
}

export interface Backend {
  readonly kind: 'supabase' | 'demo';
  weekRows(patientId: string, from: string, to: string): Promise<Rows>;
  weekList(patientId: string): Promise<WeekSummary[]>;
  insertEntries(rows: NewEntryRow[]): Promise<void>;
  updateEntry(id: string, row: Omit<EntryRow, 'id'>): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  upsertDays(rows: DayUpsert[]): Promise<void>;
  getNote(patientId: string, week: string): Promise<string>;
  saveNote(patientId: string, week: string, note: string): Promise<void>;
  patients(): Promise<PatientSummary[]>;
  /** Nombre del terapeuta vinculado, '' si no cargó su nombre, o null si no hay vínculo. */
  therapistOf(patientId: string): Promise<string | null>;
  invitations(): Promise<Invitation[]>;
  createInvitation(label: string): Promise<Invitation>;
  deleteInvitation(code: string): Promise<void>;
  lookupInvitation(code: string): Promise<{ therapistName: string; valid: boolean } | null>;
  acceptInvitation(code: string): Promise<void>;
  endCareLink(patientId: string): Promise<void>;
  deleteMyAccount(): Promise<void>;
  allRows(patientId: string): Promise<Rows>;
}

const ENTRY_COLUMNS = 'id, date, start_time, end_time, activity, category, pleasure, control, notes, source';
const DAY_COLUMNS = 'date, mood, reflection';
const INVITATION_COLUMNS = 'code, patient_label, created_at, expires_at, used_at';

/** Convierte la respuesta de Supabase en datos o en un error. */
function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

export const supabaseBackend: Backend = {
  kind: 'supabase',

  async weekRows(patientId, from, to) {
    const [entries, days] = await Promise.all([
      supabase.from('entries').select(ENTRY_COLUMNS).eq('patient_id', patientId).gte('date', from).lte('date', to),
      supabase.from('day_logs').select(DAY_COLUMNS).eq('patient_id', patientId).gte('date', from).lte('date', to),
    ]);
    return { entries: check(entries) as EntryRow[], days: check(days) as DayRow[] };
  },

  async weekList(patientId) {
    const data = check(await supabase.rpc('patient_weeks', { p_patient: patientId })) as
      | { week: string; entries: number }[]
      | null;
    return (data ?? []).map((w) => ({ week: w.week, entries: Number(w.entries) }));
  },

  async insertEntries(rows) {
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('entries').insert(rows.slice(i, i + 500)));
    }
  },

  async updateEntry(id, row) {
    check(await supabase.from('entries').update(row).eq('id', id));
  },

  async deleteEntry(id) {
    check(await supabase.from('entries').delete().eq('id', id));
  },

  async upsertDays(rows) {
    if (rows.length) check(await supabase.from('day_logs').upsert(rows, { onConflict: 'patient_id,date' }));
  },

  async getNote(patientId, week) {
    const data = check(
      await supabase.from('therapist_notes').select('note').eq('patient_id', patientId).eq('week', week).maybeSingle(),
    ) as { note: string } | null;
    return data?.note ?? '';
  },

  async saveNote(patientId, week, note) {
    check(
      await supabase
        .from('therapist_notes')
        .upsert({ patient_id: patientId, week, note }, { onConflict: 'therapist_id,patient_id,week' }),
    );
  },

  async patients() {
    const data = check(
      await supabase
        .from('care_links')
        .select('patient_id, created_at, patient:profiles!care_links_patient_id_fkey(full_name)')
        .order('created_at', { ascending: true }),
    ) as unknown as { patient_id: string; created_at: string; patient: { full_name: string } | null }[];
    return data.map((r) => ({ id: r.patient_id, name: r.patient?.full_name || 'Paciente', since: r.created_at }));
  },

  async therapistOf(patientId) {
    const data = check(
      await supabase
        .from('care_links')
        .select('therapist:profiles!care_links_therapist_id_fkey(full_name)')
        .eq('patient_id', patientId)
        .maybeSingle(),
    ) as unknown as { therapist: { full_name: string } | null } | null;
    if (!data) return null;
    return data.therapist?.full_name ?? '';
  },

  async invitations() {
    return check(
      await supabase.from('invitations').select(INVITATION_COLUMNS).order('created_at', { ascending: false }),
    ) as Invitation[];
  },

  async createInvitation(label) {
    return check(
      await supabase
        .from('invitations')
        .insert({ patient_label: label.trim().slice(0, 120) })
        .select(INVITATION_COLUMNS)
        .single(),
    ) as Invitation;
  },

  async deleteInvitation(code) {
    check(await supabase.from('invitations').delete().eq('code', code));
  },

  async lookupInvitation(code) {
    const data = check(await supabase.rpc('get_invitation', { p_code: code })) as
      | { therapist_name: string; valid: boolean }[]
      | null;
    const row = data?.[0];
    return row ? { therapistName: row.therapist_name, valid: row.valid } : null;
  },

  async acceptInvitation(code) {
    check(await supabase.rpc('accept_invitation', { p_code: code }));
  },

  async endCareLink(patientId) {
    check(await supabase.rpc('end_care_link', { p_patient: patientId }));
  },

  async deleteMyAccount() {
    check(await supabase.rpc('delete_my_account'));
  },

  async allRows(patientId) {
    const entries: EntryRow[] = [];
    for (let from = 0; ; from += 1000) {
      const page = check(
        await supabase
          .from('entries')
          .select(ENTRY_COLUMNS)
          .eq('patient_id', patientId)
          .order('date')
          .range(from, from + 999),
      ) as EntryRow[];
      entries.push(...page);
      if (page.length < 1000) break;
    }
    const days = check(await supabase.from('day_logs').select(DAY_COLUMNS).eq('patient_id', patientId)) as DayRow[];
    return { entries, days };
  },
};
