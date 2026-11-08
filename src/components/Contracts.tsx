import { BOUNTIES } from '../data/homepageData';
import BountyCard from './BountyCard';
import SectionHeader from './SectionHeader';

export default function Contracts() {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title="[ CHAMBER // ACTIVE_EXPEDITION_CONTRACTS_&_RAIDS ]"
        titleClass="text-secondary"
        tag="᚛ᛒᛟᚢᚾᛏᛁᛖᛋ᚜"
        right={
          <span className="font-label-sm text-label-sm text-tertiary uppercase">
            3 BOUNTIES UNDER EXCAVATION
          </span>
        }
      />

      <div className="flex flex-col gap-space-sm">
        {BOUNTIES.map((bounty) => (
          <BountyCard key={bounty.id} bounty={bounty} />
        ))}
      </div>
    </section>
  );
}
