/**
 * Single source of truth for the theme colour tokens (DES-03/05 groundwork).
 *
 * Every value is an RGB triplet string ("r g b") that `src/app/globals.css`
 * exposes as a CSS custom property (`--<name>`) — light values under `:root`
 * (light is the default) and the dark values under `html.dark`. Tailwind
 * (`tailwind.config.cjs`) references those variables through
 * `rgb(var(--<name>) / <alpha-value>)`, so a class like `bg-primary/50`
 * keeps working.
 *
 * `palette.test.ts` reads `globals.css` and asserts every triplet here also
 * exists there (and vice versa) so the two copies cannot drift apart.
 *
 * Rationale for the light palette (warm "limestone daylight", Dwarf Fortress
 * direction) is documented in `doc/DEMARCHE-CREATIVE.md`:
 * - light stone surfaces with dark charcoal text;
 * - the same gold family as the dark theme (`#c59b27` ramp), darkened to
 *   `#6f5100` for light surfaces so gold text keeps WCAG AA contrast;
 * - fixed tones (`primary-fixed*`, `secondary-fixed*`, `tertiary-fixed*`)
 *   are identical in both themes, as are theme-independent tones
 *   (`dwarf-rune-green`, `dwarf-gold-ink`, `chisel-gold-*` borders, scanline).
 */

export type RgbTriplet = `${number} ${number} ${number}`;

export type PaletteMap = Record<string, RgbTriplet>;

/** Light theme (default, under `:root`). */
export const LIGHT_TRIPLETS: PaletteMap = {
  // --- main surfaces & text (Material-ish naming already used by the app)
  background: '233 226 210',
  surface: '233 226 210',
  'surface-dim': '216 208 190',
  'surface-bright': '244 239 227',
  'surface-container-lowest': '248 244 234',
  'surface-container-low': '242 237 226',
  'surface-container': '236 231 219',
  'surface-container-high': '230 224 210',
  'surface-container-highest': '224 217 201',
  'surface-variant': '222 214 197',
  'surface-tint': '197 155 39',
  'on-surface': '36 31 22',
  'on-surface-variant': '87 78 63',
  'on-background': '36 31 22',
  // --- primary (gold family, darkened for light surfaces)
  'on-primary': '255 248 231',
  'on-primary-container': '61 44 0',
  'on-primary-fixed': '37 26 0',
  'on-primary-fixed-variant': '90 67 0',
  primary: '111 81 0',
  'primary-container': '242 217 138',
  'primary-fixed': '255 223 152',
  'primary-fixed-dim': '238 193 75',
  'inverse-primary': '238 193 75',
  // --- secondary (ember / forge)
  'on-secondary': '255 248 240',
  'on-secondary-container': '61 27 0',
  'on-secondary-fixed': '46 21 0',
  'on-secondary-fixed-variant': '109 58 0',
  secondary: '140 74 0',
  'secondary-container': '255 219 194',
  'secondary-fixed': '255 220 194',
  'secondary-fixed-dim': '255 183 123',
  // --- tertiary (moss / rune green)
  'on-tertiary': '255 255 255',
  'on-tertiary-container': '12 43 8',
  'on-tertiary-fixed': '2 33 0',
  'on-tertiary-fixed-variant': '40 80 30',
  tertiary: '61 102 50',
  'tertiary-container': '204 233 190',
  'tertiary-fixed': '192 240 173',
  'tertiary-fixed-dim': '164 211 147',
  // --- error
  'on-error': '255 255 255',
  'on-error-container': '65 0 2',
  error: '186 26 26',
  'error-container': '255 218 214',
  // --- outline / inverse
  outline: '121 111 90',
  'outline-variant': '196 188 171',
  'inverse-surface': '32 31 31',
  'inverse-on-surface': '229 226 225',
  // --- "Dwarf Fortress" stone palette (login terminal & stone chrome)
  'dwarf-abyss': '255 248 231', // cream: readable on gold fills in light mode
  'dwarf-bg': '233 226 210',
  'dwarf-slate': '226 218 200',
  'dwarf-basalt': '221 212 192',
  'dwarf-border': '168 154 125',
  'dwarf-border-light': '138 125 99',
  'dwarf-parchment': '58 51 40',
  'dwarf-parchment-muted': '103 95 81',
  'dwarf-parchment-bright': '58 51 40',
  'dwarf-gold': '111 81 0',
  'dwarf-gold-light': '133 99 0',
  'dwarf-gold-hover': '122 91 0',
  'dwarf-rune-green': '79 121 66', // same in both themes: reads on both caves
  'dwarf-rune-bright': '56 96 43',
  'dwarf-magma': '165 58 16',
  // --- stone terminal surfaces (auth screens; dark values = current rendering)
  'dwarf-cave': '233 226 210',
  'dwarf-terminal': '243 238 225',
  'dwarf-terminal-header': '232 225 207',
  'dwarf-rune-badge': '219 232 212',
  'dwarf-status-strip': '239 232 216',
  'dwarf-input-bg': '251 248 239',
  'dwarf-input-border': '155 143 118',
  'dwarf-track': '224 217 198',
  'dwarf-divider-strong': '179 168 142',
  'dwarf-divider': '192 182 160',
  'dwarf-divider-soft': '211 203 184',
  'dwarf-parchment-icon': '107 87 38',
  'dwarf-gold-ink': '61 44 7', // same in both themes: sits on gold buttons
  'dwarf-showcase-header': '176 166 141',
  'dwarf-showcase-frame': '162 150 124',
  'dwarf-showcase-overlay': '239 233 219',
  'dwarf-showcase-panel-border': '141 129 101',
  'dwarf-showcase-panel': '246 242 230',
  'dwarf-showcase-divider': '196 187 164',
  'dwarf-danger': '185 28 28',
  // --- bespoke globals.css component colours (stone panels, chisel buttons)
  'stone-panel-border': '168 154 125',
  'stone-panel-outline': '125 115 96',
  'stone-panel-inner-border': '195 185 163',
  'chisel-gold-top': '233 189 63',
  'chisel-gold-mid': '201 154 34',
  'chisel-gold-bottom': '170 126 19',
  'chisel-gold-border': '246 207 99',
  'chisel-gold-base': '90 64 5',
  'chisel-gold-hover-top': '219 171 47',
  'chisel-gold-hover-mid': '184 139 27',
  'chisel-gold-hover-bottom': '153 113 15',
  'chisel-stone-border': '157 146 120',
  'chisel-stone-base': '92 84 63',
  'chisel-stone-hover': '221 213 194',
  'chisel-stone-hover-border': '110 100 80',
  scanline: '0 0 0',
};

/** Dark theme (under `html.dark`) — exact reproduction of the current site. */
export const DARK_TRIPLETS: PaletteMap = {
  // --- main surfaces & text
  background: '19 19 19',
  surface: '19 19 19',
  'surface-dim': '19 19 19',
  'surface-bright': '57 57 57',
  'surface-container-lowest': '14 14 14',
  'surface-container-low': '28 27 27',
  'surface-container': '32 31 31',
  'surface-container-high': '42 42 42',
  'surface-container-highest': '53 53 52',
  'surface-variant': '53 53 52',
  'surface-tint': '238 193 75',
  'on-surface': '229 226 225',
  'on-surface-variant': '209 197 175',
  'on-background': '229 226 225',
  // --- primary
  'on-primary': '62 46 0',
  'on-primary-container': '71 53 0',
  'on-primary-fixed': '37 26 0',
  'on-primary-fixed-variant': '90 67 0',
  primary: '238 193 75',
  'primary-container': '197 155 39',
  'primary-fixed': '255 223 152',
  'primary-fixed-dim': '238 193 75',
  'inverse-primary': '119 90 0',
  // --- secondary
  'on-secondary': '77 39 0',
  'on-secondary-container': '255 178 112',
  'on-secondary-fixed': '46 21 0',
  'on-secondary-fixed-variant': '109 58 0',
  secondary: '255 183 123',
  'secondary-container': '122 65 0',
  'secondary-fixed': '255 220 194',
  'secondary-fixed-dim': '255 183 123',
  // --- tertiary
  'on-tertiary': '17 56 9',
  'on-tertiary-container': '25 64 16',
  'on-tertiary-fixed': '2 33 0',
  'on-tertiary-fixed-variant': '40 80 30',
  tertiary: '164 211 147',
  'tertiary-container': '128 173 112',
  'tertiary-fixed': '192 240 173',
  'tertiary-fixed-dim': '164 211 147',
  // --- error
  'on-error': '105 0 5',
  'on-error-container': '255 218 214',
  error: '255 180 171',
  'error-container': '147 0 10',
  // --- outline / inverse
  outline: '154 144 124',
  'outline-variant': '78 70 53',
  'inverse-surface': '229 226 225',
  'inverse-on-surface': '49 48 48',
  // --- "Dwarf Fortress" stone palette
  'dwarf-abyss': '12 11 10',
  'dwarf-bg': '20 19 18',
  'dwarf-slate': '28 26 23',
  'dwarf-basalt': '37 34 29',
  'dwarf-border': '60 54 45',
  'dwarf-border-light': '84 76 63',
  'dwarf-parchment': '212 197 169',
  'dwarf-parchment-muted': '150 136 112',
  'dwarf-parchment-bright': '255 255 255',
  'dwarf-gold': '197 155 39',
  'dwarf-gold-light': '229 169 60',
  'dwarf-gold-hover': '245 190 84',
  'dwarf-rune-green': '79 121 66',
  'dwarf-rune-bright': '98 158 82',
  'dwarf-magma': '211 78 36',
  // --- stone terminal surfaces
  'dwarf-cave': '15 14 13',
  'dwarf-terminal': '23 21 19',
  'dwarf-terminal-header': '28 25 22',
  'dwarf-rune-badge': '26 40 24',
  'dwarf-status-strip': '31 28 24',
  'dwarf-input-bg': '18 17 16',
  'dwarf-input-border': '63 56 45',
  'dwarf-track': '14 13 12',
  'dwarf-divider-strong': '54 47 37',
  'dwarf-divider': '52 46 36',
  'dwarf-divider-soft': '35 32 26',
  'dwarf-parchment-icon': '138 114 65',
  'dwarf-gold-ink': '61 44 7',
  'dwarf-showcase-header': '48 42 32',
  'dwarf-showcase-frame': '59 51 39',
  'dwarf-showcase-overlay': '16 14 12',
  'dwarf-showcase-panel-border': '77 66 51',
  'dwarf-showcase-panel': '22 20 18',
  'dwarf-showcase-divider': '51 43 33',
  'dwarf-danger': '220 38 38',
  // --- bespoke globals.css component colours
  'stone-panel-border': '74 65 53',
  'stone-panel-outline': '28 26 23',
  'stone-panel-inner-border': '54 48 38',
  'chisel-gold-top': '219 171 47',
  'chisel-gold-mid': '184 139 27',
  'chisel-gold-bottom': '153 113 15',
  'chisel-gold-border': '246 207 99',
  'chisel-gold-base': '90 64 5',
  'chisel-gold-hover-top': '233 189 63',
  'chisel-gold-hover-mid': '201 154 34',
  'chisel-gold-hover-bottom': '170 126 19',
  'chisel-stone-border': '68 60 48',
  'chisel-stone-base': '20 18 15',
  'chisel-stone-hover': '43 39 34',
  'chisel-stone-hover-border': '99 87 68',
  scanline: '0 0 0',
};

/** "r g b" -> "#rrggbb" (used by theme-color metas and the contrast test). */
export function tripletToHex(triplet: string): string {
  return `#${triplet
    .trim()
    .split(/\s+/)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** "r g b" -> [r, g, b] channel numbers. */
export function tripletToRgb(triplet: string): [number, number, number] {
  const [r, g, b] = triplet.trim().split(/\s+/).map(Number);
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`invalid triplet: ${JSON.stringify(triplet)}`);
  }
  return [r, g, b];
}

/** `theme-color` meta values matching the page background of each theme. */
export const LIGHT_BACKGROUND_HEX = tripletToHex(LIGHT_TRIPLETS['background']);
export const DARK_BACKGROUND_HEX = tripletToHex(DARK_TRIPLETS['background']);
