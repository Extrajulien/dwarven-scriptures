import Navbar from '../components/Navbar/Navbar';
import Footer from '../components/Footer';
import ButtonPrimary from '../components/ButtonPrimary';
import ButtonSecondary from '../components/ButtonSecondary';
import JoinableRooms from '../components/home/JoinableRooms';
import { quickPlay } from './rooms/actions';
import { listPublicRoomsForPage } from '../db/queries/rooms';
import { getSession } from '../lib/session';
import { getLocale, pick } from '../i18n/messages';

/**
 * Landing page (`/`): a real entry point instead of the previous demo tiles.
 *
 * First section (hero) — left half is the "Strike the keys!" pitch with a
 * quick-play action (JOIN-03, server action), a host-a-room secondary action
 * and the live public-room count; the right half is the compact joinable
 * rooms list (JOIN-02). Below, a "how it works" strip explains the race loop
 * to new visitors.
 */
export default async function Page() {
  const [session, locale, rooms] = await Promise.all([
    getSession(),
    getLocale(),
    listPublicRoomsForPage(),
  ]);
  const messages = pick(locale);

  const steps = [
    { title: messages['home.how.step1.title'], body: messages['home.how.step1.body'] },
    { title: messages['home.how.step2.title'], body: messages['home.how.step2.body'] },
    { title: messages['home.how.step3.title'], body: messages['home.how.step3.body'] },
  ];

  return (
    <>
      <Navbar
        user={session ? { username: session.username } : null}
        locale={locale}
        messages={messages}
      />

      <main className="min-h-[calc(100vh-3rem)] w-full bg-surface pb-16 pt-20">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-space-xl px-margin py-space-lg sm:px-margin-tablet">
          {/* First section: hero */}
          <section className="grid grid-cols-1 items-stretch gap-space-lg lg:min-h-[90vh] lg:grid-cols-2">
            <div className="flex flex-col justify-center gap-space-md">
              <h1 className="font-display text-headline-xl-mobile uppercase tracking-wide text-primary sm:text-headline-xl">
                {messages['home.hero.title']}
              </h1>
              <p className="max-w-prose font-body-md text-body-md text-dwarf-parchmentMuted">
                {messages['home.hero.subtitle']}
              </p>

              <div className="flex flex-wrap items-center gap-space-sm pt-space-sm">
                <form action={quickPlay}>
                  <ButtonPrimary type="submit">
                    {messages['raceSection.quickPlayLabel']}
                  </ButtonPrimary>
                </form>
                <ButtonSecondary href="/race">
                  {messages['raceSection.createTitle']}
                </ButtonSecondary>
              </div>
            </div>

            <JoinableRooms rooms={rooms} messages={messages} />
          </section>

          {/* Second section: how it works */}
          <section
            className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
            aria-labelledby="how-it-works-title"
          >
            <h2
              id="how-it-works-title"
              className="font-display text-headline-md uppercase tracking-wide text-primary"
            >
              {messages['home.how.title']}
            </h2>
            <ol className="grid grid-cols-1 gap-space-md md:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-space-xs rounded bg-dwarf-slate p-space-md shadow-stone-inner"
                >
                  <span className="font-mono font-label-sm text-label-sm text-dwarf-gold">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-label-md uppercase tracking-wide text-on-surface">
                    {step.title}
                  </h3>
                  <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
