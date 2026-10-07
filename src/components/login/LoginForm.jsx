'use client';

import { useState } from 'react';
import { LOGIN_FORM } from '../../data/loginData';

function PickaxeIcon() {
  return (
    <svg
      className="h-4 w-4 text-[#8a7241]"
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
      className="h-4 w-4 text-[#8a7241]"
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
      className="h-4 w-4 text-[#3d2c07] transition-transform duration-150 group-hover:rotate-12"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
    </svg>
  );
}

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="space-y-4"
      data-purpose="scribe-verification-form"
      onSubmit={(event) => event.preventDefault()}
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
            <span>{LOGIN_FORM.callsign.label}</span>
          </label>
          <span className="text-[10px] text-dwarf-parchmentMuted">
            {LOGIN_FORM.callsign.hint}
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
            placeholder={LOGIN_FORM.callsign.placeholder}
            className="w-full rounded border border-[#3f382d] bg-[#121110] py-2.5 pl-10 pr-3 font-mono text-sm text-dwarf-parchment placeholder-[#615747] shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
        </div>
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
            <span>{LOGIN_FORM.password.label}</span>
          </label>
          <a
            href="#retrieve-cipher"
            className="text-[11px] tracking-tight text-dwarf-gold hover:text-dwarf-goldLight hover:underline focus:underline focus:outline-none"
          >
            {LOGIN_FORM.password.forgot}
          </a>
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
            placeholder={LOGIN_FORM.password.placeholder}
            className="w-full rounded border border-[#3f382d] bg-[#121110] py-2.5 pl-10 pr-10 font-mono text-sm tracking-wider text-dwarf-parchment placeholder-[#615747] shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
          <button
            type="button"
            aria-label="Toggle password visibility"
            onClick={() => setShowPassword((visible) => !visible)}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 transition-colors focus:outline-none ${
              showPassword ? 'text-dwarf-gold' : 'text-[#746652] hover:text-dwarf-gold'
            }`}
          >
            <EyeIcon />
          </button>
        </div>
      </div>

      {/* Remember checkbox */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex cursor-pointer select-none items-center space-x-2">
          <input
            type="checkbox"
            name="remember_scribe"
            className="dwarf-checkbox h-4 w-4 rounded-none border-[#3f382d] bg-[#121110] text-dwarf-gold transition focus:border-dwarf-gold focus:ring-0 focus:ring-offset-0"
          />
          <span className="text-xs tracking-tight text-[#a3957e]">
            {LOGIN_FORM.remember}
          </span>
        </label>
      </div>

      {/* Primary submit */}
      <div className="pt-2">
        <button
          type="submit"
          className="btn-chisel-gold group flex min-h-[48px] w-full cursor-pointer items-center justify-center space-x-2 rounded px-4 py-3 text-xs font-extrabold uppercase tracking-widest text-[#16120b] shadow-gold-glow sm:text-sm"
        >
          <HammerIcon />
          <span className="font-spacemono font-bold">{LOGIN_FORM.submit}</span>
        </button>
      </div>
    </form>
  );
}
