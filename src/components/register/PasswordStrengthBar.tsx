import {
  passwordStrength,
  passwordStrengthScore,
  type PasswordStrength,
} from '../../lib/password';
import { REGISTER_FORM } from '../../data/registerData';
import type { Messages } from '../../i18n/messages';

/**
 * Live "entropy bar" for the registration password field.
 *
 * It fills left-to-right as the password strengthens, and its colour encodes
 * the tier (see `passwordStrength` / `passwordStrengthScore`):
 * - `empty`      → dark, 0%
 * - `weak`       → red, 1–49%
 * - `acceptable` → yellow, 50–79%
 * - `strong`     → green, 80–100%
 */

const FILL_CLASSES: Record<PasswordStrength, string> = {
  empty: 'bg-transparent',
  weak: 'bg-dwarf-danger',
  acceptable: 'bg-dwarf-goldLight',
  strong: 'bg-dwarf-runeBright',
};

const STRENGTH_LABEL_KEYS: Record<PasswordStrength, keyof Messages> = {
  empty: REGISTER_FORM.strength.emptyKey,
  weak: REGISTER_FORM.strength.weakKey,
  acceptable: REGISTER_FORM.strength.acceptableKey,
  strong: REGISTER_FORM.strength.strongKey,
};

export default function PasswordStrengthBar({
  password,
  messages,
}: {
  password: string;
  messages: Messages;
}) {
  const tier = passwordStrength(password);
  const score = passwordStrengthScore(password);

  return (
    <div
      data-purpose="password-strength-bar"
      data-strength={tier}
      role="progressbar"
      aria-label={messages[REGISTER_FORM.strength.labelKey]}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={messages[STRENGTH_LABEL_KEYS[tier]]}
      className="h-1.5 w-full overflow-hidden rounded border border-dwarf-inputBorder bg-dwarf-track shadow-stone-inner"
    >
      <div
        aria-hidden="true"
        className={`h-full transition-all duration-300 ${FILL_CLASSES[tier]}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}
