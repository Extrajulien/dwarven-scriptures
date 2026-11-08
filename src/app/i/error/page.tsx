import type { Metadata } from 'next';
import Navbar from '../../../components/Navbar/Navbar';
import ButtonSecondary from '../../../components/ButtonSecondary';
import { getLocale, pick } from '../../../i18n/messages';
import { SITE } from '../../../data/site';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.invitation']}` };
}

const REASON_KEYS = {
  unknown: 'inviteError.unknown',
  revoked: 'inviteError.revoked',
  used: 'inviteError.used',
  full: 'inviteError.full',
  kicked: 'inviteError.kicked',
  notJoinable: 'inviteError.notJoinable',
  unexpected: 'inviteError.unexpected',
} as const;

/**
 * Friendly error page for invitation links (SALLE-04): unknown, revoked,
 * used-by-someone-else, full, kicked or closed rooms all land here with the
 * localized message — no room existence is ever revealed beyond that.
 */
export default async function InvitationErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const rawReason = (await searchParams).reason;
  const reason =
    typeof rawReason === 'string' && rawReason in REASON_KEYS
      ? (rawReason as keyof typeof REASON_KEYS)
      : 'unknown';
  const locale = await getLocale();
  const messages = pick(locale);

  return (
    <>
      <Navbar user={null} locale={locale} messages={messages} />
      <main className="w-full bg-surface pt-20 pb-12 min-h-screen">
        <div className="mx-auto w-full max-w-[1200px] px-margin py-space-lg sm:px-margin-tablet">
          <section className="mx-auto flex w-full max-w-md flex-col items-center gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
            <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-error">
              {messages['inviteError.title']}
            </h1>
            <p role="alert" className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
              {messages[REASON_KEYS[reason]]}
            </p>
            <ButtonSecondary href="/" className="w-full">
              {messages['inviteError.home']}
            </ButtonSecondary>
          </section>
        </div>
      </main>
    </>
  );
}
