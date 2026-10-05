export default function ProgressBar({
  percent,
  fillClass,
  trackClass = 'w-full bg-surface-container-lowest h-1.5',
}) {
  return (
    <div className={`rounded overflow-hidden ${trackClass}`}>
      <div className={`h-full ${fillClass}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
