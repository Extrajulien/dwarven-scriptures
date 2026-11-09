import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import TypingZone, {
  PROGRESS_FLUSH_INTERVAL_MS,
  shouldFlush,
} from './TypingZone';

/**
 * COURSE-04 + PERF-02: the typing zone renders the three character states
 * with a caret (free advancement past marked errors in accumulate mode,
 * blocked caret in stop mode), drives the pure reducer from keyboard events,
 * ignores paste, throttles progress sends to one per 250 ms (with trailing +
 * completion + unmount flushes) and renders the fr i18n labels.
 */

const messages = MESSAGES.fr;

function renderZone(
  props: Partial<Parameters<typeof TypingZone>[0]> = {},
): { onProgress: jest.Mock } {
  const onProgress = jest.fn();
  render(
    <TypingZone
      text="bonjour"
      errorMode="accumulate"
      enabled
      messages={messages}
      onProgress={onProgress}
      {...props}
    />,
  );
  return { onProgress };
}

function typeKey(key: string) {
  fireEvent.keyDown(screen.getByTestId('typing-input'), { key });
}

function charState(index: number): string | null {
  return screen
    .getByTestId('typing-text')
    .querySelector(`[data-char-index="${index}"]`)
    ?.getAttribute('data-state') ?? null;
}

describe('shouldFlush (pure throttle rule, PERF-02)', () => {
  test('flushes on the first call and once per window afterwards', () => {
    expect(shouldFlush(0, null)).toBe(true);
    expect(shouldFlush(100, 0)).toBe(false);
    expect(shouldFlush(249, 0)).toBe(false);
    expect(shouldFlush(250, 0)).toBe(true);
    expect(shouldFlush(10_000, 9_750)).toBe(true);
  });
});

describe('character states and caret (COURSE-04)', () => {
  test('renders every character as upcoming with the caret on the first', () => {
    renderZone();
    expect(screen.getByTestId('typing-text').children).toHaveLength(7);
    expect(charState(0)).toBe('upcoming');
    expect(charState(6)).toBe('upcoming');
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('0');
  });

  test('correct keystrokes validate the prefix and move the caret', () => {
    renderZone();
    typeKey('b');
    typeKey('o');
    expect(charState(0)).toBe('correct');
    expect(charState(1)).toBe('correct');
    expect(charState(2)).toBe('upcoming');
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('2');
  });

  test('accumulate mode marks a wrong character and advances past it (CONF-08)', () => {
    renderZone();
    typeKey('x'); // text starts with 'b'
    expect(charState(0)).toBe('incorrect');
    // The caret moved PAST the error (free advancement).
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('1');
    // The next keystroke compares against the ORIGINAL position 1 ('o').
    typeKey('o');
    expect(charState(1)).toBe('correct');
    expect(charState(0)).toBe('incorrect'); // the error stays marked
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('2');
    // Progress is pinned by the pending error.
    expect(screen.getByText('Progression: 0 / 7')).toBeInTheDocument();
  });

  test('accumulate correction flow: backspace clears the mark, retyping validates', () => {
    renderZone();
    typeKey('x'); // error at 0, caret advances to 1
    typeKey('Backspace'); // caret back on 0, flag cleared → upcoming again
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('0');
    expect(charState(0)).toBe('upcoming');
    typeKey('b'); // correct now validates the position
    expect(charState(0)).toBe('correct');
    expect(screen.getByText('Progression: 1 / 7')).toBeInTheDocument();
    typeKey('o');
    expect(charState(1)).toBe('correct');
    expect(screen.getByText('Progression: 2 / 7')).toBeInTheDocument();
  });

  test('accumulate finish requires correcting the remaining error', () => {
    renderZone({ text: 'ab' });
    typeKey('x'); // error at 0, caret → 1
    typeKey('b'); // correct at 1, caret → 2 (end of text)
    // The caret sits at the end (trailing caret) and the race is NOT over.
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('2');
    expect(screen.queryByText(messages['race.completeNotice'])).not.toBeInTheDocument();
    expect(charState(0)).toBe('incorrect');

    // Correct the error: backspace to it, retype, finish.
    typeKey('Backspace');
    typeKey('Backspace');
    typeKey('a');
    typeKey('b');
    expect(screen.getByText(messages['race.completeNotice'])).toBeInTheDocument();
    expect(charState(0)).toBe('correct');
    expect(charState(1)).toBe('correct');
  });

  test('stop mode blocks silently: the position is never marked incorrect', () => {
    renderZone({ errorMode: 'stop' });
    typeKey('x');
    expect(charState(0)).toBe('upcoming');
    // The caret does NOT advance in stop mode.
    expect(screen.getByTestId('typing-text').querySelector('[data-caret="true"]')?.getAttribute('data-char-index')).toBe('0');
    typeKey('b');
    expect(charState(0)).toBe('correct');
  });
});

describe('input behaviour', () => {
  test('the hidden input is accessible, auto-focused and labelled (fr bag)', () => {
    renderZone();
    const input = screen.getByTestId('typing-input');
    expect(input).toHaveAttribute('aria-label', messages['race.typingInputLabel']);
    expect(input).toHaveFocus();
  });

  test('paste is intercepted and ignored', () => {
    const { onProgress } = renderZone();
    fireEvent.paste(screen.getByTestId('typing-input'), {
      clipboardData: { getData: () => 'bonjour' },
    });
    expect(screen.getByText('Progression: 0 / 7')).toBeInTheDocument();
    expect(onProgress).not.toHaveBeenCalled();
  });

  test('modifier combinations are ignored (no accidental validation)', () => {
    renderZone();
    fireEvent.keyDown(screen.getByTestId('typing-input'), { key: 'b', ctrlKey: true });
    expect(charState(0)).toBe('upcoming');
  });

  test('disabled zone (countdown) ignores keystrokes', () => {
    const { onProgress } = renderZone({ enabled: false });
    const input = screen.getByTestId('typing-input');
    expect(input).toBeDisabled();
    typeKey('b');
    expect(charState(0)).toBe('upcoming');
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('throttled progress sends (PERF-02)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('at most one message per 250 ms window, with a trailing flush', () => {
    const { onProgress } = renderZone({ text: 'abcdef' });

    typeKey('a'); // first keystroke: outside any window → flush
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 1,
      correctKeystrokes: 1,
      totalKeystrokes: 1,
    });

    typeKey('b'); // inside the window → no send yet
    expect(onProgress).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(PROGRESS_FLUSH_INTERVAL_MS);
    });
    // The window closed: the pending counters were flushed exactly once.
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 2,
      correctKeystrokes: 2,
      totalKeystrokes: 2,
    });

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  test('a burst of keystrokes never exceeds the window rate', () => {
    const { onProgress } = renderZone({ text: 'abcdefghij' });
    typeKey('a');
    typeKey('b');
    typeKey('c');
    typeKey('d');
    expect(onProgress).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(PROGRESS_FLUSH_INTERVAL_MS);
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 4,
      correctKeystrokes: 4,
      totalKeystrokes: 4,
    });
  });

  test('completion flushes immediately, bypassing the window', () => {
    const { onProgress } = renderZone({ text: 'ab' });
    typeKey('a');
    expect(onProgress).toHaveBeenCalledTimes(1);
    typeKey('b'); // completes the text → final flush right now
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 2,
      correctKeystrokes: 2,
      totalKeystrokes: 2,
    });
    expect(screen.getByText(messages['race.completeNotice'])).toBeInTheDocument();

    // Keystrokes after completion are ignored.
    typeKey('c');
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  test('unmount flushes a pending trailing update', () => {
    const onProgress = jest.fn();
    const { unmount } = render(
      <TypingZone
        text="abcdef"
        errorMode="accumulate"
        enabled
        messages={messages}
        onProgress={onProgress}
      />,
    );
    typeKey('a'); // flushed immediately
    typeKey('b'); // pending (inside the window)
    expect(onProgress).toHaveBeenCalledTimes(1);
    unmount();
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 2,
      correctKeystrokes: 2,
      totalKeystrokes: 2,
    });
  });

  test('errors are counted in the sent totals (stop mode)', () => {
    const { onProgress } = renderZone({ text: 'ab', errorMode: 'stop' });
    typeKey('x'); // wrong attempt
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 1,
    });
    typeKey('a');
    act(() => {
      jest.advanceTimersByTime(PROGRESS_FLUSH_INTERVAL_MS);
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      validatedChars: 1,
      correctKeystrokes: 1,
      totalKeystrokes: 2,
    });
  });
});

describe('live readout (client-side Annexe A stats, i18n fr)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows the fr labels and a WPM/accuracy consistent with the counters', () => {
    renderZone({ text: 'abcdefghij' });
    expect(screen.getByText(/MPM:/)).toBeInTheDocument();
    expect(screen.getByText(/Précision:/)).toBeInTheDocument();

    for (const char of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      typeKey(char);
    }
    // All 10 chars correct in the same instant: WPM is huge at t=0, but the
    // counters drive the math; advance one minute for a stable assertion.
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    // 10 chars ÷ 5 ÷ 1 min = 2 WPM; accuracy 10/10 = 100 %.
    expect(screen.getByTestId('typing-wpm')).toHaveTextContent('2');
    expect(screen.getByTestId('typing-accuracy')).toHaveTextContent('100');
  });

  test('a wrong keystroke lowers the accuracy readout (stop mode)', () => {
    renderZone({ text: 'ab', errorMode: 'stop' });
    typeKey('x'); // wrong (blocked)
    typeKey('a');
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    // 1 correct / 2 total → 50 %.
    expect(screen.getByTestId('typing-accuracy')).toHaveTextContent('50');
  });
});
