import type { Locale } from './messages';

/**
 * I18N-03: locale-aware number and date formatting for the UI. Thin wrappers
 * over `Intl.NumberFormat` / `Intl.DateTimeFormat` so every screen formats
 * with the *active* locale (the cookie-driven `fr`/`en`) instead of a fixed
 * one. `Intl` is supported by Node (full ICU) and all browsers.
 *
 * Number notes:
 * - `formatNumber` formats plain numbers (`1234.5` → fr `1 234,5`, en
 *   `1,234.5`).
 * - `formatGroupedDigits` groups a raw digit string (`bigint`-safe, e.g. from
 *   Postgres counters that may exceed `Number.MAX_SAFE_INTEGER`) using the
 *   locale's group separator.
 *
 * Date notes: `formatDate` and `formatDateTime` accept a `Date` or an ISO
 * string and format in the *viewer's* time zone (the same zone the client
 * sees), matching how the rest of the UI renders timestamps.
 */

/** The locale's group separator (`,` in en, narrow no-break space in fr). */
function groupSeparator(locale: Locale): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567);
  const group = parts.find((part) => part.type === 'group');
  return group?.value ?? ',';
}

/** Formats a plain number with the active locale. */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Groups a raw digit string with the locale's thousands separator without
 * converting through `number`, so `bigint`-derived counters keep every digit.
 * The input may carry a leading `-`; it is preserved in front of the groups.
 */
export function formatGroupedDigits(digits: string, locale: Locale): string {
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  const separator = groupSeparator(locale);
  let grouped = '';
  for (let i = body.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    const chunk = body.slice(start, i);
    grouped = grouped === '' ? chunk : `${chunk}${separator}${grouped}`;
  }
  return grouped === '' ? '' : negative ? `-${grouped}` : grouped;
}

/** Formats a date with the active locale (numeric `YYYY-MM-DD` layout). */
export function formatDate(
  value: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(
    locale,
    options ?? { year: 'numeric', month: '2-digit', day: '2-digit' },
  ).format(date);
}

/** Formats a date *and* time with the active locale. */
export function formatDateTime(
  value: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(
    locale,
    options ?? {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
}

/**
 * Formats a race duration in milliseconds as `M:SS` (e.g. `0:58`, `1:14`)
 * with locale-aware digits — the race-history duration column (HIST-01).
 * The layout itself is data (minutes:seconds), only the digits are localized.
 */
export function formatDurationMmSs(ms: number, locale: Locale): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${formatNumber(minutes, locale)}:${formatNumber(seconds, locale, {
    minimumIntegerDigits: 2,
  })}`;
}
