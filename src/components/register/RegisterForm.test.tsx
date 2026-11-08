import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import RegisterForm from './RegisterForm';
import { registerUser } from '../../app/register/actions';
import { MESSAGES } from '../../i18n/messages';

const mockReplace = jest.fn();

jest.mock('../../app/register/actions', () => ({
  registerUser: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockedRegisterUser = jest.mocked(registerUser);

function submitForm() {
  const form = document.querySelector(
    'form[data-purpose="scribe-registration-form"]',
  );
  if (!form) {
    throw new Error('scribe-registration-form not found');
  }
  fireEvent.submit(form);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRegisterUser.mockReset();
});

test('toggles the password field visibility', () => {
  render(<RegisterForm messages={MESSAGES.fr} />);

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

test('renders a localized validation error under each invalid field', async () => {
  mockedRegisterUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {
      username: 'usernameTaken',
      password: 'passwordTooShort',
      confirmPassword: 'passwordsDoNotMatch',
    },
  });

  render(<RegisterForm messages={MESSAGES.fr} />);
  submitForm();

  expect(await screen.findByText('Ce nom est déjà pris.')).toBeInTheDocument();
  expect(
    screen.getByText('Le mot de passe doit compter au moins 12 caractères.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument();
});

test('renders a localized generic error when the action reports an unexpected failure', async () => {
  mockedRegisterUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'unexpected',
  });

  render(<RegisterForm messages={MESSAGES.fr} />);
  submitForm();

  expect(
    await screen.findByText('Une erreur est survenue. Réessayez.'),
  ).toBeInTheDocument();
});

test('shows the strength bar under the password field and starts dark', () => {
  render(<RegisterForm messages={MESSAGES.fr} />);

  const bar = screen.getByRole('progressbar', { name: /robustesse du mot de passe/i });
  expect(bar).toHaveAttribute('data-strength', 'empty');
  expect(bar).toHaveAttribute('aria-valuenow', '0');
});

test('turns the strength bar red as soon as any password is entered', () => {
  render(<RegisterForm messages={MESSAGES.fr} />);

  const passwordInput = screen.getByLabelText(/\[ chiffrement \]/i);
  fireEvent.change(passwordInput, { target: { value: 'x' } });

  const bar = screen.getByRole('progressbar', { name: /robustesse du mot de passe/i });
  expect(bar).toHaveAttribute('data-strength', 'weak');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(50);
});

test('fills the strength bar yellow once the password meets the minimum policy', () => {
  render(<RegisterForm messages={MESSAGES.fr} />);

  const passwordInput = screen.getByLabelText(/\[ chiffrement \]/i);
  fireEvent.change(passwordInput, { target: { value: 'Tr0ub4dor&3x!' } });

  const bar = screen.getByRole('progressbar', { name: /robustesse du mot de passe/i });
  expect(bar).toHaveAttribute('data-strength', 'acceptable');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(50);
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(80);
});

test('fills the strength bar green for a strong password', () => {
  render(<RegisterForm messages={MESSAGES.fr} />);

  const passwordInput = screen.getByLabelText(/\[ chiffrement \]/i);
  fireEvent.change(passwordInput, { target: { value: 'correct horse battery staple' } });

  const bar = screen.getByRole('progressbar', { name: /robustesse du mot de passe/i });
  expect(bar).toHaveAttribute('data-strength', 'strong');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(80);
});
