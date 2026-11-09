import { progression } from './stats';
import { stripAccents } from './text-generator';
import type { ParticipantKind } from './state';

/**
 * Pure comeback-bonus rules (BONUS-01/02/04).
 *
 * The exact rules, documented here so the engine, the bots and the tests all
 * share one interpretation (the « Choix à documenter » bullet of BONUS-01):
 *
 * ## Checkpoints (BONUS-01)
 *
 * The race has exactly three checkpoint events, fired when the LEADER's
 * progression — `validatedChars ÷ the leader's own effective text length`
 * (Annexe A, bonus-adjusted) — crosses 25 %, 50 % and 75 %. Each checkpoint
 * fires at most once per race ({@link newlyCrossedCheckpoints}). A
 * progression jump that crosses several checkpoints between two ticks fires
 * each of them, in ascending order. Because the denominator is the leader's
 * *effective* length, a `addWords` hinder lowers the leader's progression and
 * can never re-fire an already fired checkpoint.
 *
 * ## Targets
 *
 * - **Hinder target:** the leader at that instant — precisely, the
 *   **non-finished participant with the highest progression** (bots included;
 *   ties break by most validated characters, then by `memberId` ascending,
 *   so the choice is deterministic). A finished participant can no longer be
 *   hindered (their result is recorded, and growing their text would un-finish
 *   them) — the front-most still-racing participant is the leader.
 * - **Help target:** eligible = non-finished participants whose progression
 *   is **≥ {@link BONUS_HELP_GAP} (25 percentage points) behind the leader**
 *   **or** who hold the **last position** (the minimum progression among the
 *   other racers, strictly behind the leader). The **most-behind eligible
 *   participant** is picked (lowest progression; ties by fewest validated
 *   characters, then `memberId` ascending). No eligible participant → the
 *   help is skipped. The last-position clause guarantees an eligible target
 *   whenever at least two participants are still racing.
 *
 * ## Types (BONUS-02)
 *
 * One effect per checkpoint event; the type is a seeded uniform draw among
 * the three ({@link pickBonusType}, deterministic from the race seed):
 *
 * - `addWords` (hinder, applied to the leader): +3 words appended after the
 *   target's current text. The words are plain dictionary words synthesized
 *   deterministically from the race seed ({@link generateBonusWords}) — the
 *   same language × complexity dictionary the random-mode generator uses.
 *   **Documented trade-off:** coherent-mode passages therefore receive plain
 *   dictionary words (no capitals, numbers or punctuation — the CONF-06
 *   options are deliberately not applied to bonus words), which keeps the
 *   draw deterministic and typeable in every configuration at the cost of a
 *   possible stylistic mismatch with a corpus passage.
 * - `removeWords` (help, applied to the most-behind eligible participant):
 *   −3 words removed from the **end of the receiver's remaining text** —
 *   never anything before the receiver's current caret position, and the
 *   remaining suffix is clamped to ≥ {@link BONUS_MIN_REMAINING_CHARS}
 *   character (fewer removable words → fewer removed; nothing removable →
 *   the event is skipped). If the receiver has already validated the whole
 *   shrunken text, they finish on the spot.
 * - `fog` (hinder, leader only): **no text change** — carried as a pure
 *   event whose payload holds a {@link BONUS_FOG_DURATION_MS} blur duration
 *   (SP-4C renders the 2 s blur on the targeted client). **Bots never
 *   receive fog** (they have no visual to blur): when the leader is a bot
 *   the fog event is **skipped** — the simplest honest rule, documented here
 *   and in `doc/ARCHITECTURE.md` (the fog's effect is purely visual, so
 *   applying it to a bot would be a no-op that still counts against the
 *   bot's per-race cap).
 *
 * ## Caps
 *
 * Per-participant cap: at most {@link BONUS_MAX_PER_PARTICIPANT} bonuses
 * received per race. With three checkpoint events per race the cap is
 * currently unreachable (it is enforced defensively so future rule changes
 * cannot break the guarantee).
 *
 * ## Effects as pure data
 *
 * {@link evaluateBonusEvent} computes the effect of one event on one target
 * as pure data: `{ applied, textLengthDelta, newText, payload }`. The engine
 * (humans) and the bot adapter (`src/lib/bots/schedule.ts`) apply the same
 * `newText`/length fields to their state — one shared model (ADR-011, BOT-04).
 * `progression = validatedChars ÷ effective length` (BONUS-04) uses the
 * per-participant `text.length` everywhere, via `stats.progression`.
 *
 * ## Determinism (BOT-05 style)
 *
 * Everything is driven by injected PRNGs (`mulberry32` from
 * `src/lib/race/text-generator.ts`): the type draw uses the race seed salted
 * with {@link BONUS_SEED_SALT}, each addWords word draw uses the race seed
 * salted with {@link BONUS_WORDS_SEED_SALT} plus the event ordinal. The salts
 * are large constants that can never collide with the bot seeds
 * (`raceSeed + botNumber`, bounded by 30 racers — SALLE-05). The type draw
 * always happens for every crossed checkpoint — even when the effect is then
 * skipped (no target, cap, bot leader + fog) — so the RNG stream stays
 * reproducible for the same race seed.
 */

/** The three bonus types (BONUS-02). */
export const BONUS_TYPES = ['addWords', 'removeWords', 'fog'] as const;

export type BonusType = (typeof BONUS_TYPES)[number];

/** Checkpoint thresholds fired when the leader's progression crosses them. */
export const BONUS_CHECKPOINTS = [0.25, 0.5, 0.75] as const;

/** Help eligibility: at least 25 percentage points behind the leader (BONUS-01). */
export const BONUS_HELP_GAP = 0.25;

/** Per-participant cap: at most 3 bonuses received per race (BONUS-01). */
export const BONUS_MAX_PER_PARTICIPANT = 3;

/** Words added or removed by one `addWords`/`removeWords` event. */
export const BONUS_WORDS_PER_EVENT = 3;

/** The remaining suffix of a text can never be shortened below this. */
export const BONUS_MIN_REMAINING_CHARS = 1;

/** Blur duration carried by a `fog` event payload (rendered by SP-4C). */
export const BONUS_FOG_DURATION_MS = 2_000;

/**
 * Salt added to the race seed for the bonus type RNG stream. Far above any
 * possible bot number (≤ 30, SALLE-05), so it can never collide with the bot
 * seeds `raceSeed + botNumber`.
 */
export const BONUS_SEED_SALT = 0x10_000;

/**
 * Salt added to the race seed for the `addWords` word-synthesis draw; the
 * event ordinal (0, 1, 2) is added on top so each checkpoint event draws
 * fresh words deterministically.
 */
export const BONUS_WORDS_SEED_SALT = 0x20_000;

/**
 * One participant as the bonus rules see it: identity, the current effective
 * text (already bonus-adjusted), the validated prefix and the per-race bonus
 * counter. Built by the engine for humans and bots alike from the same
 * runtime fields (ADR-011).
 */
export type BonusParticipantState = {
  memberId: string;
  kind: ParticipantKind;
  /** Validated characters so far (spaces included, Annexe A). */
  validatedChars: number;
  /** The participant's current full text (bonus-adjusted; `text.length` is
   * the effective total length, BONUS-04). */
  text: string;
  /** Bonuses received so far this race (BONUS-01 cap). */
  bonusesReceived: number;
  /** Finished, quit or timed out — excluded from leader/help selection. */
  finished: boolean;
};

/** The wire-shaped payload of one applied event (protocol `bonusApplied`). */
export type BonusEventPayload = {
  type: BonusType;
  /** `addWords`: the words appended after the target's current text. */
  words?: string[];
  /** `removeWords`: how many words were actually removed (clamped). */
  wordCount?: number;
  /** `fog`: the blur duration SP-4C renders. */
  durationMs?: number;
  /** The target's effective total length after the event (BONUS-04). */
  totalLength: number;
  /** Server timestamp of the event. */
  at: Date;
};

/** Why an event produced no effect (the draw still happened — determinism). */
export type BonusSkipReason =
  | 'at_cap'
  | 'fog_on_bot'
  | 'no_extra_words'
  | 'nothing_to_remove';

export type BonusEvaluation =
  | { applied: false; reason: BonusSkipReason }
  | {
      applied: true;
      /** Signed character delta of the target's text (0 for `fog`). */
      textLengthDelta: number;
      /** The target's new effective text. */
      newText: string;
      payload: BonusEventPayload;
    };

function progressionOf(participant: BonusParticipantState): number {
  return progression({
    validatedChars: participant.validatedChars,
    totalTextLength: participant.text.length,
  });
}

/**
 * Uniform seeded draw among the three bonus types (BONUS-02, deterministic
 * from the race seed — the RNG is built as
 * `createSeededRandom(raceSeed + BONUS_SEED_SALT)`).
 */
export function pickBonusType(rng: () => number): BonusType {
  const index = Math.min(BONUS_TYPES.length - 1, Math.floor(rng() * BONUS_TYPES.length));
  return BONUS_TYPES[index];
}

/**
 * Deterministically synthesizes `count` plain bonus words from a dictionary
 * pool (the same language × complexity pool the random-mode generator uses).
 * Plain words only: no capitals, numbers or punctuation are applied
 * (documented trade-off — see the module note); for French with the
 * `accents` option off, accents are stripped with the generator's
 * `stripAccents` so the appended words stay typeable under the config.
 * Draws are uniform with replacement (duplicates possible).
 */
export function generateBonusWords(params: {
  wordPool: readonly string[];
  count: number;
  language: 'fr' | 'en';
  accents: boolean;
  rng: () => number;
}): string[] {
  if (!Number.isSafeInteger(params.count) || params.count < 1) {
    throw new RangeError('count must be a positive integer');
  }
  if (params.wordPool.length === 0) {
    throw new RangeError('wordPool must contain at least one word');
  }

  const words: string[] = [];
  for (let index = 0; index < params.count; index += 1) {
    const word = params.wordPool[Math.floor(params.rng() * params.wordPool.length)];
    words.push(
      params.language === 'fr' && !params.accents ? stripAccents(word) : word,
    );
  }
  return words;
}

/**
 * The checkpoints crossed by a progression move, in ascending order: every
 * threshold in {@link BONUS_CHECKPOINTS} that has not fired yet and satisfies
 * `previousProgress < threshold <= currentProgress`. A drop in progression
 * (e.g. the leader's text grew) crosses nothing, and an already fired
 * threshold never fires again.
 */
export function newlyCrossedCheckpoints(params: {
  /** The leader's progression at the previous evaluation. */
  previousProgress: number;
  /** The leader's progression now. */
  currentProgress: number;
  /** Thresholds already fired (fractions of {@link BONUS_CHECKPOINTS}). */
  fired: readonly number[];
}): number[] {
  const firedSet = new Set(params.fired);
  const crossed: number[] = [];
  for (const checkpoint of BONUS_CHECKPOINTS) {
    if (
      !firedSet.has(checkpoint) &&
      params.previousProgress < checkpoint &&
      checkpoint <= params.currentProgress
    ) {
      crossed.push(checkpoint);
    }
  }
  return crossed;
}

/**
 * The leader: the non-finished participant with the highest progression.
 * Ties break by most validated characters, then by `memberId` ascending —
 * fully deterministic. `null` when nobody is still racing.
 */
export function findBonusLeader(
  participants: readonly BonusParticipantState[],
): BonusParticipantState | null {
  let best: BonusParticipantState | null = null;
  for (const participant of participants) {
    if (participant.finished) {
      continue;
    }
    if (best === null || compareProgressionDesc(participant, best) < 0) {
      best = participant;
    }
  }
  return best;
}

/**
 * The help target: the most-behind eligible participant (BONUS-01) —
 * eligible = non-finished, not the leader, and either ≥
 * {@link BONUS_HELP_GAP} behind the leader or holding the last position
 * (minimum progression among the other racers, strictly behind the leader).
 * Ties among the most-behind break by fewest validated characters, then
 * `memberId` ascending. `null` when nobody is eligible.
 */
export function pickBonusHelpTarget(params: {
  participants: readonly BonusParticipantState[];
  leader: BonusParticipantState;
}): BonusParticipantState | null {
  const candidates = params.participants.filter(
    (participant) => !participant.finished && participant.memberId !== params.leader.memberId,
  );
  if (candidates.length === 0) {
    return null;
  }

  const leaderProgress = progressionOf(params.leader);
  let minProgress = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    minProgress = Math.min(minProgress, progressionOf(candidate));
  }

  let best: BonusParticipantState | null = null;
  for (const candidate of candidates) {
    const candidateProgress = progressionOf(candidate);
    const eligible =
      candidateProgress <= leaderProgress - BONUS_HELP_GAP ||
      (candidateProgress === minProgress && candidateProgress < leaderProgress);
    if (!eligible) {
      continue;
    }
    if (best === null || compareProgressionAsc(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best;
}

/** Higher progression first; ties: more validated chars, then memberId. */
function compareProgressionDesc(
  a: BonusParticipantState,
  b: BonusParticipantState,
): number {
  const delta = progressionOf(b) - progressionOf(a);
  if (delta !== 0) {
    return delta;
  }
  const chars = b.validatedChars - a.validatedChars;
  if (chars !== 0) {
    return chars;
  }
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

/** Lower progression first; ties: fewer validated chars, then memberId. */
function compareProgressionAsc(a: BonusParticipantState, b: BonusParticipantState): number {
  const delta = progressionOf(a) - progressionOf(b);
  if (delta !== 0) {
    return delta;
  }
  const chars = a.validatedChars - b.validatedChars;
  if (chars !== 0) {
    return chars;
  }
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

/**
 * Appends plain words after a text: single-space separated, with a leading
 * separator space when the text does not already end in whitespace (typing
 * flows naturally from the last typed character into the appended words).
 */
export function appendWordsToText(text: string, words: readonly string[]): string {
  if (words.length === 0) {
    return text;
  }
  const suffix = words.join(' ');
  if (text.length === 0 || /\s$/.test(text)) {
    return `${text}${suffix}`;
  }
  return `${text} ${suffix}`;
}

/**
 * Removes up to `wordCount` whitespace-separated words from the END of a
 * participant's remaining text (BONUS-02: the removal never touches anything
 * before the caret because it operates on the suffix only). The remaining
 * text is clamped to ≥ {@link BONUS_MIN_REMAINING_CHARS} characters — fewer
 * removable words mean fewer removed; when nothing can be removed without
 * violating the clamp, `removedWords` is `0` and the text is unchanged.
 */
export function removeWordsFromRemaining(params: {
  /** The text after the participant's caret (never the full text). */
  remainingText: string;
  wordCount: number;
}): { removedWords: number; newRemainingText: string } {
  const words = params.remainingText.split(' ');
  let removed = Math.min(Math.max(0, params.wordCount), words.length - 1);
  let candidate = words.slice(0, words.length - removed).join(' ');
  while (removed > 0 && candidate.length < BONUS_MIN_REMAINING_CHARS) {
    removed -= 1;
    candidate = words.slice(0, words.length - removed).join(' ');
  }
  if (removed === 0) {
    return { removedWords: 0, newRemainingText: params.remainingText };
  }
  return { removedWords: removed, newRemainingText: candidate };
}

/**
 * Applies a signed character delta to a participant's text (BONUS-04 — the
 * shared primitive behind every length change, humans and bots alike):
 *
 * - `delta > 0`: `appendedText` (whose length must equal `delta`) is
 *   concatenated after the current text.
 * - `delta < 0`: `-delta` characters are removed from the END of the text,
 *   never touching the validated prefix and never leaving fewer than
 *   {@link BONUS_MIN_REMAINING_CHARS} characters after the caret.
 * - `delta === 0`: the text is returned unchanged.
 *
 * Callers that need word-boundary removal compose
 * {@link removeWordsFromRemaining} first and pass the resulting delta here.
 */
export function applyTextLengthDelta(params: {
  text: string;
  validatedChars: number;
  delta: number;
  appendedText?: string;
}): string {
  if (params.delta === 0) {
    return params.text;
  }

  const caret = Math.min(Math.max(0, params.validatedChars), params.text.length);

  if (params.delta > 0) {
    if (params.appendedText === undefined) {
      throw new RangeError('appendedText is required for a positive delta');
    }
    if (params.appendedText.length !== params.delta) {
      throw new RangeError('appendedText length must equal the delta');
    }
    return `${params.text}${params.appendedText}`;
  }

  const minLength = caret + BONUS_MIN_REMAINING_CHARS;
  const targetLength = Math.max(minLength, params.text.length + params.delta);
  if (targetLength >= params.text.length) {
    return params.text;
  }
  return params.text.slice(0, targetLength);
}

/**
 * Evaluates one bonus event on one target as pure data (BONUS-01/02/04):
 * the text change (`newText`, `textLengthDelta`) and the wire payload
 * (`payload`), or an explicit skip reason. The engine applies `newText` to
 * the participant's runtime state, the bot adapter applies the same length
 * change to its schedule, and the payload becomes the `bonusApplied`
 * protocol message.
 *
 * Rules enforced here (all documented in the module note):
 *
 * - the per-participant cap ({@link BONUS_MAX_PER_PARTICIPANT}) skips the
 *   event (`at_cap`);
 * - `fog` never targets a bot (`fog_on_bot` — visual-only, no text change);
 * - `addWords` without extra words skips (`no_extra_words`);
 * - `removeWords` that cannot remove anything (clamp) skips
 *   (`nothing_to_remove`).
 */
export function evaluateBonusEvent(params: {
  type: BonusType;
  target: BonusParticipantState;
  /** For `addWords`: the words to append (synthesized by the caller). */
  extraWords: readonly string[];
  now: Date;
}): BonusEvaluation {
  const { type, target, extraWords, now } = params;

  if (target.bonusesReceived >= BONUS_MAX_PER_PARTICIPANT) {
    return { applied: false, reason: 'at_cap' };
  }

  switch (type) {
    case 'fog': {
      if (target.kind === 'bot') {
        return { applied: false, reason: 'fog_on_bot' };
      }
      return {
        applied: true,
        textLengthDelta: 0,
        newText: target.text,
        payload: {
          type,
          durationMs: BONUS_FOG_DURATION_MS,
          totalLength: target.text.length,
          at: now,
        },
      };
    }

    case 'addWords': {
      if (extraWords.length === 0) {
        return { applied: false, reason: 'no_extra_words' };
      }
      const appended = appendWordsToText(target.text, extraWords);
      const delta = appended.length - target.text.length;
      return {
        applied: true,
        textLengthDelta: delta,
        newText: appended,
        payload: {
          type,
          words: [...extraWords],
          totalLength: appended.length,
          at: now,
        },
      };
    }

    case 'removeWords': {
      const remaining = target.text.slice(target.validatedChars);
      const { removedWords, newRemainingText } = removeWordsFromRemaining({
        remainingText: remaining,
        wordCount: BONUS_WORDS_PER_EVENT,
      });
      if (removedWords === 0) {
        return { applied: false, reason: 'nothing_to_remove' };
      }
      const delta = newRemainingText.length - remaining.length;
      const newText = applyTextLengthDelta({
        text: target.text,
        validatedChars: target.validatedChars,
        delta,
      });
      return {
        applied: true,
        textLengthDelta: delta,
        newText,
        payload: {
          type,
          wordCount: removedWords,
          totalLength: newText.length,
          at: now,
        },
      };
    }
  }
}
