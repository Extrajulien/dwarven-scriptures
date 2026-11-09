'use client';

import Icon from '../Icon';
import type { Messages } from '../../i18n/messages';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemePreference } from '../../theme/theme';

/**
 * DES-05: dwarf-styled three-state theme selector (Light / Dark / System),
 * mirroring the LocaleSelector look (I18N-02): a segmented stone control, the
 * active state pressed in gold, icons from the already-loaded Material
 * Symbols Outlined font — no emojis. Labels and aria-labels come from the
 * i18n dictionary (`theme.*` keys in both bags).
 */
const OPTIONS = [
  {
    value: 'light',
    icon: 'light_mode',
    labelKey: 'theme.light',
    ariaKey: 'theme.switchToLight',
  },
  {
    value: 'dark',
    icon: 'dark_mode',
    labelKey: 'theme.dark',
    ariaKey: 'theme.switchToDark',
  },
  {
    value: 'system',
    icon: 'desktop_windows',
    labelKey: 'theme.system',
    ariaKey: 'theme.switchToSystem',
  },
] as const satisfies readonly {
  value: ThemePreference;
  icon: string;
  labelKey: keyof Messages;
  ariaKey: keyof Messages;
}[];

export default function ThemeSelector({ messages }: { messages: Messages }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="inline-flex items-center rounded border border-outline-variant bg-surface-container-high p-0.5"
      role="group"
      aria-label={messages['theme.group']}
    >
      {OPTIONS.map((option) => {
        const active = option.value === preference;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={messages[option.ariaKey]}
            title={messages[option.labelKey]}
            onClick={() => setPreference(option.value)}
            className={
              active
                ? 'flex h-7 w-8 items-center justify-center rounded-[3px] bg-primary text-on-primary shadow-[0_0_6px_rgba(217,119,6,0.4)]'
                : 'flex h-7 w-8 items-center justify-center rounded-[3px] text-on-surface-variant transition-colors hover:text-primary'
            }
          >
            <Icon name={option.icon} className="text-[18px] leading-none" />
          </button>
        );
      })}
    </div>
  );
}
