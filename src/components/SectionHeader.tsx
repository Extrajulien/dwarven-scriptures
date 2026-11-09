import type { ReactNode } from 'react';

/**
 * Section header (A11Y-02): renders a `<span>` by default so call sites keep
 * their current outline without introducing heading skips; pages that need a
 * document outline pass `level` (1–3) to render a real heading element.
 */
export default function SectionHeader({
  title,
  titleClass = 'text-primary',
  tag,
  subtitle,
  right,
  level,
}: {
  title: string;
  titleClass?: string;
  tag?: string;
  subtitle?: string;
  right?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Heading = (level !== undefined ? `h${level}` : 'span') as 'span' | 'h1' | 'h2' | 'h3';
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-xs gap-space-xs">
      <div className="flex flex-col">
        <div className="flex items-center gap-space-xs">
          <Heading
            className={`font-headline-sm text-headline-sm uppercase tracking-wide ${titleClass}`}
          >
            {title}
          </Heading>
          {tag && (
            <span className="font-label-sm text-label-sm text-outline select-none">
              {tag}
            </span>
          )}
        </div>
        {subtitle && (
          <span className="font-label-sm text-label-sm text-outline">
            {subtitle}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}
