import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from './App';
import { MESSAGES } from './i18n/messages';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// The home shell imports server actions, which import the db client; keep
// pg (Node-only) out of the jsdom test run.
jest.mock('./db/index', () => ({ db: {} }));

// The navbar locale selector's server action imports next/cache + next/headers
// (Node-only); keep them out of the jsdom test run too.
jest.mock('./i18n/locale-actions', () => ({ setLocale: jest.fn() }));

// The navbar now embeds the theme selector (DES-05); provide a context stub.
jest.mock('./theme/ThemeProvider', () => ({
  useTheme: () => ({ preference: 'system', theme: 'dark', setPreference: jest.fn() }),
}));

test('renders the guild stronghold heading', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(
    screen.getByRole('heading', { name: /ironvein quarry/i })
  ).toBeInTheDocument();
});

test('renders the expedition roster section', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(screen.getByText(/rangs_des_mineurs_et_registre_des_typistes/i)).toBeInTheDocument();
});

test('renders the locale selector in the navbar (I18N-02)', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(
    screen.getByRole('button', { name: new RegExp(MESSAGES.fr['locale.switchToFr']) }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.getByRole('button', { name: new RegExp(MESSAGES.fr['locale.switchToEn']) }),
  ).toHaveAttribute('aria-pressed', 'false');
});
