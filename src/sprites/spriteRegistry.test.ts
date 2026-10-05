import {
  computeSpriteStyle,
  getAllSheetUrls,
  resolveSprite,
  SPRITES,
  type SpriteKey,
} from './spriteRegistry';

describe('spriteRegistry', () => {
  test('every sprite key resolves to a valid sheet and in-bounds grid cell', () => {
    (Object.keys(SPRITES) as SpriteKey[]).forEach((key) => {
      const { def, sheet } = resolveSprite(key);
      expect(sheet).toBeDefined();
      expect(def.gridX).toBeGreaterThanOrEqual(0);
      expect(def.gridY).toBeGreaterThanOrEqual(0);
      expect(def.gridX).toBeLessThan(sheet.columns);
      expect(def.gridY).toBeLessThan(sheet.rows);
    });
  });

  test('getAllSheetUrls returns unique URLs', () => {
    const urls = getAllSheetUrls();
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBeGreaterThanOrEqual(1);
  });

  test('computeSpriteStyle produces pixel-exact CSS offsets', () => {
    const topLeft = computeSpriteStyle('terrain.solid-rock', 2);
    expect(topLeft.width).toBe(64);
    expect(topLeft.height).toBe(64);
    expect(topLeft.backgroundImage).toBe('url("/assets/tiles/ramps_stone.png")');
    expect(topLeft.backgroundPosition).toBe('-0px -0px');
    expect(topLeft.backgroundSize).toBe('960px 832px'); // 15 cols x 13 rows @ scale 2

    const wallSouth = computeSpriteStyle('terrain.wall-south', 2); // (0, 1)
    expect(wallSouth.backgroundPosition).toBe('-0px -64px');

    const wallEast = computeSpriteStyle('terrain.wall-east', 1); // (1, 1)
    expect(wallEast.backgroundPosition).toBe('-32px -32px');
  });
});
