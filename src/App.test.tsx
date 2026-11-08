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

test('renders the guild stronghold heading', () => {
  render(<App messages={MESSAGES.fr} />);
  expect(
    screen.getByRole('heading', { name: /ironvein quarry/i })
  ).toBeInTheDocument();
});

test('renders the expedition roster section', () => {
  render(<App messages={MESSAGES.fr} />);
  expect(screen.getByText(/miner_ranks_&_typist_roster/i)).toBeInTheDocument();
});

test('renders the race cavern with quick play, join and the guest create empty state', () => {
  render(<App messages={MESSAGES.fr} />);
  expect(screen.getByText(/caverne de course/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /démarrer une course/i })).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 3, name: /fonder une salle/i })
  ).toBeInTheDocument();
});

test('guests never see the create-room form (AUTH-03)', () => {
  render(<App messages={MESSAGES.fr} />);
  expect(screen.queryByText(MESSAGES.fr['createRoom.visibilityLabel'])).not.toBeInTheDocument();
  expect(screen.queryByText(MESSAGES.fr['createRoom.capacityLabel'])).not.toBeInTheDocument();
});

test('signed-in users see the create-room card (SALLE-01/05)', () => {
  render(<App messages={MESSAGES.fr} user={{ username: 'ada' }} />);
  expect(screen.getByText(MESSAGES.fr['createRoom.visibilityLabel'])).toBeInTheDocument();
  expect(screen.getByText(MESSAGES.fr['createRoom.capacityLabel'])).toBeInTheDocument();
  expect(screen.getByText(MESSAGES.fr['createRoom.roleLabel'])).toBeInTheDocument();
});
