import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppDialog } from './AppDialog';

describe('dialog keyboard navigation', () => {
  it('ignores controls inside collapsed panels when wrapping focus', () => {
    render(<AppDialog title="Formulaire" onClose={vi.fn()}><button>Visible</button><div hidden><input aria-label="Champ replié" /></div><fieldset disabled><button>Indisponible</button></fieldset></AppDialog>);
    const close = screen.getByRole('button', { name: 'Fermer' }); close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Visible' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Visible' }), { key: 'Tab' });
    expect(close).toHaveFocus();
  });
});
