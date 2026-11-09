/**
 * Shared RTL helper: a controllable `window.matchMedia` stub. This project's
 * jsdom version does not implement `matchMedia`, so viewport-dependent
 * components (DES-06 `MobileRaceGate`, DES-05 theme logic) install this stub
 * in their suites. The stub answers every media query with a single
 * switchable `matches` value, records `change` listeners and can fire them —
 * plus a window `resize` — to simulate viewport switches.
 *
 * Every test that cares about the viewport should call
 * `installMatchMedia(...)` itself; test files get a fresh jsdom environment
 * per file, and within a file each call replaces the previous stub.
 */

type Listener = () => void;

export type MatchMediaController = {
  /** Update the simulated `matches` value AND fire every `change` listener. */
  setMatches: (matches: boolean) => void;
  /** Update the simulated `matches` value without firing any listener. */
  setMatchesSilently: (matches: boolean) => void;
  /** Fire the recorded `change` listeners (media query evaluation change). */
  fireChange: () => void;
  /** Fire a window `resize` event (the gate re-reads `matchMedia` on resize). */
  fireResize: () => void;
  /** The stub MediaQueryList (for assertions on its media string). */
  mediaQueryList: { readonly media: string };
};

export function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const changeListeners = new Set<Listener>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(max-width: 767px)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'change') {
        changeListeners.add(listener);
      }
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === 'change') {
        changeListeners.delete(listener);
      }
    },
    dispatchEvent: () => false,
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn(() => mediaQueryList) as unknown as typeof window.matchMedia,
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of [...changeListeners]) {
        listener();
      }
    },
    setMatchesSilently(next: boolean) {
      matches = next;
    },
    fireChange() {
      for (const listener of [...changeListeners]) {
        listener();
      }
    },
    fireResize() {
      window.dispatchEvent(new Event('resize'));
    },
    mediaQueryList,
  };
}
