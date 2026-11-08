import type { Metadata } from 'next';
import Navbar from '../../components/Navbar/Navbar';
import RoomExplorer from '../../components/rooms/RoomExplorer';
import RoomsAutoRefresh from '../../components/rooms/RoomsAutoRefresh';
import { listPublicRoomsForPage } from '../../db/queries/rooms';
import { getSession } from '../../lib/session';
import { getLocale, pick } from '../../i18n/messages';
import { parseExplorerFilters } from '../../lib/explorer-filters';
import { SITE } from '../../data/site';

export const metadata: Metadata = {
  title: `${SITE.name} // Room explorer`,
};

/**
 * JOIN-02: the public room explorer. The server component fetches public
 * rooms in `en_attente` (language/complexity filters validated by
 * `parseExplorerFilters`), the filter links navigate with `searchParams`,
 * and `RoomsAutoRefresh` re-renders the list every ~5 s without a manual
 * reload.
 */
export default async function RoomsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[]; complexity?: string | string[] }>;
}) {
  const filters = parseExplorerFilters(await searchParams);
  const session = await getSession();
  const locale = await getLocale();
  const messages = pick(locale);

  const rooms = await listPublicRoomsForPage({
    textLanguage: filters.lang ?? undefined,
    textComplexity: filters.complexity ?? undefined,
  });

  return (
    <>
      <Navbar
        user={session ? { username: session.username } : null}
        locale={locale}
        messages={messages}
      />
      <main className="w-full bg-surface pt-20 pb-12 min-h-screen">
        <div className="mx-auto w-full max-w-[1200px] px-margin py-space-lg sm:px-margin-tablet">
          <div className="flex flex-col gap-space-md">
            <div className="flex items-center justify-end">
              <RoomsAutoRefresh messages={messages} />
            </div>
            <RoomExplorer
              rooms={rooms}
              filters={filters}
              viewerIsGuest={session === null}
              messages={messages}
            />
          </div>
        </div>
      </main>
    </>
  );
}
