import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { uploadAvatar, updateProfile } from '../../app/account/actions';
import type { AccountProfile } from '../../app/account/profile';
import { MESSAGES } from '../../i18n/messages';
import EditProfileModal from './EditProfileModal';

const messages = MESSAGES.fr;
const mockRefresh = jest.fn();

jest.mock('../../app/account/actions', () => ({
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  unlinkAccount: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn(), replace: jest.fn() }),
}));

const mockedUpload = jest.mocked(uploadAvatar);
const mockedUpdate = jest.mocked(updateProfile);

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function pngFile(name = 'avatar.png'): File {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

function oversizedFile(): File {
  return new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
}

const PROFILE: AccountProfile = {
  username: 'ada',
  pfpUrl: null,
  createdAt: '2026-11-07T12:00:00.000Z',
  racesCompleted: 0,
  totalWords: '0',
  bestWpm: 0,
  avgWpm: 0,
  wins: 0,
  avgAccuracy: 0,
  coins: '0',
  gems: 0,
  linkedProviders: [],
};

function renderModal(): void {
  render(<EditProfileModal open onClose={() => undefined} profile={PROFILE} messages={messages} />);
}

function selectFile(file: File | null): void {
  const input = screen.getByLabelText(messages['upload.chooseFile']);
  fireEvent.change(input, { target: { files: file ? [file] : [] } });
}

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:mock-avatar');
  URL.revokeObjectURL = jest.fn();
});

describe('EditProfileModal — avatar upload (AUTH-04)', () => {
  test('selecting a supported file shows a preview and enables the upload button', () => {
    renderModal();
    selectFile(pngFile());

    const preview = screen.getByAltText('ada avatar');
    expect(preview).toHaveAttribute('src', 'blob:mock-avatar');

    const button = screen.getByRole('button', { name: messages['upload.upload'] });
    expect(button).toBeEnabled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(File));
  });

  test('rejects an oversized file client-side with the localized error', () => {
    renderModal();
    selectFile(oversizedFile());

    expect(screen.getByRole('alert')).toHaveTextContent(messages['upload.error.fileTooLarge']);
    expect(screen.getByRole('button', { name: messages['upload.upload'] })).toBeDisabled();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  test('rejects an unsupported file type client-side', () => {
    renderModal();
    selectFile(new File([PNG_BYTES], 'avatar.exe', { type: 'application/octet-stream' }));

    expect(screen.getByRole('alert')).toHaveTextContent(messages['upload.error.unsupportedType']);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  test('submit sends the chosen file through the uploadAvatar action', async () => {
    mockedUpload.mockResolvedValue({ ok: true, pfpUrl: '/api/avatar/uuid?v=1' });

    renderModal();
    selectFile(pngFile());
    fireEvent.click(screen.getByRole('button', { name: messages['upload.upload'] }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    const formData = mockedUpload.mock.calls[0]?.[0] as FormData;
    expect(formData.get('avatar')).toBeInstanceOf(File);
  });

  test('shows a progress state while the upload is in flight', async () => {
    let resolveUpload: (value: Awaited<ReturnType<typeof uploadAvatar>>) => void = () => undefined;
    mockedUpload.mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    renderModal();
    selectFile(pngFile());
    fireEvent.click(screen.getByRole('button', { name: messages['upload.upload'] }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: messages['upload.uploading'] }),
      ).toBeDisabled(),
    );

    resolveUpload({ ok: true, pfpUrl: '/api/avatar/uuid?v=1' });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  test('success updates the preview to the served route URL and refreshes the page', async () => {
    mockedUpload.mockResolvedValue({
      ok: true,
      pfpUrl: '/api/avatar/11111111-1111-4111-8111-111111111111?v=1794227696789',
    });

    renderModal();
    selectFile(pngFile());
    fireEvent.click(screen.getByRole('button', { name: messages['upload.upload'] }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.getByAltText('ada avatar')).toHaveAttribute(
      'src',
      '/api/avatar/11111111-1111-4111-8111-111111111111?v=1794227696789',
    );
  });

  test('maps a server-side rate-limit failure to the localized error', async () => {
    mockedUpload.mockResolvedValue({ ok: false, error: 'rateLimited' });

    renderModal();
    selectFile(pngFile());
    fireEvent.click(screen.getByRole('button', { name: messages['upload.upload'] }));

    expect(await screen.findByText(messages['upload.error.rateLimited'])).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test('keeps the existing URL-edit path working', () => {
    renderModal();

    expect(screen.getByLabelText(messages['account.modal.avatarLabel'])).toHaveAttribute(
      'type',
      'url',
    );
    const form = screen.getByRole('button', { name: messages['account.modal.submit'] });
    expect(form).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
