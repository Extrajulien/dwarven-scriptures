import type { ReactNode } from 'react';
import AnimatedSpriteTile from './AnimatedSpriteTile';
import SpriteTile from './SpriteTile';
import { ANIMATIONS, type SpriteKey } from './spriteRegistry';
import { useSpritePreloader } from './useSpritePreloader';
import type { Messages } from '../i18n/messages';

const TERRAIN_TILES: SpriteKey[] = [
  'terrain.rock.floor',
  'terrain.solid-rock',
  'terrain.tunnel-ceiling',
  'terrain.cleared-path',
  'terrain.wall-north',
  'terrain.wall-south',
  'terrain.wall-east',
  'terrain.wall-west',
];

const MINING_FRAMES: SpriteKey[] = [
  'mining.progress-0',
  'mining.progress-1',
  'mining.progress-2',
  'mining.progress-3',
];

const MONSTER_TILES: SpriteKey[] = [
  'monster.forgotten-beast.head',
  'monster.forgotten-beast.body',
  'monster.forgotten-beast.tentacle',
  'monster.forgotten-beast.overlay',
];

function LabeledTile({ spriteKey, scale = 2 }: { spriteKey: SpriteKey; scale?: number }) {
  return (
    <div className="flex flex-col items-center gap-space-xs">
      <SpriteTile spriteKey={spriteKey} scale={scale} className="border border-outline-variant" />
      <span className="max-w-[112px] break-all text-center font-label-sm leading-tight text-on-surface-variant">
        {spriteKey}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-space-md">
      <h3 className="font-headline-sm text-on-surface">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Dev-only demo: renders static tiles, an animated sequence, layered tiles,
 * and the preloader state. Mount it anywhere to verify the registry + renderer.
 */
export default function SpriteShowcase({ messages }: { messages: Messages }) {
  const { isLoaded, progress, error } = useSpritePreloader();

  if (!isLoaded) {
    return (
      <section className="flex flex-col gap-space-md rounded-lg border border-outline-variant bg-surface-container-low p-space-lg">
        <h3 className="font-headline-sm text-on-surface">
          {messages['demo.showcaseTitle']}
        </h3>
        <p className="font-body-sm text-on-surface-variant">
          {messages['demo.preloading']} {Math.round(progress * 100)}%
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {error && <p className="font-body-sm text-error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-space-xl rounded-lg border border-outline-variant bg-surface-container-low p-space-lg">
      <header className="flex flex-col gap-space-xs">
        <h2 className="font-headline-md text-primary">{messages['demo.showcaseTitle']}</h2>
        <p className="font-body-sm text-on-surface-variant">
          {messages['demo.showcaseSubtitle']}
        </p>
      </header>

      <Section title={messages['demo.sectionTerrain']}>
        <div className="flex flex-wrap gap-space-md">
          {TERRAIN_TILES.map((key) => (
            <SpriteTile key={key} spriteKey={key} scale={2} />
             //<LabeledTile key={key} spriteKey={key} />
          ))}
        </div>
      </Section>

      <Section title={messages['demo.sectionMining']}>
        <div className="flex flex-wrap items-center gap-space-md">
          <AnimatedSpriteTile
            frames={ANIMATIONS.miningProgress}
            fps={3}
            scale={2}
            className="border border-outline-variant"
          />
          <div className="flex flex-wrap gap-space-md">
            {MINING_FRAMES.map((key) => (
              <LabeledTile key={key} spriteKey={key} />
            ))}
          </div>
        </div>
      </Section>

      <Section title={messages['demo.sectionActors']}>
        <div className="flex flex-wrap items-end gap-space-md">
          <LabeledTile spriteKey="actor.dwarf-miner-idle" />
          <LabeledTile spriteKey="actor.dwarf-miner-digging" />
          <div className="flex flex-col items-center gap-space-xs">
            <AnimatedSpriteTile
              frames={ANIMATIONS.pickaxeSwing}
              fps={10}
              scale={3}
              className="border border-outline-variant"
            />
            <span className="max-w-[112px] break-all text-center font-label-sm leading-tight text-on-surface-variant">
              {messages['demo.pickaxeSwing']}
            </span>
          </div>
        </div>
      </Section>

      <Section title={messages['demo.sectionLayered']}>
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex flex-col items-center gap-space-xs">
            <SpriteTile
              spriteKey="actor.dwarf-miner-idle"
              scale={3}
              className="relative border border-outline-variant"
            >
              <div
                className="pointer-events-none absolute inset-0 bg-tertiary/25"
              />
            </SpriteTile>
            <span className="font-label-sm text-on-surface-variant">
              {messages['demo.idleHighlight']}
            </span>
          </div>

          <div className="flex flex-col items-center gap-space-xs">
            {/* Two tiles composited: floor underneath, beast overlay on top.
                Placeholder sheets are opaque except the overlay tile, which is
                drawn with alpha so the floor shows through. */}
            <div className="relative">
              <SpriteTile spriteKey="terrain.cleared-path" scale={3} className="absolute inset-0" />
              <SpriteTile spriteKey="monster.forgotten-beast.overlay" scale={3} className="relative" />
            </div>
            <span className="font-label-sm text-on-surface-variant">
              {messages['demo.floorBeast']}
            </span>
          </div>
        </div>
      </Section>

      <Section title={messages['demo.sectionMonsters']}>
        <div className="flex flex-wrap gap-space-md">
          {MONSTER_TILES.map((key) => (
            <LabeledTile key={key} spriteKey={key} />
          ))}
        </div>
      </Section>
    </section>
  );
}
