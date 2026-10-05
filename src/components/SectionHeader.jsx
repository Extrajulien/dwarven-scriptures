export default function SectionHeader({
  title,
  titleClass = 'text-primary',
  tag,
  subtitle,
  right,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-xs gap-space-xs">
      <div className="flex flex-col">
        <div className="flex items-center gap-space-xs">
          <span
            className={`font-headline-sm text-headline-sm uppercase tracking-wide ${titleClass}`}
          >
            {title}
          </span>
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
