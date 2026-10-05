import { render, screen } from '@testing-library/react';
import App from './App.jsx';

test('renders the guild stronghold heading', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: /ironvein quarry/i })
  ).toBeInTheDocument();
});

test('renders the expedition roster section', () => {
  render(<App />);
  expect(screen.getByText(/miner_ranks_&_typist_roster/i)).toBeInTheDocument();
});
