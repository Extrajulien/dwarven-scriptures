import { MESSAGES } from '../../i18n/messages';
import {
  BOT_DISPLAY_LEVEL_KEYS,
  localizeBotDisplayName,
  splitBotDisplayName,
} from './bot-display';

/**
 * BOT-04/I18N-01: the engine wires bots with a neutral `"<level> <n>"`
 * display name; the UI localizes it per viewer language through
 * {@link localizeBotDisplayName}. Unparseable names fall back verbatim
 * (defensive — the engine never produces them).
 */

const fr = MESSAGES.fr;
const en = MESSAGES.en;

describe('splitBotDisplayName', () => {
  test('parses every level plus the bot number', () => {
    expect(splitBotDisplayName('noob 1')).toEqual({ level: 'noob', index: 1 });
    expect(splitBotDisplayName('debutant 2')).toEqual({ level: 'debutant', index: 2 });
    expect(splitBotDisplayName('intermediaire 3')).toEqual({ level: 'intermediaire', index: 3 });
    expect(splitBotDisplayName('expert 30')).toEqual({ level: 'expert', index: 30 });
    expect(splitBotDisplayName('impossible 12')).toEqual({ level: 'impossible', index: 12 });
  });

  test('rejects strings outside the documented format', () => {
    expect(splitBotDisplayName('')).toBeNull();
    expect(splitBotDisplayName('expert')).toBeNull();
    expect(splitBotDisplayName('expert 0')).toBeNull();
    expect(splitBotDisplayName('expert -2')).toBeNull();
    expect(splitBotDisplayName('expert x')).toBeNull();
    expect(splitBotDisplayName('wizard 2')).toBeNull();
    expect(splitBotDisplayName('ada')).toBeNull();
  });
});

describe('localizeBotDisplayName', () => {
  test('composes the localized level label and number suffix (fr/en)', () => {
    expect(localizeBotDisplayName('expert 2', fr)).toBe('Expert n°2');
    expect(localizeBotDisplayName('noob 1', fr)).toBe('Noob n°1');
    expect(localizeBotDisplayName('expert 2', en)).toBe('Expert #2');
    expect(localizeBotDisplayName('debutant 3', en)).toBe('Beginner #3');
  });

  test('returns human and unparseable names unchanged', () => {
    expect(localizeBotDisplayName('ada', fr)).toBe('ada');
    expect(localizeBotDisplayName('Gimli', en)).toBe('Gimli');
    expect(localizeBotDisplayName('Noob-1', fr)).toBe('Noob-1');
  });

  test('every level key resolves in both bags', () => {
    for (const level of ['noob', 'debutant', 'intermediaire', 'expert', 'impossible'] as const) {
      expect(fr[BOT_DISPLAY_LEVEL_KEYS[level]]).not.toBe('');
      expect(en[BOT_DISPLAY_LEVEL_KEYS[level]]).not.toBe('');
    }
    expect(fr['bot.nameSuffix']).not.toBe('');
    expect(en['bot.nameSuffix']).not.toBe('');
  });
});
