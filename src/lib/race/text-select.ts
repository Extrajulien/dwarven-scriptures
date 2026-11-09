import type { RoomConfig } from '../../db/schema';

/**
 * Pure selection of a coherent passage for a race (CONF-03/07).
 *
 * Coherent mode picks real passages from the seeded corpus. Selection is a
 * ranking, not a hard filter, so it degrades gracefully: the passage whose
 * metrics best match the configuration wins, ordered by
 *
 * 1. language match (CONF-02),
 * 2. complexity match (CONF-05),
 * 3. word count closest to the requested length (CONF-04),
 * 4. option compatibility — the fewest CONF-06 flag mismatches
 *    (`options` on requires the flag, `options` off requires its absence),
 * 5. title, ascending, as the deterministic tie-break.
 *
 * `listCoherentCandidates` already restricts the candidate set to the
 * requested language and complexity; the ranking still checks them so the
 * function stays correct for any caller-supplied list. The CONF-07 choice is
 * documented here and in `doc/EXIGENCES.md`: compatible passages rank first,
 * and when no passage is fully compatible the closest one is chosen instead
 * of failing.
 */

/** The subset of the room config that drives text selection. */
export type TextSelectionConfig = Pick<
  RoomConfig,
  'textLanguage' | 'textComplexity' | 'wordCount' | 'options'
>;

/** A corpus passage with the metrics the selection needs (CONF-05). */
export type CoherentCandidate = {
  id: number;
  title: string;
  body: string;
  language: string;
  complexity: string;
  wordCount: number;
  hasPunctuation: boolean;
  hasNumbers: boolean;
  hasCapitals: boolean;
  hasAccents: boolean;
};

/** CONF-06 option ↔ corpus flag pairs, in a fixed order. */
export const CANDIDATE_OPTION_FLAGS = [
  ['punctuation', 'hasPunctuation'],
  ['numbers', 'hasNumbers'],
  ['capitals', 'hasCapitals'],
  ['accents', 'hasAccents'],
] as const;

/**
 * CONF-07 (coherent mode): an option turned on requires the matching flag,
 * an option turned off requires its absence — so a passage with capitals is
 * not selected for a no-capitals race. Returns the number of mismatches
 * (0 = fully compatible).
 */
export function countOptionMismatches(
  candidate: CoherentCandidate,
  options: TextSelectionConfig['options'],
): number {
  let mismatches = 0;
  for (const [option, flag] of CANDIDATE_OPTION_FLAGS) {
    if (options[option] !== candidate[flag]) {
      mismatches += 1;
    }
  }
  return mismatches;
}

/**
 * Sorts the candidates best-first per the documented ranking (CONF-02/04/
 * 05/06/07). Deterministic: the comparator never returns "equal" for
 * different passages thanks to the title tie-break. The input is not
 * mutated.
 */
export function rankCandidates(
  candidates: readonly CoherentCandidate[],
  config: TextSelectionConfig,
): CoherentCandidate[] {
  return [...candidates].sort((a, b) => {
    const languageA = a.language === config.textLanguage ? 0 : 1;
    const languageB = b.language === config.textLanguage ? 0 : 1;
    if (languageA !== languageB) {
      return languageA - languageB;
    }

    const complexityA = a.complexity === config.textComplexity ? 0 : 1;
    const complexityB = b.complexity === config.textComplexity ? 0 : 1;
    if (complexityA !== complexityB) {
      return complexityA - complexityB;
    }

    const distanceA = Math.abs(a.wordCount - config.wordCount);
    const distanceB = Math.abs(b.wordCount - config.wordCount);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    const mismatchesA = countOptionMismatches(a, config.options);
    const mismatchesB = countOptionMismatches(b, config.options);
    if (mismatchesA !== mismatchesB) {
      return mismatchesA - mismatchesB;
    }

    if (a.title < b.title) {
      return -1;
    }
    if (a.title > b.title) {
      return 1;
    }
    return 0;
  });
}

/** The best-matching passage, or `null` when there is no candidate at all. */
export function pickCoherentText(
  candidates: readonly CoherentCandidate[],
  config: TextSelectionConfig,
): CoherentCandidate | null {
  return rankCandidates(candidates, config)[0] ?? null;
}
