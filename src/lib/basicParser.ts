import type { CategoryId, Entry, OrganizedDay, Rating } from '../types';
import { pad, timeToMinutes } from './date';

// Modo básico (sin IA): separa el relato en frases, busca horarios y adivina la
// categoría por palabras clave. Es una ayuda para cuando la IA no está configurada;
// siempre conviene revisar el resultado antes de agregarlo.

const KEYWORDS: [CategoryId, RegExp][] = [
  ['descanso', /\b(dorm|despert|levant|siesta|me acost|descans|sueñ|cama)/],
  ['comidas', /\b(desayun|almorz|almorc|almuerz|cen[ée]|cena|merend|merienda|com[íi]|comida|snack|mate)/],
  ['movimiento', /\b(gimnasio|gym|corr[íi]|correr|camin|entren|yoga|pilates|bici|nad[ée]|futbol|fútbol|deporte|ejercicio)/],
  ['trabajo', /\b(trabaj|oficina|reuni[óo]n|meet|estudi|clase|facu|facultad|curso|proyecto|cliente|mail)/],
  ['vinculos', /\b(amig|familia|mam[áa]|pap[áa]|herman|pareja|novi[oa]|abuel|llam[ée]|juntada|visit|charl)/],
  ['autocuidado', /\b(ducha|duch[ée]|bañ|terapia|psic[óo]log|medit|m[ée]dic|remedio|pastilla|skincare|respir)/],
  ['ocio', /\b(serie|pel[íi]cula|netflix|jugu[ée]|juego|play|redes|instagram|tiktok|youtube|celular|le[íi]|libro|m[úu]sica|tele)/],
  ['tareas', /\b(limpi|cocin|compras|super|lav[ée]|ordené|orden[ée]|tr[áa]mite|colectivo|subte|tren|manej|viaj)/],
];

// "placer 7", "placer: 8/10", "control de 5"
const SCORE_RE = {
  pleasure: /\bplacer\s*(?:de|:)?\s*(\d{1,2})(?:\s*\/\s*10)?/i,
  control: /\bcontrol\s*(?:de|:)?\s*(\d{1,2})(?:\s*\/\s*10)?/i,
};

function findScore(text: string, key: keyof typeof SCORE_RE): Rating | undefined {
  const m = SCORE_RE[key].exec(text);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 10 ? (n as Rating) : undefined;
}

function guessCategory(text: string): CategoryId {
  const t = text.toLowerCase();
  for (const [id, re] of KEYWORDS) if (re.test(t)) return id;
  return 'otro';
}

function to24h(hour: number, minutes: number, period: string | undefined): string {
  let h = hour;
  const p = period?.toLowerCase() ?? '';
  if (/(tarde|noche|p\.?m)/.test(p) && h < 12) h += 12;
  if (/(mañana|madrugada|a\.?m)/.test(p) && h === 12) h = 0;
  return `${pad(h % 24)}:${pad(minutes)}`;
}

const PERIOD_WORDS = String.raw`de la (?:mañana|tarde|noche|madrugada)|a\.?m\.?|p\.?m\.?`;
const PERIOD = String.raw`(?:\s*(?:hs\.?|h\b))?(?:\s*(${PERIOD_WORDS}))?`;
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?`;
// Grupos: 1–3 inicio (hora, minutos, momento), 4–6 fin.
const RANGE_RE = new RegExp(
  String.raw`(?:de|desde)\s+(?:las?\s+)?${TIME}${PERIOD}\s+(?:a|hasta)\s+(?:las?\s+)?${TIME}${PERIOD}`,
  'i',
);
// Tres formas: "a las 9[:30] [de la mañana]", "9[:30] hs [de la noche]", "9[:30] pm".
const SINGLE_RE = new RegExp(
  [
    String.raw`(?:a\s+las?|tipo|como\s+a\s+las?|cerca\s+de\s+las?|desde\s+las?)\s+${TIME}${PERIOD}`,
    String.raw`\b${TIME}\s*(?:hs\.?|h\b)(?:\s*(${PERIOD_WORDS}))?`,
    String.raw`\b${TIME}\s*(${PERIOD_WORDS})`,
  ].join('|'),
  'i',
);

// Momentos del día sin hora exacta: se usa una hora de referencia, marcada como aproximada.
const PART_OF_DAY: [RegExp, string][] = [
  [/\b(?:a la|por la|de|en la) madrugada\b/i, '03:00'],
  [/\b(?:a la|por la|de|en la) mañana\b|\btemprano\b/i, '09:00'],
  [/\bal mediod[íi]a\b/i, '13:00'],
  [/\b(?:a la|por la|de|en la) siesta\b/i, '15:00'],
  [/\b(?:a la|por la|de|en la) tarde\b/i, '17:00'],
  [/\b(?:a la|por la|de|en la) noche\b/i, '21:00'],
];
const PART_OF_DAY_RE = /\b(?:a la|por la|de|en la) (?:madrugada|mañana|siesta|tarde|noche)\b|\bal mediod[íi]a\b/i;

function cleanActivity(text: string): string {
  const s = text
    .replace(RANGE_RE, '')
    .replace(SINGLE_RE, '')
    .replace(/^\s*(y|e|después|despues|luego|más tarde|mas tarde|entonces|también|tambien)\b[\s,]*/i, '')
    .replace(PART_OF_DAY_RE, '')
    .replace(SCORE_RE.pleasure, '')
    .replace(SCORE_RE.control, '')
    .replace(/[,;]?\s*(?:y\s*)?$/i, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Corta en fin de oración, o antes de un conector temporal ("…, después", "… y a la noche").
const CONNECTOR = String.raw`(?:después|despues|luego|más tarde|mas tarde|a la (?:mañana|tarde|noche)|al mediod[íi]a|a las?\s+\d)`;
const SPLIT_RE = new RegExp(String.raw`(?<=[.!?\n;])\s+|,\s*(?=(?:y\s+)?${CONNECTOR})|\s+y\s+(?=${CONNECTOR})`, 'i');

export function organizeBasic(text: string): OrganizedDay {
  const sentences = text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const entries: Omit<Entry, 'id'>[] = [];
  let lastMinutes: number | null = null;

  for (const sentence of sentences) {
    let start: string | undefined;
    let end: string | undefined;
    let approximate = false;

    const range = RANGE_RE.exec(sentence);
    if (range) {
      const endPeriod = range[6];
      start = to24h(Number(range[1]), Number(range[2] ?? 0), range[3] ?? endPeriod);
      end = to24h(Number(range[4]), Number(range[5] ?? 0), endPeriod);
    } else {
      const single = SINGLE_RE.exec(sentence);
      if (single) {
        const hour = single[1] ?? single[4] ?? single[7];
        const min = single[2] ?? single[5] ?? single[8];
        const period = single[3] ?? single[6] ?? single[9];
        start = to24h(Number(hour), Number(min ?? 0), period);
      }
    }

    // Sin hora explícita: "a la tarde", "a la noche"… dan una hora aproximada.
    if (!start) {
      const part = PART_OF_DAY.find(([re]) => re.test(sentence));
      const partMin = part ? timeToMinutes(part[1])! : null;
      if (partMin !== null && (lastMinutes === null || partMin > lastMinutes)) {
        start = part![1];
        approximate = true;
      }
    }

    // Si tampoco hay momento del día, va después de la actividad anterior.
    if (!start) {
      if (lastMinutes === null) continue;
      const m = Math.min(lastMinutes + 60, 23 * 60 + 59);
      start = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      approximate = true;
    }

    // Si quedó antes de la anterior y no aclaró el momento, probablemente es de tarde.
    const startMin = timeToMinutes(start)!;
    if (lastMinutes !== null && startMin < lastMinutes && startMin < 12 * 60 && !/mañana|madrugada|\ba\.?m\b/i.test(sentence)) {
      const shifted = startMin + 12 * 60;
      start = `${pad(Math.floor(shifted / 60))}:${pad(shifted % 60)}`;
      if (end) {
        const endMin = timeToMinutes(end)!;
        if (endMin < 12 * 60) end = `${pad(Math.floor((endMin + 720) / 60) % 24)}:${pad(endMin % 60)}`;
      }
    }

    const activity = cleanActivity(sentence);
    if (!activity) continue;
    entries.push({
      start,
      end,
      activity: activity.length > 80 ? `${activity.slice(0, 77)}…` : activity,
      category: guessCategory(sentence),
      pleasure: findScore(sentence, 'pleasure'),
      control: findScore(sentence, 'control'),
      notes: approximate ? 'Hora aproximada' : undefined,
      // El modo básico no usa la IA: la marca «Ordenada con la IA» sería falsa.
      source: 'manual',
    });
    lastMinutes = timeToMinutes(end ?? start);
  }

  entries.sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));

  return {
    reply: entries.length
      ? `Encontré ${entries.length} actividad${entries.length === 1 ? '' : 'es'}. Revisalas antes de agregarlas: en modo básico puedo equivocarme con horarios y categorías.${
          entries.some((e) => !e.pleasure || !e.control)
            ? ' Si querés, sumá placer y control a cada una (por ejemplo: «placer 7, control 5»).'
            : ''
        }`
      : 'No pude encontrar horarios en el relato. Probá mencionando las horas, por ejemplo: "a las 9 desayuné, de 10 a 13 trabajé".',
    entries,
    dayMood: null,
    reflection: null,
    supportNote: null,
  };
}
