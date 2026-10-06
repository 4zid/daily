import type { CategoryId, Mood } from '../types';

export interface Category {
  id: CategoryId;
  label: string;
  /** Slot de la paleta categórica (1–8) o null para "Otro" (gris neutro). */
  slot: number | null;
}

// El orden fija el color: cada categoría toma el siguiente slot de la paleta,
// nunca se reciclan. "Otro" usa el gris neutro.
export const CATEGORIES: Category[] = [
  { id: 'trabajo', label: 'Trabajo / estudio', slot: 1 },
  { id: 'comidas', label: 'Comidas', slot: 2 },
  { id: 'movimiento', label: 'Actividad física', slot: 3 },
  { id: 'ocio', label: 'Ocio / pantallas', slot: 4 },
  { id: 'vinculos', label: 'Vínculos / social', slot: 5 },
  { id: 'autocuidado', label: 'Autocuidado / salud', slot: 6 },
  { id: 'descanso', label: 'Descanso / sueño', slot: 7 },
  { id: 'tareas', label: 'Tareas / traslados', slot: 8 },
  { id: 'otro', label: 'Otro', slot: null },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): Category {
  return BY_ID.get(id) ?? BY_ID.get('otro')!;
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && BY_ID.has(value as CategoryId);
}

export function categoryColorVar(id: CategoryId): string {
  const slot = getCategory(id).slot;
  return slot ? `var(--cat-${slot})` : 'var(--cat-other)';
}

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Muy mal' },
  { value: 2, emoji: '😕', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
];

export function moodInfo(mood: Mood | undefined | null) {
  return mood ? MOODS[mood - 1] : undefined;
}

export function isMood(value: unknown): value is Mood {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
