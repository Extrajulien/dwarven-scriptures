import { TERMINAL_HEADER } from '../../data/loginData';

export default function LoginHeader() {
  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-dwarf-border bg-[#141210]/90 px-4 py-2.5 text-xs text-dwarf-parchmentMuted backdrop-blur-sm">
      <div className="flex items-center space-x-3">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-none bg-dwarf-runeGreen shadow-rune-glow" />
        <span className="text-[13px] font-bold tracking-wider text-dwarf-gold">
          {TERMINAL_HEADER.node}
        </span>
        <span className="hidden text-[#52493d] sm:inline-block">|</span>
        <span className="hidden tracking-widest text-[#887b64] sm:inline-block">
          {TERMINAL_HEADER.protocol}
        </span>
      </div>
      <div className="flex items-center space-x-4">
        <div className="rounded border border-[#3b3429] bg-[#1a1714] px-2 py-1 text-[11px] text-dwarf-gold">
          {TERMINAL_HEADER.depth}
        </div>
        <div className="hidden items-center space-x-1.5 text-dwarf-runeBright md:flex">
          <span>{TERMINAL_HEADER.carrierLabel}</span>
          <span className="border border-dwarf-runeGreen/50 bg-[#182315] px-1.5 py-0.5 text-[10px]">
            {TERMINAL_HEADER.carrierStatus}
          </span>
        </div>
      </div>
    </header>
  );
}
