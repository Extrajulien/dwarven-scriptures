import Link from 'next/link';
import { AUTH_ALTERNATIVES, REGISTER_CARD } from '../../data/registerData';
import RegisterForm from './RegisterForm';
import RegisterOAuthButtons from './RegisterOAuthButtons';

export default function RegisterCard() {
  return (
    <section className="col-span-1 flex flex-col justify-center md:col-span-6 lg:col-span-5">
      <div
        className="stone-panel relative flex flex-col justify-between rounded-md bg-[#171513] p-5 sm:p-7"
        data-purpose="register-card-terminal"
      >
        {/* Terminal header */}
        <div className="mb-5 flex items-center justify-between border-b border-dwarf-border pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-dwarf-borderLight/60 bg-[#1c1916] p-0.5 shadow-stone-inner">
              <img
                alt={REGISTER_CARD.logoAlt}
                className="h-10 w-10 rounded object-contain"
                height="40"
                width="40"
                src={REGISTER_CARD.logoUrl}
              />
              <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-black bg-dwarf-gold shadow-gold-glow" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-spacemono text-xs font-extrabold uppercase tracking-widest text-dwarf-gold">
                  {REGISTER_CARD.title}
                </span>
              </div>
              <h1 className="font-spacemono text-base font-bold leading-tight tracking-wide text-dwarf-parchment sm:text-lg">
                {REGISTER_CARD.heading}
              </h1>
              <p className="mt-0.5 text-label-sm tracking-tight text-dwarf-parchmentMuted">
                {REGISTER_CARD.subtitle}
              </p>
            </div>
          </div>
          <div className="hidden flex-col items-end sm:flex">
            <span className="border border-dwarf-runeGreen/40 bg-[#1a2818] px-2 py-0.5 text-[9px] tracking-wider text-dwarf-runeBright">
              {REGISTER_CARD.status}
            </span>
            <span className="mt-1 font-mono text-[10px] text-dwarf-parchmentMuted">
              {REGISTER_CARD.terminalId}
            </span>
          </div>
        </div>

        {/* Stone inscription guidance bar */}
        <div className="mb-5 flex items-center justify-between border-l-2 border-dwarf-gold bg-[#1f1c18] px-3 py-2 text-label-sm text-dwarf-parchment">
          <span className="flex items-center space-x-1.5">
            <span className="text-dwarf-gold">{REGISTER_CARD.guidance.rune}</span>
            <span>{REGISTER_CARD.guidance.text}</span>
          </span>
          <span className="text-[10px] font-bold text-dwarf-gold">
            {REGISTER_CARD.guidance.version}
          </span>
        </div>

        <RegisterForm />

        {/* ASCII divider */}
        <div className="relative my-5 flex items-center justify-center">
          <div className="absolute w-full border-t border-[#362f25]" />
          <span className="relative select-none bg-[#171513] px-3 font-mono text-[10px] uppercase tracking-widest text-dwarf-parchmentMuted">
            {AUTH_ALTERNATIVES.divider}
          </span>
        </div>

        <RegisterOAuthButtons />

        {/* Login callout */}
        <div
          className="mt-6 border-t border-[#342e24] pt-4 text-center"
          data-purpose="login-callout"
        >
          <p className="text-label-sm text-dwarf-parchmentMuted">
            {AUTH_ALTERNATIVES.login.prompt}
          </p>
          <Link
            href={AUTH_ALTERNATIVES.login.href}
            className="mt-1 inline-block font-spacemono text-xs font-bold tracking-wider text-dwarf-gold transition hover:text-dwarf-goldLight hover:underline"
          >
            {AUTH_ALTERNATIVES.login.label}
          </Link>
        </div>

        {/* Security footer note */}
        <div className="mt-4 border-t border-[#23201a] pt-3 text-center">
          <p className="font-mono text-[9px] uppercase tracking-wider text-dwarf-slate">
            {AUTH_ALTERNATIVES.security}
          </p>
        </div>
      </div>
    </section>
  );
}
