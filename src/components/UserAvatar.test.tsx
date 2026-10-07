import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from './UserAvatar';

describe('UserAvatar', () => {
  it('keeps initials when no photo is available', () => {
    const { container } = render(<UserAvatar initials="LM" photoUrl="   " />);

    expect(screen.getByText('LM')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('LM')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the existing photo without duplicating the adjacent user name', () => {
    const { container } = render(<UserAvatar initials="LM" photoUrl=" /portraits/luc.jpg " />);
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('src', '/portraits/luc.jpg');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByText('LM')).not.toBeInTheDocument();
  });

  it('falls back after a photo error and tries a replacement photo', () => {
    const { container, rerender } = render(<UserAvatar initials="LM" photoUrl="/portraits/broken.jpg" />);
    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByText('LM')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();

    rerender(<UserAvatar initials="LM" photoUrl="/portraits/replacement.jpg" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/portraits/replacement.jpg');
  });

  it('preserves the descriptive photo label where the avatar identifies a person on its own', () => {
    render(<UserAvatar className="hr-profile-avatar" imageAlt="Photo de Luc MARTIN" initials="LM" photoUrl="/portraits/luc.jpg" />);

    expect(screen.getByRole('img', { name: 'Photo de Luc MARTIN' }).parentElement).not.toHaveAttribute('aria-hidden');
  });

  it('keeps fallback initials decorative even when the photo has a descriptive label', () => {
    const { rerender } = render(<UserAvatar imageAlt="Photo de Luc MARTIN" initials="LM" />);
    expect(screen.getByText('LM')).toHaveAttribute('aria-hidden', 'true');

    rerender(<UserAvatar imageAlt="Photo de Luc MARTIN" initials="LM" photoUrl="/portraits/broken.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Photo de Luc MARTIN' }));

    expect(screen.getByText('LM')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img', { name: 'Photo de Luc MARTIN' })).not.toBeInTheDocument();
  });
});
