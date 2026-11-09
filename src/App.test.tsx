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

test('renders the race cavern with quick play, join and the guest create empty state', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(screen.getByText(/caverne de course/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /démarrer une course/i })).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 2, name: /fonder une salle/i })
  ).toBeInTheDocument();
});

test('guests never see the create-room form (AUTH-03)', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(screen.queryByText(MESSAGES.fr['createRoom.visibilityLabel'])).not.toBeInTheDocument();
  expect(screen.queryByText(MESSAGES.fr['createRoom.capacityLabel'])).not.toBeInTheDocument();
});

test('signed-in users see the create-room card (SALLE-01/05)', () => {
  render(<App messages={MESSAGES.fr} locale="fr" user={{ username: 'ada' }} />);
  expect(screen.getByText(MESSAGES.fr['createRoom.visibilityLabel'])).toBeInTheDocument();
  expect(screen.getByText(MESSAGES.fr['createRoom.capacityLabel'])).toBeInTheDocument();
  expect(screen.getByText(MESSAGES.fr['createRoom.roleLabel'])).toBeInTheDocument();
});

test('renders the locale selector in the navbar (I18N-02)', () => {
  render(<App messages={MESSAGES.fr} locale="fr" />);
  expect(screen.getByRole('button', { name: MESSAGES.fr['locale.switchToFr'] })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: MESSAGES.fr['locale.switchToEn'] })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
