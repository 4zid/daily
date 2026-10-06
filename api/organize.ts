import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Función serverless (Vercel) que ordena el relato del día en actividades.
// En desarrollo la sirve el plugin de vite.config.ts con este mismo handler.

// Mismos valores públicos que usa la app (src/lib/supabase.ts).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kiifochsbrbuhyrrmwsv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ApxSFOfQ-VBD-Zbb5Cs9NQ_TCzvVWIf';

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

"supportNote": si la persona menciona ideas de hacerse daño, de quitarse la vida o que está en peligro, escribí un mensaje breve y contenedor que la anime a comunicarse ya con su terapeuta o con un servicio de emergencias, sin minimizar lo que siente. En cualquier otro caso, null.`;

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

// Turnos de conversación previos que se mandan a la IA (los más recientes).
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

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function buildMessages(req: OrganizeRequest): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of req.history.slice(-MAX_HISTORY_TURNS)) {
    // La conversación tiene que empezar con un mensaje de la persona.
    if (messages.length === 0 && turn.role !== 'user') continue;
    messages.push({ role: turn.role, content: turn.content });
  }

  const saved = req.existing.length
    ? req.existing.map((e) => `- ${e.start}${e.end ? `–${e.end}` : ''} ${e.activity}`).join('\n')
    : '(ninguna)';

  messages.push({
    role: 'user',
    content: `Día: ${req.dateLabel} (${req.date})\nActividades ya guardadas ese día:\n${saved}\n\nMensaje:\n${req.message}`,
  });
  return messages;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return json({ error: 'not_configured', message: 'Falta configurar ANTHROPIC_API_KEY.' }, 503);
  }

  // Solo usuarios con sesión iniciada: así nadie más gasta tu clave.
  if (!(await verifySession(request))) {
    return json({ error: 'unauthorized', message: 'Tu sesión venció. Volvé a ingresar.' }, 401);
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return json({ error: 'bad_request', message: 'El pedido no tiene el formato esperado.' }, 400);
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Si el modelo declina el pedido, la API lo reintenta con un modelo alternativo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(OrganizedDaySchema) },
      system: SYSTEM_PROMPT,
      messages: buildMessages(parsedBody.data),
    });

    if (response.stop_reason === 'refusal') {
      return json(
        { error: 'refusal', message: 'No pude procesar este relato. Probá cargándolo a mano.' },
        422,
      );
    }
    if (!response.parsed_output) {
      return json({ error: 'parse_error', message: 'La respuesta de la IA vino incompleta. Probá de nuevo.' }, 502);
    }
    return json(response.parsed_output);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic: clave inválida');
      return json({ error: 'auth', message: 'La clave de la API de Anthropic no es válida.' }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'rate_limited', message: 'Hay muchos pedidos en este momento. Probá en un minuto.' }, 429);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return json({ error: 'connection', message: 'No me pude conectar con la IA. Probá de nuevo.' }, 502);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic API error', error.status, error.message);
      return json({ error: 'api', message: 'La IA devolvió un error. Probá de nuevo en un momento.' }, 502);
    }
    if (error instanceof Anthropic.AnthropicError) {
      // parse() falla si la respuesta quedó cortada o se declinó a mitad de camino.
      console.error('Anthropic: respuesta no válida', error.message);
      return json(
        { error: 'parse_error', message: 'No pude ordenar este relato. Probá de nuevo o cargalo a mano.' },
        502,
      );
    }
    throw error;
  }
}
