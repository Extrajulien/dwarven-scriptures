import { passwordStrength, passwordStrengthScore } from '../../lib/password';
import { REGISTER_FORM } from '../../data/registerData';

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

const FILL_CLASSES = {
  empty: 'bg-transparent',
  weak: 'bg-[#dc2626]',
  acceptable: 'bg-dwarf-goldLight',
  strong: 'bg-dwarf-runeBright',
};

export default function PasswordStrengthBar({ password }) {
  const tier = passwordStrength(password);
  const score = passwordStrengthScore(password);

  return (
    <div
      data-purpose="password-strength-bar"
      data-strength={tier}
      role="progressbar"
      aria-label={REGISTER_FORM.strength.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={REGISTER_FORM.strength[tier]}
      className="h-1.5 w-full overflow-hidden rounded border border-[#3f382d] bg-[#0e0d0c] shadow-stone-inner"
    >
      <div
        aria-hidden="true"
        className={`h-full transition-all duration-300 ${FILL_CLASSES[tier]}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}
