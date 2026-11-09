import type { RoomConfig } from '../db/schema';
import type { RaceText } from '../lib/race/state';
import { generateRandomRaceText } from '../lib/race/text-generator';
import { pickCoherentText } from '../lib/race/text-select';
import type { ComplexityLevel } from '../lib/text-metrics';
import { getDictionaryWords, listCoherentCandidates } from '../db/queries/texts';

/**
 * Production text picker for the race engine (CONF-02/03/04/05/06/07).
 *
 * Coherent mode ranks the corpus passages with the pure
 * `pickCoherentText` over `listCoherentCandidates` (language + complexity
 * pair, then word count, then CONF-06 option compatibility — the CONF-07
 * behavior documented in `src/lib/race/text-select.ts`). Random mode
 * generates a deterministic text with `generateRandomRaceText` from the
 * seeded dictionary and the seed the engine recorded in its race state.
 * Returns `null` when the corpus/dictionary cannot provide a text so the
 * engine can report `race_not_running` instead of crashing.
 */
export async function pickRaceText(config: RoomConfig, seed: number): Promise<RaceText | null> {
  if (config.textType === 'coherent') {
    const candidates = await listCoherentCandidates({
      language: config.textLanguage,
      complexity: config.textComplexity,
    });
    const best = pickCoherentText(candidates, config);
    if (!best) {
      return null;
    }
    if (best.language !== 'fr' && best.language !== 'en') {
      return null;
    }
    const complexity: ComplexityLevel =
      best.complexity === 'facile' || best.complexity === 'moyen' || best.complexity === 'difficile'
        ? best.complexity
        : config.textComplexity;

    return {
      id: String(best.id),
      body: best.body,
      language: best.language,
      complexity,
      wordCount: best.wordCount,
    };
  }

  const dictionaryWords = await getDictionaryWords({
    language: config.textLanguage,
    complexity: config.textComplexity,
  });
  if (dictionaryWords.length === 0) {
    return null;
  }

  const generated = generateRandomRaceText({
    language: config.textLanguage,
    complexity: config.textComplexity,
    wordCount: config.wordCount,
    options: config.options,
    dictionaryWords,
    seed,
  });

  return {
    id: null,
    body: generated.body,
    language: config.textLanguage,
    complexity: config.textComplexity,
    wordCount: config.wordCount,
  };
}
