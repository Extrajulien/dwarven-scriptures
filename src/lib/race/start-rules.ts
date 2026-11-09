import type { RoomConfig } from '../../db/schema';
import { roomConfigSchema, safeParseRoomConfig } from '../room-config';
import {
  isRacePhase,
  type RaceParticipant,
  type RacePhase,
} from './state';

/**
 * Pure rules around starting a race inside a room (COURSE-02/03, SALLE-09).
 *
 * These are the bridges between the room layer (database rows, `rooms.status`)
 * and the race machine (`src/lib/race/state.ts`): mapping present members to
 * race participants, validating the race configuration with the same Zod
 * schema that guards `rooms.config`, and owning the room-status ↔ race-phase
 * mapping as a single source of truth. Everything is deterministic over
 * plain data — the SP-2B wiring calls these functions before feeding the
 * state machine.
 */

/** Raised when input cannot be turned into race data. */
export class RaceStartRulesError extends Error {
  readonly code: 'invalid_member_identity' | 'unknown_phase';

  constructor(code: 'invalid_member_identity' | 'unknown_phase', message: string) {
    super(message);
    this.name = 'RaceStartRulesError';
    this.code = code;
  }
}

/**
 * What `collectRaceParticipants` needs from a present membership row: the
 * internal member id (server-side only), the role, exactly one identity and
 * a display name. The caller passes **present** members only — `leftAt` and
 * kick filtering belong to the room queries, which already select
 * `leftAt IS NULL`.
 */
export type MemberForRace = {
  memberId: number;
  role: string;
  userId: number | null;
  guestToken: string | null;
  /** Username for users, the guest's chosen nickname for guests. */
  displayName: string;
};

/**
 * COURSE-02: turns present room members into race participants. Spectators
 * are excluded; everyone else — participants and the `host` role — races.
 * Users map to `kind: 'user'`, guests to `kind: 'guest'`. The `'bot'` kind
 * exists in {@link RaceParticipant} for Phase 4, but bots never come from
 * the room membership table: the bot engine adds them directly to the race.
 * A member with neither (or both) identities is malformed and rejected.
 */
export function collectRaceParticipants(
  members: readonly MemberForRace[],
): RaceParticipant[] {
  const participants: RaceParticipant[] = [];

  for (const member of members) {
    if (member.role === 'spectator') {
      continue;
    }

    const hasUser = member.userId !== null;
    const hasGuest = member.guestToken !== null;
    if (hasUser === hasGuest) {
      throw new RaceStartRulesError(
        'invalid_member_identity',
        `member ${member.memberId} must have exactly one of userId or guestToken`,
      );
    }

    participants.push({
      memberId: String(member.memberId),
      kind: hasUser ? 'user' : 'guest',
      displayName: member.displayName,
      isSpectator: false,
    });
  }

  return participants;
}

export type RaceConfigValidationResult =
  | { ok: true; config: RoomConfig }
  | { ok: false; issues: string[] };

/**
 * Validates a race configuration with the room-config Zod schema — the exact
 * same single source of truth that guards `rooms.config` (CONF-01..12, TECH-07).
 * Returns a result object instead of throwing so callers can hand the issues
 * straight to a form.
 */
export function validateRaceConfig(value: unknown): RaceConfigValidationResult {
  const result = safeParseRoomConfig(value);
  if (result !== null) {
    return { ok: true, config: result };
  }

  const parsed = roomConfigSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, config: parsed.data };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`,
    ),
  };
}

/**
 * COURSE-01/SALLE-09: maps a race phase to the `rooms.status` value. The two
 * vocabularies are identical by design (`en_attente`, `decompte`,
 * `en_course`, `resultats`, `fermee`), so the mapping is the identity — but
 * every layer that persists a room status or reads one must go through this
 * function (or `isRacePhase`) instead of hardcoding the strings, keeping one
 * place to change if the vocabularies ever diverge. Accepts a raw string and
 * throws on any unknown value, so an unchecked database status can never
 * leak into the race machine.
 */
export function roomStatusForPhase(phase: string): RacePhase {
  if (!isRacePhase(phase)) {
    throw new RaceStartRulesError('unknown_phase', `unknown race phase: ${String(phase)}`);
  }
  return phase;
}

/** Inverse convenience: a valid `rooms.status` is always a race phase. */
export function phaseForRoomStatus(status: string): RacePhase | null {
  return isRacePhase(status) ? status : null;
}
