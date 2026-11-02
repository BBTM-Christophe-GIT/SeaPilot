import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProcessScopeSelect, type ProcessScopeEntity } from './ProcessScopeSelect';

const entities: ProcessScopeEntity[] = [
  { id: 5, name: 'Armement - CHERBOURG', assetKind: 'office' },
  { id: 4, name: 'Quai inconnu', assetKind: 'quay' },
  { id: 2, name: 'SUROIT', assetKind: 'vessel' },
  { id: 1, name: 'GOURY', assetKind: 'vessel' },
  { id: 3, name: 'Navire très long', assetKind: 'vessel', lengthOverall: 50 },
];

describe('ProcessScopeSelect', () => {
  it('keeps the aggregate first, sorts vessels by length, then quays/offices without mutating caller data', async () => {
    const original = entities.map((entity) => entity.id);
    render(<ProcessScopeSelect entities={entities} value="all" onChange={vi.fn()} aggregateLabel="Toute la compagnie" />);
    await userEvent.click(screen.getByRole('button', { name: 'Périmètre du radar : Toute la compagnie' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Toute la compagnie', 'Navire très long', 'GOURY', 'SUROIT', 'Quai inconnu', 'Armement - CHERBOURG',
    ]);
    expect(entities.map((entity) => entity.id)).toEqual(original);
    expect(screen.getAllByRole('menuitem')[0]).toHaveAttribute('aria-current', 'true');
  });

  it('uses miniature shared illustrations and falls back to a pictogram after an image error', async () => {
    render(<ProcessScopeSelect entities={entities} value="1" onChange={vi.fn()} aggregateLabel="Toute la compagnie" />);
    const trigger = screen.getByRole('button', { name: 'Périmètre du radar : GOURY' });
    const image = trigger.querySelector('img')!;
    expect(image.getAttribute('src')).toMatch(/^\/vessels\/bbtm\/goury-/);
    expect(image).toHaveAttribute('width', '55');
    expect(image).toHaveAttribute('height', '37');
    fireEvent.error(image);
    expect(trigger.querySelector('img')).toBeNull();
    expect(trigger.querySelector('.lucide-ship')).not.toBeNull();
    await userEvent.click(trigger);
    const office = screen.getByRole('menuitem', { name: 'Armement - CHERBOURG' });
    expect(office.querySelector('img')).toHaveAttribute('src', '/action-plan/offices.png');
    expect(screen.getByRole('menuitem', { name: 'Quai inconnu' }).querySelector('.lucide-warehouse')).not.toBeNull();
  });

  it('supports keyboard selection, arrow navigation, Escape and trigger focus restoration', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProcessScopeSelect entities={entities} value="all" onChange={onChange} aggregateLabel="Toute la compagnie" />);
    const trigger = screen.getByRole('button', { name: /Périmètre du radar/ });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Périmètres du radar' });
    await waitFor(() => expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus());
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus());
    await user.keyboard('{End}');
    expect(screen.getAllByRole('menuitem').at(-1)).toHaveFocus();
    await user.keyboard('{Home}{ArrowUp}');
    expect(screen.getAllByRole('menuitem').at(-1)).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click, and Tab exits to the next control', async () => {
    const user = userEvent.setup();
    render(<><ProcessScopeSelect entities={entities} value="all" onChange={vi.fn()} aggregateLabel="Toute la compagnie" /><div style={{ display: 'none' }}><button type="button">Action masquée</button></div><button type="button">Après le périmètre</button></>);
    const trigger = screen.getByRole('button', { name: /Périmètre du radar/ });
    await user.click(trigger);
    await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus());
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Après le périmètre' })).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Après le périmètre' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Après le périmètre' })).toHaveFocus();
  });

  it('does not emit changes for the current option or infer unauthorized entities', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProcessScopeSelect entities={[entities[3]]} value="1" onChange={onChange} aggregateLabel="Mon périmètre" />);
    await userEvent.click(screen.getByRole('button', { name: 'Périmètre du radar : GOURY' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('menuitem', { name: 'GOURY' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<ProcessScopeSelect entities={[]} value="1" onChange={onChange} aggregateLabel="Mon périmètre" />);
    expect(screen.getByRole('button', { name: 'Périmètre du radar : Périmètre indisponible' })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows a still-visible trigger after a native window scroll and keeps the aggregate selectable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProcessScopeSelect entities={entities} value="1" onChange={onChange} aggregateLabel="Votre périmètre" />);
    const trigger = screen.getByRole('button', { name: 'Périmètre du radar : GOURY' });
    const bounds = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 220, 260, 44));
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Périmètres du radar' });
    expect(menu).toHaveStyle({ left: '20px', top: '268px' });
    bounds.mockReturnValue(new DOMRect(24, 164, 260, 44));
    fireEvent.scroll(window);
    expect(screen.getByRole('menu', { name: 'Périmètres du radar' })).toBe(menu);
    expect(menu).toHaveStyle({ left: '24px', top: '212px' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Scrolling the options themselves must not move or dismiss their menu.
    bounds.mockReturnValue(new DOMRect(24, 80, 260, 44));
    fireEvent.scroll(menu);
    expect(menu).toHaveStyle({ left: '24px', top: '212px' });
    await user.click(within(menu).getByRole('menuitem', { name: 'Votre périmètre' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('all');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when scrolling the trigger out of view without scrolling the page back to it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProcessScopeSelect entities={entities} value="1" onChange={onChange} aggregateLabel="Votre périmètre" />);
    const trigger = screen.getByRole('button', { name: 'Périmètre du radar : GOURY' });
    const bounds = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 120, 260, 44));
    const focus = vi.spyOn(trigger, 'focus');
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: 'Périmètres du radar' })).toBeVisible();
    focus.mockClear();
    bounds.mockReturnValue(new DOMRect(20, -100, 260, 44));
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(onChange).not.toHaveBeenCalled();
  });
});
