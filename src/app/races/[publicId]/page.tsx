import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '../../../components/Navbar/Navbar';
import ButtonSecondary from '../../../components/ButtonSecondary';
import Footer from '../../../components/Footer';
import SectionHeader from '../../../components/SectionHeader';
import RaceKeyboardHeatmap from '../../../components/race/RaceKeyboardHeatmap';
import ResultsPodium from '../../../components/race/ResultsPodium';
import ResultsTable from '../../../components/race/ResultsTable';
import ResultsWpmChart from '../../../components/race/ResultsWpmChart';
import { getRaceForReplay } from '../../../db/queries/races';
import { formatDateTime, formatDurationMmSs, formatNumber } from '../../../i18n/format';
import { getLocale, pick } from '../../../i18n/messages';
import { getSession } from '../../../lib/session';
import type { RaceResultEntry } from '../../../realtime/protocol';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: messages['pageTitle.raceReplay'] };
}

/**
 * Persisted race replay (HIST-02): clicking a history row re-displays the
 * full results screen — podium, complete table and the WPM-over-time chart —
 * from the persisted race (RES-05). The keyboard heatmap is per-race and
 * client-side only (RES-03): the honest "unavailable" state is shown here.
 * Unknown races answer 404.
 */
export default async function RaceReplayPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const race = await getRaceForReplay(publicId);
  if (!race) {
    notFound();
  }

  const session = await getSession();
  const locale = await getLocale();
  const messages = pick(locale);

  const results: RaceResultEntry[] = race.results.map((participant) => ({
    participantId: participant.participantId,
    displayName: participant.displayName,
    kind: participant.kind,
    wpm: participant.wpm,
    rawWpm: participant.rawWpm,
    accuracy: participant.accuracy,
    errors: participant.errors,
    status: participant.status,
    finishedAtMs: participant.finishedAtMs,
    rank: participant.rank,
    wpmSeries: participant.wpmSeries,
  }));
  const pfpUrls: Record<string, string | null> = {};
  for (const participant of race.results) {
    pfpUrls[participant.participantId] = participant.pfpUrl;
  }

  // The viewer's own line is highlighted when they took part in the race.
  const localParticipantId = session?.publicId ?? '';

  return (
    <>
      <Navbar
        user={session ? { username: session.username } : null}
        locale={locale}
        messages={messages}
      />

      <main className="min-h-[calc(100vh-3rem)] w-full bg-surface pb-16 pt-20">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-space-md px-margin py-space-lg sm:px-margin-tablet">
          <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
            <SectionHeader
              title={messages['results.title']}
              right={
                <ButtonSecondary href={session ? '/account' : '/'} className="shrink-0">
                  {session ? messages['raceReplay.back'] : messages['lobby.backHome']}
                </ButtonSecondary>
              }
            />
            <dl className="flex flex-wrap gap-x-space-lg gap-y-space-xs border-b border-dwarf-border pb-space-md font-label-sm text-label-sm">
              <div className="flex items-baseline gap-space-xs">
                <dt className="uppercase text-dwarf-parchmentMuted">
                  {messages['raceReplay.date']}
                </dt>
                <dd className="text-dwarf-parchment">{formatDateTime(race.finishedAt, locale)}</dd>
              </div>
              <div className="flex items-baseline gap-space-xs">
                <dt className="uppercase text-dwarf-parchmentMuted">
                  {messages['raceReplay.duration']}
                </dt>
                <dd className="text-dwarf-parchment">
                  {formatDurationMmSs(race.durationMs, locale)} (
                  {formatNumber(race.durationMs, locale)} ms)
                </dd>
              </div>
              <div className="flex items-baseline gap-space-xs">
                <dt className="uppercase text-dwarf-parchmentMuted">
                  {messages['raceReplay.language']}
                </dt>
                <dd className="uppercase text-dwarf-parchment">{race.textLanguage}</dd>
              </div>
            </dl>

            <ResultsPodium results={results} messages={messages} locale={locale} pfpUrls={pfpUrls} />
            <ResultsTable
              results={results}
              localParticipantId={localParticipantId}
              messages={messages}
              locale={locale}
              pfpUrls={pfpUrls}
            />
          </section>

          <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
            <ResultsWpmChart results={results} messages={messages} locale={locale} />
            {/* RES-03: the heatmap comes from the local typing session of the
                race itself; a persisted replay has no per-key data, so the
                honest unavailable state is shown. */}
            <RaceKeyboardHeatmap keyErrors={null} messages={messages} locale={locale} />
          </div>

          <section className="rounded bg-surface-container-lowest p-space-lg shadow-xl">
            <h2 className="font-label-md text-label-md uppercase text-primary">
              {messages['raceReplay.textLabel']}
            </h2>
            <p className="mt-space-sm whitespace-pre-wrap break-words font-body-sm text-body-sm leading-relaxed text-dwarf-parchment">
              {race.textBody}
            </p>
          </section>

          {session && (
            <div className="flex justify-end">
              <Link
                href="/account"
                className="font-label-sm text-label-sm uppercase text-primary underline-offset-4 hover:underline"
              >
                {messages['raceReplay.back']}
              </Link>
            </div>
          )}
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
