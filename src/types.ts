export type CategoryId =
  | 'trabajo'
  | 'comidas'
  | 'movimiento'
  | 'ocio'
  | 'vinculos'
  | 'autocuidado'
  | 'descanso'
  | 'tareas'
  | 'otro';

/** 1 = muy mal … 5 = muy bien (ánimo general del día). */
export type Mood = 1 | 2 | 3 | 4 | 5;

/** Puntaje de 1 (nada) a 10 (muchísimo). */
export type Rating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Entry {
  id: string;
  /** Hora de inicio, "HH:MM" (24 h). */
  start: string;
  /** Hora de fin opcional, "HH:MM". Si falta, dura hasta la siguiente actividad. */
  end?: string;
  activity: string;
  category: CategoryId;
  /** Cuánto lo disfrutó (1–10). */
  pleasure?: Rating;
  /** Cuánto control o dominio sintió (1–10). */
  control?: Rating;
  notes?: string;
  source?: 'manual' | 'ia';
}

export interface DayLog {
  /** Fecha local "YYYY-MM-DD". */
  date: string;
  entries: Entry[];
  mood?: Mood;
  reflection?: string;
}

/** Lo que devuelve el organizador (IA o modo básico). */
export interface OrganizedDay {
  reply: string;
  entries: Omit<Entry, 'id'>[];
  dayMood: Mood | null;
  reflection: string | null;
  supportNote: string | null;
}
