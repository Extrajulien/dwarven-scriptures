import { FOOTER } from '../data/homepageData';
import type { Messages } from '../i18n/messages';

export default function Footer({ messages }: { messages: Messages }) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 h-12 z-40 bg-surface-container-lowest shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
      <div className="h-full w-full px-margin-desktop flex items-center justify-between font-label-sm text-label-sm uppercase text-on-surface-variant">
        <span>{messages[FOOTER.leftKey]}</span>
        <div className="flex items-center gap-space-md">
          <span>{messages[FOOTER.statusKey]}</span>
          <span className="text-tertiary">{messages[FOOTER.optimalKey]}</span>
          <span className="text-on-surface select-none">▪</span>
        </div>
      </div>
    </footer>
  );
}
