import {
  DARK_TRIPLETS,
  LIGHT_TRIPLETS,
  tripletToRgb,
  type PaletteMap,
} from './palette';

/**
 * A11Y-01: computed WCAG 2.x contrast verification for both themes.
 *
 * Relative luminance follows the WCAG formula (0.03928 cut-off) and the
 * contrast ratio is (L1 + 0.05) / (L2 + 0.05) with L1 >= L2. Every key text
 * pair is asserted against the AA threshold (4.5:1, 3:1 for the labelled
 * large/bold headline pair and non-text UI elements). The pairs run against
 * BOTH `:root` (light) and `html.dark` (dark) triplets so neither theme can
 * regress silently.
 */

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(triplet: string): number {
  const [r, g, b] = tripletToRgb(triplet);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

type ContrastPair = {
  name: string;
  foreground: keyof PaletteMap;
  background: keyof PaletteMap;
  /** AA threshold: 4.5 for normal text, 3.0 for large text / non-text UI. */
  minimum: number;
};

const PAIRS: readonly ContrastPair[] = [
  { name: 'body text on background', foreground: 'on-surface', background: 'background', minimum: 4.5 },
  { name: 'body text on surface-container-low', foreground: 'on-surface', background: 'surface-container-low', minimum: 4.5 },
  { name: 'body text on surface-container', foreground: 'on-surface', background: 'surface-container', minimum: 4.5 },
  { name: 'body text on surface-container-high', foreground: 'on-surface', background: 'surface-container-high', minimum: 4.5 },
  { name: 'secondary text on background', foreground: 'on-surface-variant', background: 'background', minimum: 4.5 },
  { name: 'secondary text on surface-container-high', foreground: 'on-surface-variant', background: 'surface-container-high', minimum: 4.5 },
  { name: 'primary text on background', foreground: 'primary', background: 'background', minimum: 4.5 },
  { name: 'on-primary text on primary', foreground: 'on-primary', background: 'primary', minimum: 4.5 },
  { name: 'headline brand text on navbar (large bold)', foreground: 'primary', background: 'surface-container-lowest', minimum: 3 },
  { name: 'error text on background', foreground: 'error', background: 'background', minimum: 4.5 },
  { name: 'on-error text on error', foreground: 'on-error', background: 'error', minimum: 4.5 },
  { name: 'auth terminal body text', foreground: 'dwarf-parchment', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'auth terminal secondary text', foreground: 'dwarf-parchment-muted', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'auth terminal gold accent text', foreground: 'dwarf-gold', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'auth rune badge text', foreground: 'dwarf-rune-bright', background: 'dwarf-rune-badge', minimum: 4.5 },
  { name: 'outline on background (non-text UI)', foreground: 'outline', background: 'background', minimum: 3 },
  // Race typing zone (COURSE-04): the three character states and the live
  // stats chips. The caret uses `primary` on `dwarf-bg` too, so the correct
  // characters pair covers it (4.5 >= the 3.0 non-text threshold).
  { name: 'race correct characters', foreground: 'primary', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'race incorrect characters', foreground: 'error', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'race upcoming characters', foreground: 'on-surface-variant', background: 'dwarf-bg', minimum: 4.5 },
  { name: 'race live stats chip text', foreground: 'on-surface', background: 'dwarf-slate', minimum: 4.5 },
  { name: 'race progress chip text', foreground: 'on-surface-variant', background: 'dwarf-slate', minimum: 4.5 },
  // Race progress track + top-3 + overtake strips (COURSE-05, GAME-2/3): the
  // marker/top-3 names and WPM chips reuse the stone chips; the local/top-3
  // names and the gold badges sit on the same surfaces. The overtake "down"
  // strip is parchment on basalt with the magma reserved for the decorative
  // chevron (dwarf-magma on dark basalt is ≈3.7:1, below AA for text).
  { name: 'race track marker name', foreground: 'dwarf-parchment', background: 'surface-container-lowest', minimum: 4.5 },
  { name: 'race track local/top3 name (gold)', foreground: 'dwarf-gold', background: 'surface-container-lowest', minimum: 4.5 },
  { name: 'race top3 row name', foreground: 'dwarf-parchment', background: 'dwarf-slate', minimum: 4.5 },
  { name: 'race top3 wpm text', foreground: 'dwarf-gold', background: 'dwarf-slate', minimum: 4.5 },
  { name: 'race you tag / finish badge on gold', foreground: 'dwarf-abyss', background: 'dwarf-gold', minimum: 4.5 },
  { name: 'race overtake down strip text', foreground: 'dwarf-parchment', background: 'dwarf-basalt', minimum: 4.5 },
  // Phase 5 follow-ups (A11Y-01): the pairs flagged during the audit.
  // BonusAnnouncer local banner (gold text on the basalt strip; the border
  // lost its /70 alpha so the same pair covers it as non-text UI).
  { name: 'bonus announcer banner text', foreground: 'dwarf-gold', background: 'dwarf-basalt', minimum: 4.5 },
  { name: 'bonus announcer banner border (non-text UI)', foreground: 'dwarf-gold', background: 'dwarf-basalt', minimum: 3 },
  // ResultsPodium: the gold title + winner WPM on the podium surface, and the
  // winner rank badge (ink on the pale-gold primary container after the
  // former `dwarf-goldInk` on `dwarf-gold` badge measured ≈1.83:1 in light).
  { name: 'results podium gold text', foreground: 'dwarf-gold', background: 'surface-container-lowest', minimum: 4.5 },
  { name: 'results podium winner rank badge', foreground: 'on-primary-container', background: 'primary-container', minimum: 4.5 },
  // RaceKeyboardHeatmap "top" tone: solid error fill with on-error text (the
  // old `on-surface` on `error`/60 measured ≈2.6:1 light / ≈2.1:1 dark).
  { name: 'race heatmap top-tone key text', foreground: 'on-error', background: 'error', minimum: 4.5 },
  // Overtake strips: the "up" strip text and both strip borders (the borders
  // lost their /60 alpha — ≈1.6:1 before, below the 3:1 non-text floor).
  { name: 'race overtake up strip text', foreground: 'dwarf-rune-bright', background: 'dwarf-rune-badge', minimum: 4.5 },
  { name: 'race overtake up strip border (non-text UI)', foreground: 'dwarf-rune-bright', background: 'dwarf-rune-badge', minimum: 3 },
  { name: 'race overtake down strip border (non-text UI)', foreground: 'dwarf-magma', background: 'dwarf-basalt', minimum: 3 },
];

describe.each([
  ['light', LIGHT_TRIPLETS],
  ['dark', DARK_TRIPLETS],
] as const)('WCAG AA contrast — %s theme', (themeName, palette) => {
  test.each(PAIRS)('$name (min $minimum:1)', ({ foreground, background, minimum }) => {
      const ratio = contrastRatio(palette[foreground], palette[background]);
      const labelled = `${ratio.toFixed(2)}:1`;
      // Logged so the CI/console output doubles as the evidence table.
      console.log(`  [${themeName}] ${foreground}/${background} = ${labelled} (min ${minimum}:1)`);
      expect(ratio).toBeGreaterThanOrEqual(minimum);
    },
  );

  test('every palette triplet is a valid RGB triplet', () => {
    for (const [name, triplet] of Object.entries(palette)) {
      const [r, g, b] = tripletToRgb(triplet);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeLessThanOrEqual(255);
      expect(name).toBeTruthy();
    }
  });
});
