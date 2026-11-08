import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginForm from './LoginForm';
import { loginUser } from '../../app/login/actions';

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
  render(<LoginForm />);

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

test('renders required errors under both fields', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {
      username: 'required',
      password: 'required',
    },
  });

  render(<LoginForm />);
  submitForm();

  expect(await screen.findByText('A name is required.')).toBeInTheDocument();
  expect(screen.getByText('A password is required.')).toBeInTheDocument();
});

test('renders the invalid-credentials message', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'invalidCredentials',
  });

  render(<LoginForm />);
  submitForm();

  expect(
    await screen.findByText('Incorrect username or password.'),
  ).toBeInTheDocument();
});

test('renders the unexpected message', async () => {
  mockedLoginUser.mockResolvedValueOnce({
    ok: false,
    fieldErrors: {},
    formError: 'unexpected',
  });

  render(<LoginForm />);
  submitForm();

  expect(
    await screen.findByText('Something went wrong. Please try again.'),
  ).toBeInTheDocument();
});

test('redirects to / when the action succeeds', async () => {
  mockedLoginUser.mockResolvedValueOnce({ ok: true });

  render(<LoginForm />);
  submitForm();

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});
