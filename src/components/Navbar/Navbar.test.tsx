import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { MESSAGES } from '../../i18n/messages';

// The selector's server action imports next/cache + next/headers (Node-only);
// keep them out of the jsdom run, mirroring App.test.tsx's db mock.
jest.mock('../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

// The navbar now embeds the theme selector (DES-05); provide a context stub.
jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({ preference: 'system', theme: 'dark', setPreference: jest.fn() }),
}));

/**
 * I18N-02: the navbar renders the FR/EN selector with real labels and marks
 * the active locale.
 */
describe('Navbar locale selector (I18N-02)', () => {
  test('renders FR and EN labels with the current locale pressed', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} />);

    // WCAG 2.5.3 (Label in Name): the aria-label carries the visible text
    // too ("… (FR)"), so the assertions match against the full phrase.
    const frButton = screen.getByRole('button', {
      name: new RegExp(MESSAGES.fr['locale.switchToFr']),
    });
    const enButton = screen.getByRole('button', {
      name: new RegExp(MESSAGES.fr['locale.switchToEn']),
    });

    expect(frButton).toHaveTextContent('FR');
    expect(enButton).toHaveTextContent('EN');
    expect(frButton).toHaveAttribute('aria-pressed', 'true');
    expect(enButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks EN as active when the locale is en', () => {
    render(<Navbar locale="en" messages={MESSAGES.en} />);

    expect(
      screen.getByRole('button', { name: new RegExp(MESSAGES.en['locale.switchToEn']) }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: new RegExp(MESSAGES.en['locale.switchToFr']) }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('still renders the guild chrome and account entry', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} user={{ username: 'ada' }} />);

    expect(screen.getByText('Dwarven Scriptures')).toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
  });
});
