/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { AccountProfile } from '../../app/account/profile';
import { MESSAGES } from '../../i18n/messages';
import AccountStats from './AccountStats';

const messages = MESSAGES.fr;

const profile: AccountProfile = {
  username: 'ada',
  pfpUrl: null,
  createdAt: '2026-11-07T12:00:00.000Z',
  racesCompleted: 48,
  totalWords: '18540',
  bestWpm: 87.4,
  avgWpm: 76.5,
  wins: 23,
  avgAccuracy: 94.1,
  coins: '4820',
  gems: 12,
  linkedProviders: [],
};

describe('AccountStats (AUTH-06)', () => {
  test('renders the real wins and average-accuracy tiles next to the classic four', () => {
    render(<AccountStats profile={profile} locale="fr" messages={messages} />);

    expect(screen.getByText(messages['account.stats.tile.racesCompleted'])).toBeInTheDocument();
    expect(screen.getByText(messages['account.stats.tile.bestWpm'])).toBeInTheDocument();
    expect(screen.getByText(messages['account.stats.tile.avgWpm'])).toBeInTheDocument();
    expect(screen.getByText(messages['account.stats.tile.totalWords'])).toBeInTheDocument();
    expect(screen.getByText(messages['account.stats.tile.wins'])).toBeInTheDocument();
    expect(screen.getByText(messages['account.stats.tile.avgAccuracy'])).toBeInTheDocument();

    // Locale-formatted values (fr): the wins count and the derived accuracy.
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('94,1')).toBeInTheDocument();
  });

  test('renders a zero accuracy and zero wins honestly', () => {
    render(
      <AccountStats
        profile={{ ...profile, wins: 0, avgAccuracy: 0 }}
        locale="fr"
        messages={messages}
      />,
    );

    expect(screen.getByText('0,0')).toBeInTheDocument();
  });
});
