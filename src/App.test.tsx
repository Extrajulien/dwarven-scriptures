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
