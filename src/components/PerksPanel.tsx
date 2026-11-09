import { PERKS } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import Icon from './Icon';
import PerkCard from './PerkCard';
import SectionHeader from './SectionHeader';

export default function PerksPanel({ messages }: { messages: Messages }) {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title={messages['home.perks.title']}
        subtitle={messages['home.perks.subtitle']}
        right={<Icon name="construction" className="text-primary text-headline-md" />}
      />

      <div className="flex flex-col gap-space-sm">
        {PERKS.map((perk) => (
          <PerkCard key={perk.id} perk={perk} messages={messages} />
        ))}
      </div>
    </section>
  );
}
