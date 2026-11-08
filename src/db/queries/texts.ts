import { and, eq } from 'drizzle-orm';
import { db } from '..';
import { texts, wordDictionaries, type Text } from '../schema';
import type { CoherentCandidate } from '../../lib/race/text-select';

/**
 * Data access for the typing corpus and the random-mode dictionaries
 * (CONF-02/03/04/05/06).
 *
 * Reads only: `texts` and `word_dictionaries` are reference data seeded by
 * `src/db/seed.ts` (`npm run db:seed`) and never written by the application.
 * The selection ranking itself is pure and lives in
 * `src/lib/race/text-select.ts`; these queries only fetch the candidate set
 * filtered by language + complexity (the indexed pair) and the word pool.
 */

/** Raised for input the database must not be asked to filter on. */
export class InvalidTextInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTextInputError';
  }
}

export const TEXT_LANGUAGES = ['fr', 'en'] as const;
export const TEXT_COMPLEXITIES = ['facile', 'moyen', 'difficile'] as const;

export type TextLanguage = (typeof TEXT_LANGUAGES)[number];
export type TextComplexity = (typeof TEXT_COMPLEXITIES)[number];

/** Key of the reference tables: one dictionary / corpus slice per pair. */
export type TextSelectionKey = {
  language: TextLanguage;
  complexity: TextComplexity;
};

function assertLanguage(language: string): void {
  if (!(TEXT_LANGUAGES as readonly string[]).includes(language)) {
    throw new InvalidTextInputError('language must be "fr" or "en"');
  }
}

function assertComplexity(complexity: string): void {
  if (!(TEXT_COMPLEXITIES as readonly string[]).includes(complexity)) {
    throw new InvalidTextInputError('complexity must be facile, moyen or difficile');
  }
}

/**
 * Coherent-mode candidates for one (language, complexity) pair (CONF-02/03/
 * 05). The returned rows carry the metrics and CONF-06 flags that
 * `pickCoherentText` ranks on; the pair is indexed
 * (`texts_language_complexity_idx`).
 */
export async function listCoherentCandidates(
  filters: TextSelectionKey,
): Promise<CoherentCandidate[]> {
  assertLanguage(filters.language);
  assertComplexity(filters.complexity);

  return db
    .select({
      id: texts.id,
      title: texts.title,
      body: texts.body,
      language: texts.language,
      complexity: texts.complexity,
      wordCount: texts.wordCount,
      hasPunctuation: texts.hasPunctuation,
      hasNumbers: texts.hasNumbers,
      hasCapitals: texts.hasCapitals,
      hasAccents: texts.hasAccents,
    })
    .from(texts)
    .where(
      and(eq(texts.language, filters.language), eq(texts.complexity, filters.complexity)),
    );
}

/**
 * Defensively parses the `word_dictionaries.words` jsonb column into a plain
 * string array. The `pg` driver normally returns jsonb already parsed, but a
 * raw JSON string (or anything else a hand-edited row could contain) is
 * tolerated; unparsable values yield an empty list. Only strings survive.
 */
export function parseDictionaryWords(value: unknown): string[] {
  let entries: unknown = value;

  if (typeof value === 'string') {
    try {
      entries = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * The random-mode word pool for one (language, complexity) pair (CONF-03).
 * Returns `[]` when the pair is missing — the seed guarantees all six rows,
 * so an empty result is a misconfigured database, never a crash.
 */
export async function getDictionaryWords(filters: TextSelectionKey): Promise<string[]> {
  assertLanguage(filters.language);
  assertComplexity(filters.complexity);

  const rows = await db
    .select({ words: wordDictionaries.words })
    .from(wordDictionaries)
    .where(
      and(
        eq(wordDictionaries.language, filters.language),
        eq(wordDictionaries.complexity, filters.complexity),
      ),
    )
    .limit(1);

  return rows[0] ? parseDictionaryWords(rows[0].words) : [];
}

/**
 * Loads one corpus passage by internal id (server-side use only: the id is
 * resolved from the database, never accepted from a client). Returns `null`
 * when the row does not exist.
 */
export async function getTextById(id: number): Promise<Text | null> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new InvalidTextInputError('id must be a positive integer');
  }

  const rows = await db.select().from(texts).where(eq(texts.id, id)).limit(1);
  return rows[0] ?? null;
}
