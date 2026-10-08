import { fireEvent, render, screen } from '@testing-library/react';
import RegisterForm from './RegisterForm';

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
