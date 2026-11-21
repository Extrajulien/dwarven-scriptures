import type { Metadata } from 'next';
import Footer from '../../components/Footer';
import Navbar from '../../components/Navbar/Navbar';
import PreviousRacesArchive from '../../components/previousRaces/PreviousRacesArchive';
import { SITE } from '../../data/site';
import { getArchiveSummary, listFinishedRacesArchive } from '../../db/queries/races';
import { getUserFullProfile } from '../../db/queries/users';
import { getLocale, pick } from '../../i18n/messages';
import { parseArchiveFilters } from '../../lib/archive-filters';
import { getSession } from '../../lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.previousRaces']}` };
}

/**
 * "Previous races" archive ledger, backed by the persisted races. The server
 * component resolves the viewer (a guest sees public races only), parses the
 * scope/search/page filters and fetches the paginated archive plus the
 * viewer's summary metrics. Authorization lives in `listFinishedRacesArchive`
 * (private races are only listed for their participants).
 */
export default async function PreviousRacesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[]; q?: string | string[]; page?: string | string[] }>;
}) {
  const filters = parseArchiveFilters(await searchParams);
  const session = await getSession();
  const locale = await getLocale();
  const messages = pick(locale);

  // The archive query filters by the internal user id, so translate the
  // session's public id through the profile lookup (mirrors the account page).
  const viewerUserId = session
    ? ((await getUserFullProfile({ publicId: session.publicId }).catch(() => null))?.id ?? null)
    : null;

  const visibility =
    filters.scope === 'public' ? 'public' : filters.scope === 'private' ? 'private' : undefined;

  const page = await listFinishedRacesArchive({
    viewerUserId,
    visibility,
    participatedOnly: filters.scope === 'mine',
    query: filters.query === '' ? undefined : filters.query,
    page: filters.page,
  });
  const summary = viewerUserId !== null ? await getArchiveSummary(viewerUserId) : null;

  return (
    <>
      <Navbar
        user={session ? { username: session.username } : null}
        locale={locale}
        messages={messages}
      />

      <main className="min-h-[calc(100vh-3rem)] w-full bg-surface pb-16 pt-20">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-margin md:px-margin-desktop">
          <PreviousRacesArchive
            page={page}
            summary={summary}
            filters={filters}
            viewerIsGuest={session === null}
            locale={locale}
            messages={messages}
          />
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
