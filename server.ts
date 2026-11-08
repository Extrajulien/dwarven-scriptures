/**
 * Custom server entry (ADR-010, Decision A): one HTTP server for Next.js and
 * the WebSocket realtime layer, one process, one port.
 *
 * See `doc/ARCHITECTURE.md` (ADR-010) for the decision record. Next 16.3.8's
 * documented custom-server pattern is used: `next({ dev, httpServer })` +
 * `app.prepare()` + `app.getRequestHandler()`; those APIs are not among the
 * deprecated custom-server methods. The realtime layer answers upgrades on
 * `/ws`; every other upgrade stays with Next's own handler (dev HMR).
 *
 * This file runs under the `tsx` CLI and is **not** compiled by `next build`
 * (`node_modules/next/dist/docs/01-app/02-guides/custom-server.md`), so it
 * loads `.env.local` itself and imports the rest of the application lazily —
 * the database client reads `DATABASE_URL` at module evaluation time.
 *
 * Launch notes (verified locally):
 * - the full `tsx` CLI is required — `node --import tsx/esm` breaks
 *   drizzle-orm's internal module resolution and cannot be used;
 * - `next` must be imported (and `app.prepare()` awaited) before the realtime
 *   module loads, otherwise Next's module graph can boot corrupted;
 * - the realtime graph must not import `next/headers` at boot — the pure
 *   token codecs (`src/lib/session-token.ts`, `guest-token.ts`) keep the
 *   cookie verification free of Next's request context.
 */

import * as dotenv from 'dotenv';
import { resolveHostname, resolvePort } from './src/lib/server-config';
import { parseAllowedOrigins } from './src/realtime/origin';

dotenv.config({ path: '.env.local' });
dotenv.config();

const port = resolvePort(process.env.PORT);
const hostname = resolveHostname(process.env.HOSTNAME);
const dev = process.env.NODE_ENV !== 'production';

async function main(): Promise<void> {
  // Load 'next' first and wait for it: importing the realtime module (whose
  // graph touches the token codecs) in parallel with 'next' corrupted Next's
  // module graph at boot during local verification.
  const [{ createServer }, { default: next }] = await Promise.all([
    import('node:http'),
    import('next'),
  ]);

  const server = createServer();
  const app = next({ dev, httpServer: server, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const { createRealtimeServer } = await import('./src/realtime/server');

  const realtime = createRealtimeServer(server, {
    allowedOrigins: parseAllowedOrigins(process.env.WS_ALLOWED_ORIGINS),
  });

  server.on('request', (request, response) => {
    void handle(request, response);
  });

  server.listen(port, hostname, () => {
    console.log(
      `> Dwarven scriptures ready on http://${hostname}:${port} ` +
        `(${dev ? 'development' : process.env.NODE_ENV ?? 'production'}), ws on /ws`,
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    try {
      await realtime.close();
    } catch (error) {
      console.error('realtime shutdown failed', error);
    }
    try {
      await app.close();
    } catch (error) {
      console.error('next shutdown failed', error);
    }
    server.close(() => {
      process.exit(0);
    });
    // Do not hang forever on stubborn connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error('failed to start the server', error);
  process.exit(1);
});
