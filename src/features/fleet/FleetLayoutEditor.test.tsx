import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { FleetLayoutEditor } from './FleetLayoutEditor';
import { DEFAULT_FLEET_LAYOUT, type FleetLayout } from './fleetLayout';

const layout: FleetLayout = [
  { id: 'identity', label: 'Identification', fields: [{ id: 'flagState', label: 'Pavillon' }] },
  {
    id: 'dimensions',
    label: 'Dimensions',
    fields: [{ id: 'lengthOverall', label: 'Longueur' }, { id: 'beamOverallM', label: 'Largeur' }],
  },
];

it('renames and reorders the shared layout in a draft and saves the same data identifiers', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<FleetLayoutEditor error="" layout={layout} onClose={vi.fn()} onSave={onSave} saving={false} />);

  const save = screen.getByRole('button', { name: 'Enregistrer' });
  expect(save).toBeDisabled();
  const categoryName = screen.getByRole('textbox', { name: 'Nom de la rubrique' });
  await user.clear(categoryName);
  expect(save).toBeDisabled();
  await user.type(categoryName, 'Immatriculation');
  await user.click(screen.getByRole('button', { name: 'Descendre la rubrique Immatriculation' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Déplacer le champ Pavillon vers une autre rubrique' }), 'dimensions');

  const moved = screen.getByRole('textbox', { name: 'Nom du champ 3' });
  expect(moved).toHaveValue('Pavillon');
  expect(moved).toHaveFocus();
  await user.clear(moved);
  await user.type(moved, 'Pavillon du navire');
  await user.click(screen.getByRole('button', { name: 'Monter le champ Pavillon du navire' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(layout[0].fields).toEqual([{ id: 'flagState', label: 'Pavillon' }]);

  await user.click(save);
  expect(onSave).toHaveBeenCalledExactlyOnceWith([
    { ...layout[1], fields: [layout[1].fields[0], { id: 'flagState', label: 'Pavillon du navire' }, layout[1].fields[1]] },
    { id: 'identity', label: 'Immatriculation', fields: [] },
  ]);
});

it('reports a save error and restores the defaults only in the draft', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<FleetLayoutEditor error="Enregistrement indisponible." layout={layout} onClose={onClose} onSave={onSave} saving={false} />);

  expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement indisponible.');
  await user.click(screen.getByRole('button', { name: 'Rétablir le modèle' }));
  expect(screen.getByRole('textbox', { name: 'Nom de la rubrique' })).toHaveValue(DEFAULT_FLEET_LAYOUT[0].label);
  expect(onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith(DEFAULT_FLEET_LAYOUT);
  expect(onClose).not.toHaveBeenCalled();
});

it('edits English labels independently and leaves a cleared translation to the default', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const [identity, dimensions] = layout;
  const [flag] = identity.fields;
  const bilingual = [
    { ...identity, labelEn: 'Identification', fields: [{ ...flag, labelEn: 'Flag' }] },
    dimensions,
  ];
  render(<FleetLayoutEditor error="" layout={bilingual} onClose={vi.fn()} onSave={onSave} saving={false} />);

  await user.click(screen.getByRole('button', { name: 'Anglais' }));
  const categoryName = screen.getByRole('textbox', { name: 'Nom de la rubrique en anglais' });
  const fieldName = screen.getByRole('textbox', { name: 'Nom du champ 1 en anglais' });
  expect(fieldName).toHaveAccessibleDescription('Pavillon');
  await user.clear(categoryName);
  await user.type(categoryName, '  Vessel identity  ');
  await user.clear(fieldName);

  await user.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByRole('textbox', { name: 'Nom de la rubrique' })).toHaveValue(identity.label);
  expect(screen.getByRole('textbox', { name: 'Nom du champ 1' })).toHaveValue(flag.label);
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith([{ ...identity, labelEn: 'Vessel identity' }, dimensions]);
});
