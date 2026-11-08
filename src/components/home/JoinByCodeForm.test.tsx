import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { joinByCodeFormAction, leaveAndJoinFormAction } from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import JoinByCodeForm from './JoinByCodeForm';

const mockPush = jest.fn();

jest.mock('../../app/rooms/actions', () => ({
  joinByCodeFormAction: jest.fn(),
  leaveAndJoinFormAction: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const joinActionMock = jest.mocked(joinByCodeFormAction);
const leaveActionMock = jest.mocked(leaveAndJoinFormAction);

const messages = MESSAGES.fr;
const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

function submitJoinForm(code: string) {
  fireEvent.change(screen.getByLabelText(messages['joinCode.label']), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole('button', { name: messages['joinCode.submit'] }));
}

beforeEach(() => {
  jest.clearAllMocks();
  joinActionMock.mockReset();
  leaveActionMock.mockReset();
});

test('submits the code and navigates to the room on success (JOIN-01)', async () => {
  joinActionMock.mockResolvedValue({ ok: true, roomPublicId: ROOM_PUBLIC_ID });

  render(<JoinByCodeForm viewer={{ kind: 'user', username: 'ada' }} messages={messages} />);
  submitJoinForm('ghjkm2');

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/rooms/${ROOM_PUBLIC_ID}`));
  expect(joinActionMock).toHaveBeenCalledTimes(1);
  const formData = joinActionMock.mock.calls[0]?.[1] as FormData;
  expect(formData.get('code')).toBe('GHJKM2');
});

test('shows the typed rate-limit message on rateLimited', async () => {
  joinActionMock.mockResolvedValue({ ok: false, error: 'rateLimited', currentRoom: null });

  render(<JoinByCodeForm viewer={{ kind: 'guest', nickname: 'Nain' }} messages={messages} />);
  submitJoinForm('ghjkm2');

  expect(await screen.findByText(messages['joinCode.error.rateLimited'])).toBeInTheDocument();
});

test('shows the typed not-found message on roomNotFound', async () => {
  joinActionMock.mockResolvedValue({ ok: false, error: 'roomNotFound', currentRoom: null });

  render(<JoinByCodeForm viewer={{ kind: 'guest', nickname: 'Nain' }} messages={messages} />);
  submitJoinForm('ghjkm2');

  expect(await screen.findByText(messages['joinCode.error.roomNotFound'])).toBeInTheDocument();
});

test('alreadyInRoom shows the current room with a leave-and-join path (SALLE-06)', async () => {
  joinActionMock.mockResolvedValue({
    ok: false,
    error: 'alreadyInRoom',
    currentRoom: { publicId: '22222222-2222-4222-8222-222222222222', code: 'ABCDEF' },
  });

  render(<JoinByCodeForm viewer={{ kind: 'user', username: 'ada' }} messages={messages} />);
  submitJoinForm('ghjkm2');

  expect(await screen.findByText(messages['joinCode.alreadyInRoom'])).toBeInTheDocument();
  expect(screen.getByText('ABCDEF')).toBeInTheDocument();

  // The leave-and-join button re-submits with the code and the current room.
  leaveActionMock.mockResolvedValue({ ok: true, roomPublicId: ROOM_PUBLIC_ID });
  fireEvent.click(screen.getByRole('button', { name: messages['joinCode.leaveAndJoin'] }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/rooms/${ROOM_PUBLIC_ID}`));
  const formData = leaveActionMock.mock.calls[0]?.[1] as FormData;
  expect(formData.get('code')).toBe('GHJKM2');
  expect(formData.get('currentRoomPublicId')).toBe('22222222-2222-4222-8222-222222222222');
});

test('guests without a nickname cookie get the dwarf-name field (AUTH-02)', () => {
  render(<JoinByCodeForm viewer={null} messages={messages} />);
  expect(screen.getByLabelText(messages['guestNickname.label'])).toBeInTheDocument();
});

test('identified users and guests with a nickname do not see the nickname field', () => {
  render(<JoinByCodeForm viewer={{ kind: 'user', username: 'ada' }} messages={messages} />);
  expect(screen.queryByLabelText(messages['guestNickname.label'])).not.toBeInTheDocument();
});
