import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../../components/AppDialog';
import { BillingServiceQuantityFields } from './BillingServiceQuantityFields';
import type { BillingServiceQuantityMode } from './projectBilling';

interface Settings {
  quantityMode?: BillingServiceQuantityMode;
  quantityOperationTypes?: string[];
}
function Fixture({ initial, onChange, disabled = false }: {
  initial: Settings;
  onChange: (settings: Settings) => void;
  disabled?: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  return <BillingServiceQuantityFields {...settings} disabled={disabled} legacyLabel="Réglage actuel"
    operationTypes={[' 24/24 Operation ', 'Déplacement particulier']}
    onChange={(changes) => { setSettings(changes); onChange(changes); }} />;
}
function trigger() { return screen.getByRole('button', { name: 'Calcul quantité' }); }

describe('billing service quantity menu', () => {
  it('preserves the legacy rule until an explicit mode is chosen and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture initial={{ quantityOperationTypes: ['Type importé'] }} onChange={onChange} />);
    expect(trigger()).toHaveAccessibleDescription('Réglage actuel');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(trigger());
    expect(screen.getByText('Réglage actuel · actuel')).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Manuel' }));
    expect(trigger()).toHaveAccessibleDescription('Manuel');
    expect(trigger()).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'manual', quantityOperationTypes: ['Type importé'] });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Manuel, mode sélectionné' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps operation choices inside the popup, normalizes aliases and retains unknown types across modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture initial={{ quantityMode: 'operations', quantityOperationTypes: [' 24/24 operation ', '24/24   OPERATION', 'Type importé'] }} onChange={onChange} />);
    expect(screen.queryByText('Types d’opérations à compter')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleDescription('Types d’opérations sélectionnés · 24/24 Operation, Type importé');
    await user.click(trigger());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Manuel' })).toHaveFocus());
    expect(screen.getAllByRole('menuitem', { name: /^24\/24 Operation/ })).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: 'Type importé, sélectionné' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '14h Port Call' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: '24/24 Operation, sélectionné' }));
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'operations', quantityOperationTypes: ['Type importé'] });
    expect(screen.getByRole('menu')).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Déplacement particulier' }));
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'operations', quantityOperationTypes: ['Type importé', 'Déplacement particulier'] });
    expect(screen.getByRole('menuitem', { name: 'Déplacement particulier, sélectionné' })).toHaveFocus();
    await user.click(screen.getByRole('menuitem', { name: 'Jours de la période sélectionnée' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Jours du mois sélectionné' }));
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'month', quantityOperationTypes: ['Type importé', 'Déplacement particulier'] });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Types d’opérations sélectionnés' }));
    expect(screen.getByRole('menuitem', { name: 'Type importé, sélectionné' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Déplacement particulier, sélectionné' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '24/24 Operation' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Terminer' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('supports keyboard choices and closes Escape inside the modal without closing its dialog', async () => {
    const user = userEvent.setup();
    const closeDialog = vi.fn();
    render(<AppDialog onClose={closeDialog} title="Prestation"><Fixture initial={{ quantityMode: 'manual' }} onChange={vi.fn()} /></AppDialog>);
    const dialog = screen.getByRole('dialog', { name: 'Prestation' });
    trigger().focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('menu', { name: 'Calcul quantité' });
    expect(menu.closest('.app-dialog')).toBe(dialog);
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Manuel, mode sélectionné' })).toHaveFocus());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(trigger()).toHaveAccessibleDescription('Jours de la période sélectionnée');
    expect(trigger()).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Manuel' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(dialog).toBeVisible();
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it('closes on a second trigger click, outside interaction and Tab without rewriting settings', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<><button type="button">Champ précédent</button><Fixture initial={{ quantityMode: 'manual' }} onChange={onChange} />
      <button disabled type="button">Indisponible</button><div style={{ display: 'none' }}><button type="button">Champ masqué</button></div>
      <button type="button">Champ suivant</button></>);
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Champ suivant' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Champ suivant' })).toHaveFocus();
    await user.click(trigger());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Manuel, mode sélectionné' })).toHaveFocus());
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Champ suivant' })).toHaveFocus();
    await user.click(trigger());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Manuel, mode sélectionné' })).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Champ précédent' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prevents reader changes and dismisses an open menu when permissions, saving or the external mode changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(<BillingServiceQuantityFields disabled quantityMode="operations" quantityOperationTypes={['24/24 Operation']} onChange={onChange} />);
    expect(trigger()).toBeDisabled();
    await user.click(trigger());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    view.rerender(<BillingServiceQuantityFields quantityMode="manual" onChange={onChange} />);
    await user.click(trigger());
    expect(screen.getByRole('menu')).toBeVisible();
    view.rerender(<BillingServiceQuantityFields disabled quantityMode="manual" onChange={onChange} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    view.rerender(<BillingServiceQuantityFields quantityMode="manual" onChange={onChange} />);
    await user.click(trigger());
    view.rerender(<BillingServiceQuantityFields quantityMode="month" onChange={onChange} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleDescription('Jours du mois sélectionné');
    expect(onChange).not.toHaveBeenCalled();
  });
});
