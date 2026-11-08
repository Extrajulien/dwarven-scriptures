import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { MESSAGES } from '../../i18n/messages';
import type { ThemePreference } from '../../theme/theme';

// The selector's server action imports next/cache + next/headers (Node-only);
// keep them out of the jsdom run, mirroring Navbar.test.tsx.
jest.mock('../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

// DES-05: mock the theme hook so the navbar-level test drives the selector
// without a real ThemeProvider.
const mockSetPreference = jest.fn();
const mockUseTheme = jest.fn(() => ({
  preference: 'system' as ThemePreference,
  theme: 'dark' as const,
  setPreference: mockSetPreference,
}));

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => mockUseTheme(),
}));

/**
 * DES-05: the navbar renders the dwarf-styled Light / Dark / System selector
 * with real i18n labels, marks the active state and forwards clicks to the
 * theme context.
 */
describe('Navbar theme selector (DES-05)', () => {
  beforeEach(() => {
    mockSetPreference.mockClear();
    mockUseTheme.mockReturnValue({
      preference: 'system',
      theme: 'dark',
      setPreference: mockSetPreference,
    });
  });

  test('renders the three states with icons and i18n labels, no emojis', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} />);

    const group = screen.getByRole('group', { name: MESSAGES.fr['theme.group'] });
    expect(group).toBeInTheDocument();

    const light = screen.getByRole('button', { name: MESSAGES.fr['theme.switchToLight'] });
    const dark = screen.getByRole('button', { name: MESSAGES.fr['theme.switchToDark'] });
    const system = screen.getByRole('button', { name: MESSAGES.fr['theme.switchToSystem'] });

    expect(light).toHaveTextContent('light_mode');
    expect(dark).toHaveTextContent('dark_mode');
    expect(system).toHaveTextContent('desktop_windows');

    // No emoji glyphs inside the selector.
    expect(group.textContent ?? '').not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    );
  });

  test('marks the active preference and the English labels render too', () => {
    mockUseTheme.mockReturnValue({
      preference: 'dark',
      theme: 'dark',
      setPreference: mockSetPreference,
    });
    render(<Navbar locale="en" messages={MESSAGES.en} />);

    expect(
      screen.getByRole('button', { name: MESSAGES.en['theme.switchToDark'] }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: MESSAGES.en['theme.switchToLight'] }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a state forwards the preference to the theme context', () => {
    render(<Navbar locale="fr" messages={MESSAGES.fr} />);

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.fr['theme.switchToLight'] }));
    expect(mockSetPreference).toHaveBeenCalledWith('light');

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.fr['theme.switchToDark'] }));
    expect(mockSetPreference).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.fr['theme.switchToSystem'] }));
    expect(mockSetPreference).toHaveBeenCalledWith('system');
  });
});
