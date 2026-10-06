import { useEffect, useRef, useState } from 'react';
import SpriteTile from './SpriteTile';
import type { SpriteKey } from './spriteRegistry';

export interface AnimatedSpriteTileProps {
  /** Ordered sprite keys stepped through in sequence. */
  frames: readonly SpriteKey[];
  /** Frames per second. */
  fps: number;
  /** Restart from the first frame after the last (default true). */
  loop?: boolean;
  scale?: number;
  className?: string;
}

/**
 * Steps through a sequence of sprite keys using `requestAnimationFrame`.
 * Only re-renders when the active frame actually changes (not on every rAF
 * tick), so it stays cheap even at high frame rates.
 */
export default function AnimatedSpriteTile({
  frames,
  fps,
  loop = true,
  scale,
  className,
}: AnimatedSpriteTileProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const indexRef = useRef(0);
  const frameMs = fps > 0 ? 1000 / fps : Infinity;

  // Reset the sequence whenever the frames or speed change.
  useEffect(() => {
    indexRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the sequence when inputs change
    setFrameIndex(0);
  }, [frames, frameMs]);

  useEffect(() => {
    if (frames.length <= 1 || !Number.isFinite(frameMs)) return;

    let rafId = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      acc += now - last;
      last = now;

      while (acc >= frameMs) {
        acc -= frameMs;
        const next = indexRef.current + 1;
        if (next >= frames.length) {
          if (!loop) {
            indexRef.current = frames.length - 1;
            setFrameIndex(frames.length - 1);
            return; // finished — stop scheduling further frames
          }
          indexRef.current = 0;
        } else {
          indexRef.current = next;
        }
        setFrameIndex(indexRef.current);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [frames, frameMs, loop]);

  if (frames.length === 0) return null;

  const key = frames[Math.min(frameIndex, frames.length - 1)];
  return <SpriteTile spriteKey={key} scale={scale} className={className} />;
}
