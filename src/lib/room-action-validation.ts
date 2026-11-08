import { z } from 'zod';
import { guestNicknameSchema } from './guest-session';
import { roomConfigSchema } from './room-config';

/**
 * Zod v4 schemas for the room server actions (`src/app/rooms/actions.ts`).
 *
 * The schemas live here, outside the `'use server'` file, for two reasons:
 * Next.js only allows async functions to be exported from such a file, and
 * keeping the validation pure makes it unit-testable without mocking the
 * server-action runtime. Every action input is parsed with `.strict()` —
 * unknown keys are rejected, never ignored.
 */

export const roomVisibilitySchema = z.enum(['public', 'code', 'private']);
export const joinRoleSchema = z.enum(['participant', 'spectator']);

/** A room code as typed by a user: trimmed, upper-cased, SALLE-02 alphabet. */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJKMNP-Z2-9]{6}$/);

export const roomPublicIdSchema = z.uuid();

/** One target identity: a connected user (publicId) XOR a guest (token). */
export const targetIdentitySchema = z
  .object({
    targetUserId: roomPublicIdSchema.optional(),
    targetGuestToken: z.uuid().optional(),
  })
  .strict()
  .refine((data) => (data.targetUserId === undefined) !== (data.targetGuestToken === undefined), {
    error: 'exactlyOne',
  });

export const createRoomActionSchema = z
  .object({
    visibility: roomVisibilitySchema,
    capacity: z.number().int().min(2).max(30).optional(),
    hostRole: joinRoleSchema.optional(),
    config: roomConfigSchema.optional(),
  })
  .strict();

export const roomActionSchema = z
  .object({
    roomPublicId: roomPublicIdSchema,
  })
  .strict();

export const updateRoomConfigActionSchema = z
  .object({
    roomPublicId: roomPublicIdSchema,
    config: roomConfigSchema,
  })
  .strict();

export const kickMemberActionSchema = z
  .object({
    roomPublicId: roomPublicIdSchema,
    targetUserId: roomPublicIdSchema.optional(),
    targetGuestToken: z.uuid().optional(),
  })
  .strict()
  .refine((data) => (data.targetUserId === undefined) !== (data.targetGuestToken === undefined), {
    error: 'exactlyOne',
  });

export const transferHostActionSchema = z
  .object({
    roomPublicId: roomPublicIdSchema,
    targetUserId: roomPublicIdSchema,
  })
  .strict();

export const generateInvitationLinksActionSchema = z
  .object({
    roomPublicId: roomPublicIdSchema,
    count: z.number().int().min(1).max(100),
  })
  .strict();

export const setGuestNicknameActionSchema = z
  .object({
    nickname: guestNicknameSchema,
  })
  .strict();

export const joinRoomByCodeActionSchema = z
  .object({
    code: roomCodeSchema,
    role: joinRoleSchema.optional(),
  })
  .strict();

/**
 * Home create-room card (SALLE-01/05): the FormData fields arrive as strings,
 * so the capacity is coerced and bounds-checked here — the same 2–30 range
 * the action/query re-verify.
 */
export const createRoomFormDataSchema = z
  .object({
    visibility: roomVisibilitySchema,
    capacity: z.coerce.number().int().min(2).max(30),
    hostRole: joinRoleSchema,
  })
  .strict();

export type CreateRoomActionInput = z.input<typeof createRoomActionSchema>;
export type UpdateRoomConfigActionInput = z.input<typeof updateRoomConfigActionSchema>;
export type KickMemberActionInput = z.input<typeof kickMemberActionSchema>;
export type TransferHostActionInput = z.input<typeof transferHostActionSchema>;
export type GenerateInvitationLinksActionInput = z.input<
  typeof generateInvitationLinksActionSchema
>;
export type SetGuestNicknameActionInput = z.input<typeof setGuestNicknameActionSchema>;
export type JoinRoomByCodeActionInput = z.input<typeof joinRoomByCodeActionSchema>;
export type RoomActionInput = z.input<typeof roomActionSchema>;
