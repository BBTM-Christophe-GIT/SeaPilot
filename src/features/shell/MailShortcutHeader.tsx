import { Mail } from 'lucide-react';
import type { MouseEvent } from 'react';
import './mailShortcutHeader.css';

interface MailShortcutHeaderProps {
  email?: string;
  unreadCount?: number | null;
  onOpen?: () => void;
}

export function MailShortcutHeader({ email, unreadCount, onOpen }: MailShortcutHeaderProps) {
  const accountEmail = email?.trim();
  const count = typeof unreadCount === 'number' && Number.isSafeInteger(unreadCount) && unreadCount >= 0
    ? unreadCount
    : null;

  if (!accountEmail) {
    return (
      <button
        aria-label="Boîte mail indisponible"
        className="topbar-icon-button topbar-mail-shortcut"
        disabled
        title="Boîte mail indisponible : aucun compte de connexion actif"
        type="button"
      >
        <Mail aria-hidden="true" size={19} />
      </button>
    );
  }

  const url = `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#inbox`;
  const unreadLabel = count === null ? '' : count === 0
    ? ', aucun message non lu'
    : `, ${count} message${count > 1 ? 's' : ''} non lu${count > 1 ? 's' : ''}`;
  const label = `Ouvrir Gmail pour ${accountEmail} dans une nouvelle fenêtre${unreadLabel}`;

  function openMailbox(event: MouseEvent<HTMLAnchorElement>) {
    onOpen?.();
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.open(url, '_blank', 'popup,width=1200,height=800,noopener,noreferrer');
  }

  return (
    <a
      aria-label={label}
      className="topbar-icon-button topbar-mail-shortcut"
      href={url}
      onClick={openMailbox}
      rel="noopener noreferrer"
      target="_blank"
      title={label}
    >
      <Mail aria-hidden="true" size={19} />
      {count !== null && count > 0 ? (
        <span aria-hidden="true" className="topbar-notification-badge topbar-mail-badge">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </a>
  );
}
