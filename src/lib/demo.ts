import type { CategoryId } from '../types';
import type { Profile } from './supabase';
import { supabaseBackend, type Backend, type DayRow, type EntryRow, type Invitation, type NewEntryRow, type Rows } from './backend';
import { addDays, pad, timeToMinutes, todayISO, weekStart } from './date';
import { newId } from './store';
import { setBackend, resetCloudCache } from './cloud';

// Modo demo: la app completa con datos de ejemplo en memoria. No usa la base ni
// la cuenta de nadie; al recargar la página o reiniciar la demo, vuelve al inicio.

export const DEMO_THERAPIST: Profile = { id: 'demo-julia', role: 'therapist', full_name: 'Lic. Julia Romero' };
export const DEMO_PATIENT: Profile = { id: 'demo-martina', role: 'patient', full_name: 'Martina Ruiz' };

interface DemoPatient {
  id: string;
  name: string;
  since: string;
}

interface DemoDb {
  patients: DemoPatient[];
  entries: (EntryRow & { patient_id: string })[];
  days: (DayRow & { patient_id: string })[];
  notes: Map<string, string>;
  invitations: Invitation[];
}

// ─────────── Generador de datos ───────────

/** Números pseudoaleatorios repetibles: la demo es igual cada vez que se abre. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Option = [activity: string, category: CategoryId, pleasure: number, control: number, note?: string];

interface Block {
  start: string;
  end: string;
  options: Option[];
  /** Probabilidad de que la actividad aparezca ese día. */
  chance?: number;
}

const WEEKDAY: Block[] = [
  {
    start: '07:30',
    end: '08:00',
    options: [
      ['Desayuno tranquilo', 'comidas', 6, 6],
      ['Desayuno con mate', 'comidas', 7, 6],
      ['Desayuno rápido', 'comidas', 4, 5, 'Me levanté tarde'],
    ],
  },
  {
    start: '08:15',
    end: '09:00',
    options: [
      ['Viaje al trabajo', 'tareas', 4, 5],
      ['Colectivo al trabajo', 'tareas', 3, 4, 'Mucha gente, me agobié un poco'],
    ],
  },
  {
    start: '09:00',
    end: '13:00',
    options: [
      ['Trabajo en el proyecto', 'trabajo', 5, 7],
      ['Reunión de equipo', 'trabajo', 3, 5, 'Me costó opinar'],
      ['Atención a clientes', 'trabajo', 6, 7],
    ],
  },
  {
    start: '13:00',
    end: '14:00',
    options: [
      ['Almuerzo con compañeros de trabajo', 'vinculos', 7, 6],
      ['Almuerzo en el escritorio', 'comidas', 4, 5],
    ],
  },
  {
    start: '14:00',
    end: '18:00',
    options: [
      ['Trabajo en el proyecto', 'trabajo', 5, 7],
      ['Informe mensual', 'trabajo', 4, 8, 'Lo terminé a tiempo'],
    ],
  },
  {
    start: '18:30',
    end: '19:30',
    chance: 0.75,
    options: [
      ['Caminata por el parque', 'movimiento', 8, 7],
      ['Clase de yoga', 'movimiento', 8, 8],
      ['Gimnasio', 'movimiento', 7, 8],
    ],
  },
  {
    start: '20:00',
    end: '21:00',
    options: [
      ['Cena en casa', 'comidas', 6, 6],
      ['Cocinar la cena', 'tareas', 6, 7],
      ['Cena con mi pareja', 'vinculos', 8, 6],
    ],
  },
  {
    start: '21:00',
    end: '22:30',
    chance: 0.8,
    options: [
      ['Una serie', 'ocio', 7, 4],
      ['Leer un libro', 'ocio', 8, 6],
      ['Redes sociales', 'ocio', 4, 2, 'Me quedé mirando el celular más de lo que quería'],
    ],
  },
];

const WEEKEND: Block[] = [
  { start: '09:30', end: '10:30', options: [['Desayuno largo', 'comidas', 8, 6]] },
  {
    start: '11:00',
    end: '13:00',
    options: [
      ['Limpieza de la casa', 'tareas', 3, 8],
      ['Compras del súper', 'tareas', 4, 7],
    ],
  },
  {
    start: '13:30',
    end: '16:00',
    options: [
      ['Almuerzo con mi familia', 'vinculos', 8, 6],
      ['Asado con amigos', 'vinculos', 9, 6],
    ],
  },
  { start: '16:30', end: '17:30', chance: 0.6, options: [['Siesta', 'descanso', 7, 5]] },
  {
    start: '18:00',
    end: '19:30',
    chance: 0.5,
    options: [
      ['Bici por la costanera', 'movimiento', 9, 8],
      ['Paseo con amigos', 'vinculos', 8, 6],
    ],
  },
  {
    start: '21:00',
    end: '23:00',
    options: [
      ['Cine', 'ocio', 8, 5],
      ['Juntada con amigos', 'vinculos', 9, 6],
      ['Película en casa', 'ocio', 7, 5],
    ],
  },
];

const THERAPY: Option = ['Sesión de terapia', 'autocuidado', 6, 7];

const REFLECTIONS = [
  'Me costó arrancar, pero la caminata me cambió el humor.',
  'Día tranquilo. Sentí que tenía bastante control de lo que tenía que hacer.',
  'La reunión me dejó pensando: me cuesta decir que no.',
  'Disfruté mucho el almuerzo con mi familia, hacía rato que no nos juntábamos.',
  'Terminé lo que tenía pendiente y me sentí bien conmigo.',
  'Me quedé hasta tarde con el celular y al otro día lo sentí.',
];

const HARD_REFLECTIONS = [
  'Dormí mal y todo me pesó más. A la tarde me ayudó salir a caminar.',
  'Me angustié después del trabajo. Lo quiero hablar en sesión.',
  'No tuve ganas de nada. Igual cumplí con lo mínimo y eso me alivió un poco.',
];

function clampRating(n: number) {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function shift(time: string, minutes: number) {
  const m = timeToMinutes(time)! + minutes;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

interface PatientPlan {
  id: string;
  seed: number;
  /** Probabilidad de que un día quede sin registrar. */
  skip: number;
  /** Desde cuántas semanas atrás hay datos. */
  weeksBack: number;
  /** Probabilidad de puntuar cada actividad. */
  rated: number;
  /** Día de la sesión de terapia (0 = lunes), a las 18:30. */
  therapyDay: number;
}

function generatePatient(db: DemoDb, p: PatientPlan, today: string, nowMinutes: number) {
  const rand = random(p.seed);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const first = addDays(weekStart(today), -7 * p.weeksBack);
  // Un día difícil por semana (de lunes a viernes).
  const hardDays = new Set<string>();
  for (let w = 0; w <= p.weeksBack; w++) hardDays.add(addDays(first, w * 7 + Math.floor(rand() * 5)));

  for (let date = first; date <= today; date = addDays(date, 1)) {
    const isToday = date === today;
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    // El día de terapia siempre queda registrado.
    if (!isToday && weekday !== p.therapyDay && rand() < p.skip) continue;
    const weekend = weekday >= 5;
    const hard = hardDays.has(date);
    const blocks = weekend ? WEEKEND : WEEKDAY;
    let pleasureSum = 0;
    let count = 0;

    blocks.forEach((block, index) => {
      // El día de terapia, la sesión reemplaza a la actividad de la tarde.
      const therapy = !weekend && weekday === p.therapyDay && index === 5;
      if (!therapy && block.chance !== undefined && rand() > block.chance) return;
      let [activity, category, pleasure, control, note] = therapy ? THERAPY : pick(block.options);
      const jitter = weekend || index === 0 ? Math.round((rand() - 0.5) * 2) * 15 : 0;
      const start = shift(block.start, jitter);
      const end = shift(block.end, jitter);
      // Hoy, solo lo que ya pasó.
      if (isToday && timeToMinutes(end)! > nowMinutes) return;
      if (hard) {
        pleasure -= 2;
        control -= 1;
        if (index === 0) note = 'Dormí mal';
      }
      const p1 = clampRating(pleasure + (rand() - 0.5) * 2.4);
      const c1 = clampRating(control + (rand() - 0.5) * 2.4);
      const rated = rand() < p.rated;
      db.entries.push({
        id: newId(),
        patient_id: p.id,
        date,
        start_time: start,
        // Algunas sin hora de fin: duran hasta la siguiente.
        end_time: rand() < 0.15 ? null : end,
        activity,
        category,
        pleasure: rated ? p1 : null,
        control: rated ? c1 : null,
        notes: note ?? null,
        source: rand() < 0.3 ? 'ia' : 'manual',
      });
      pleasureSum += p1;
      count += 1;
    });

    if (!count) continue;
    const avg = pleasureSum / count;
    const mood = hard ? 2 : avg >= 7 ? 5 : avg >= 6 ? 4 : avg >= 4.5 ? 3 : 2;
    const reflection = hard ? pick(HARD_REFLECTIONS) : rand() < 0.35 ? pick(REFLECTIONS) : null;
    // Hoy el día sigue abierto: sin ánimo ni reflexión todavía.
    if (!isToday) db.days.push({ patient_id: p.id, date, mood, reflection });
  }
}

function createDb(): DemoDb {
  const today = todayISO();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const monthsAgo = (n: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    return d.toISOString();
  };
  const db: DemoDb = {
    patients: [
      { id: DEMO_PATIENT.id, name: DEMO_PATIENT.full_name, since: monthsAgo(3) },
      { id: 'demo-tomas', name: 'Tomás Herrera', since: monthsAgo(2) },
      { id: 'demo-camila', name: 'Camila Sosa', since: monthsAgo(1) },
    ],
    entries: [],
    days: [],
    notes: new Map(),
    invitations: [
      {
        code: 'DEMO4K7Q2M',
        patient_label: 'Lucía',
        created_at: new Date(now.getTime() - 2 * 864e5).toISOString(),
        expires_at: new Date(now.getTime() + 12 * 864e5).toISOString(),
        used_at: null,
      },
    ],
  };
  const plans: PatientPlan[] = [
    { id: DEMO_PATIENT.id, seed: 20261, skip: 0.08, weeksBack: 3, rated: 0.95, therapyDay: 3 },
    { id: 'demo-tomas', seed: 9137, skip: 0.45, weeksBack: 2, rated: 0.7, therapyDay: 1 },
    { id: 'demo-camila', seed: 5521, skip: 0.3, weeksBack: 1, rated: 0.85, therapyDay: 0 },
  ];
  for (const plan of plans) generatePatient(db, plan, today, nowMinutes);
  db.notes.set(
    `${DEMO_PATIENT.id}|${addDays(weekStart(today), -7)}`,
    'Buena semana en general. Registró que caminar después del trabajo le sube el ánimo.\nRetomar: la reunión del miércoles y qué le pasa cuando tiene que decir que no.',
  );
  return db;
}

// ─────────── Backend en memoria ───────────

let db: DemoDb | null = null;

function data(): DemoDb {
  return (db ??= createDb());
}

/** Una pausa mínima para que la demo se sienta como la app real. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 60));

function strip<T extends { patient_id: string }>(row: T): Omit<T, 'patient_id'> {
  const { patient_id: _p, ...rest } = row;
  return rest;
}

// Cada operación toma la base al empezar: si en la pausa se reinicia la demo,
// lo pendiente cae en la base vieja (que se descarta) y no en la nueva.
function rowsOf(d: DemoDb, patientId: string, from = '0000-00-00', to = '9999-99-99'): Rows {
  return {
    entries: d.entries.filter((e) => e.patient_id === patientId && e.date >= from && e.date <= to).map(strip),
    days: d.days.filter((x) => x.patient_id === patientId && x.date >= from && x.date <= to).map(strip),
  };
}

const demoBackend: Backend = {
  kind: 'demo',

  async weekRows(patientId, from, to) {
    const rows = structuredClone(rowsOf(data(), patientId, from, to));
    await tick();
    return rows;
  },

  async weekList(patientId) {
    const { entries, days } = rowsOf(data(), patientId);
    await tick();
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(weekStart(e.date), (counts.get(weekStart(e.date)) ?? 0) + 1);
    for (const d of days) if (d.mood || d.reflection) counts.set(weekStart(d.date), counts.get(weekStart(d.date)) ?? 0);
    return [...counts].map(([week, n]) => ({ week, entries: n })).sort((a, b) => b.week.localeCompare(a.week));
  },

  async insertEntries(rows: NewEntryRow[]) {
    const d = data();
    await tick();
    d.entries.push(...structuredClone(rows));
  },

  async updateEntry(id, row) {
    const d = data();
    await tick();
    const entry = d.entries.find((e) => e.id === id);
    if (entry) Object.assign(entry, structuredClone(row));
  },

  async deleteEntry(id) {
    const d = data();
    await tick();
    d.entries = d.entries.filter((e) => e.id !== id);
  },

  async upsertDays(rows) {
    const d = data();
    await tick();
    for (const row of rows) {
      const existing = d.days.find((x) => x.patient_id === row.patient_id && x.date === row.date);
      if (existing) Object.assign(existing, row);
      else d.days.push({ ...row });
    }
  },

  async getNote(patientId, week) {
    const note = data().notes.get(`${patientId}|${week}`) ?? '';
    await tick();
    return note;
  },

  async saveNote(patientId, week, note) {
    const d = data();
    await tick();
    d.notes.set(`${patientId}|${week}`, note);
  },

  async patients() {
    const list = data().patients.map((p) => ({ ...p }));
    await tick();
    return list;
  },

  async therapistOf(patientId) {
    const linked = data().patients.some((p) => p.id === patientId);
    await tick();
    return linked ? DEMO_THERAPIST.full_name : null;
  },

  async invitations() {
    const list = data().invitations.map((i) => ({ ...i }));
    await tick();
    return list;
  },

  async createInvitation(label) {
    const d = data();
    await tick();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = `DEMO${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
    const now = Date.now();
    const invitation: Invitation = {
      code,
      patient_label: label.trim().slice(0, 120),
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 14 * 864e5).toISOString(),
      used_at: null,
    };
    d.invitations.unshift(invitation);
    return { ...invitation };
  },

  async deleteInvitation(code) {
    const d = data();
    await tick();
    d.invitations = d.invitations.filter((i) => i.code !== code);
  },

  async lookupInvitation(code) {
    const found = data().invitations.find((i) => i.code === code);
    await tick();
    return found ? { therapistName: DEMO_THERAPIST.full_name, valid: !found.used_at } : null;
  },

  async acceptInvitation() {
    await tick();
  },

  async endCareLink(patientId) {
    const d = data();
    await tick();
    d.patients = d.patients.filter((p) => p.id !== patientId);
  },

  async deleteMyAccount() {
    throw new Error('En la demo no hay cuenta para borrar.');
  },

  async allRows(patientId) {
    const rows = structuredClone(rowsOf(data(), patientId));
    await tick();
    return rows;
  },
};

/**
 * Semana con la que abre el informe del terapeuta: la actual, salvo que tenga
 * poco cargado todavía (por ejemplo, un lunes temprano); ahí, la anterior.
 */
export function demoReportWeek(): string {
  const monday = weekStart(todayISO());
  const count = data().entries.filter((e) => e.patient_id === DEMO_PATIENT.id && weekStart(e.date) === monday).length;
  return count >= 8 ? monday : addDays(monday, -7);
}

// ─────────── Entrar y salir ───────────

/** Pasa la app a la demo con datos nuevos. */
export function enterDemo() {
  db = createDb();
  setBackend(demoBackend);
}

/** Vuelve a los datos reales y descarta los de la demo. */
export function exitDemo() {
  setBackend(supabaseBackend);
  db = null;
}

/** Datos de ejemplo desde cero (por ejemplo, antes de mostrársela a otra persona). */
export function resetDemo() {
  db = createDb();
  resetCloudCache();
}
