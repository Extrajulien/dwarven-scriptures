import type { BotLevel } from '../../db/schema';
import type { Messages } from '../../i18n/messages';
import { BOT_LEVELS } from '../room-config';

/**
 * Bot display-name handling (BOT-04, I18N-01).
 *
 * The engine wires bots with a **neutral** display name — `"<level> <n>"`,
 * e.g. `"expert 2"` — which is never rendered raw. Every component that
 * shows a bot participant localizes it through {@link localizeBotDisplayName}
 * with its own `Messages` bag, so fr and en viewers each get their own
 * language (`Expert n°2` / `Expert #2`) while the wire and the persisted
 * `race_participants.displayName` stay locale-neutral. The same neutral
 * format is what `race-engine.ts` persists, so replays localize identically.
 */

/** Localized level-label key for each bot level (flat-key convention). */
export const BOT_DISPLAY_LEVEL_KEYS: Record<BotLevel, keyof Messages> = {
  noob: 'bot.level.noob',
  debutant: 'bot.level.debutant',
  intermediaire: 'bot.level.intermediaire',
  expert: 'bot.level.expert',
  impossible: 'bot.level.impossible',
};

/** The parsed pieces of a neutral bot display name (`"expert 2"`). */
export type BotDisplayNameParts = {
  level: BotLevel;
  /** 1-based bot number (unique per race, across levels). */
  index: number;
};

/**
 * Parses a neutral bot display name into its level and number, or `null`
 * when the string is not in the documented format (then callers render it
 * verbatim — a defensive fallback, never expected from the engine).
 */
export function splitBotDisplayName(displayName: string): BotDisplayNameParts | null {
  const separator = displayName.lastIndexOf(' ');
  if (separator <= 0) {
    return null;
  }
  const level = displayName.slice(0, separator);
  const index = Number(displayName.slice(separator + 1));
  if (
    !(BOT_LEVELS as readonly string[]).includes(level) ||
    !Number.isInteger(index) ||
    index < 1
  ) {
    return null;
  }
  return { level: level as BotLevel, index };
}

/**
 * The localized, user-facing name of a bot participant: the level label from
 * the active bag plus the localized number suffix (`n°` in fr, `#` in en).
 * Non-bot participants and unparseable names are returned unchanged.
 */
export function localizeBotDisplayName(displayName: string, messages: Messages): string {
  const parts = splitBotDisplayName(displayName);
  if (parts === null) {
    return displayName;
  }
  return `${messages[BOT_DISPLAY_LEVEL_KEYS[parts.level]]} ${messages['bot.nameSuffix']}${parts.index}`;
}
