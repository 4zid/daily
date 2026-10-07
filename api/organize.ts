import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Función serverless (Vercel) que ordena el relato del día en actividades.
// En desarrollo la sirve el plugin de vite.config.ts con este mismo handler.
//
// Usa cualquier API compatible con OpenAI (chat/completions). Por defecto, Groq,
// que tiene un plan gratis: alcanza con GROQ_API_KEY. Para usar otro proveedor,
// AI_BASE_URL, AI_API_KEY y AI_MODEL (ver README).

// Mismos valores públicos que usa la app (src/lib/supabase.ts).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kiifochsbrbuhyrrmwsv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ApxSFOfQ-VBD-Zbb5Cs9NQ_TCzvVWIf';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
// Si el primero llega a su límite gratis del día, se prueba el siguiente (cada modelo tiene el suyo).
const DEFAULT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

// Tiempo máximo por intento, para que un modelo lento no deje colgado el chat.
const ATTEMPT_TIMEOUT_MS = 45_000;

// El plan gratis de Groq permite unos 8000 tokens por minuto por modelo, y cada pedido
// descuenta lo que se manda más el máximo de respuesta. Las instrucciones y el esquema
// ocupan ~1300 tokens; el resto se estima en 3 caracteres por token (de más, para tener
// margen). La respuesta se lleva lo que queda, entre MIN y MAX_COMPLETION_TOKENS.
const TOKENS_PER_MINUTE = 7600;
const FIXED_PROMPT_TOKENS = 1300;
const CHARS_PER_TOKEN = 3;
const MIN_COMPLETION_TOKENS = 1500;
const MAX_COMPLETION_TOKENS = 4000;
const charsFor = (tokens: number) => (TOKENS_PER_MINUTE - FIXED_PROMPT_TOKENS - tokens) * CHARS_PER_TOKEN;
// El historial se agrega mientras deje lugar para una respuesta de 3000 tokens (~9900 caracteres
// entre relato, guardadas e historial). La última propuesta entra aunque deje menos.
const USER_CONTENT_BUDGET = charsFor(3000);
const USER_CONTENT_LIMIT = charsFor(MIN_COMPLETION_TOKENS);
// Para seguir con una propuesta pendiente, la IA la vuelve a escribir entera: tiene que
// entrar en la respuesta (el JSON rinde ~3,5 caracteres por token) con lugar para razonar.
const JSON_CHARS_PER_TOKEN = 3.5;
const REASONING_TOKENS = 500;
// Actividades guardadas que se le pasan (las del día, para que no las repita).
const MAX_SAVED = 40;

function isGroq(url: string): boolean {
  try {
    return new URL(url).hostname === 'api.groq.com';
  } catch {
    return false;
  }
}

function aiConfig() {
  const custom = process.env.AI_MODEL?.split(',').map((m) => m.trim()).filter(Boolean);
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  // La clave de Groq solo se manda a Groq: con otro proveedor hace falta AI_API_KEY.
  const groq = isGroq(baseUrl);
  return {
    baseUrl,
    apiKey: process.env.AI_API_KEY || (groq ? process.env.GROQ_API_KEY : '') || '',
    keyName: groq ? 'GROQ_API_KEY' : 'AI_API_KEY',
    models: custom?.length ? custom : DEFAULT_MODELS,
  };
}

/** Devuelve el id del usuario si el token de sesión es válido. */
async function verifySession(request: Request): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

// Mantener sincronizado con src/lib/categories.ts.
const CATEGORY_IDS = [
  'trabajo',
  'comidas',
  'movimiento',
  'ocio',
  'vinculos',
  'autocuidado',
  'descanso',
  'tareas',
  'otro',
] as const;

const SYSTEM_PROMPT = `Sos el asistente de una app de registro diario. La persona que te escribe está en tratamiento psicológico y anota lo que hace cada día para compartirlo con su terapeuta. Te cuenta con sus palabras cómo fue su día y vos lo ordenás en una lista cronológica de actividades que después ella revisa y guarda.

Cómo ordenar:
- Usá solo lo que la persona contó. No inventes actividades ni detalles.
- "start" es la hora de inicio en formato 24 h "HH:MM". Si no dijo la hora exacta, estimala por el contexto ("después de almorzar", "a la tarde") y aclará "Hora aproximada" en "notes".
- "end" solo si dijo cuándo terminó o se deduce con claridad ("de 10 a 13"). Si no, null: la app asume que dura hasta la siguiente actividad.
- "activity": frase breve (hasta 8 palabras) que diga qué hizo, por ejemplo "Desayuno con mi hermana" o "Trabajo en el proyecto".
- "category", una de: trabajo (trabajo o estudio), comidas, movimiento (actividad física), ocio (ocio y pantallas), vinculos (vínculos y vida social), autocuidado (autocuidado y salud, incluye terapia y medicación), descanso (dormir, siesta, descansar), tareas (tareas del hogar, trámites, traslados), otro.
- "pleasure" (placer) y "control", de 1 (nada) a 10 (muchísimo). Son los dos puntajes que el terapeuta mira en cada actividad: placer es cuánto la disfrutó; control es cuánto dominio, logro o control sintió al hacerla. Completalos solo si la persona dio el número o lo dijo con claridad ("lo disfruté muchísimo", "sentí que no podía con nada"); si no, null para que lo complete ella. No los inventes.
- "notes": emociones, pensamientos o detalles que puedan importarle a su terapeuta, lo más fiel posible a sus palabras. null si no hay nada.
- "dayMood": cómo fue el día en general, de 1 a 5, solo si se desprende del relato; si no, null.
- "reflection": una a tres oraciones en primera persona que resuman el día como lo contó, sin juicios, consejos ni diagnósticos. null si el relato es muy corto.
- "reply": un mensaje breve y cálido (una o dos oraciones, en español rioplatense) que confirme qué ordenaste. Si falta algo importante, como el horario de una actividad central, preguntalo. Si faltan los puntajes de placer y control, recordale que puede agregarlos (por ejemplo "placer 7, control 5").

En la conversación:
- Te paso las actividades que ya están guardadas ese día: no las repitas.
- Si en un mensaje posterior la persona corrige o agrega algo, devolvé la lista completa y actualizada de lo que todavía no está guardado.
- No des consejos clínicos ni interpretes lo que le pasa.

"supportNote": si la persona menciona ideas de hacerse daño, de quitarse la vida o que está en peligro, escribí un mensaje breve y contenedor que la anime a comunicarse ya con su terapeuta o con un servicio de emergencias, sin minimizar lo que siente. En cualquier otro caso, null.

Respondé solo con el objeto JSON pedido, sin texto antes ni después.`;

const EntrySchema = z.object({
  start: z.string().describe('Hora de inicio en formato 24 h HH:MM'),
  end: z.string().nullable().describe('Hora de fin HH:MM, o null si no se sabe'),
  activity: z.string().describe('Qué hizo, en pocas palabras'),
  category: z.enum(CATEGORY_IDS),
  pleasure: z.number().nullable().describe('Placer de 1 a 10, solo si lo dijo'),
  control: z.number().nullable().describe('Control o dominio de 1 a 10, solo si lo dijo'),
  notes: z.string().nullable(),
});

const OrganizedDaySchema = z.object({
  reply: z.string(),
  entries: z.array(EntrySchema),
  dayMood: z.number().nullable(),
  reflection: z.string().nullable(),
  supportNote: z.string().nullable(),
});

// Esquema estricto para la API: todos los campos obligatorios, null donde corresponde
// y sin propiedades extra.
const { $schema: _draft, ...RESPONSE_SCHEMA } = z.toJSONSchema(OrganizedDaySchema, { target: 'draft-7' });

// Turnos de conversación previos que se mandan a la IA (los más recientes que entren).
const MAX_HISTORY_TURNS = 30;

const RequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateLabel: z.string().max(80),
  message: z.string().trim().min(1).max(8000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(16000) }))
    .max(200),
  existing: z
    .array(z.object({ start: z.string().max(5), end: z.string().max(5).optional(), activity: z.string().max(300) }))
    .max(200),
});

type OrganizeRequest = z.infer<typeof RequestSchema>;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Va en lugar de un mensaje que no entró, para que la conversación empiece con la persona.
const OMITTED_TURN: ChatMessage = { role: 'user', content: '(Mensaje anterior omitido por largo.)' };

const userChars = (messages: ChatMessage[]) =>
  messages.reduce((n, m) => n + (m.role === 'system' ? 0 : m.content.length), 0);

/** Lo que queda del límite por minuto para la respuesta. */
function completionTokens(messages: ChatMessage[]): number {
  const room = TOKENS_PER_MINUTE - FIXED_PROMPT_TOKENS - Math.ceil(userChars(messages) / CHARS_PER_TOKEN);
  return Math.min(MAX_COMPLETION_TOKENS, Math.max(MIN_COMPLETION_TOKENS, room));
}

/** La última propuesta de la IA, si todavía tiene actividades sin guardar. */
function pendingProposal(req: OrganizeRequest): string | null {
  const last = req.history.slice(-MAX_HISTORY_TURNS).findLast((t) => t.role === 'assistant');
  if (!last) return null;
  try {
    const entries = (JSON.parse(last.content) as { entries?: unknown }).entries;
    return Array.isArray(entries) && entries.length ? last.content : null;
  } catch {
    return null;
  }
}

/**
 * Arma la conversación. Primero va la última propuesta, que tiene lo que falta guardar
 * (sin ella, una corrección pierde la lista). Con "full" se suman después los turnos más
 * recientes que entren; con "minimal" (si el pedido no entró), nada más.
 */
function buildMessages(req: OrganizeRequest, mode: 'full' | 'minimal'): ChatMessage[] {
  const saved = req.existing.length
    ? req.existing
        .slice(0, MAX_SAVED)
        .map((e) => `- ${e.start}${e.end ? `–${e.end}` : ''} ${e.activity.slice(0, 80)}`)
        .join('\n')
    : '(ninguna)';
  const current = `Día: ${req.dateLabel} (${req.date})\nActividades ya guardadas ese día:\n${saved}\n\nMensaje:\n${req.message}`;

  const turns = req.history.slice(-MAX_HISTORY_TURNS);
  const picked = new Set<number>();
  let used = current.length;
  const proposal = turns.findLastIndex((t) => t.role === 'assistant');
  if (proposal >= 0) {
    const size = OMITTED_TURN.content.length + turns[proposal].content.length;
    if (used + size <= USER_CONTENT_LIMIT) {
      picked.add(proposal);
      used += size;
    }
  }
  if (mode === 'full') {
    // Del más reciente al más viejo, mientras entren en el presupuesto.
    for (let i = turns.length - 1; i >= 0; i--) {
      if (picked.has(i)) continue;
      if (used + turns[i].content.length > USER_CONTENT_BUDGET) break;
      picked.add(i);
      used += turns[i].content.length;
    }
  }
  const history: ChatMessage[] = turns
    .filter((_, i) => picked.has(i))
    .map((t) => ({ role: t.role, content: t.content }));
  // La conversación tiene que empezar con un mensaje de la persona.
  if (history[0]?.role === 'assistant') history.unshift(OMITTED_TURN);

  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: current }];
}

// retry: vale la pena probar con el modelo siguiente.
type Failure = {
  ok: false;
  kind: keyof typeof FAILURES;
  retry: boolean;
  status: number;
  error: string;
  message: string;
};
/** Resultado de un intento con un modelo. */
type Attempt = { ok: true; day: z.infer<typeof OrganizedDaySchema> } | Failure;

const TOO_MUCH =
  'Es mucho para ordenar de una sola vez. Contámelo en partes (por ejemplo, la mañana y después la tarde) y guardá cada parte antes de seguir.';

const FAILURES = {
  auth: { status: 500, error: 'auth', message: 'La clave de la API de la IA no es válida.' },
  rateLimited: { status: 429, error: 'rate_limited', message: 'Hay muchos pedidos en este momento. Probá en un minuto.' },
  connection: { status: 502, error: 'connection', message: 'No me pude conectar con la IA. Probá de nuevo.' },
  api: { status: 502, error: 'api', message: 'La IA devolvió un error. Probá de nuevo en un momento.' },
  parse: { status: 502, error: 'parse_error', message: 'No pude ordenar este relato. Probá de nuevo o cargalo a mano.' },
  refusal: { status: 422, error: 'refusal', message: 'No pude procesar este relato. Probá cargándolo a mano.' },
  // El pedido no entra en el límite por minuto.
  tooLarge: { status: 413, error: 'too_large', message: TOO_MUCH },
  // La respuesta no entró en el máximo: con otro modelo pasaría lo mismo.
  tooLong: { status: 422, error: 'too_long', message: TOO_MUCH },
  // La propuesta pendiente es tan larga que no entra para volver a escribirla.
  listTooLong: {
    status: 422,
    error: 'too_long',
    message:
      'La lista que te propuse es muy larga para seguir cambiándola con la IA. Destildá lo que esté mal, guardá el resto y después contame lo que falte.',
  },
  // Se terminó el cupo gratis del día: la app sigue con el modo básico.
  quotaExhausted: { status: 503, error: 'quota_exhausted', message: 'Por hoy se terminó el cupo gratis de la IA.' },
} as const;

const fail = (kind: keyof typeof FAILURES, retry: boolean): Failure => ({ ok: false, kind, retry, ...FAILURES[kind] });

/** Código de error de la API (sin el texto, que puede incluir lo que escribió la persona). */
function errorInfo(detail: string): { code: string; tooLarge: boolean; daily: boolean } {
  try {
    const error = (JSON.parse(detail) as { error?: { code?: unknown; message?: unknown } }).error;
    const message = String(error?.message ?? '');
    return {
      code: String(error?.code ?? '').slice(0, 60),
      tooLarge: /request too large|reduce your message size/i.test(message),
      daily: /per day|\b(TPD|RPD)\b/i.test(message),
    };
  } catch {
    return { code: '', tooLarge: false, daily: false };
  }
}

async function attempt(
  config: ReturnType<typeof aiConfig>,
  model: string,
  messages: ChatMessage[],
): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'dia_ordenado', strict: true, schema: RESPONSE_SCHEMA },
        },
        temperature: 0.3,
        max_completion_tokens: completionTokens(messages),
        // Los modelos gpt-oss razonan antes de responder: con poco alcanza y gasta menos cupo.
        ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch {
    return fail('connection', true);
  }

  if (!res.ok) {
    const { code, tooLarge, daily } = errorInfo(await res.text().catch(() => ''));
    console.error('IA: error de la API', model, res.status, code);
    if (res.status === 401 || res.status === 403) return fail('auth', false);
    // Un pedido más grande que el límite por minuto: no entra en ningún modelo del plan.
    if (res.status === 413 || tooLarge) return fail('tooLarge', false);
    // Sin cupo en este modelo: cada modelo tiene el suyo. Si es el del día, no sirve esperar un minuto.
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after'));
      return fail(daily || wait > 120 ? 'quotaExhausted' : 'rateLimited', true);
    }
    // La salida no respetó el esquema, o el modelo ya no existe: se prueba el siguiente.
    if (/json_validate_failed|model_not_found|model_decommissioned/.test(code)) return fail('parse', true);
    return fail('api', res.status >= 500 || res.status === 404);
  }

  const body = (await res.json().catch(() => null)) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  } | null;
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal) return fail('refusal', false);
  if (choice?.finish_reason === 'length') {
    console.error('IA: respuesta cortada', model);
    return fail('tooLong', false);
  }
  if (!choice?.message?.content) {
    console.error('IA: respuesta vacía', model, choice?.finish_reason);
    return fail('parse', true);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(choice.message.content);
  } catch {
    console.error('IA: la respuesta no es JSON', model);
    return fail('parse', true);
  }
  const parsed = OrganizedDaySchema.safeParse(raw);
  if (!parsed.success) {
    console.error('IA: la respuesta no respeta el esquema', model);
    return fail('parse', true);
  }
  return { ok: true, day: parsed.data };
}

export async function POST(request: Request): Promise<Response> {
  const config = aiConfig();
  if (!config.apiKey) {
    console.error(`IA: falta ${config.keyName}`);
    return json({ error: 'not_configured', message: `Falta configurar ${config.keyName}.` }, 503);
  }

  // Solo usuarios con sesión iniciada: así nadie más usa tu clave.
  if (!(await verifySession(request))) {
    return json({ error: 'unauthorized', message: 'Tu sesión venció. Volvé a ingresar.' }, 401);
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return json({ error: 'bad_request', message: 'El pedido no tiene el formato esperado.' }, 400);
  }

  const full = buildMessages(parsedBody.data, 'full');
  const minimal = buildMessages(parsedBody.data, 'minimal');

  // Con una propuesta pendiente muy larga, la respuesta no tendría lugar para reescribirla:
  // se avisa sin gastar cupo en un pedido que va a quedar cortado.
  const pending = pendingProposal(parsedBody.data);
  if (
    pending &&
    (!full.some((m) => m.role === 'assistant' && m.content === pending) ||
      completionTokens(full) < Math.ceil(pending.length / JSON_CHARS_PER_TOKEN) + REASONING_TOKENS)
  ) {
    const { status, error, message } = FAILURES.listTooLong;
    return json({ error, message }, status);
  }
  let failure: Failure = fail('api', false);
  for (const model of config.models) {
    let result = await attempt(config, model, full);
    // Si no entra, se prueba una vez con menos conversación previa.
    if (!result.ok && result.kind === 'tooLarge' && userChars(minimal) < userChars(full)) {
      result = await attempt(config, model, minimal);
    }
    if (result.ok) return json(result.day);
    // Si un modelo solo está sin cupo por este minuto, eso es lo que se avisa.
    if (!(result.kind === 'quotaExhausted' && failure.kind === 'rateLimited')) failure = result;
    if (!result.retry) break;
  }
  return json({ error: failure.error, message: failure.message }, failure.status);
}
