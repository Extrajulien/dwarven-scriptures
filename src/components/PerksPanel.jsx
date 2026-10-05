import { PERKS } from '../data/homepageData';
import Icon from './Icon';
import PerkCard from './PerkCard';
import SectionHeader from './SectionHeader';

export default function PerksPanel() {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title="[ RUNIC_FORGE_PERKS ]"
        subtitle="ANCESTRAL RESEARCH & BUFFS"
        right={<Icon name="construction" className="text-primary text-[24px]" />}
      />

      <div className="flex flex-col gap-space-sm">
        {PERKS.map((perk) => (
          <PerkCard key={perk.id} perk={perk} />
        ))}
      </div>
    </section>
  );
}
