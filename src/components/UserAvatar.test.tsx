import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import UserAvatar from './UserAvatar';

describe('UserAvatar', () => {
  test('renders the profile picture when pfpUrl is set', () => {
    render(<UserAvatar pfpUrl="https://example.com/me.png" username="ada" />);

    const image = screen.getByAltText('ada avatar');
    expect(image).toHaveAttribute('src', 'https://example.com/me.png');
  });

  test('falls back to the shared person icon when pfpUrl is null', () => {
    render(<UserAvatar pfpUrl={null} username="ada" />);

    expect(screen.queryByAltText('ada avatar')).not.toBeInTheDocument();

    const icon = document.querySelector('.material-symbols-outlined');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveTextContent('person');
  });
});
