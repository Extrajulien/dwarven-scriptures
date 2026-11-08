import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  closeRoom,
  kickMember,
  leaveRoom,
  transferHost,
} from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RoomSnapshot, RoomSocketState } from '../../realtime/client-types';
import RoomLobby, { type LobbyViewer } from './RoomLobby';

const messages = MESSAGES.fr;
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const ADA_ID = '22222222-2222-4222-8222-222222222222';
const BOB_ID = '33333333-3333-4333-8333-333333333333';
const GUEST_TOKEN = '44444444-4444-4444-8444-444444444444';
const JOINED_AT = '2026-11-07T21:00:00.000Z';

const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

let socketState: RoomSocketState = { status: 'idle', snapshot: null, error: null };

jest.mock('../../realtime/useRoomSocket', () => ({
  useRoomSocket: () => ({
    ...socketState,
    join: mockJoin,
    leave: mockLeave,
    sendPing: jest.fn(),
  }),
}));

jest.mock('../../app/rooms/actions', () => ({
  closeRoom: jest.fn(),
  kickMember: jest.fn(),
  leaveRoom: jest.fn(),
  transferHost: jest.fn(),
  generateInvitationLinks: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: mockRefresh }),
}));

const mockedCloseRoom = jest.mocked(closeRoom);
const mockedKickMember = jest.mocked(kickMember);
const mockedLeaveRoom = jest.mocked(leaveRoom);
const mockedTransferHost = jest.mocked(transferHost);

function makeSnapshot(): RoomSnapshot {
  return {
    room: {
      publicId: ROOM_ID,
      code: 'DWRF42',
      visibility: 'public',
      status: 'en_attente',
      capacity: 6,
      config: defaultRoomConfig,
      host: { publicId: ADA_ID, username: 'ada' },
      createdAt: '2026-11-07T20:00:00.000Z',
    },
    members: [
      {
        kind: 'user',
        publicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: true,
      },
      {
        kind: 'user',
        publicId: BOB_ID,
        username: 'bob',
        pfpUrl: null,
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: false,
      },
      {
        kind: 'guest',
        guestToken: GUEST_TOKEN,
        nickname: null,
        role: 'spectator',
        joinedAt: JOINED_AT,
        connected: false,
      },
    ],
  };
}

const hostViewer: LobbyViewer = { kind: 'user', publicId: ADA_ID, username: 'ada' };
const memberViewer: LobbyViewer = { kind: 'user', publicId: BOB_ID, username: 'bob' };
const guestViewer: LobbyViewer = {
  kind: 'guest',
  nickname: 'Nain',
  guestToken: '55555555-5555-4555-8555-555555555555',
};

function renderOpenLobby(viewer: LobbyViewer, invitations: null = null) {
  socketState = { status: 'open', snapshot: makeSnapshot(), error: null };
  return render(
    <RoomLobby
      roomPublicId={ROOM_ID}
      roomCode="DWRF42"
      invitationToken={null}
      viewer={viewer}
      initialInvitations={invitations}
      messages={messages}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  socketState = { status: 'idle', snapshot: null, error: null };
});

describe('lobby snapshot rendering (SALLE-01, CONF-12)', () => {
  test('renders the room code, capacity, config and live member list', () => {
    renderOpenLobby(hostViewer);

    expect(screen.getByText('DWRF42')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-capacity')).toHaveTextContent('2 / 6');
    expect(screen.getAllByText('ada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bob').length).toBeGreaterThan(0);
    // Guest without a live nickname shows the placeholder (AUTH-02/03).
    expect(screen.getByText(messages['lobby.guestPlaceholder'])).toBeInTheDocument();
    // Config summary comes from the snapshot (CONF-12).
    expect(screen.getByText(messages['lobby.config.language'])).toBeInTheDocument();
    expect(screen.getByText(messages['lobby.lang.fr'])).toBeInTheDocument();
    // The host member carries the host role chip.
    expect(screen.getAllByText(messages['lobby.role.host']).length).toBeGreaterThan(0);
    expect(mockJoin).toHaveBeenCalledWith({ code: 'DWRF42' });
  });

  test('joins by invitation token when one is provided (SALLE-04)', () => {
    socketState = { status: 'open', snapshot: makeSnapshot(), error: null };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken="tok123"
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
      />,
    );
    expect(mockJoin).toHaveBeenCalledWith({ invitationToken: 'tok123' });
  });
});

describe('host controls (SALLE-07, SEC-01)', () => {
  test('are only rendered for the host — members and guests never see them', () => {
    const memberRender = renderOpenLobby(memberViewer);
    expect(screen.queryByText(messages['lobby.hostControlsTitle'])).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['lobby.kick'] })).not.toBeInTheDocument();
    memberRender.unmount();

    renderOpenLobby(guestViewer);
    expect(screen.queryByText(messages['lobby.hostControlsTitle'])).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['lobby.kick'] })).not.toBeInTheDocument();
  });

  test('kicks a member after the two-step confirm', async () => {
    renderOpenLobby(hostViewer);

    const kickButtons = screen.getAllByRole('button', { name: messages['lobby.kick'] });
    expect(kickButtons.length).toBeGreaterThan(0);
    fireEvent.click(kickButtons[0]);

    expect(screen.getByText(messages['lobby.confirmKick'])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));

    await waitFor(() =>
      expect(mockedKickMember).toHaveBeenCalledWith({
        roomPublicId: ROOM_ID,
        targetUserId: BOB_ID,
      }),
    );
  });

  test('cancel aborts the kick', () => {
    renderOpenLobby(hostViewer);

    fireEvent.click(screen.getAllByRole('button', { name: messages['lobby.kick'] })[0]);
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.cancel'] }));

    expect(screen.queryByText(messages['lobby.confirmKick'])).not.toBeInTheDocument();
    expect(mockedKickMember).not.toHaveBeenCalled();
  });

  test('closes the room after the two-step confirm and stops the socket', async () => {
    renderOpenLobby(hostViewer);

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.closeRoom'] }));
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));

    await waitFor(() =>
      expect(mockedCloseRoom).toHaveBeenCalledWith({ roomPublicId: ROOM_ID }),
    );
    expect(mockLeave).toHaveBeenCalled();
  });

  test('transfers the host to a picked human member (SALLE-08)', async () => {
    renderOpenLobby(hostViewer);

    fireEvent.change(screen.getByLabelText(messages['lobby.transferHostPicker']), {
      target: { value: BOB_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.transferHostButton'] }));

    await waitFor(() =>
      expect(mockedTransferHost).toHaveBeenCalledWith({
        roomPublicId: ROOM_ID,
        targetUserId: BOB_ID,
      }),
    );
  });
});

describe('leave, kick notice and closed screen', () => {
  test('leaves after confirm and navigates home', async () => {
    renderOpenLobby(memberViewer);

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.leave'] }));
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));

    await waitFor(() =>
      expect(mockedLeaveRoom).toHaveBeenCalledWith({ roomPublicId: ROOM_ID }),
    );
    expect(mockLeave).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('a kicked member is redirected home with a notice (SALLE-07)', async () => {
    socketState = {
      status: 'closed',
      snapshot: null,
      error: { code: 'kicked', message: 'you were kicked from the room', fatal: true },
    };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/?notice=kicked'));
  });

  test('roomClosed shows the closed screen', () => {
    socketState = { status: 'closed', snapshot: null, error: null };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
      />,
    );

    expect(screen.getByText(messages['lobby.closed.title'])).toBeInTheDocument();
    expect(screen.getByText(messages['lobby.closed.body'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages['lobby.backHome'] })).toBeInTheDocument();
  });

  test('a fatal join error shows the typed message', () => {
    socketState = {
      status: 'closed',
      snapshot: null,
      error: { code: 'room_full', message: 'room full', fatal: true },
    };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
      />,
    );

    expect(screen.getByText(messages['lobby.error.roomFull'])).toBeInTheDocument();
  });
});
