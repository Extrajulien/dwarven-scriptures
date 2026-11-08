import { CREST } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import GuildEmblem from './GuildEmblem';

export default function GuildCrest({ messages }: { messages: Messages }) {
  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-space-lg lg:w-5/12 bg-surface-container-low p-space-md rounded shadow-inner">
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 bg-surface-container-lowest p-2 rounded shadow-md flex items-center justify-center">
        <GuildEmblem />
        <span className="absolute -top-1 -right-1 bg-primary text-on-primary font-label-sm text-label-sm px-1.5 py-0.5 rounded font-bold shadow">
          {CREST.level}
        </span>
      </div>

      <div className="flex flex-col gap-space-xs text-center sm:text-left">
        <div className="flex items-center gap-space-xs justify-center sm:justify-start">
          <span className="font-label-sm text-label-sm uppercase bg-secondary-container text-on-secondary-container px-space-xs py-0.5 rounded font-bold tracking-widest">
            {messages[CREST.chapterKey]}
          </span>
          <span className="font-label-sm text-label-sm text-primary uppercase">
            {messages[CREST.orderKey]}
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
          {messages[CREST.nameKey]}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant italic">
          {messages[CREST.mottoKey]}
        </p>
        <div className="flex items-center gap-space-sm mt-space-xs justify-center sm:justify-start">
          <span className="font-label-sm text-label-sm text-tertiary">
            {messages[CREST.statsKeys[0]]}
          </span>
          <span className="text-outline">▪</span>
          <span className="font-label-sm text-label-sm text-secondary">
            {messages[CREST.statsKeys[1]]}
          </span>
        </div>
      </div>
    </div>
  );
}
