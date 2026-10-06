import { useEffect, useMemo, useState } from 'react';
import { getAllSheetUrls } from './spriteRegistry';

export interface PreloadState {
  /** True once every requested sheet has loaded successfully. */
  isLoaded: boolean;
  /** 0..1 fraction of sheets that have settled (loaded or failed). */
  progress: number;
  /** Set when one or more sheets failed to load; null otherwise. */
  error: string | null;
}

/**
 * Preloads sprite-sheet images into the browser cache before the game UI
 * mounts, eliminating flicker while tiles stream in.
 *
 * Pass `urls` as a stable reference (a module constant or `useMemo` result),
 * or omit it to preload every sheet listed in the sprite registry.
 */
export function useSpritePreloader(urls?: string[]): PreloadState {
  const sources = useMemo(() => Array.from(new Set(urls ?? getAllSheetUrls())), [urls]);

  const [state, setState] = useState<PreloadState>({
    isLoaded: false,
    progress: 0,
    error: null,
  });

  useEffect(() => {
    if (sources.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to preload
      setState({ isLoaded: true, progress: 1, error: null });
      return;
    }

    let cancelled = false;
    let settled = 0;
    const failures: string[] = [];

    setState({ isLoaded: false, progress: 0, error: null });

    const settle = (src: string, failed: boolean) => {
      if (cancelled) return;
      settled += 1;
      if (failed) failures.push(src);
      const done = settled === sources.length;
      setState({
        isLoaded: done && failures.length === 0,
        progress: done ? 1 : settled / sources.length,
        error: failures.length > 0 ? `Failed to load: ${failures.join(', ')}` : null,
      });
    };

    sources.forEach((src) => {
      const img = new Image();
      img.onload = () => settle(src, false);
      img.onerror = () => settle(src, true);
      img.src = src;
    });

    return () => {
      cancelled = true;
    };
  }, [sources]);

  return state;
}
