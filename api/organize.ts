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
// ocupan ~1300 tokens; el resto del pedido (relato, guardadas e historial) se recorta a
// USER_CONTENT_BUDGET caracteres (~3500 tokens) para que todo entre con margen.
const MAX_COMPLETION_TOKENS = 2500;
const USER_CONTENT_BUDGET = 12_000;
// Actividades guardadas que se le pasan (las del día, para que no las repita).
const MAX_SAVED = 40;

function aiConfig() {
  const custom = process.env.AI_MODEL?.split(',').map((m) => m.trim()).filter(Boolean);
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || '',
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

function buildMessages(req: OrganizeRequest, withHistory: boolean): ChatMessage[] {
  const saved = req.existing.length
    ? req.existing
        .slice(0, MAX_SAVED)
        .map((e) => `- ${e.start}${e.end ? `–${e.end}` : ''} ${e.activity.slice(0, 80)}`)
        .join('\n')
    : '(ninguna)';
  const current = `Día: ${req.dateLabel} (${req.date})\nActividades ya guardadas ese día:\n${saved}\n\nMensaje:\n${req.message}`;

  // Del más reciente al más viejo, mientras entren en el presupuesto.
  const history: ChatMessage[] = [];
  let room = USER_CONTENT_BUDGET - current.length;
  for (const turn of withHistory ? req.history.slice(-MAX_HISTORY_TURNS).reverse() : []) {
    room -= turn.content.length;
    if (room < 0) break;
    history.unshift({ role: turn.role, content: turn.content });
  }
  // La conversación tiene que empezar con un mensaje de la persona.
  while (history.length && history[0].role !== 'user') history.shift();

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

const FAILURES = {
  auth: { status: 500, error: 'auth', message: 'La clave de la API de la IA no es válida.' },
  rateLimited: { status: 429, error: 'rate_limited', message: 'Hay muchos pedidos en este momento. Probá en un minuto.' },
  connection: { status: 502, error: 'connection', message: 'No me pude conectar con la IA. Probá de nuevo.' },
  api: { status: 502, error: 'api', message: 'La IA devolvió un error. Probá de nuevo en un momento.' },
  parse: { status: 502, error: 'parse_error', message: 'No pude ordenar este relato. Probá de nuevo o cargalo a mano.' },
  refusal: { status: 422, error: 'refusal', message: 'No pude procesar este relato. Probá cargándolo a mano.' },
  tooLarge: {
    status: 413,
    error: 'too_large',
    message: 'El relato es muy largo para la IA. Probá contarlo en partes más cortas.',
  },
} as const;

const fail = (kind: keyof typeof FAILURES, retry: boolean): Failure => ({ ok: false, kind, retry, ...FAILURES[kind] });

/** Código de error de la API (sin el texto: puede incluir lo que escribió la persona). */
function errorInfo(detail: string): { code: string; tooLarge: boolean } {
  try {
    const error = (JSON.parse(detail) as { error?: { code?: unknown; message?: unknown } }).error;
    return {
      code: String(error?.code ?? '').slice(0, 60),
      tooLarge: /request too large|reduce your message size/i.test(String(error?.message ?? '')),
    };
  } catch {
    return { code: '', tooLarge: false };
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
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // Los modelos gpt-oss razonan antes de responder: con poco alcanza y gasta menos cupo.
        ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch {
    return fail('connection', true);
  }

  if (!res.ok) {
    const { code, tooLarge } = errorInfo(await res.text().catch(() => ''));
    console.error('IA: error de la API', model, res.status, code);
    if (res.status === 401 || res.status === 403) return fail('auth', false);
    // Un pedido más grande que el límite por minuto: no entra en ningún modelo del plan.
    if (res.status === 413 || tooLarge) return fail('tooLarge', false);
    // Sin cupo en este modelo: cada modelo tiene el suyo.
    if (res.status === 429) return fail('rateLimited', true);
    // La salida no respetó el esquema, o el modelo ya no existe: se prueba el siguiente.
    if (/json_validate_failed|model_not_found|model_decommissioned/.test(code)) return fail('parse', true);
    return fail('api', res.status >= 500 || res.status === 404);
  }

  const body = (await res.json().catch(() => null)) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  } | null;
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal) return fail('refusal', false);
  if (!choice?.message?.content || choice.finish_reason === 'length') {
    console.error('IA: respuesta incompleta', model, choice?.finish_reason);
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
    return json({ error: 'not_configured', message: 'Falta configurar GROQ_API_KEY.' }, 503);
  }

  // Solo usuarios con sesión iniciada: así nadie más usa tu clave.
  if (!(await verifySession(request))) {
    return json({ error: 'unauthorized', message: 'Tu sesión venció. Volvé a ingresar.' }, 401);
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return json({ error: 'bad_request', message: 'El pedido no tiene el formato esperado.' }, 400);
  }

  const full = buildMessages(parsedBody.data, true);
  let failure: Failure = fail('api', false);
  for (const model of config.models) {
    let result = await attempt(config, model, full);
    // Si no entra, se prueba una vez sin la conversación previa.
    if (!result.ok && result.kind === 'tooLarge' && full.length > 2) {
      result = await attempt(config, model, buildMessages(parsedBody.data, false));
    }
    if (result.ok) return json(result.day);
    failure = result;
    if (!result.retry) break;
  }
  return json({ error: failure.error, message: failure.message }, failure.status);
}
