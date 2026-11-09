'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, type LoginFormError } from '../../app/login/actions';
import { LOGIN_FORM } from '../../data/loginData';
import type { LoginFieldErrorCode, LoginFieldErrors } from '../../lib/login-validation';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';

/**
 * Stable error codes from the server action/validation, mapped to localized
 * text via the message dictionary (I18N-01): the action returns codes only —
 * never human-readable strings.
 */
const USERNAME_ERROR_KEYS: Record<LoginFieldErrorCode, keyof Messages> = {
  required: 'auth.error.requiredUsername',
};

const PASSWORD_ERROR_KEYS: Record<LoginFieldErrorCode, keyof Messages> = {
  required: 'auth.error.requiredPassword',
};

const FORM_ERROR_KEYS: Record<LoginFormError, keyof Messages> = {
  invalidCredentials: 'auth.login.error.invalidCredentials',
  unexpected: 'auth.error.unexpected',
};

function PickaxeIcon() {
  return (
    <svg
      className="h-4 w-4 text-dwarf-parchmentIcon"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-4 w-4 text-dwarf-parchmentIcon"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HammerIcon() {
  return (
    <svg
      className="h-4 w-4 text-dwarf-goldInk transition-transform duration-150 group-hover:rotate-12"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
    </svg>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="text-xs font-medium text-dwarf-magma">
      {message}
    </p>
  );
}

export default function LoginForm({ messages }: { messages: Messages }) {
  const [state, formAction, pending] = useActionState(loginUser, null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state && state.ok) {
      router.replace('/');
    }
  }, [state, router]);

  const fieldErrors: LoginFieldErrors =
    state && state.ok === false ? state.fieldErrors : {};
  const usernameError = fieldErrors.username;
  const passwordError = fieldErrors.password;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form
      className="space-y-4"
      data-purpose="scribe-login-form"
      action={formAction}
      noValidate
    >
      {/* Callsign / username field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="callsign-input"
            className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wide text-dwarf-parchment"
          >
            <span className="font-bold text-dwarf-gold">
              {LOGIN_FORM.callsign.rune}
            </span>
            <span>{messages[LOGIN_FORM.callsign.labelKey]}</span>
          </label>
          <span className="text-label-sm text-dwarf-parchmentMuted">
            {messages[LOGIN_FORM.callsign.hintKey]}
          </span>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-dwarf-gold">
            <PickaxeIcon />
          </div>
          <input
            id="callsign-input"
            name="username"
            type="text"
            autoComplete="username"
            required
            placeholder={messages[LOGIN_FORM.callsign.placeholderKey]}
            aria-invalid={usernameError ? true : undefined}
            aria-describedby={usernameError ? 'username-error' : undefined}
            className="w-full rounded border border-dwarf-inputBorder bg-dwarf-inputBg py-2.5 pl-10 pr-3 font-mono text-sm text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
        </div>
        {usernameError && (
          <FieldError
            id="username-error"
            message={messages[USERNAME_ERROR_KEYS[usernameError]]}
          />
        )}
      </div>

      {/* Password field */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="cipher-input"
            className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wide text-dwarf-parchment"
          >
            <span className="font-bold text-dwarf-gold">
              {LOGIN_FORM.password.rune}
            </span>
            <span>{messages[LOGIN_FORM.password.labelKey]}</span>
          </label>
          <span className="text-label-sm text-dwarf-parchmentMuted">
            {messages[LOGIN_FORM.password.hintKey]}
          </span>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-dwarf-gold">
            <LockIcon />
          </div>
          <input
            id="cipher-input"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder={messages[LOGIN_FORM.password.placeholderKey]}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? 'password-error' : undefined}
            className="w-full rounded border border-dwarf-inputBorder bg-dwarf-inputBg py-2.5 pl-10 pr-10 font-mono text-sm tracking-wider text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
          <button
            type="button"
            aria-label={messages['auth.login.togglePassword']}
            onClick={() => setShowPassword((visible) => !visible)}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 transition-colors focus:outline-none focus:ring-1 focus:ring-dwarf-gold ${
              showPassword ? 'text-dwarf-gold' : 'text-dwarf-parchmentMuted hover:text-dwarf-gold'
            }`}
          >
            <EyeIcon />
          </button>
        </div>
        {passwordError && (
          <FieldError
            id="password-error"
            message={messages[PASSWORD_ERROR_KEYS[passwordError]]}
          />
        )}
      </div>

      {/* Remember checkbox */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex cursor-pointer select-none items-center space-x-2">
          <input
            type="checkbox"
            name="remember_scribe"
            className="dwarf-checkbox h-4 w-4 rounded-none border-dwarf-inputBorder bg-dwarf-inputBg text-dwarf-gold transition focus:border-dwarf-gold focus:ring-0 focus:ring-offset-0"
          />
          <span className="text-xs tracking-tight text-dwarf-parchmentMuted">
            {messages[LOGIN_FORM.rememberKey]}
          </span>
        </label>
      </div>

      {/* Primary submit */}
      <div className="pt-2">
        {formError && (
          <p role="alert" className="mb-3 text-xs font-medium text-dwarf-magma">
            {messages[FORM_ERROR_KEYS[formError]]}
          </p>
        )}
        <ButtonPrimary type="submit" disabled={pending} className="w-full">
          <HammerIcon />
          <span className="font-bold">
            {pending
              ? messages[LOGIN_FORM.submitPendingKey]
              : messages[LOGIN_FORM.submitKey]}
          </span>
        </ButtonPrimary>
      </div>
    </form>
  );
}
