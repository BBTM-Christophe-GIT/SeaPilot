import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ServiceProviderPicker } from './ServiceProviderPicker';
import type { ServiceProviderCatalogEntry } from './serviceProviders';

const providers: ServiceProviderCatalogEntry[] = [
  { id: 1, name: 'Ports Normands', specialties: [{ name: 'Frais de port', active: true }] },
  { id: 2, name: 'TotalEnergies', specialties: [{ name: 'Fuel', active: true }] },
];

function PickerFixture({
  initialValue,
  onChange,
  onAdd,
}: {
  initialValue: string;
  onChange: (provider: ServiceProviderCatalogEntry) => void;
  onAdd?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return <ServiceProviderPicker label="Fournisseur" providers={providers} value={value} required onAdd={onAdd} onChange={(provider) => {
    setValue(provider.name);
    onChange(provider);
  }} />;
}

describe('ServiceProviderPicker selection and search', () => {
  it('shows the search icon in an empty field without a selected provider', () => {
    const view = render(<PickerFixture initialValue="" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Fournisseur' })).toBeRequired();
    expect(view.container.querySelector('.lucide-search')).toBeInTheDocument();
  });

  it('hides the icon for the selected supplier and preserves specialty filtering, keyboard selection and adding', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAdd = vi.fn();
    const view = render(<PickerFixture initialValue="Ports Normands" onChange={onChange} onAdd={onAdd} />);
    const input = screen.getByRole('combobox', { name: 'Fournisseur' });
    expect(input).toHaveValue('Ports Normands');
    expect(view.container.querySelector('.lucide-search')).not.toBeInTheDocument();
    expect(view.container.querySelector('.lucide-chevron-down')).toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('group', { name: 'Frais de port' })).toBeVisible();
    expect(view.container.querySelector('.lucide-search')).not.toBeInTheDocument();
    await user.clear(input);
    expect(view.container.querySelector('.lucide-search')).toBeInTheDocument();
    await user.type(input, 'fuel');
    expect(screen.getByRole('group', { name: 'Fuel' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Frais de port' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(providers[1]);
    expect(input).toHaveValue('TotalEnergies');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(view.container.querySelector('.lucide-search')).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'aucun fournisseur');
    expect(screen.getByText('Aucune société ne correspond à la recherche.')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('TotalEnergies');
    expect(view.container.querySelector('.lucide-search')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
