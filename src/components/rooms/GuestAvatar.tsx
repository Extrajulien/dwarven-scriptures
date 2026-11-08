const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᛟ', 'ᛞ'];

const RUNE_COLORS = [
  'text-dwarf-gold',
  'text-dwarf-runeBright',
  'text-secondary',
  'text-tertiary',
  'text-dwarf-magma',
];

/**
 * Generated guest avatar (AUTH-03): a deterministic dwarf rune drawn from the
 * guest's identity, rendered as a stone tile. No emojis, no uploads — the
 * rune is the site's own glyph language (see the guild banner runes), so the
 * avatar stays inside the Dwarf-Fortress direction.
 */
export default function GuestAvatar({
  seed,
  className = '',
}: {
  seed: string;
  className?: string;
}) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const rune = RUNES[hash % RUNES.length];
  const colorClass = RUNE_COLORS[hash % RUNE_COLORS.length];

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-display ${colorClass} ${className}`}
    >
      {rune}
    </span>
  );
}
