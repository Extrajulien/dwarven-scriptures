import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '..';
import { oauthAccounts, userResources, userStats, users } from '../schema';
import { InvalidUserInputError, isUsernameUniqueViolation, UsernameTakenError } from './users';

/**
 * Data access for OAuth-linked accounts.
 *
 * One `oauth_accounts` row links a `users` row to a provider identity
 * (`github` / `discord`). The find-or-create entry point
 * (`createOrLinkOAuthUser`) is what the OAuth callback calls: a returning
 * provider account is matched to its existing user, while a first sign-in
 * creates the user, both child rows and the linking row in one transaction.
 *
 * Username collisions are retried with a short random suffix so a provider
 * name that is already taken still results in a working account rather than a
 * failed sign-in.
 */

export const OAUTH_PROVIDERS = ['github', 'discord'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type OAuthAccountIdentity = {
  provider: OAuthProvider;
  providerAccountId: string;
};

export type NewOAuthUser = OAuthAccountIdentity & {
  username: string;
  pfpUrl: string | null;
};

export type OAuthSessionUser = {
  publicId: string;
  username: string;
};

const USERNAME_MAX_LENGTH = 32;
const MAX_USERNAME_ATTEMPTS = 5;

function assertIdentity(provider: string, providerAccountId: string): void {
  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
    throw new InvalidUserInputError(
      `provider must be one of ${OAUTH_PROVIDERS.join(', ')}`,
    );
  }
  if (
    typeof providerAccountId !== 'string' ||
    providerAccountId.trim().length === 0
  ) {
    throw new InvalidUserInputError('providerAccountId must be a non-empty string');
  }
}

function assertValidProfile(profile: NewOAuthUser): void {
  assertIdentity(profile.provider, profile.providerAccountId);

  const username = profile.username?.trim();
  if (!username || username.length === 0) {
    throw new InvalidUserInputError('username must be a non-empty string');
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    throw new InvalidUserInputError(
      `username must be at most ${USERNAME_MAX_LENGTH} characters`,
    );
  }
  if (profile.pfpUrl != null && typeof profile.pfpUrl !== 'string') {
    throw new InvalidUserInputError('pfpUrl must be a string or null');
  }
}

/**
 * Looks up the user linked to a provider account, or `null` when this is the
 * first sign-in with that identity.
 */
export async function findUserByOAuthAccount(
  provider: OAuthProvider,
  providerAccountId: string,
): Promise<OAuthSessionUser | null> {
  assertIdentity(provider, providerAccountId);

  const rows = await db
    .select({ publicId: users.publicId, username: users.username })
    .from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Creates the user, both child rows and the `oauth_accounts` link in one
 * transaction. A username collision is retried with a random suffix a few
 * times before giving up, so two different provider names that clash never
 * silently merge into one account.
 */
export async function createOAuthUser(profile: NewOAuthUser): Promise<OAuthSessionUser> {
  assertValidProfile(profile);
  const base = profile.username.trim();

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = attempt === 0 ? base : withRandomSuffix(base);

    try {
      return await insertOAuthUser({ ...profile, username });
    } catch (error) {
      if (!isUsernameUniqueViolation(error)) {
        throw error;
      }
      // Collision: try the next suffixed candidate in a fresh transaction.
    }
  }

  throw new UsernameTakenError();
}

/**
 * Returns the user for a provider identity, creating it on first sign-in.
 * This is the single entry point the OAuth callback needs.
 */
export async function createOrLinkOAuthUser(
  profile: NewOAuthUser,
): Promise<OAuthSessionUser> {
  const existing = await findUserByOAuthAccount(
    profile.provider,
    profile.providerAccountId,
  );
  if (existing) {
    return existing;
  }

  return createOAuthUser(profile);
}

async function insertOAuthUser(
  profile: NewOAuthUser & { username: string },
): Promise<OAuthSessionUser> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        username: profile.username,
        passwordHash: null,
        pfpUrl: profile.pfpUrl,
      })
      .returning({
        id: users.id,
        publicId: users.publicId,
        username: users.username,
      });

    if (!created) {
      throw new Error('Failed to create OAuth user: the insert returned no row');
    }

    const now = new Date();
    await tx.insert(userStats).values({ userId: created.id, updatedAt: now });
    await tx.insert(userResources).values({ userId: created.id, updatedAt: now });
    await tx.insert(oauthAccounts).values({
      userId: created.id,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
    });

    return { publicId: created.publicId, username: created.username };
  });
}

function withRandomSuffix(base: string): string {
  const suffix = `-${randomBytes(2).toString('hex')}`;
  return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
}
