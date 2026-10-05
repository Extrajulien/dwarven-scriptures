import type { CSSProperties, ReactNode } from 'react';
import { computeSpriteStyle, type SpriteKey } from './spriteRegistry';

export interface SpriteTileProps {
  /** Registry key of the tile to render. */
  spriteKey: SpriteKey;
  /** Integer pixel multiplier over the sheet's tile size (default 1 = 32px). */
  scale?: number;
  className?: string;
  /** Optional layered content rendered on top of the tile. */
  children?: ReactNode;
}

/**
 * Renders a single sprite as a GPU-friendly `<div>` whose `backgroundImage` +
 * `backgroundPosition` isolate the requested tile. `image-rendering` is set to
 * nearest-neighbour (`pixelated`) so scaled tiles never blur or bleed.
 */
export default function SpriteTile({
  spriteKey,
  scale = 1,
  className,
  children,
}: SpriteTileProps) {
  const style: CSSProperties = {
    ...computeSpriteStyle(spriteKey, scale),
    imageRendering: 'pixelated',
  };

  const classes = ['sprite-tile', className].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
