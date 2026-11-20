/**
 * @jest-environment node
 *
 * ADR-010 bridge: the hub/engine must survive the module duplication that
 * Next.js introduces between the custom server (`tsx server.ts`) and the
 * compiled server-action bundle. `events.ts` therefore stores the instances
 * on `globalThis`; this test loads two copies of the module and proves that
 * what the realtime server registers is what a server action reads back.
 */

import type { RoomHub } from './hub';

type FakeHub = {
  notifyHostChanged: jest.Mock;
  notifyConfigUpdated: jest.Mock;
  notifyMemberKicked: jest.Mock;
  notifyRoomClosed: jest.Mock;
  notifyMemberLeft: jest.Mock;
};

const HOST = { publicId: '22222222-2222-4222-8222-222222222222', username: 'bob' };

function makeHub(): FakeHub {
  return {
    notifyHostChanged: jest.fn(),
    notifyConfigUpdated: jest.fn(),
    notifyMemberKicked: jest.fn(),
    notifyRoomClosed: jest.fn(),
    notifyMemberLeft: jest.fn(),
  };
}

afterEach(() => {
  jest.resetModules();
  // Clear the process-wide registration so it cannot leak across tests.
  const events = jest.requireActual('./events') as typeof import('./events');
  events.setRealtimeHub(null);
  events.setRaceEngine(null);
});

describe('events bridge (ADR-010)', () => {
  test('the hub registered by the realtime server is visible to a server-action copy', () => {
    const serverSide = jest.requireActual('./events') as typeof import('./events');
    const hub = makeHub();
    serverSide.setRealtimeHub(hub as unknown as RoomHub);

    // A fresh module graph mirrors Next.js bundling server actions into a
    // second copy of events.ts: it must read the same global registration.
    jest.resetModules();
    const actionSide = jest.requireActual('./events') as typeof import('./events');
    actionSide.publishHostChanged(42, HOST);

    expect(hub.notifyHostChanged).toHaveBeenCalledWith(42, HOST);
  });

  test('publish helpers are safe no-ops when no hub is registered', () => {
    const events = jest.requireActual('./events') as typeof import('./events');

    expect(() => {
      events.publishHostChanged(42, HOST);
      events.publishRoomClosed(42);
      events.publishMemberKicked(42, { userId: 1 });
      events.publishMemberLeft(42, { userId: 1 });
    }).not.toThrow();
  });
});
