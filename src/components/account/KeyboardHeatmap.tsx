import type { ReactNode } from 'react';
import { HEATMAP } from '../../data/accountData';
import Icon from '../Icon';

// Static mock keyboard layout (no heatmap statistics exist yet). The tinting is
// placeholder until per-key error data is recorded (STAT-2 keyboard heatmap).

type Tone = 'plain' | 'muted' | 'accurate' | 'medium' | 'error' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  plain: 'border border-outline-variant bg-surface-container-high text-on-surface-variant',
  muted: 'border border-outline-variant bg-surface-container-high text-outline',
  accurate: 'border border-tertiary/60 bg-tertiary/15 text-tertiary',
  medium: 'border border-primary/60 bg-primary/20 text-primary',
  error: 'border border-error bg-error/25 text-error',
  accent: 'border border-primary bg-primary font-extrabold text-on-primary',
};

function Key({
  children,
  size = 'w-8 sm:w-10',
  tone,
  className = '',
}: {
  children: ReactNode;
  size?: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <div
      className={`flex h-9 items-center justify-center rounded sm:h-10 ${size} ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

const MODIFIER = 'font-label-sm text-label-sm uppercase tracking-wider';

export default function KeyboardHeatmap() {
  const { title, caption, legendLabel, legend, analysis } = HEATMAP;

  return (
    <section className="stone-card space-y-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 md:p-6">
      <div className="flex flex-col justify-between gap-2 border-b border-outline-variant pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Icon name="keyboard" className="text-[20px] text-secondary" />
          <h2 className="font-display text-headline-sm font-bold uppercase tracking-wider text-on-surface">
            {title}
          </h2>
          <span className="font-mono font-label-sm text-label-sm text-outline">{caption}</span>
        </div>

        <div className="flex items-center gap-3 font-mono font-label-sm text-label-sm uppercase tracking-wider">
          <span className="text-outline">{legendLabel}:</span>
          {legend.map((item) => (
            <div key={item.id} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded ${item.swatchClass}`} />
              <span className={`font-bold ${item.labelClass}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-3 sm:p-4">
        <div className="mx-auto max-w-4xl min-w-[620px] select-none space-y-1.5 font-mono text-body-sm font-bold">
          {/* Row 1: numbers & symbols */}
          <div className="flex justify-center gap-1.5">
            <Key tone="plain">`</Key>
            <Key tone="accurate">1</Key>
            <Key tone="accurate">2</Key>
            <Key tone="accurate">3</Key>
            <Key tone="accurate">4</Key>
            <Key tone="accurate">5</Key>
            <Key tone="accurate">6</Key>
            <Key tone="medium">7</Key>
            <Key tone="accurate">8</Key>
            <Key tone="medium">9</Key>
            <Key tone="accurate">0</Key>
            <Key tone="error">-</Key>
            <Key tone="plain">=</Key>
            <Key tone="muted" size="w-14 sm:w-16" className={MODIFIER}>
              [BACK]
            </Key>
          </div>

          {/* Row 2: QWERTY */}
          <div className="flex justify-center gap-1.5">
            <Key tone="muted" size="w-12 sm:w-14" className={MODIFIER}>
              [TAB]
            </Key>
            <Key tone="accurate">Q</Key>
            <Key tone="accurate">W</Key>
            <Key tone="accurate">E</Key>
            <Key tone="accurate">R</Key>
            <Key tone="accurate">T</Key>
            <Key tone="medium">Y</Key>
            <Key tone="accurate">U</Key>
            <Key tone="accurate">I</Key>
            <Key tone="accurate">O</Key>
            <Key tone="error">P</Key>
            <Key tone="plain">[</Key>
            <Key tone="plain">]</Key>
            <Key tone="plain" size="w-10 sm:w-12">
              \
            </Key>
          </div>

          {/* Row 3: ASDF */}
          <div className="flex justify-center gap-1.5">
            <Key tone="muted" size="w-14 sm:w-16" className={MODIFIER}>
              [CAPS]
            </Key>
            <Key tone="accurate">A</Key>
            <Key tone="accurate">S</Key>
            <Key tone="accurate">D</Key>
            <Key tone="accurate">F</Key>
            <Key tone="accurate">G</Key>
            <Key tone="accurate">H</Key>
            <Key tone="accurate">J</Key>
            <Key tone="accurate">K</Key>
            <Key tone="accurate">L</Key>
            <Key tone="medium">;</Key>
            <Key tone="error">&apos;</Key>
            <Key tone="accent" size="w-16 sm:w-20" className={MODIFIER}>
              [ENTER]
            </Key>
          </div>

          {/* Row 4: ZXCV */}
          <div className="flex justify-center gap-1.5">
            <Key tone="muted" size="w-16 sm:w-20" className={MODIFIER}>
              [SHIFT]
            </Key>
            <Key tone="accurate">Z</Key>
            <Key tone="medium">X</Key>
            <Key tone="accurate">C</Key>
            <Key tone="accurate">V</Key>
            <Key tone="accurate">B</Key>
            <Key tone="accurate">N</Key>
            <Key tone="accurate">M</Key>
            <Key tone="medium">,</Key>
            <Key tone="accurate">.</Key>
            <Key tone="error">/</Key>
            <Key tone="muted" size="w-16 sm:w-20" className={MODIFIER}>
              [SHIFT]
            </Key>
          </div>

          {/* Row 5: space & modifiers */}
          <div className="flex justify-center gap-1.5 pt-0.5">
            <Key tone="muted" size="w-12 sm:w-14" className={MODIFIER}>
              [CTRL]
            </Key>
            <Key tone="muted" size="w-12 sm:w-14" className={MODIFIER}>
              [ALT]
            </Key>
            <div className="flex h-9 max-w-sm flex-1 items-center justify-center rounded border border-tertiary/70 bg-tertiary/20 font-label-sm text-label-sm font-bold uppercase tracking-widest text-tertiary sm:h-10">
              [SPACE] — 99.8% ACCURATE
            </div>
            <Key tone="muted" size="w-12 sm:w-14" className={MODIFIER}>
              [ALT]
            </Key>
            <Key tone="muted" size="w-12 sm:w-14" className={MODIFIER}>
              [CTRL]
            </Key>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 font-mono text-body-sm text-outline">
        <div className="flex items-center gap-2">
          <span className="font-bold text-error">{analysis.weakestLabel}</span>
          <span className="text-on-surface">{analysis.weakestValue}</span>
        </div>
        <div className="hidden font-label-sm text-label-sm text-outline-variant sm:block">
          {analysis.drill}
        </div>
      </div>
    </section>
  );
}
