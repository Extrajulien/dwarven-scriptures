import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  closeRoom,
  kickMember,
  leaveRoom,
  transferHost,
  updateRoomConfig,
} from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RoomConfig } from '../../db/schema';
import type { RaceSocketState, RaceView, RoomSnapshot } from '../../realtime/client-types';
import type { MemberInfo, RoomStatus } from '../../realtime/protocol';
import RoomLobby, { type LobbyViewer } from './RoomLobby';

const messages = MESSAGES.fr;
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const ADA_ID = '22222222-2222-4222-8222-222222222222';
const BOB_ID = '33333333-3333-4333-8333-333333333333';
const GUEST_TOKEN = '44444444-4444-4444-8444-444444444444';
const JOINED_AT = '2026-11-07T21:00:00.000Z';

const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockStartRace = jest.fn();
const mockQuitRace = jest.fn();
const mockSendProgress = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

let socketState: RaceSocketState = { status: 'idle', snapshot: null, error: null, race: null };

jest.mock('../../realtime/useRoomSocket', () => ({
  useRoomSocket: () => ({
    ...socketState,
    join: mockJoin,
    leave: mockLeave,
    sendPing: jest.fn(),
    startRace: mockStartRace,
    quitRace: mockQuitRace,
    sendRaceProgress: mockSendProgress,
  }),
}));

jest.mock('../../app/rooms/actions', () => ({
  closeRoom: jest.fn(),
  kickMember: jest.fn(),
  leaveRoom: jest.fn(),
  transferHost: jest.fn(),
  generateInvitationLinks: jest.fn(),
  updateRoomConfig: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: mockRefresh }),
}));

const mockedCloseRoom = jest.mocked(closeRoom);
const mockedKickMember = jest.mocked(kickMember);
const mockedLeaveRoom = jest.mocked(leaveRoom);
const mockedTransferHost = jest.mocked(transferHost);
const mockedUpdateRoomConfig = jest.mocked(updateRoomConfig);

function makeSnapshot(
  status: RoomStatus = 'en_attente',
  members: MemberInfo[] = defaultMembers(),
  config: RoomConfig = defaultRoomConfig,
): RoomSnapshot {
  return {
    room: {
      publicId: ROOM_ID,
      code: 'DWRF42',
      visibility: 'public',
      status,
      capacity: 6,
      config,
      host: { publicId: ADA_ID, username: 'ada' },
      createdAt: '2026-11-07T20:00:00.000Z',
    },
    members,
  };
}

function defaultMembers(): MemberInfo[] {
  return [
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
  ];
}

function makeRace(overrides: Partial<RaceView> = {}): RaceView {
  return {
    phase: 'decompte',
    startedAt: null,
    startAt: null,
    textId: null,
    text: null,
    totalLength: null,
    ownProgress: null,
    participants: [],
    lastTickAt: null,
    finishRanks: {},
    finished: null,
    ...overrides,
  };
}

const hostViewer: LobbyViewer = { kind: 'user', publicId: ADA_ID, username: 'ada' };
const memberViewer: LobbyViewer = { kind: 'user', publicId: BOB_ID, username: 'bob' };
const guestViewer: LobbyViewer = {
  kind: 'guest',
  nickname: 'Nain',
  guestToken: '55555555-5555-4555-8555-555555555555',
};

function renderOpenLobby(
  viewer: LobbyViewer,
  invitations: null = null,
  status: RoomStatus = 'en_attente',
  race: RaceView | null = null,
  config: RoomConfig = defaultRoomConfig,
) {
  socketState = { status: 'open', snapshot: makeSnapshot(status, defaultMembers(), config), error: null, race };
  return render(
    <RoomLobby
      roomPublicId={ROOM_ID}
      roomCode="DWRF42"
      invitationToken={null}
      viewer={viewer}
      initialInvitations={invitations}
      messages={messages}
      locale="fr"
      viewerBestWpm={null}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  socketState = { status: 'idle', snapshot: null, error: null, race: null };
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
    socketState = { status: 'open', snapshot: makeSnapshot(), error: null, race: null };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken="tok123"
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
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
      race: null,
    };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/?notice=kicked'));
  });

  test('roomClosed shows the closed screen', () => {
    socketState = { status: 'closed', snapshot: null, error: null, race: null };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
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
      race: null,
    };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={memberViewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
      />,
    );

    expect(screen.getByText(messages['lobby.error.roomFull'])).toBeInTheDocument();
  });
});

describe('race screen integration (COURSE-02/03, GAME-1)', () => {
  test('en_attente: the host sees the launch panel and can start the race', () => {
    renderOpenLobby(hostViewer);
    const startButton = screen.getByRole('button', { name: messages['race.startButton'] });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);
    expect(mockStartRace).toHaveBeenCalledTimes(1);
    // The lobby content (member list, config) stays rendered below.
    expect(screen.getByText(messages['lobby.configTitle'])).toBeInTheDocument();
  });

  test('decompte: the countdown overlay and the revealed text render', () => {
    renderOpenLobby(
      hostViewer,
      null,
      'decompte',
      makeRace({
        phase: 'decompte',
        startAt: new Date(Date.now() + 3_000).toISOString(),
        text: 'bonjour les nains',
        totalLength: 17,
        ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      }),
    );
    expect(screen.getByTestId('countdown-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('countdown-number')).toHaveTextContent('3');
    expect(screen.getByTestId('race-text')).toHaveTextContent('bonjour les nains');
    expect(screen.queryByTestId('typing-input')).not.toBeInTheDocument();
  });

  test('en_course: a participant gets the typing zone wired to the hook', () => {
    renderOpenLobby(
      memberViewer,
      null,
      'en_course',
      makeRace({
        phase: 'en_course',
        startAt: new Date(Date.now() + 3_000).toISOString(),
        text: 'bonjour',
        totalLength: 7,
        ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      }),
    );
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('typing-input'), { key: 'b' });
    expect(mockSendProgress).toHaveBeenCalledWith({
      validatedChars: 1,
      correctKeystrokes: 1,
      totalKeystrokes: 1,
    });
  });

  test('en_course: a spectator viewer sees the badge and no typing zone', () => {
    const spectatorMembers = defaultMembers().map((member) =>
      member.kind === 'guest' ? { ...member, role: 'spectator' as const } : member,
    );
    socketState = {
      status: 'open',
      snapshot: makeSnapshot('en_course', spectatorMembers),
      error: null,
      race: makeRace({
        phase: 'en_course',
        startAt: new Date(Date.now() + 3_000).toISOString(),
        text: 'bonjour',
        totalLength: 7,
        ownProgress: null,
      }),
    };
    render(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={guestViewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
      />,
    );
    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });
});

describe('config editing and live sync (CONF-01..12)', () => {
  type LobbyRerender = ReturnType<typeof render>['rerender'];

  function rerenderWithSnapshot(
    rerender: LobbyRerender,
    viewer: LobbyViewer,
    status: RoomStatus,
    config: RoomConfig,
    race: RaceView | null = null,
  ) {
    socketState = {
      status: 'open',
      snapshot: makeSnapshot(status, defaultMembers(), config),
      error: null,
      race,
    };
    rerender(
      <RoomLobby
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        invitationToken={null}
        viewer={viewer}
        initialInvitations={null}
        messages={messages}
        locale="fr"
        viewerBestWpm={null}
      />,
    );
  }

  test('the host opens the editor from the edit toggle and sees the current values', () => {
    renderOpenLobby(hostViewer);

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.config.edit'] }));

    expect(screen.getByLabelText(messages['lobby.config.wordCount'])).toHaveValue(60);
    expect(screen.getByLabelText(messages['lobby.config.timeLimit'])).toHaveValue(60);
  });

  test('the host save is wired to the updateRoomConfig action with the room id', async () => {
    mockedUpdateRoomConfig.mockResolvedValue({ ok: true });
    renderOpenLobby(hostViewer);

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.config.edit'] }));
    fireEvent.change(screen.getByLabelText(messages['lobby.config.wordCount']), {
      target: { value: '80' },
    });
    fireEvent.submit(document.querySelector('form[data-purpose="race-config-form"]')!);

    await waitFor(() => expect(mockedUpdateRoomConfig).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRoomConfig).toHaveBeenCalledWith({
      roomPublicId: ROOM_ID,
      config: expect.objectContaining({ wordCount: 80 }),
    });
  });

  test('non-hosts never see the edit toggle', () => {
    renderOpenLobby(memberViewer);

    expect(
      screen.queryByRole('button', { name: messages['lobby.config.edit'] }),
    ).not.toBeInTheDocument();
  });

  test('a mid-race room disables the edit toggle and shows the localized reason', () => {
    renderOpenLobby(hostViewer, null, 'en_course', makeRace({ phase: 'en_course' }));

    expect(screen.getByRole('button', { name: messages['lobby.config.edit'] })).toBeDisabled();
    expect(screen.getByText(messages['lobby.config.lockedRace'])).toBeInTheDocument();
  });

  test('the summary and the open editor re-render from a configUpdated snapshot (CONF-12)', () => {
    const configA: RoomConfig = { ...defaultRoomConfig, wordCount: 120, timeLimitSeconds: 300 };
    const configB: RoomConfig = { ...defaultRoomConfig, wordCount: 42, timeLimitSeconds: null };

    const { rerender } = renderOpenLobby(hostViewer, null, 'en_attente', null, configA);
    expect(screen.getByText('120')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.config.edit'] }));
    expect(screen.getByLabelText(messages['lobby.config.wordCount'])).toHaveValue(120);

    // The socket hook re-applies the configUpdated message into the snapshot;
    // re-rendering with the new snapshot simulates that state update.
    rerenderWithSnapshot(rerender, hostViewer, 'en_attente', configB);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(messages['lobby.config.noTimeLimit'])).toBeInTheDocument();
    expect(screen.getByLabelText(messages['lobby.config.wordCount'])).toHaveValue(42);
    expect(screen.getByLabelText(messages['lobby.config.timeLimit'])).toHaveAttribute('value', '');
  });

  test('non-hosts receive the configUpdated snapshot too', () => {
    const configA: RoomConfig = { ...defaultRoomConfig, wordCount: 90 };
    const configB: RoomConfig = { ...defaultRoomConfig, wordCount: 130 };

    const { rerender } = renderOpenLobby(memberViewer, null, 'en_attente', null, configA);
    expect(screen.getByText('90')).toBeInTheDocument();

    rerenderWithSnapshot(rerender, memberViewer, 'en_attente', configB);

    expect(screen.getByText('130')).toBeInTheDocument();
  });

  test('an open editor is disabled with the localized reason when the race starts', () => {
    const { rerender } = renderOpenLobby(hostViewer, null, 'en_attente');
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.config.edit'] }));
    expect(screen.getByLabelText(messages['lobby.config.wordCount'])).toBeEnabled();

    rerenderWithSnapshot(
      rerender,
      hostViewer,
      'decompte',
      defaultRoomConfig,
      makeRace({
        phase: 'decompte',
        startAt: new Date(Date.now() + 3_000).toISOString(),
        text: 'bonjour les nains',
        totalLength: 17,
        ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      }),
    );

    expect(screen.getByLabelText(messages['lobby.config.wordCount'])).toBeDisabled();
    expect(screen.getByText(messages['lobby.config.lockedRace'])).toBeInTheDocument();
  });
});
