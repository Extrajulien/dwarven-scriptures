import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { PublicRoomForPage } from '../../db/queries/rooms';
import { MESSAGES } from '../../i18n/messages';
import PublicRacesList from './PublicRacesList';

const messages = MESSAGES.fr;

// The join button imports server actions (which import the db client) and
// next/navigation; keep pg (Node-only) out of the jsdom test run.
jest.mock('../../db/index', () => ({ db: {} }));
jest.mock('../../app/rooms/actions', () => ({
  joinRoomByCode: jest.fn(),
}));

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  );
  MockLink.displayName = 'MockLink';
  return { __esModule: true, default: MockLink };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

function room(overrides: Partial<PublicRoomForPage>): PublicRoomForPage {
  return {
    publicId: '11111111-1111-4111-8111-111111111111',
    code: 'ABCDEF',
    status: 'en_attente',
    capacity: 10,
    hostName: 'ada',
    participantCount: 3,
    textLanguage: 'fr',
    textComplexity: 'moyen',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('renders rooms with code, host, language, complexity, participants and status (JOIN-02)', () => {
  render(
    <PublicRacesList
      rooms={[
        room({}),
        room({
          publicId: '22222222-2222-4222-8222-222222222222',
          code: 'GHJKLM',
          hostName: 'bob',
          participantCount: 9,
          capacity: 12,
          textLanguage: 'en',
          textComplexity: 'difficile',
        }),
      ]}
      viewerIsGuest={false}
      messages={messages}
    />,
  );

  expect(screen.getByText('ABCDEF')).toBeInTheDocument();
  expect(screen.getByText('GHJKLM')).toBeInTheDocument();
  expect(screen.getByText('ada')).toBeInTheDocument();
  expect(screen.getByText('bob')).toBeInTheDocument();
  expect(screen.getByText('3 / 10')).toBeInTheDocument();
  expect(screen.getByText('9 / 12')).toBeInTheDocument();
  expect(screen.getAllByText(messages['lobby.lang.fr']).length).toBeGreaterThan(0);
  expect(screen.getAllByText(messages['lobby.lang.en']).length).toBeGreaterThan(0);
  expect(screen.getAllByText(messages['lobby.complexity.moyen']).length).toBeGreaterThan(0);
  expect(screen.getAllByText(messages['lobby.complexity.difficile']).length).toBeGreaterThan(0);
  expect(screen.getAllByText(messages['lobby.status.en_attente']).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: messages['explorer.join'] })).toHaveLength(2);
});

test('shows the empty state with a create link for signed-in users (SALLE-01)', () => {
  render(<PublicRacesList rooms={[]} viewerIsGuest={false} messages={messages} />);

  expect(screen.getByText(messages['raceHome.empty'])).toBeInTheDocument();
  expect(screen.getByRole('link', { name: messages['raceHome.createOne'] })).toHaveAttribute(
    'href',
    '#create-room',
  );
});

test('shows the empty state with a login link for guests (AUTH-03)', () => {
  render(<PublicRacesList rooms={[]} viewerIsGuest={true} messages={messages} />);

  expect(screen.getByText(messages['raceHome.empty'])).toBeInTheDocument();
  expect(screen.getByRole('link', { name: messages['raceHome.createOne'] })).toHaveAttribute(
    'href',
    '/login',
  );
});
