import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DARK_TRIPLETS,
  LIGHT_TRIPLETS,
  tripletToHex,
  tripletToRgb,
} from './palette';

/**
 * Drift guard between the TypeScript palette (source of truth) and the CSS
 * custom properties in `src/app/globals.css`. Both directions are checked:
 *
 * 1. every triplet in `palette.ts` appears verbatim as a `--<name>: r g b;`
 *    declaration in the CSS;
 * 2. every RGB-triplet custom property declared in the CSS is known to the
 *    palette (name and value), so an orphan CSS variable cannot slip through.
 *
 * Alpha scrim variables (--stone-*, --scanlines-alpha, --chisel-gold-text-*)
 * are not RGB triplets and are intentionally out of scope: they are
 * light-agnostic black/white depth hints, not palette colours.
 */

const CSS_PATH = path.join(process.cwd(), 'src', 'app', 'globals.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

const TRIPLET_DECLARATION = /--([a-z0-9-]+):\s*(\d{1,3}\s+\d{1,3}\s+\d{1,3})\s*;/g;

describe('palette ⇄ globals.css drift guard', () => {
  test('both maps define exactly the same token names', () => {
    expect(Object.keys(LIGHT_TRIPLETS).sort()).toEqual(Object.keys(DARK_TRIPLETS).sort());
  });

  test('every light triplet appears in globals.css', () => {
    for (const [name, triplet] of Object.entries(LIGHT_TRIPLETS)) {
      expect(CSS).toMatch(new RegExp(`--${name}:\\s*${triplet}\\s*;`));
    }
  });

  test('every dark triplet appears in globals.css', () => {
    for (const [name, triplet] of Object.entries(DARK_TRIPLETS)) {
      expect(CSS).toMatch(new RegExp(`--${name}:\\s*${triplet}\\s*;`));
    }
  });

  test('every RGB custom property in globals.css is known to the palette', () => {
    const declarations = [...CSS.matchAll(TRIPLET_DECLARATION)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const match of declarations) {
      const name = match[1];
      const value = match[2];
      const known =
        LIGHT_TRIPLETS[name] === value || DARK_TRIPLETS[name] === value;
      expect(`${name}: ${value} known to palette.ts`).toBeTruthy();
      expect(known).toBe(true);
    }
  });

  test('triplet helpers convert to hex and rgb', () => {
    expect(tripletToHex('233 226 210')).toBe('#e9e2d2');
    expect(tripletToRgb('233 226 210')).toEqual([233, 226, 210]);
  });
});
