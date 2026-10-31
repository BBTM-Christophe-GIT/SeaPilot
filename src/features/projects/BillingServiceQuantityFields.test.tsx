import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

describe('billing service quantity fields', () => {
  it('preserves the legacy rule until an explicit mode is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture initial={{ quantityOperationTypes: ['Type importé'] }} onChange={onChange} />);
    const mode = screen.getByRole('combobox', { name: 'Mode de quantité' });
    expect(mode).toHaveDisplayValue('Réglage actuel');
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(mode, 'manual');
    expect(mode).toHaveDisplayValue('Manuel');
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'manual', quantityOperationTypes: ['Type importé'] });
    expect(screen.queryByRole('option', { name: 'Réglage actuel' })).not.toBeInTheDocument();
  });

  it('matches operation aliases once, removes all matching aliases and retains unknown types across modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture initial={{ quantityMode: 'operations', quantityOperationTypes: [' 24/24 operation ', '24/24   OPERATION', 'Type importé'] }} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Types d’opérations à compter' })).toBeVisible();
    expect(screen.getAllByRole('checkbox', { name: '24/24 Operation' })).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: '24/24 Operation' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Type importé' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '14h Port Call' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '24/24 Operation' }));
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'operations', quantityOperationTypes: ['Type importé'] });
    await user.click(screen.getByRole('checkbox', { name: 'Déplacement particulier' }));
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'operations', quantityOperationTypes: ['Type importé', 'Déplacement particulier'] });

    const mode = screen.getByRole('combobox', { name: 'Mode de quantité' });
    await user.selectOptions(mode, 'period');
    expect(screen.queryByRole('group', { name: 'Types d’opérations à compter' })).not.toBeInTheDocument();
    await user.selectOptions(mode, 'month');
    expect(onChange).toHaveBeenLastCalledWith({ quantityMode: 'month', quantityOperationTypes: ['Type importé', 'Déplacement particulier'] });
    await user.selectOptions(mode, 'operations');
    expect(screen.getByRole('checkbox', { name: 'Type importé' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Déplacement particulier' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '24/24 Operation' })).not.toBeChecked();
  });

  it('keeps the mode and operation choices disabled for a reader or pending save', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture disabled initial={{ quantityMode: 'operations', quantityOperationTypes: ['24/24 Operation'] }} onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: 'Mode de quantité' })).toBeDisabled();
    const operation = screen.getByRole('checkbox', { name: '24/24 Operation' });
    expect(operation).toBeDisabled();
    await user.click(operation);
    expect(onChange).not.toHaveBeenCalled();
  });
});
