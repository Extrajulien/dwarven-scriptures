import { fireEvent, render, screen } from '@testing-library/react';
import RegisterForm from './RegisterForm';
import { registerUser } from '../../app/register/actions';

const mockReplace = jest.fn();

jest.mock('../../app/register/actions', () => ({
  registerUser: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

function submitForm() {
  const form = document.querySelector(
    'form[data-purpose="scribe-registration-form"]',
  );
  fireEvent.submit(form);
}

beforeEach(() => {
  jest.clearAllMocks();
  registerUser.mockReset();
});

test('toggles the password field visibility', () => {
  render(<RegisterForm />);

  const passwordInput = screen.getByLabelText(/\[ cipher \]/i);
  const toggle = screen.getByRole('button', {
    name: /toggle password visibility/i,
  });

  expect(passwordInput).toHaveAttribute('type', 'password');

  fireEvent.click(toggle);
  expect(passwordInput).toHaveAttribute('type', 'text');

  fireEvent.click(toggle);
  expect(passwordInput).toHaveAttribute('type', 'password');
});

test('renders a validation error under each invalid field', async () => {
  registerUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {
      username: 'usernameTaken',
      password: 'passwordTooShort',
      confirmPassword: 'passwordsDoNotMatch',
    },
  });

  render(<RegisterForm />);
  submitForm();

  expect(await screen.findByText('That name is already taken.')).toBeInTheDocument();
  expect(screen.getByText('Password must be at least 12 characters.')).toBeInTheDocument();
  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
});

test('renders a generic error when the action reports an unexpected failure', async () => {
  registerUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'unexpected',
  });

  render(<RegisterForm />);
  submitForm();

  expect(
    await screen.findByText('Something went wrong. Please try again.'),
  ).toBeInTheDocument();
});

test('shows the strength bar under the password field and starts dark', () => {
  render(<RegisterForm />);

  const bar = screen.getByRole('progressbar', { name: /password strength/i });
  expect(bar).toHaveAttribute('data-strength', 'empty');
  expect(bar).toHaveAttribute('aria-valuenow', '0');
});

test('turns the strength bar red as soon as any password is entered', () => {
  render(<RegisterForm />);

  const passwordInput = screen.getByLabelText(/\[ cipher \]/i);
  fireEvent.change(passwordInput, { target: { value: 'x' } });

  const bar = screen.getByRole('progressbar', { name: /password strength/i });
  expect(bar).toHaveAttribute('data-strength', 'weak');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(50);
});

test('fills the strength bar yellow once the password meets the minimum policy', () => {
  render(<RegisterForm />);

  const passwordInput = screen.getByLabelText(/\[ cipher \]/i);
  fireEvent.change(passwordInput, { target: { value: 'Tr0ub4dor&3x!' } });

  const bar = screen.getByRole('progressbar', { name: /password strength/i });
  expect(bar).toHaveAttribute('data-strength', 'acceptable');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(50);
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(80);
});

test('fills the strength bar green for a strong password', () => {
  render(<RegisterForm />);

  const passwordInput = screen.getByLabelText(/\[ cipher \]/i);
  fireEvent.change(passwordInput, { target: { value: 'correct horse battery staple' } });

  const bar = screen.getByRole('progressbar', { name: /password strength/i });
  expect(bar).toHaveAttribute('data-strength', 'strong');
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(80);
});
