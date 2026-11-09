import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginForm from './LoginForm';
import { loginUser } from '../../app/login/actions';
import { MESSAGES } from '../../i18n/messages';

const mockReplace = jest.fn();

jest.mock('../../app/login/actions', () => ({
  loginUser: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockedLoginUser = jest.mocked(loginUser);

function submitForm() {
  const form = document.querySelector(
    'form[data-purpose="scribe-login-form"]',
  );
  if (!form) {
    throw new Error('scribe-login-form not found');
  }
  fireEvent.submit(form);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLoginUser.mockReset();
});

test('toggles the password field visibility', () => {
  render(<LoginForm messages={MESSAGES.fr} />);

  const passwordInput = screen.getByLabelText(/\[ chiffrement \]/i);
  const toggle = screen.getByRole('button', {
    name: /afficher ou masquer le mot de passe/i,
  });

  expect(passwordInput).toHaveAttribute('type', 'password');

  fireEvent.click(toggle);
  expect(passwordInput).toHaveAttribute('type', 'text');

  fireEvent.click(toggle);
  expect(passwordInput).toHaveAttribute('type', 'password');
});

test('renders required errors under both fields', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {
      username: 'required',
      password: 'required',
    },
  });

  render(<LoginForm messages={MESSAGES.fr} />);
  submitForm();

  expect(await screen.findByText('Un nom est requis.')).toBeInTheDocument();
  expect(screen.getByText('Un mot de passe est requis.')).toBeInTheDocument();
});

test('renders the localized invalid-credentials message from the code', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'invalidCredentials',
  });

  render(<LoginForm messages={MESSAGES.fr} />);
  submitForm();

  expect(
    await screen.findByText('Nom d’utilisateur ou mot de passe incorrect.'),
  ).toBeInTheDocument();
});

test('renders the localized unexpected message from the code', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'unexpected',
  });

  render(<LoginForm messages={MESSAGES.fr} />);
  submitForm();

  expect(
    await screen.findByText('Une erreur est survenue. Réessayez.'),
  ).toBeInTheDocument();
});

test('renders the English bag for an en session (I18N-01)', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'invalidCredentials',
  });

  render(<LoginForm messages={MESSAGES.en} />);
  submitForm();

  expect(
    await screen.findByText('Incorrect username or password.'),
  ).toBeInTheDocument();
});

test('redirects to / when the action succeeds', async () => {
  mockedLoginUser.mockResolvedValueOnce({ ok: true });

  render(<LoginForm messages={MESSAGES.fr} />);
  submitForm();

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});
