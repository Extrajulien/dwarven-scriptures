import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { guestNicknameFormAction } from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import GuestNicknameForm from './GuestNicknameForm';

const messages = MESSAGES.fr;
const mockRefresh = jest.fn();

jest.mock('../../app/rooms/actions', () => ({
  guestNicknameFormAction: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn(), replace: jest.fn() }),
}));

const mockedAction = jest.mocked(guestNicknameFormAction);

function submitNickname(nickname: string) {
  fireEvent.change(screen.getByLabelText(messages['guestNickname.label']), {
    target: { value: nickname },
  });
  fireEvent.click(screen.getByRole('button', { name: messages['guestNickname.submit'] }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAction.mockReset();
});

test('renders the dwarf-styled nickname form (AUTH-02)', () => {
  render(<GuestNicknameForm messages={messages} />);

  expect(screen.getByText(messages['guestNickname.title'])).toBeInTheDocument();
  expect(screen.getByLabelText(messages['guestNickname.label'])).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: messages['guestNickname.signInInstead'] }),
  ).toBeInTheDocument();
});

test('submits the nickname and refreshes the route when the cookie is written', async () => {
  mockedAction.mockResolvedValue({ ok: true });

  render(<GuestNicknameForm messages={messages} />);
  submitNickname('Nain Curieux');

  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  const formData = mockedAction.mock.calls[0]?.[1] as FormData;
  expect(formData.get('nickname')).toBe('Nain Curieux');
});

test('rejects a nickname outside 3–20 characters with the typed message', async () => {
  mockedAction.mockResolvedValue({ ok: false, error: 'invalidNickname' });

  render(<GuestNicknameForm messages={messages} />);
  submitNickname('ab');

  expect(await screen.findByText(messages['guestNickname.error.invalid'])).toBeInTheDocument();
  expect(mockRefresh).not.toHaveBeenCalled();
});

test('surfaces the unexpected error message', async () => {
  mockedAction.mockResolvedValue({ ok: false, error: 'unexpected' });

  render(<GuestNicknameForm messages={messages} />);
  submitNickname('Nain Curieux');

  expect(
    await screen.findByText(messages['guestNickname.error.unexpected']),
  ).toBeInTheDocument();
});
