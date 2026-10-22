import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PharmacyItemForm } from './PharmacyForms';
import { blankPharmacyItem, type PharmacyItem } from './pharmacyModel';

describe('PharmacyItemForm medical dotation', () => {
  it('uses the vessel assignment for a new article while keeping the source section distinct', () => {
    const onSave = vi.fn();
    render(<PharmacyItemForm medicalDotation="Dotation C" medicalSection="medicines" categories={['SOINS C']} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByLabelText('Type de dotation médicale')).toHaveValue('Dotation C');
    expect(screen.getByLabelText('Type de dotation médicale')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Section d’origine'), { target: { value: 'Source médicaments' } });
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'Nouvel article' } });
    fireEvent.submit(dialog);
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ medical_dotation: 'Dotation C', section: 'Source médicaments', designation: 'Nouvel article' }));
    expect([...dialog.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toEqual(['SOINS C']);
  });
  it.each(['Dotation B', ''])('preserves the saved article parent %j when the vessel now has a different assignment', (medicalDotation) => {
    const article: PharmacyItem = { ...blankPharmacyItem(), medical_dotation: medicalDotation, id: 1, company_id: 1, vessel_id: 1, designation: 'Article historique', revision: 2, source_file: 'Source.xlsx', source_sheet: 'Feuille', source_row: 3, updated_at: '' };
    const onSave = vi.fn();
    render(<PharmacyItemForm item={article} medicalDotation="Dotation C" categories={['SOINS B']} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('Type de dotation médicale')).toHaveValue(medicalDotation || 'Dotation non renseignée');
    expect(screen.getByText('Le type enregistré avec cet article est conservé.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ medical_dotation: medicalDotation, revision: 2, source_file: 'Source.xlsx' }));
  });
  it('requires an explicit branch and resets the category and suggestions when that choice changes', () => {
    const onSave = vi.fn();
    const records = [{ id: 1, company_id: 1, vessel_id: 1, medical_dotation: 'Dotation B', medical_section: 'medicines' as const, name: 'MÉDICAMENT COMMUN', revision: 1, created_at: '', updated_at: '' }, { id: 2, company_id: 1, vessel_id: 1, medical_dotation: 'Dotation B', medical_section: 'equipment' as const, name: 'MATÉRIEL COMMUN', revision: 1, created_at: '', updated_at: '' }];
    render(<PharmacyItemForm medicalDotation="Dotation B" categories={[]} categoryRecords={records} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('Branche')).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'À classer' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'Article' } });
    fireEvent.change(screen.getByLabelText('Section d’origine'), { target: { value: 'Médicaments dans le fichier original' } });
    fireEvent.submit(screen.getByRole('dialog'));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez la branche'); expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'equipment' } });
    expect([...screen.getByRole('dialog').querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toEqual(['MATÉRIEL COMMUN']);
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'MATÉRIEL COMMUN' } });
    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'medicines' } });
    expect(screen.getByLabelText('Catégorie')).toHaveValue('');
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ medical_section: 'medicines', category: '', section: 'Médicaments dans le fichier original' }));
  });
  it('keeps an unclassified legacy branch until the manager explicitly corrects it', () => {
    const article: PharmacyItem = { ...blankPharmacyItem(), medical_dotation: 'Dotation B', medical_section: 'unclassified', category: 'ANCIENNE CATÉGORIE', category_id: 44, id: 1, company_id: 1, vessel_id: 1, designation: 'Héritage', section: 'Texte ambigu médicaments', quantity: '12 boîtes', revision: 5, source_file: 'Source.xlsx', source_sheet: 'Feuille', source_row: 2, updated_at: '' };
    const onSave = vi.fn();
    render(<PharmacyItemForm item={article} medicalDotation="Dotation C" categories={[]} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('Branche')).toHaveValue('unclassified');
    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'equipment' } });
    expect(screen.getByLabelText('Catégorie')).toHaveValue('');
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ medical_dotation: 'Dotation B', medical_section: 'equipment', category: '', category_id: null, quantity: '12 boîtes', revision: 5, source_file: 'Source.xlsx' }));
  });
});
