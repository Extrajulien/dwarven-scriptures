import { AUTH_ALTERNATIVES, LOGIN_CARD } from '../../data/loginData';
import LoginForm from './LoginForm';
import OAuthButtons from './OAuthButtons';

export default function LoginCard() {
  return (
    <section className="col-span-1 flex flex-col justify-center md:col-span-6 lg:col-span-5">
      <div
        className="stone-panel relative flex flex-col justify-between rounded-md bg-[#171513] p-5 sm:p-7"
        data-purpose="login-card-terminal"
      >
        {/* Terminal header */}
        <div className="mb-5 flex items-center justify-between border-b border-dwarf-border pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-dwarf-borderLight/60 bg-[#1c1916] p-0.5 shadow-stone-inner">
              <img
                alt={LOGIN_CARD.logoAlt}
                className="h-10 w-10 rounded object-contain"
                height="40"
                width="40"
                src={LOGIN_CARD.logoUrl}
              />
              <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-black bg-dwarf-gold shadow-gold-glow" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-spacemono text-xs font-extrabold uppercase tracking-widest text-dwarf-gold">
                  {LOGIN_CARD.title}
                </span>
              </div>
              <h1 className="font-spacemono text-base font-bold leading-tight tracking-wide text-dwarf-parchment sm:text-lg">
                {LOGIN_CARD.heading}
              </h1>
              <p className="mt-0.5 text-[11px] tracking-tight text-dwarf-parchmentMuted">
                {LOGIN_CARD.subtitle}
              </p>
            </div>
          </div>
          <div className="hidden flex-col items-end sm:flex">
            <span className="border border-dwarf-runeGreen/40 bg-[#1a2818] px-2 py-0.5 text-[9px] tracking-wider text-dwarf-runeBright">
              {LOGIN_CARD.status}
            </span>
            <span className="mt-1 font-mono text-[10px] text-[#71644f]">
              {LOGIN_CARD.terminalId}
            </span>
          </div>
        </div>

        {/* Stone inscription guidance bar */}
        <div className="mb-5 flex items-center justify-between border-l-2 border-dwarf-gold bg-[#1f1c18] px-3 py-2 text-[11px] text-[#aa9d85]">
          <span className="flex items-center space-x-1.5">
            <span className="text-dwarf-gold">{LOGIN_CARD.guidance.rune}</span>
            <span>{LOGIN_CARD.guidance.text}</span>
          </span>
          <span className="text-[10px] font-bold text-dwarf-gold">
            {LOGIN_CARD.guidance.version}
          </span>
        </div>

        <LoginForm />

        {/* ASCII divider */}
        <div className="relative my-5 flex items-center justify-center">
          <div className="absolute w-full border-t border-[#362f25]" />
          <span className="relative select-none bg-[#171513] px-3 font-mono text-[10px] uppercase tracking-widest text-[#786a55]">
            {AUTH_ALTERNATIVES.divider}
          </span>
        </div>

        <OAuthButtons />

        {/* Registration callout */}
        <div
          className="mt-6 border-t border-[#342e24] pt-4 text-center"
          data-purpose="registration-callout"
        >
          <p className="text-[11px] text-[#8e806b]">
            {AUTH_ALTERNATIVES.register.prompt}
          </p>
          <a
            href={AUTH_ALTERNATIVES.register.href}
            className="mt-1 inline-block font-spacemono text-xs font-bold tracking-wider text-dwarf-gold transition hover:text-dwarf-goldLight hover:underline"
          >
            {AUTH_ALTERNATIVES.register.label}
          </a>
        </div>

        {/* Security footer note */}
        <div className="mt-4 border-t border-[#23201a] pt-3 text-center">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#5c5344]">
            {AUTH_ALTERNATIVES.security}
          </p>
        </div>
      </div>
    </section>
  );
}
