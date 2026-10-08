import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from './AppDialog';

function deferAnimationFrame() {
  let callback: FrameRequestCallback | undefined;
  const frameId = 42;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((nextCallback) => {
    callback = nextCallback;
    return frameId;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  return {
    cancel,
    frameId,
    run: () => {
      if (!callback) throw new Error('The dialog has not scheduled its initial focus.');
      callback(0);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('dialog keyboard navigation', () => {
  it('ignores controls inside collapsed panels when wrapping focus', () => {
    render(<AppDialog title="Formulaire" onClose={vi.fn()}><button>Visible</button><div hidden><input aria-label="Champ replié" /></div><fieldset disabled><button>Indisponible</button></fieldset></AppDialog>);
    const close = screen.getByRole('button', { name: 'Fermer' }); close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Visible' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Visible' }), { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('focuses the first control when the opening frame runs before user interaction', () => {
    const frame = deferAnimationFrame();
    render(<button>Ouvrir</button>);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    render(<AppDialog title="Formulaire" onClose={vi.fn()}><textarea aria-label="Description" /></AppDialog>);
    expect(opener).toHaveFocus();
    act(() => frame.run());
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('keeps a field focused when the opening frame runs during typing', async () => {
    const frame = deferAnimationFrame();
    const onClose = vi.fn();
    function FindingDialog() {
      const [open, setOpen] = useState(true);
      return open ? (
        <AppDialog title="Créer un écart" onClose={() => { onClose(); setOpen(false); }}>
          <textarea aria-label="Description du constat" onInput={(event) => {
            if (event.currentTarget.value === 'C') frame.run();
          }} />
        </AppDialog>
      ) : null;
    }
    render(<FindingDialog />);
    const dialog = screen.getByRole('dialog');
    const field = screen.getByRole('textbox', { name: 'Description du constat' });
    await userEvent.setup().type(field, 'Conserver la pièce choisie.');
    expect(field).toHaveValue('Conserver la pièce choisie.');
    expect(field).toHaveFocus();
    expect(dialog).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels pending focus on unmount and ignores an obsolete opening frame', () => {
    const frame = deferAnimationFrame();
    render(<><button>Ouvrir</button><button>Autre action</button></>);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    const { unmount } = render(<AppDialog title="Formulaire" onClose={vi.fn()}><input aria-label="Champ" /></AppDialog>);
    const closeFocus = vi.spyOn(screen.getByRole('button', { name: 'Fermer' }), 'focus');
    unmount();
    expect(frame.cancel).toHaveBeenCalledWith(frame.frameId);
    expect(opener).toHaveFocus();
    const otherAction = screen.getByRole('button', { name: 'Autre action' });
    otherAction.focus();
    act(() => frame.run());
    expect(otherAction).toHaveFocus();
    expect(closeFocus).not.toHaveBeenCalled();
  });
});
