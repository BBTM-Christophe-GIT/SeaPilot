import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailShortcutHeader } from './MailShortcutHeader';

afterEach(() => { vi.restoreAllMocks(); });

describe('MailShortcutHeader', () => {
  it('opens the connected account in a protected new window directly on click', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onOpen = vi.fn();
    render(<MailShortcutHeader email="marin+navire@example.test" onOpen={onOpen} />);
    const shortcut = screen.getByRole('link', { name: 'Ouvrir Gmail pour marin+navire@example.test dans une nouvelle fenêtre' });

    expect(shortcut).toHaveAttribute('href', 'https://mail.google.com/mail/?authuser=marin%2Bnavire%40example.test#inbox');
    expect(shortcut).toHaveAttribute('target', '_blank');
    expect(shortcut).toHaveAttribute('rel', 'noopener noreferrer');
    await userEvent.setup().click(shortcut);

    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://mail.google.com/mail/?authuser=marin%2Bnavire%40example.test#inbox',
      '_blank',
      'popup,width=1200,height=800,noopener,noreferrer',
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows keyboard activation', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<MailShortcutHeader email="capitaine@example.test" />);
    const shortcut = screen.getByRole('link', { name: /Ouvrir Gmail/ });
    const user = userEvent.setup();

    await user.tab();
    expect(shortcut).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledOnce();
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('preserves the browser’s native %s link behavior', (modifier) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onOpen = vi.fn();
    render(<MailShortcutHeader email="marin@example.test" onOpen={onOpen} />);
    const shortcut = screen.getByRole('link', { name: /Ouvrir Gmail/ });

    const event = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true, [modifier]: true });
    fireEvent(shortcut, event);

    expect(event.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('does not invent a badge for an unavailable or invalid count (%s)', (unreadCount) => {
    const { container } = render(<MailShortcutHeader email="marin@example.test" unreadCount={unreadCount} />);

    expect(container.querySelector('.topbar-mail-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir Gmail/ })).not.toHaveAccessibleName(/message/);
  });

  it.each([
    [1, '1', '1 message non lu'],
    [12, '12', '12 messages non lus'],
    [1234, '99+', '1234 messages non lus'],
  ] as const)('shows a verified count of %s with its full accessible label', (unreadCount, badge, label) => {
    const { container } = render(<MailShortcutHeader email="marin@example.test" unreadCount={unreadCount} />);

    expect(container.querySelector('.topbar-mail-badge')).toHaveTextContent(badge);
    expect(container.querySelector('.topbar-mail-badge')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: /Ouvrir Gmail/ })).toHaveAccessibleName(expect.stringContaining(label));
  });

  it('keeps a verified empty inbox free of a badge', () => {
    const { container } = render(<MailShortcutHeader email="marin@example.test" unreadCount={0} />);

    expect(container.querySelector('.topbar-mail-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir Gmail/ })).toHaveAccessibleName(expect.stringContaining('aucun message non lu'));
  });

  it('disables the shortcut without a login email, including when a count is supplied', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onOpen = vi.fn();
    const { container } = render(<MailShortcutHeader email="   " unreadCount={12} onOpen={onOpen} />);
    const shortcut = screen.getByRole('button', { name: 'Boîte mail indisponible' });

    expect(shortcut).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.topbar-mail-badge')).not.toBeInTheDocument();
    await userEvent.setup().click(shortcut);
    expect(open).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
