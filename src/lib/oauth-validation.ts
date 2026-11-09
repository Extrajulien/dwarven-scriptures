import { z } from 'zod';
import { OAUTH_PROVIDER_IDS } from './oauth';

/**
 * Zod schemas for the server-side OAuth inputs. They are used by the API
 * routes under `src/app/api/auth/[provider]/` (and by the account action for
 * provider unlinking) so that provider ids, the post-login `next` destination
 * and the provider callback query are validated exactly once, as schemas.
 */

export const oauthProviderSchema = z.enum(OAUTH_PROVIDER_IDS);

/** A same-origin absolute path (`/…`, never `//…`) for the post-login redirect. */
export const oauthNextPathSchema = z.string().regex(/^\/(?!\/)/);

/**
 * The query parameters the OAuth provider echoes back on the callback.
 * `error` is `null` when the provider does not send one (the parameter is
 * absent), which is the expected happy path.
 */
export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().nullable(),
});
