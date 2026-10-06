import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';

// En producción, Vercel publica api/organize.ts como función serverless.
// En desarrollo, este plugin atiende /api/organize con el mismo handler.
function devApi(): Plugin {
  return {
    name: 'daily-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/organize', async (req, res) => {
        try {
          const { POST } = (await server.ssrLoadModule('/api/organize.ts')) as typeof import('./api/organize');
          const response = await POST(await toRequest(req));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(String(error));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'server', message: 'Error interno del servidor de desarrollo.' }));
        }
      });
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  return new Request(`http://localhost${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
}

export default defineConfig(({ mode }) => {
  // Expone ANTHROPIC_API_KEY y APP_ACCESS_CODE de .env.local al handler (nunca al navegador).
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'APP_ACCESS_CODE']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), devApi()],
  };
});
