import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PharmacyCategoriesDialog } from './PharmacyCategoriesDialog';
import { blankPharmacyItem, type PharmacyCategory, type PharmacyItem, type PharmacyMedicalSection } from './pharmacyModel';

const category: PharmacyCategory = { id: 1, company_id: 1, vessel_id: 2, name: '2. SOINS', medical_section: 'medicines', revision: 3, created_at: '', updated_at: '' };
const item: PharmacyItem = { ...blankPharmacyItem(), id: 10, company_id: 1, vessel_id: 2, category: '2. SOINS', medical_section: 'medicines', designation: 'Article conservé', revision: 2, source_file: 'Source.xlsx', source_sheet: 'Feuille', source_row: 1, updated_at: '' };
function show({ categories = [category], items = [item], busy = false, medicalDotation = '', notice = '', initialMedicalSection = 'medicines' }: { categories?: PharmacyCategory[]; items?: PharmacyItem[]; busy?: boolean; medicalDotation?: string; notice?: string; initialMedicalSection?: 'all' | PharmacyMedicalSection } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined); const onDelete = vi.fn().mockResolvedValue(undefined); const onClose = vi.fn();
  const view = render(<PharmacyCategoriesDialog vesselName="SUROIT" medicalDotation={medicalDotation} initialMedicalSection={initialMedicalSection} categories={categories} items={items} busy={busy} notice={notice} onSave={onSave} onDelete={onDelete} onClose={onClose} />);
  return { onSave, onDelete, onClose, ...view };
}
describe('PharmacyCategoriesDialog', () => {
  it('sorts numbered categories naturally and counts active plus retired articles', () => {
    show({ categories: [{ ...category, id: 10, name: '10. DERMATOLOGIE' }, category, { ...category, id: 3, name: '1. CARDIOLOGIE' }], items: [item, { ...item, id: 11, active: false }] });
    const rows = within(screen.getByRole('list', { name: 'Catégories de SUROIT' })).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(['1. CARDIOLOGIE', '2. SOINS', '10. DERMATOLOGIE']);
    expect(rows[1]).toHaveTextContent('2 articles · 1 retiré');
    expect(rows[0]).toHaveTextContent('0 article');
  });
  it('shows an empty catalogue and trims a name before adding an empty category', async () => {
    const test = show({ categories: [], items: [] });
    expect(screen.getByText(/Aucune catégorie dans cette dotation/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: '  TROUSSE VIDE  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await screen.findByLabelText('Nouvelle catégorie');
    expect(test.onSave).toHaveBeenCalledExactlyOnceWith('TROUSSE VIDE', undefined, 'medicines');
    await act(async () => {});
    expect(screen.getByLabelText('Nouvelle catégorie')).toHaveValue('');
  });
  it.each(['', '   ', '  2. soins  '])('rejects an empty or duplicate category without writing: %j', (name) => {
    const test = show();
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert')).toHaveTextContent(name.trim() ? 'Une catégorie porte déjà ce nom' : '1 à 200 caractères');
    expect(test.onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nouvelle catégorie')).toHaveAttribute('maxlength', '200');
  });
  it('preserves the typed name after a network failure and allows an explicit retry', async () => {
    const test = show(); test.onSave.mockRejectedValueOnce(new Error('Connexion indisponible.'));
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: 'NOUVELLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion indisponible.');
    expect(screen.getByLabelText('Nouvelle catégorie')).toHaveValue('NOUVELLE');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await act(async () => {});
    expect(test.onSave).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Nouvelle catégorie')).toHaveValue('');
  });
  it('cancels an inline rename and skips saving an unchanged name', () => {
    const test = show();
    fireEvent.click(screen.getByRole('button', { name: 'Renommer 2. SOINS' }));
    fireEvent.change(screen.getByLabelText('Nouveau nom de 2. SOINS'), { target: { value: 'Autre nom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le renommage de 2. SOINS' }));
    expect(screen.queryByLabelText('Nouveau nom de 2. SOINS')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Renommer 2. SOINS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer 2. SOINS' }));
    expect(test.onSave).not.toHaveBeenCalled();
  });
  it('requires confirmation and explains that every article is retained without its category', async () => {
    const test = show({ items: [item, { ...item, id: 11, active: false }] });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2. SOINS' }));
    const confirmation = screen.getByRole('dialog', { name: 'Supprimer la catégorie 2. SOINS' });
    expect(confirmation).toHaveTextContent('SUROIT');
    expect(confirmation).toHaveTextContent('2 articles, y compris les articles retirés, sur SUROIT');
    expect(confirmation).toHaveTextContent('Les articles et leur historique sont conservés.');
    expect(test.onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('dialog', { name: 'Gérer les catégories' })).toBeInTheDocument();
    expect(test.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2. SOINS' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await act(async () => {});
    expect(test.onDelete).toHaveBeenCalledExactlyOnceWith(category);
  });
  it('keeps a failed deletion open with the original revision for conflict recovery', async () => {
    const test = show(); test.onDelete.mockRejectedValue(new Error('Cette catégorie a été modifiée. Actualisez l’inventaire.'));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2. SOINS' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette catégorie a été modifiée.');
    expect(screen.getByRole('dialog', { name: 'Supprimer la catégorie 2. SOINS' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' })).toBeEnabled();
    expect(test.onDelete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 1, revision: 3 }));
  });
  it('blocks duplicate submissions and closing while a save is pending', async () => {
    let finish: () => void = () => undefined;
    const test = show(); test.onSave.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: 'NOUVELLE' } });
    const add = screen.getByRole('button', { name: 'Ajouter' });
    fireEvent.click(add); fireEvent.click(add);
    expect(test.onSave).toHaveBeenCalledOnce();
    expect(add).toBeDisabled(); expect(screen.getByLabelText('Nouvelle catégorie')).toBeDisabled();
    for (const close of screen.getAllByRole('button', { name: 'Fermer' })) expect(close).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(test.onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(add).toBeEnabled();
  });
  it('limits the catalogue, counts and confirmation to the captured parent even when another type has the same category', async () => {
    const selected = { ...category, medical_dotation: 'Dotation C' };
    const other = { ...category, id: 2, medical_dotation: 'Dotation B' };
    const test = show({ medicalDotation: 'Dotation C', categories: [selected, other, { ...other, id: 3, name: 'AUTRE B' }], items: [{ ...item, medical_dotation: 'Dotation C' }, { ...item, id: 11, medical_dotation: 'Dotation B' }] });
    expect(screen.getByRole('dialog')).toHaveTextContent('SUROIT · Dotation C');
    expect(screen.getAllByRole('button', { name: 'Renommer 2. SOINS' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Renommer AUTRE B' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2. SOINS' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('1 article, y compris les articles retirés');
    expect(screen.getByRole('dialog')).toHaveTextContent('Dotation C, branche Médicaments');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await act(async () => {});
    expect(test.onDelete).toHaveBeenCalledExactlyOnceWith(selected);
  });
  it('allows a name used in another dotation and never falls back to that parent catalogue', async () => {
    const test = show({ medicalDotation: 'Dotation C', categories: [{ ...category, medical_dotation: 'Dotation B' }] });
    expect(screen.getByText(/Aucune catégorie dans cette dotation/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: category.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await act(async () => {});
    expect(test.onSave).toHaveBeenCalledExactlyOnceWith(category.name, undefined, 'medicines');
  });
  it('hides an earlier success notice when validation reports an error', () => {
    show({ notice: 'Catégorie enregistrée.' });
    expect(screen.getByRole('status')).toHaveTextContent('Catégorie enregistrée.');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1 à 200 caractères');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('requires a creation branch and accepts the same category name in another branch of the shared catalogue', async () => {
    const test = show({ initialMedicalSection: 'all', categories: [category] });
    fireEvent.change(screen.getByLabelText('Nouvelle catégorie'), { target: { value: category.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez la branche'); expect(test.onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Branche du catalogue'), { target: { value: 'equipment' } });
    expect(screen.queryByRole('button', { name: 'Renommer 2. SOINS' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await act(async () => {});
    expect(test.onSave).toHaveBeenCalledExactlyOnceWith(category.name, undefined, 'equipment');
  });
  it('disambiguates identical category actions across branches and describes the shared deletion impact without a made-up fleet count', () => {
    show({ initialMedicalSection: 'all', categories: [category, { ...category, id: 2, medical_section: 'equipment' }], items: [item, { ...item, id: 12, medical_section: 'equipment' }] });
    expect(screen.getByRole('button', { name: 'Renommer 2. SOINS — Médicaments' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2. SOINS — Matériel médical et objets de pansement' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('1 article, y compris les articles retirés, sur SUROIT');
    expect(dialog).toHaveTextContent('Sur tous les navires de la société partageant cette dotation et cette branche');
    expect(dialog).toHaveTextContent('Les quantités restent propres à chaque navire.');
    expect(dialog).not.toHaveTextContent('2 articles');
  });
});
