import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PharmacyItemForm } from './PharmacyForms';
import { blankPharmacyItem, type PharmacyItem } from './pharmacyModel';

describe('PharmacyItemForm medical dotation', () => {
  it('uses the vessel assignment for a new article while keeping the source section distinct', () => {
    const onSave = vi.fn();
    render(<PharmacyItemForm medicalDotation="Dotation C" categories={['SOINS C']} busy={false} error="" onClose={vi.fn()} onSave={onSave} />);
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
});
