import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { MESSAGES } from '../../i18n/messages';

// The selector's server action imports next/cache + next/headers (Node-only);
// keep them out of the jsdom run, mirroring App.test.tsx's db mock.
jest.mock('../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

/**
 * I18N-02: the navbar renders the FR/EN selector with real labels and marks
 * the active locale.
 */
describe('Navbar locale selector (I18N-02)', () => {
  test('renders FR and EN labels with the current locale pressed', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} />);

    const frButton = screen.getByRole('button', {
      name: MESSAGES.fr['locale.switchToFr'],
    });
    const enButton = screen.getByRole('button', {
      name: MESSAGES.fr['locale.switchToEn'],
    });

    expect(frButton).toHaveTextContent('FR');
    expect(enButton).toHaveTextContent('EN');
    expect(frButton).toHaveAttribute('aria-pressed', 'true');
    expect(enButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks EN as active when the locale is en', () => {
    render(<Navbar locale="en" messages={MESSAGES.en} />);

    expect(
      screen.getByRole('button', { name: MESSAGES.en['locale.switchToEn'] }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: MESSAGES.en['locale.switchToFr'] }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('still renders the guild chrome and account entry', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} user={{ username: 'ada' }} />);

    expect(screen.getByText('Dwarven Scriptures')).toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
  });
});
