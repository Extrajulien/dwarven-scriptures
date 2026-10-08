import { ART_SHOWCASE } from '../../data/registerData';

export default function RegisterArtShowcase() {
  return (
    <section
      aria-label={ART_SHOWCASE.ariaLabel}
      className="hidden flex-col justify-center md:col-span-6 md:flex lg:col-span-7"
    >
      <div className="stone-panel relative flex h-full flex-col justify-between rounded-md bg-dwarf-bg p-3 shadow-2xl sm:p-4">
        {/* Carved runic top arch border */}
        <div className="mb-2.5 flex items-center justify-between border-b border-[#302a20] px-2 py-1 font-mono text-label-sm text-dwarf-gold/80">
          <div className="flex items-center space-x-1">
            <span className="text-dwarf-gold">╔════</span>
            <span className="text-[10px] uppercase tracking-wider text-dwarf-parchmentMuted">
              {ART_SHOWCASE.topLeft}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="animate-pulse text-[10px] text-dwarf-runeBright">
              {ART_SHOWCASE.feedStatus}
            </span>
            <span className="text-dwarf-gold">════╗</span>
          </div>
        </div>

        {/* Main pixel art stage */}
        <div className="group relative flex min-h-[460px] max-h-[90] w-full flex-grow items-center justify-center overflow-hidden rounded border border-[#3b3327] bg-black shadow-inner lg:min-h-[580px]">
          <img
            alt={ART_SHOWCASE.image.alt}
            className="h-full w-full object-cover object-center contrast-[1.05] saturate-[1.08] transition-transform duration-700 group-hover:scale-105"
            height="896"
            width="1200"
            loading="eager"
            src={ART_SHOWCASE.image.src}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#100e0c] via-transparent to-black/30" />

          {/* Floating HUD overlay */}
          <div className="absolute bottom-3 left-3 right-3 rounded border border-[#4d4233] bg-[#161412]/90 p-3.5 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#332b21] pb-2">
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 animate-ping rounded-full bg-dwarf-gold" />
                  <span className="font-spacemono text-xs font-bold uppercase tracking-widest text-dwarf-gold">
                    {ART_SHOWCASE.hud.title}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-label-sm">
                  <span className="text-dwarf-parchmentMuted">
                    {ART_SHOWCASE.hud.activeScribesLabel}{' '}
                    <strong className="text-white">
                      {ART_SHOWCASE.hud.activeScribesValue}
                    </strong>
                  </span>
                  <span className="text-dwarf-borderLight">|</span>
                  <span className="text-dwarf-runeBright">
                    {ART_SHOWCASE.hud.veinLabel}{' '}
                    <strong className="text-dwarf-runeBright">
                      {ART_SHOWCASE.hud.veinValue}
                    </strong>
                  </span>
                </div>
              </div>
              <p className="flex items-start space-x-1.5 pt-0.5 text-label-sm italic leading-relaxed text-dwarf-parchment">
                <span className="font-serif text-sm text-dwarf-gold">“</span>
                <span>{ART_SHOWCASE.hud.quote}</span>
                <span className="font-serif text-sm text-dwarf-gold">”</span>
              </p>
            </div>
          </div>

          {/* Corner stone carvings */}
          <div className="absolute left-2 top-2 select-none font-mono text-[10px] text-dwarf-gold/60">
            ᚦ
          </div>
          <div className="absolute right-2 top-2 select-none font-mono text-[10px] text-dwarf-gold/60">
            ᚱ
          </div>
        </div>

        {/* Bottom bracket frame marker */}
        <div className="mt-2.5 flex items-center justify-between border-t border-[#302a20] px-2 py-1 font-mono text-[10px] text-dwarf-parchmentMuted">
          <span><span className="text-dwarf-gold">╚════</span> {ART_SHOWCASE.bottomLeft}</span>
          <span>{ART_SHOWCASE.bottomRight} <span className="text-dwarf-gold">════╝</span></span>
        </div>
      </div>
    </section>
  );
}
