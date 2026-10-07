// Recibe los errores de pantalla que reporta el navegador (src/components/ErrorBoundary.tsx)
// y los deja en los registros de Vercel. No incluye datos de la persona: solo el
// mensaje técnico, la ruta (sin códigos) y el navegador.

const clip = (value: unknown, max: number) => String(value ?? '').slice(0, max);

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body) {
    console.error(
      'client-error',
      JSON.stringify({
        message: clip(body.message, 500),
        stack: clip(body.stack, 2000),
        componentStack: clip(body.componentStack, 2000),
        route: clip(body.route, 60),
        userAgent: clip(request.headers.get('user-agent'), 300),
      }),
    );
  }
  return new Response(null, { status: 204 });
}
