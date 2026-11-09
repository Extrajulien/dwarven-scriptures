'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { updateRoomConfig } from '../../app/rooms/actions';
import type { BotLevel, RoomConfig } from '../../db/schema';
import type { Messages } from '../../i18n/messages';
import {
  BOT_LEVELS,
  ROOM_MAX_BOTS,
  ROOM_TIME_LIMIT_MAX_SECONDS,
  ROOM_TIME_LIMIT_MIN_SECONDS,
  ROOM_WORD_COUNT_MAX,
  ROOM_WORD_COUNT_MIN,
  roomConfigSchema,
} from '../../lib/room-config';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';

/**
 * Host-only race configuration editor (CONF-01..10, CONF-12).
 *
 * Every field of the `rooms.config` shape is editable here; the same Zod
 * schema that guards the stored JSON (`src/lib/room-config.ts`) validates the
 * payload client-side before the existing `updateRoomConfig` server action —
 * which re-validates authoritatively and broadcasts `configUpdated` — is
 * called. The editor never invents bounds: min/max values come from the
 * exported room-config constants.
 *
 * Editing discipline:
 *
 * - `canEdit` is false for a non-host viewer and while the room is not in
 *   `en_attente` (the config is snapshotted at race start, CONF-12); the
 *   whole form is disabled and `lockedReason` explains why.
 * - Accents only apply to French texts (CONF-06): switching the language to
 *   English turns the option off, the toggle is disabled and the payload
 *   never stores `accents: true` for an English config.
 * - Bots (CONF-10) are `{ level, count }` rows; a count of 0 removes the
 *   entry from the saved payload. The bot ENGINE arrives in Phase 4 (BOT-*).
 */

/** Localized label keys for the five bot levels (BOT-01), shared with the lobby summary. */
export const BOT_LEVEL_LABEL_KEYS: Record<BotLevel, keyof Messages> = {
  noob: 'lobby.bot.noob',
  debutant: 'lobby.bot.debutant',
  intermediaire: 'lobby.bot.intermediaire',
  expert: 'lobby.bot.expert',
  impossible: 'lobby.bot.impossible',
};

/**
 * The editor's working copy: numeric fields stay strings while they are being
 * typed, so an empty time limit ("no limit", CONF-01) and partial input are
 * representable without silent `0` coercions.
 */
export type RaceConfigDraft = {
  textLanguage: 'fr' | 'en';
  textComplexity: 'facile' | 'moyen' | 'difficile';
  textType: 'coherent' | 'random';
  wordCount: string;
  /** '' means "no time limit" (CONF-01). */
  timeLimitSeconds: string;
  errorMode: 'accumulate' | 'stop';
  options: {
    punctuation: boolean;
    numbers: boolean;
    capitals: boolean;
    accents: boolean;
  };
  bonusesEnabled: boolean;
  bots: Array<{ level: BotLevel; count: string }>;
};

/** Copies the current configuration into an editable draft. */
export function draftFromConfig(config: RoomConfig): RaceConfigDraft {
  return {
    textLanguage: config.textLanguage,
    textComplexity: config.textComplexity,
    textType: config.textType,
    wordCount: String(config.wordCount),
    timeLimitSeconds: config.timeLimitSeconds === null ? '' : String(config.timeLimitSeconds),
    errorMode: config.errorMode,
    options: { ...config.options },
    bonusesEnabled: config.bonusesEnabled,
    bots: config.bots.map((entry) => ({ level: entry.level, count: String(entry.count) })),
  };
}

/** Fields the draft can fail on, keyed for the localized error messages. */
export type ConfigDraftErrors = Partial<
  Record<'wordCount' | 'timeLimitSeconds' | 'botCount' | 'general', boolean>
>;

export type ConfigDraftResult =
  | { ok: true; config: RoomConfig }
  | { ok: false; errors: ConfigDraftErrors };

/**
 * Validates the draft with the shared Zod schema and converts it to the
 * stored `RoomConfig`. Zero-count bot entries are dropped (they are
 * semantically absent); accents are forced off for English texts (CONF-06).
 */
export function buildConfigPayload(draft: RaceConfigDraft): ConfigDraftResult {
  const wordCount = Number(draft.wordCount);
  const timeLimitSeconds =
    draft.timeLimitSeconds.trim() === '' ? null : Number(draft.timeLimitSeconds);
  const bots = draft.bots
    .map((entry) => ({ level: entry.level, count: Number(entry.count) }))
    .filter((entry) => entry.count > 0);

  const parsed = roomConfigSchema.safeParse({
    textLanguage: draft.textLanguage,
    textComplexity: draft.textComplexity,
    textType: draft.textType,
    wordCount,
    timeLimitSeconds,
    errorMode: draft.errorMode,
    options:
      draft.textLanguage === 'en'
        ? { ...draft.options, accents: false }
        : { ...draft.options },
    bonusesEnabled: draft.bonusesEnabled,
    bots,
  });
  if (!parsed.success) {
    const errors: ConfigDraftErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      if (path === 'wordCount') {
        errors.wordCount = true;
      } else if (path === 'timeLimitSeconds') {
        errors.timeLimitSeconds = true;
      } else if (path === 'bots' || path.startsWith('bots.')) {
        errors.botCount = true;
      } else {
        errors.general = true;
      }
    }
    return { ok: false, errors };
  }
  return { ok: true, config: parsed.data };
}

/** Server-action error codes → localized messages (the server stays authoritative). */
const ACTION_ERROR_KEYS: Record<string, keyof Messages> = {
  notHost: 'lobby.config.lockedNotHost',
  configLocked: 'lobby.config.lockedRace',
  invalidInput: 'lobby.config.error.invalid',
  invalidConfig: 'lobby.config.error.invalid',
  unexpected: 'lobby.config.error.unexpected',
};

const FIELD_CLASSES =
  'w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm text-dwarf-parchment shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold';

const LABEL_CLASSES = 'font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted';

const ERROR_CLASSES = 'text-xs font-medium text-dwarf-magma';

function selectValue<T extends string>(event: ChangeEvent<HTMLSelectElement>, values: readonly T[]): T {
  const next = values.find((value) => value === event.target.value);
  return (next ?? values[0]) as T;
}

type RaceConfigEditorProps = {
  /** The current authoritative configuration (from the room snapshot, CONF-12). */
  config: RoomConfig;
  roomPublicId: string;
  /** Host AND room in `en_attente` — the config is snapshotted at race start. */
  canEdit: boolean;
  /** Localized reason shown while `canEdit` is false. */
  lockedReason: string | null;
  /** Closes the editor without saving (rendered by the lobby's edit toggle). */
  onClose?: () => void;
  messages: Messages;
};

export default function RaceConfigEditor({
  config,
  roomPublicId,
  canEdit,
  lockedReason,
  onClose,
  messages,
}: RaceConfigEditorProps) {
  const [draft, setDraft] = useState<RaceConfigDraft>(() => draftFromConfig(config));
  // The React "adjust state when props change" pattern: a `configUpdated`
  // message replaces the snapshot config, so an open editor re-syncs its
  // draft to the freshly saved values without an effect.
  const [previousConfig, setPreviousConfig] = useState(config);
  if (previousConfig !== config) {
    setPreviousConfig(config);
    setDraft(draftFromConfig(config));
  }

  const [errors, setErrors] = useState<ConfigDraftErrors>({});
  const [submitError, setSubmitError] = useState<keyof Messages | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (next: Partial<RaceConfigDraft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const patchOption = (option: keyof RaceConfigDraft['options']) =>
    setDraft((prev) => ({
      ...prev,
      options: { ...prev.options, [option]: !prev.options[option] },
    }));

  const patchBot = (index: number, next: Partial<RaceConfigDraft['bots'][number]>) =>
    setDraft((prev) => ({
      ...prev,
      bots: prev.bots.map((entry, botIndex) =>
        botIndex === index ? { ...entry, ...next } : entry,
      ),
    }));

  const addBot = () =>
    setDraft((prev) => ({ ...prev, bots: [...prev.bots, { level: 'noob', count: '1' }] }));

  const removeBot = (index: number) =>
    setDraft((prev) => ({ ...prev, bots: prev.bots.filter((_, botIndex) => botIndex !== index) }));

  const changeLanguage = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value === 'en' ? 'en' : 'fr';
    setDraft((prev) => ({
      ...prev,
      textLanguage: next,
      // CONF-06: accents apply to French only — switching to English turns
      // the option off; the payload enforces it again in buildConfigPayload.
      options: next === 'en' ? { ...prev.options, accents: false } : prev.options,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSaved(false);

    const result = buildConfigPayload(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const outcome = await updateRoomConfig({ roomPublicId, config: result.config });
      if (outcome.ok) {
        setSaved(true);
      } else {
        setSubmitError(
          outcome.error in ACTION_ERROR_KEYS
            ? ACTION_ERROR_KEYS[outcome.error as keyof typeof ACTION_ERROR_KEYS]
            : 'lobby.config.error.unexpected',
        );
      }
    } catch {
      setSubmitError('lobby.config.error.unexpected');
    } finally {
      setSaving(false);
    }
  };

  const accentsDisabled = draft.textLanguage === 'en';

  return (
    <section
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
      aria-labelledby="race-config-editor-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h3
          id="race-config-editor-title"
          className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary"
        >
          {messages['lobby.config.edit']}
        </h3>
        {onClose && (
          <ButtonSecondary type="button" onClick={onClose} className="px-space-sm py-space-xs">
            {messages['lobby.cancel']}
          </ButtonSecondary>
        )}
      </div>

      {!canEdit && lockedReason && (
        <p className="font-label-sm text-label-sm text-dwarf-parchmentMuted">{lockedReason}</p>
      )}

      <form
        data-purpose="race-config-form"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-space-md"
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-space-md">
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-text-language" className={LABEL_CLASSES}>
                {messages['lobby.config.language']}
              </label>
              <select
                id="config-text-language"
                value={draft.textLanguage}
                onChange={changeLanguage}
                className={FIELD_CLASSES}
              >
                <option value="fr">{messages['lobby.lang.fr']}</option>
                <option value="en">{messages['lobby.lang.en']}</option>
              </select>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-text-complexity" className={LABEL_CLASSES}>
                {messages['lobby.config.complexity']}
              </label>
              <select
                id="config-text-complexity"
                value={draft.textComplexity}
                onChange={(event) =>
                  patch({
                    textComplexity: selectValue(event, [
                      'facile',
                      'moyen',
                      'difficile',
                    ] as const),
                  })
                }
                className={FIELD_CLASSES}
              >
                <option value="facile">{messages['lobby.complexity.facile']}</option>
                <option value="moyen">{messages['lobby.complexity.moyen']}</option>
                <option value="difficile">{messages['lobby.complexity.difficile']}</option>
              </select>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-text-type" className={LABEL_CLASSES}>
                {messages['lobby.config.textType']}
              </label>
              <select
                id="config-text-type"
                value={draft.textType}
                onChange={(event) =>
                  patch({ textType: selectValue(event, ['coherent', 'random'] as const) })
                }
                className={FIELD_CLASSES}
              >
                <option value="coherent">{messages['lobby.textType.coherent']}</option>
                <option value="random">{messages['lobby.textType.random']}</option>
              </select>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-word-count" className={LABEL_CLASSES}>
                {messages['lobby.config.wordCount']}
              </label>
              <input
                id="config-word-count"
                type="number"
                min={ROOM_WORD_COUNT_MIN}
                max={ROOM_WORD_COUNT_MAX}
                inputMode="numeric"
                value={draft.wordCount}
                onChange={(event) => patch({ wordCount: event.target.value })}
                aria-invalid={errors.wordCount ? true : undefined}
                aria-describedby={errors.wordCount ? 'config-word-count-error' : undefined}
                className={FIELD_CLASSES}
              />
              {errors.wordCount && (
                <p id="config-word-count-error" role="alert" className={ERROR_CLASSES}>
                  {messages['lobby.config.error.wordCount']}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-time-limit" className={LABEL_CLASSES}>
                {messages['lobby.config.timeLimit']}
              </label>
              <input
                id="config-time-limit"
                type="number"
                min={ROOM_TIME_LIMIT_MIN_SECONDS}
                max={ROOM_TIME_LIMIT_MAX_SECONDS}
                inputMode="numeric"
                placeholder={messages['lobby.config.noTimeLimit']}
                value={draft.timeLimitSeconds}
                onChange={(event) => patch({ timeLimitSeconds: event.target.value })}
                aria-invalid={errors.timeLimitSeconds ? true : undefined}
                aria-describedby={errors.timeLimitSeconds ? 'config-time-limit-error' : undefined}
                className={FIELD_CLASSES}
              />
              {errors.timeLimitSeconds ? (
                <p id="config-time-limit-error" role="alert" className={ERROR_CLASSES}>
                  {messages['lobby.config.error.timeLimit']}
                </p>
              ) : (
                <p className={LABEL_CLASSES}>{messages['lobby.config.timeLimitHint']}</p>
              )}
            </div>

            <div className="flex flex-col gap-space-xs">
              <label htmlFor="config-error-mode" className={LABEL_CLASSES}>
                {messages['lobby.config.errorMode']}
              </label>
              <select
                id="config-error-mode"
                value={draft.errorMode}
                onChange={(event) =>
                  patch({ errorMode: selectValue(event, ['accumulate', 'stop'] as const) })
                }
                className={FIELD_CLASSES}
              >
                <option value="accumulate">{messages['lobby.errorMode.accumulate']}</option>
                <option value="stop">{messages['lobby.errorMode.stop']}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-space-xs rounded bg-dwarf-slate p-space-md">
            <span className={LABEL_CLASSES}>{messages['lobby.config.options']}</span>
            <div className="grid grid-cols-1 gap-space-xs sm:grid-cols-2">
              {(
                [
                  ['punctuation', 'lobby.option.punctuation'],
                  ['numbers', 'lobby.option.numbers'],
                  ['capitals', 'lobby.option.capitals'],
                  ['accents', 'lobby.option.accents'],
                ] as const
              ).map(([option, labelKey]) => (
                <label key={option} className="flex items-center gap-space-sm font-body-sm text-body-sm text-dwarf-parchment">
                  <input
                    id={`config-option-${option}`}
                    type="checkbox"
                    checked={draft.options[option]}
                    disabled={option === 'accents' && accentsDisabled}
                    onChange={() => patchOption(option)}
                    className="h-4 w-4 accent-dwarf-gold"
                  />
                  {messages[labelKey]}
                </label>
              ))}
            </div>
            {accentsDisabled && (
              <p className={LABEL_CLASSES}>{messages['lobby.config.accentsHint']}</p>
            )}
          </div>

          <div className="flex flex-col gap-space-xs">
            <label htmlFor="config-bonuses" className="flex items-center gap-space-sm font-body-sm text-body-sm text-dwarf-parchment">
              <input
                id="config-bonuses"
                type="checkbox"
                checked={draft.bonusesEnabled}
                onChange={() => patch({ bonusesEnabled: !draft.bonusesEnabled })}
                className="h-4 w-4 accent-dwarf-gold"
              />
              {messages['lobby.config.bonuses']}
            </label>
          </div>

          <div className="flex flex-col gap-space-sm rounded bg-dwarf-slate p-space-md">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <span className={LABEL_CLASSES}>{messages['lobby.config.bots']}</span>
              <ButtonSecondary type="button" onClick={addBot} className="px-space-sm py-space-xs">
                {messages['lobby.config.addBot']}
              </ButtonSecondary>
            </div>

            {draft.bots.length === 0 && (
              <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">—</p>
            )}

            {draft.bots.map((entry, index) => (
              <div
                key={index}
                className="flex flex-wrap items-end gap-space-sm rounded border border-dwarf-border bg-dwarf-basalt p-space-sm"
              >
                <div className="flex min-w-0 flex-col gap-space-xs">
                  <label htmlFor={`config-bot-${index}-level`} className={LABEL_CLASSES}>
                    {messages['lobby.config.botLevel']}
                  </label>
                  <select
                    id={`config-bot-${index}-level`}
                    value={entry.level}
                    onChange={(event) =>
                      patchBot(index, { level: selectValue(event, BOT_LEVELS) })
                    }
                    className={FIELD_CLASSES}
                  >
                    {BOT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {messages[BOT_LEVEL_LABEL_KEYS[level]]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label htmlFor={`config-bot-${index}-count`} className={LABEL_CLASSES}>
                    {messages['lobby.config.botCount']}
                  </label>
                  <input
                    id={`config-bot-${index}-count`}
                    type="number"
                    min={0}
                    max={ROOM_MAX_BOTS}
                    inputMode="numeric"
                    value={entry.count}
                    onChange={(event) => patchBot(index, { count: event.target.value })}
                    aria-invalid={errors.botCount ? true : undefined}
                    aria-describedby={errors.botCount ? 'config-bot-count-error' : undefined}
                    className={FIELD_CLASSES}
                  />
                </div>
                <ButtonSecondary
                  type="button"
                  aria-label={messages['lobby.config.removeBot']}
                  onClick={() => removeBot(index)}
                  className="px-space-sm py-space-xs"
                >
                  ✕
                </ButtonSecondary>
              </div>
            ))}

            {errors.botCount && (
              <p id="config-bot-count-error" role="alert" className={ERROR_CLASSES}>
                {messages['lobby.config.error.botCount']}
              </p>
            )}
            <p className={LABEL_CLASSES}>{messages['lobby.config.botsNote']}</p>
          </div>
        </fieldset>

        {errors.general && (
          <p role="alert" className={ERROR_CLASSES}>
            {messages['lobby.config.error.invalid']}
          </p>
        )}
        {submitError && (
          <p role="alert" className={ERROR_CLASSES}>
            {messages[submitError]}
          </p>
        )}
        {saved && !submitError && (
          <p role="status" className="font-label-sm text-label-sm text-dwarf-rune-green">
            {messages['lobby.config.saved']}
          </p>
        )}

        <ButtonPrimary type="submit" disabled={!canEdit || saving} className="w-full">
          {saving ? messages['lobby.config.saving'] : messages['lobby.config.save']}
        </ButtonPrimary>
      </form>
    </section>
  );
}
