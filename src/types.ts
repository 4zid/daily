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

/** 1 = muy mal … 5 = muy bien */
export type Mood = 1 | 2 | 3 | 4 | 5;

export interface Entry {
  id: string;
  /** Hora de inicio, "HH:MM" (24 h). */
  start: string;
  /** Hora de fin opcional, "HH:MM". Si falta, dura hasta la siguiente actividad. */
  end?: string;
  activity: string;
  category: CategoryId;
  mood?: Mood;
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

export interface StoreData {
  version: 1;
  patientName: string;
  /** Registros por fecha. */
  days: Record<string, DayLog>;
  /** Notas del terapeuta por semana (clave: lunes "YYYY-MM-DD"). */
  therapistNotes: Record<string, string>;
  settings: {
    theme: 'system' | 'light' | 'dark';
    accessCode: string;
  };
}

/** Datos de paciente que se ven en la vista de terapeuta (propios, de un link o de un archivo). */
export interface PatientDataset {
  patientName: string;
  days: Record<string, DayLog>;
}

/** Lo que devuelve el organizador (IA o modo básico). */
export interface OrganizedDay {
  reply: string;
  entries: Omit<Entry, 'id'>[];
  dayMood: Mood | null;
  reflection: string | null;
  supportNote: string | null;
}
