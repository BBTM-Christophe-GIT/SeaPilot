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
    expect(screen.queryByLabelText('Section d’origine')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'equipment' } });
    expect(screen.getByLabelText('Catégorie')).toHaveValue('');
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ medical_dotation: 'Dotation B', medical_section: 'equipment', category: '', category_id: null, section: article.section, quantity: '12 boîtes', revision: 5, source_file: 'Source.xlsx' }));
  });
  it('saves the dispensing units, package size and dosage and clears the date when marked as inapplicable', () => {
    const article: PharmacyItem = { ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 1, designation: 'Article', medical_section: 'medicines', expires_on: '2027-06-30', expiry_precision: 'day', expiry_text: 'Juin 2027', revision: 1, source_file: '', source_sheet: '', source_row: null, updated_at: '' };
    const onSave = vi.fn();
    render(<PharmacyItemForm item={article} categories={[]} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('Date de péremption')).toHaveValue('2027-06-30');
    fireEvent.change(screen.getByLabelText('Quantité à bord'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Quantité requise'), { target: { value: '9' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Unité de stock' }), { target: { value: 'comprimé' } });
    fireEvent.change(screen.getByLabelText('Unités par boîte'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Dosage ou volume par unité'), { target: { value: '300 mg' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hors dotation' }));
    expect(screen.getByLabelText('Quantité requise')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sans date de péremption' }));
    expect(screen.queryByLabelText('Date de péremption')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outside_dotation: true, no_expiry: true, expires_on: null, expiry_precision: 'unknown', expiry_text: '', stock_quantity: 6, required_stock_quantity: 9, stock_unit: 'comprimé', package_size: 3, strength: '300 mg', update_dotation_requirement: false }));
  });
  it('prefills a common requirement and edits it separately from the vessel stock', () => {
    const onSave = vi.fn();
    render(<PharmacyItemForm medicalDotation="C Restreint" medicalSection="medicines" requirements={[{
      dotation_key: 'dotation c restreinte', medical_section: 'medicines', designation: 'Sérum physiologique', designation_key: 'serum physiologique',
      required_quantity: '20', required_stock_quantity: 20, required_stock_unit: 'ampoule', required_strength: '5 mL', dotation_requirement_revision: 3,
    }]} categories={[]} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'SÉRUM  PHYSIOLOGIQUE' } });
    const stock = within(screen.getByRole('group', { name: 'Stock à bord' }));
    const dotation = within(screen.getByRole('group', { name: 'Dotation' }));
    expect(dotation.getByLabelText('Quantité requise')).toHaveValue('20');
    expect(dotation.getByLabelText('Unité de dotation')).toHaveValue('ampoule');
    expect(dotation.getByLabelText('Dosage ou volume requis par unité')).toHaveValue('5 mL');
    expect(stock.getByLabelText('Quantité à bord')).toHaveValue('');
    fireEvent.change(stock.getByLabelText('Quantité à bord'), { target: { value: '10' } });
    fireEvent.change(stock.getByLabelText('Unité de stock'), { target: { value: 'flacon' } });
    fireEvent.change(stock.getByLabelText('Dosage ou volume par unité'), { target: { value: '10 mL' } });
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ stock_quantity: 10, stock_unit: 'flacon', strength: '10 mL',
      required_stock_quantity: 20, required_stock_unit: 'ampoule', required_strength: '5 mL', update_dotation_requirement: false, dotation_requirement_revision: 3 }));
    fireEvent.change(dotation.getByLabelText('Quantité requise'), { target: { value: '22' } });
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ stock_quantity: 10, required_stock_quantity: 22, update_dotation_requirement: true, dotation_requirement_revision: 3 }));
  });
  it('keeps a previously saved stock unit outside the list', () => {
    const article: PharmacyItem = { ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 1, designation: 'Article', medical_section: 'equipment', stock_unit: 'rouleau', revision: 1, source_file: '', source_sheet: '', source_row: null, updated_at: '' };
    const onSave = vi.fn();
    render(<PharmacyItemForm item={article} categories={[]} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole('option', { name: 'Autre unité…', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Préciser l’unité')).toHaveValue('rouleau');
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ stock_unit: 'rouleau' }));
  });
  it('can explicitly share an unchanged legacy requirement', () => {
    const item: PharmacyItem = { ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 1, designation: 'Compresses',
      medical_dotation: 'Dotation B', medical_section: 'equipment', required_quantity: '20 pièces', revision: 2,
      source_file: '', source_sheet: '', source_row: null, updated_at: '' };
    const onSave = vi.fn();
    render(<PharmacyItemForm item={item} categories={[]} requirements={[]} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ update_dotation_requirement: false }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Partager cette dotation' }));
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ update_dotation_requirement: true, required_quantity: '20 pièces', dotation_requirement_revision: null }));
  });
});
