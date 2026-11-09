import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import { installMatchMedia } from '../../testing/matchMediaMock';
import MobileRaceGate, { MOBILE_RACE_MEDIA_QUERY } from './MobileRaceGate';

/**
 * DES-06: on mobile viewports the gate replaces its children (the typing
 * interaction) with the physical-keyboard notice; on desktop the children
 * render exactly as before. Detection is `matchMedia('(max-width: 767px)')`
 * driven, reacts to `change` AND `resize`, and the server/legacy default is
 * desktop (SSR-safe, no hydration mismatch).
 */

const messages = MESSAGES.fr;

function renderGate() {
  return render(
    <MobileRaceGate messages={messages}>
      <div data-testid="typing-zone">typing zone</div>
    </MobileRaceGate>,
  );
}

describe('MobileRaceGate (DES-06)', () => {
  test('uses the documented breakpoint: strictly below md (768 px)', () => {
    expect(MOBILE_RACE_MEDIA_QUERY).toBe('(max-width: 767px)');
  });

  test('desktop: children render exactly as before, no notice', () => {
    installMatchMedia(false);
    renderGate();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
  });

  test('mobile: the notice replaces the children (localized, i18n)', () => {
    installMatchMedia(true);
    renderGate();
    const notice = screen.getByTestId('mobile-race-notice');
    expect(notice).toHaveTextContent(messages['mobile.raceTitle']);
    expect(notice).toHaveTextContent(messages['mobile.raceBody']);
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });

  test('switching matchMedia re-renders in both directions', () => {
    const controller = installMatchMedia(false);
    renderGate();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();

    act(() => {
      controller.setMatches(true);
    });
    expect(screen.getByTestId('mobile-race-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();

    act(() => {
      controller.setMatches(false);
    });
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
  });

  test('a window resize that crosses the breakpoint re-renders (resize listener)', () => {
    const controller = installMatchMedia(true);
    renderGate();
    expect(screen.getByTestId('mobile-race-notice')).toBeInTheDocument();

    act(() => {
      // Cross the breakpoint without firing the `change` event: only the
      // resize listener can pick this up.
      controller.setMatchesSilently(false);
      controller.fireResize();
    });
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
  });

  test('no matchMedia: stays on desktop without crashing (SSR/legacy default)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    renderGate();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
  });
});
