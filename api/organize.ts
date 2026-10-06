import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

// Función serverless (Vercel) que ordena el relato del día en actividades.
// En desarrollo la sirve el plugin de vite.config.ts con este mismo handler.

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
- "mood" de 1 (muy mal) a 5 (muy bien) solo si la persona expresó cómo se sintió en esa actividad; si no, null.
- "notes": emociones, pensamientos o detalles que puedan importarle a su terapeuta, lo más fiel posible a sus palabras. null si no hay nada.
- "dayMood": cómo fue el día en general, de 1 a 5, solo si se desprende del relato; si no, null.
- "reflection": una a tres oraciones en primera persona que resuman el día como lo contó, sin juicios, consejos ni diagnósticos. null si el relato es muy corto.
- "reply": un mensaje breve y cálido (una o dos oraciones, en español rioplatense) que confirme qué ordenaste. Si falta algo importante, como el horario de una actividad central, preguntalo.

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
  mood: z.number().nullable().describe('Ánimo de 1 a 5, solo si lo expresó'),
  notes: z.string().nullable(),
});

const OrganizedDaySchema = z.object({
  reply: z.string(),
  entries: z.array(EntrySchema),
  dayMood: z.number().nullable(),
  reflection: z.string().nullable(),
  supportNote: z.string().nullable(),
});

const RequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateLabel: z.string().max(80),
  message: z.string().trim().min(1).max(8000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(16000) }))
    .max(30),
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
  for (const turn of req.history) {
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

  const accessCode = process.env.APP_ACCESS_CODE;
  if (accessCode && request.headers.get('x-access-code') !== accessCode) {
    return json({ error: 'unauthorized', message: 'Código de acceso incorrecto.' }, 401);
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
    throw error;
  }
}
