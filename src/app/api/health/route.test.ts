/**
 * @jest-environment node
 *
 * Unit test for the Railway liveness probe (TECH-05): the handler must
 * answer 200 with a fixed payload and must not require any database or
 * session context.
 */

import { GET } from './route';

describe('GET /api/health (TECH-05)', () => {
  test('answers 200 with { status: "ok" }', () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  test('payload is the fixed status object', async () => {
    const response = GET();
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
