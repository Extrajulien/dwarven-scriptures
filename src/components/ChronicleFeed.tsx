import { CHRONICLES } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import SectionHeader from './SectionHeader';

export default function ChronicleFeed({ messages }: { messages: Messages }) {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title={messages['home.chronicles.title']}
        titleClass="text-on-surface"
        subtitle={messages['home.chronicles.subtitle']}
        right={<span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />}
      />

      <div className="flex flex-col gap-space-xs font-body-sm text-body-sm">
        {CHRONICLES.map((event) => (
          <div
            key={event.id}
            className="bg-surface-container p-space-xs rounded flex flex-col"
          >
            <div className="flex items-center justify-between text-label-sm text-outline">
              <span className={`font-bold ${event.authorClass}`}>
                {event.author}
              </span>
              <span>{messages[event.timeKey]}</span>
            </div>
            <span className={event.bodyClass}>
              {event.segments.map((segment, index) => (
                <span key={index} className={segment.className}>
                  {messages[segment.textKey]}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-low p-space-xs rounded flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
        <span className="text-primary">&gt;</span>
        <input
          className="bg-transparent text-on-surface placeholder:text-outline border-none outline-none w-full font-body-sm text-body-sm"
          placeholder={messages['home.chronicles.placeholder']}
          type="text"
        />
        <button
          type="button"
          className="text-primary hover:text-primary-fixed uppercase font-bold"
        >
          {messages['home.chronicles.post']}
        </button>
      </div>
    </section>
  );
}
