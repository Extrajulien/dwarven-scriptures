import { BOUNTIES } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import BountyCard from './BountyCard';
import SectionHeader from './SectionHeader';

export default function Contracts({ messages }: { messages: Messages }) {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title={messages['home.bounties.title']}
        titleClass="text-secondary"
        tag={messages['home.bounties.tag']}
        right={
          <span className="font-label-sm text-label-sm text-tertiary uppercase">
            {messages['home.bounties.count']}
          </span>
        }
      />

      <div className="flex flex-col gap-space-sm">
        {BOUNTIES.map((bounty) => (
          <BountyCard key={bounty.id} bounty={bounty} messages={messages} />
        ))}
      </div>
    </section>
  );
}
