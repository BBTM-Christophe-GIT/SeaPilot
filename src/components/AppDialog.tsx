import {
  type FormEventHandler,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type AppDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
export type AppDialogVariant = 'modal' | 'drawer' | 'preview';

interface AppDialogProps {
  children: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  footer?: ReactNode;
  icon?: ReactNode;
  isBusy?: boolean;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  size?: AppDialogSize;
  title: string;
  variant?: AppDialogVariant;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

export function AppDialog({
  children,
  description,
  eyebrow,
  footer,
  icon,
  isBusy = false,
  onClose,
  onSubmit,
  size = 'md',
  title,
  variant = 'modal',
}: AppDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first = dialog ? focusableElements(dialog)[0] : null;
    window.requestAnimationFrame(() => (first || dialog)?.focus());
    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !isBusy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const elements = focusableElements(dialogRef.current);
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const commonProps = {
    'aria-busy': isBusy || undefined,
    'aria-describedby': description ? descriptionId : undefined,
    'aria-labelledby': titleId,
    'aria-modal': true,
    className: `app-dialog app-dialog--${size} app-dialog--${variant}`,
    onKeyDown: handleKeyDown,
    ref: (node: HTMLElement | null) => { dialogRef.current = node; },
    role: 'dialog',
    tabIndex: -1,
  };

  const content = (
    <>
      <header className="app-dialog__header">
        <div className="app-dialog__identity">
          {icon ? <span className="app-dialog__icon">{icon}</span> : null}
          <span>
            {eyebrow ? <small>{eyebrow}</small> : null}
            <h2 id={titleId}>{title}</h2>
          </span>
        </div>
        <button aria-label="Fermer" className="app-dialog__close" disabled={isBusy} onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>
      {description ? <div className="app-dialog__description" id={descriptionId}>{description}</div> : null}
      <div className="app-dialog__content">{children}</div>
      {footer ? <footer className="app-dialog__footer">{footer}</footer> : null}
    </>
  );

  return (
    <div
      className={`app-dialog-backdrop app-dialog-backdrop--${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
      role="presentation"
    >
      {onSubmit
        ? <form {...commonProps} onSubmit={onSubmit}>{content}</form>
        : <section {...commonProps}>{content}</section>}
    </div>
  );
}

interface AppConfirmDialogProps {
  confirmLabel: string;
  description: ReactNode;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: 'danger' | 'warning';
}

export function AppConfirmDialog({
  confirmLabel,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  title,
  tone = 'warning',
}: AppConfirmDialogProps) {
  return (
    <AppDialog
      description={description}
      eyebrow="Confirmation"
      footer={(
        <div className="app-dialog__actions">
          <button className="is-secondary" disabled={isBusy} onClick={onCancel} type="button">Retour</button>
          <button className={tone === 'danger' ? 'is-danger' : 'is-primary'} disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? 'Traitement…' : confirmLabel}
          </button>
        </div>
      )}
      icon={<AlertTriangle aria-hidden="true" size={20} />}
      isBusy={isBusy}
      onClose={onCancel}
      size="sm"
      title={title}
    >
      <p className={`app-dialog__confirm-note is-${tone}`}>
        Cette action est enregistrée dans Supabase avant la mise à jour de l’écran.
      </p>
    </AppDialog>
  );
}
