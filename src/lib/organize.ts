import type { Entry, OrganizedDay } from '../types';
import { isCategoryId, isMood, isRating } from './categories';
import { normalizeTime } from './date';
import { organizeBasic } from './basicParser';
import { accessToken } from './auth';

export interface ChatTurn {
  role: 'user' | 'assistant';
  /** Para el usuario: su relato. Para el asistente: la propuesta que devolvió (JSON). */
  content: string;
}

export interface OrganizeRequest {
  date: string;
  dateLabel: string;
  history: ChatTurn[];
  message: string;
  existing: Pick<Entry, 'start' | 'end' | 'activity'>[];
}

export type OrganizeResult = OrganizedDay & { mode: 'ia' | 'basico'; notice?: string };

class ApiUnavailable extends Error {}

/** Redondea y valida un puntaje de 1 a 10 que llega de la IA. */
function toRating(value: unknown) {
  const n = typeof value === 'number' ? Math.round(value) : value;
  return isRating(n) ? n : undefined;
}

function sanitize(raw: OrganizedDay): OrganizedDay {
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .map((e) => ({
      start: normalizeTime(e.start) ?? '',
      end: normalizeTime(e.end),
      activity: String(e.activity ?? '').trim(),
      category: isCategoryId(e.category) ? e.category : 'otro',
      pleasure: toRating(e.pleasure),
      control: toRating(e.control),
      notes: e.notes ? String(e.notes).trim() || undefined : undefined,
      source: 'ia' as const,
    }))
    .filter((e) => e.start && e.activity);
  return {
    reply: String(raw.reply ?? ''),
    entries,
    dayMood: isMood(raw.dayMood) ? raw.dayMood : null,
    reflection: raw.reflection ? String(raw.reflection) : null,
    supportNote: raw.supportNote ? String(raw.supportNote) : null,
  };
}

async function callApi(req: OrganizeRequest): Promise<OrganizedDay> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch('/api/organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(req),
    });
  } catch {
    throw new ApiUnavailable('Sin conexión con el servidor.');
  }
  const body = (await res.json().catch(() => null)) as (OrganizedDay & { error?: string; message?: string }) | null;
  if (res.status === 404 || res.status === 503 || body?.error === 'not_configured') {
    throw new ApiUnavailable('La IA no está configurada en este servidor.');
  }
  if (res.status === 401) {
    throw new Error('Tu sesión venció. Volvé a ingresar para usar la IA.');
  }
  if (!res.ok || !body) {
    throw new Error(body?.message ?? 'No pude organizar tu día. Probá de nuevo en un momento.');
  }
  return body;
}

/**
 * Organiza el relato con la IA. Si el servidor no tiene la IA configurada
 * (o la app corre sin backend), usa el modo básico local.
 */
export async function organizeDay(req: OrganizeRequest): Promise<OrganizeResult> {
  try {
    const result = await callApi(req);
    return { ...sanitize(result), mode: 'ia' };
  } catch (error) {
    if (!(error instanceof ApiUnavailable)) throw error;
    // El modo básico no entiende correcciones: solo procesa el último mensaje.
    return {
      ...organizeBasic(req.message),
      mode: 'basico',
      notice: `${error.message} Usé el modo básico (sin IA).`,
    };
  }
}
