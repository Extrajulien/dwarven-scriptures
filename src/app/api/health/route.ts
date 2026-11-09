/**
 * GET /api/health — minimal liveness probe for Railway health checks
 * (TECH-05). Intentionally touches neither the database nor the realtime
 * layer: the platform only needs to know the process answers HTTP. No
 * request parameter is declared because nothing about the request matters.
 */
export function GET(): Response {
  return Response.json({ status: 'ok' });
}
