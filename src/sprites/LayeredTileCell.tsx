import { memo, type CSSProperties } from 'react';
import {
  computeSpriteStyleFromOffset,
  DEFAULT_TILE_SIZE,
  getSheet,
} from './spriteRegistry';
import type { ResolvedSpriteRef } from './autoTileEvaluator';

export interface LayeredTileCellProps {
  /** Back-to-front layer list (from `resolveCellSprites`). */
  layers: readonly ResolvedSpriteRef[];
  scale?: number;
  className?: string;
}

function layerStyle(layer: ResolvedSpriteRef, scale: number): CSSProperties {
  const s = computeSpriteStyleFromOffset(layer.sheet, layer.gridX, layer.gridY, scale);
  if (layer.tint) {
    return {
      backgroundColor: layer.tint,
      // Use the sprite sheet slice as an alpha mask
      WebkitMaskImage: s.backgroundImage,
      maskImage: s.backgroundImage,
      WebkitMaskPosition: s.backgroundPosition,
      maskPosition: s.backgroundPosition,
      WebkitMaskSize: s.backgroundSize,
      maskSize: s.backgroundSize,
      WebkitMaskRepeat: s.backgroundRepeat,
      maskRepeat: s.backgroundRepeat,
      imageRendering: 'pixelated' as const,
      pointerEvents: 'none' as const,
    };
  }

  return {
    backgroundImage: s.backgroundImage,
    backgroundPosition: s.backgroundPosition,
    backgroundSize: s.backgroundSize,
    backgroundRepeat: s.backgroundRepeat,
    imageRendering: 'pixelated' as const,
    pointerEvents: 'none' as const,
  };
}

function layersEqual(a: readonly ResolvedSpriteRef[], b: readonly ResolvedSpriteRef[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.sheet !== y.sheet || x.gridX !== y.gridX || x.gridY !== y.gridY || x.tint !== y.tint) return false;
  }
  return true;
}

function arePropsEqual(prev: LayeredTileCellProps, next: LayeredTileCellProps): boolean {
  return (
    prev.scale === next.scale &&
    prev.className === next.className &&
    layersEqual(prev.layers, next.layers)
  );
}

/**
 * Renders one grid cell as stacked, absolutely-positioned layers. Memoized
 * with a custom comparator so an adjacent tile update does not re-render this
 * cell unless its resolved layers actually changed.
 */
export const LayeredTileCell = memo(function LayeredTileCell({
  layers,
  scale = 1,
  className,
}: LayeredTileCellProps) {
  const tileSize = layers.length > 0 ? getSheet(layers[0].sheet).tileSize : DEFAULT_TILE_SIZE;
  const size = Math.round(tileSize * scale);

  return (
    <div
      className={['relative', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      {layers.map((layer, index) => (
        <div
          key={`${index}-${layer.sheet}-${layer.gridX}-${layer.gridY}`}
          className="sprite-tile absolute inset-0"
          style={layerStyle(layer, scale)}
        />
      ))}
    </div>
  );
}, arePropsEqual);
