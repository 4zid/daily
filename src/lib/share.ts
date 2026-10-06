import type { DayLog, PatientDataset } from '../types';
import { weekDays } from './date';
import { sanitizeDays } from './store';

// Un link para compartir lleva la semana dentro del fragmento (#) de la URL.
// El fragmento nunca se envía al servidor: los datos viajan solo en el link.

interface SharePayload {
  v: 1;
  name: string;
  week: string;
  days: Record<string, DayLog>;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeWeek(patientName: string, monday: string, days: Record<string, DayLog>): Promise<string> {
  const weekOnly: Record<string, DayLog> = {};
  for (const date of weekDays(monday)) {
    if (days[date]) weekOnly[date] = days[date];
  }
  const payload: SharePayload = { v: 1, name: patientName, week: monday, days: weekOnly };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  try {
    return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  } catch {
    // Navegador sin CompressionStream('deflate-raw'): el link va sin comprimir.
    return `j${toBase64Url(json)}`;
  }
}

export async function decodeWeek(token: string): Promise<PatientDataset & { week: string }> {
  const kind = token[0];
  if (kind === 'z' && typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede abrir el link. Abrilo en un navegador actualizado.');
  }
  const bytes = fromBase64Url(token.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  const payload = JSON.parse(new TextDecoder().decode(raw)) as SharePayload;
  if (payload.v !== 1 || typeof payload.week !== 'string') throw new Error('Link inválido');
  return {
    patientName: typeof payload.name === 'string' ? payload.name : '',
    week: payload.week,
    days: sanitizeDays(payload.days),
  };
}

export async function buildShareUrl(patientName: string, monday: string, days: Record<string, DayLog>): Promise<string> {
  const token = await encodeWeek(patientName, monday, days);
  const url = new URL(window.location.href);
  url.hash = `/terapeuta?semana=${token}`;
  return url.toString();
}
