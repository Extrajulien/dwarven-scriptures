import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AccountIdentityCard from '../../components/account/AccountIdentityCard';
import AccountStats from '../../components/account/AccountStats';
import KeyboardHeatmap from '../../components/account/KeyboardHeatmap';
import ProgressionCharts from '../../components/account/ProgressionCharts';
import RaceHistory from '../../components/account/RaceHistory';
import Footer from '../../components/Footer';
import Navbar from '../../components/Navbar/Navbar';
import { ACCOUNT_BREADCRUMB } from '../../data/accountData';
import { listLinkedProviders } from '../../db/queries/oauth-accounts';
import { getUserFullProfile } from '../../db/queries/users';
import { getLocale, pick } from '../../i18n/messages';
import { getSession } from '../../lib/session';
import { toAccountProfile } from './profile';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: messages['pageTitle.account'] };
}

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  // Defensive: a session references a valid UUID, so the lookup only rejects if
  // the query itself fails; treat that as logged out.
  const profile = await getUserFullProfile({ publicId: session.publicId }).catch(() => null);
  if (!profile) {
    redirect('/login');
  }

  const linkedProviders = await listLinkedProviders(profile.id);
  const account = toAccountProfile(profile, linkedProviders);
  const locale = await getLocale();
  const messages = pick(locale);

  return (
    <>
      <Navbar
        user={{ username: account.username, pfpUrl: account.pfpUrl }}
        locale={locale}
        messages={messages}
      />

      <main className="min-h-[calc(100vh-3rem)] w-full bg-surface pb-16 pt-20">
        <div className="mx-auto max-w-7xl space-y-6 px-margin md:px-margin-desktop">
          {/* Breadcrumb / telemetry header */}
          <div className="flex items-center justify-between border-b border-outline-variant pb-2 font-label-sm text-label-sm uppercase tracking-widest text-outline">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary">
                {messages[ACCOUNT_BREADCRUMB.leftKey]}
              </span>
              <span>{'//'}</span>
              <span>{messages[ACCOUNT_BREADCRUMB.nodeKey]}</span>
              <span>{'//'}</span>
              <span className="text-tertiary">{messages[ACCOUNT_BREADCRUMB.syncedKey]}</span>
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              {ACCOUNT_BREADCRUMB.rightKeys.map((labelKey) => (
                <span key={labelKey}>{messages[labelKey]}</span>
              ))}
            </div>
          </div>

          <AccountIdentityCard profile={account} locale={locale} messages={messages} />
          <AccountStats profile={account} locale={locale} messages={messages} />
          <ProgressionCharts messages={messages} />
          <RaceHistory messages={messages} />
          <KeyboardHeatmap messages={messages} />
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
