import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { PublicRoomForPage } from '../../db/queries/rooms';
import RoomExplorer from './RoomExplorer';

const messages = MESSAGES.fr;

// The explorer imports server actions (join button); keep pg out of jsdom.
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

test('renders rooms with participants/capacity, host, language, complexity and status (JOIN-02)', () => {
  render(
    <RoomExplorer
      rooms={[
        room({}),
        room({
          publicId: '22222222-2222-4222-8222-222222222222',
          hostName: 'bob',
          participantCount: 9,
          capacity: 12,
          textLanguage: 'en',
          textComplexity: 'difficile',
        }),
      ]}
      filters={{ lang: null, complexity: null }}
      viewerIsGuest={false}
      messages={messages}
    />,
  );

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

test('filter links preserve the other filter and mark the active one', () => {
  render(
    <RoomExplorer
      rooms={[room({})]}
      filters={{ lang: 'fr', complexity: null }}
      viewerIsGuest={false}
      messages={messages}
    />,
  );

  const languageGroup = screen.getByRole('group', {
    name: messages['explorer.filters.language'],
  });
  const complexityGroup = screen.getByRole('group', {
    name: messages['explorer.filters.complexity'],
  });

  expect(within(languageGroup).getByRole('link', { name: messages['lobby.lang.fr'] })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(within(languageGroup).getByRole('link', { name: messages['lobby.lang.en'] })).toHaveAttribute(
    'href',
    '/rooms?lang=en',
  );
  expect(
    within(languageGroup).getByRole('link', { name: messages['explorer.filters.all'] }),
  ).toHaveAttribute('href', '/rooms');
  expect(
    within(complexityGroup).getByRole('link', { name: messages['lobby.complexity.moyen'] }),
  ).toHaveAttribute('href', '/rooms?lang=fr&complexity=moyen');
  expect(
    within(complexityGroup).getByRole('link', { name: messages['explorer.filters.all'] }),
  ).toHaveAttribute('href', '/rooms?lang=fr');
});

test('shows the signed-in empty state with the forge hint', () => {
  render(
    <RoomExplorer
      rooms={[]}
      filters={{ lang: null, complexity: null }}
      viewerIsGuest={false}
      messages={messages}
    />,
  );
  expect(screen.getByText(messages['explorer.empty'])).toBeInTheDocument();
});

test('shows the guest empty state without the forge hint', () => {
  render(
    <RoomExplorer
      rooms={[]}
      filters={{ lang: null, complexity: null }}
      viewerIsGuest={true}
      messages={messages}
    />,
  );
  expect(screen.getByText(messages['explorer.emptyGuest'])).toBeInTheDocument();
});
