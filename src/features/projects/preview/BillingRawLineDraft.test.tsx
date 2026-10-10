import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BillingRawLineDraft, { type BillingRawLineValues } from './BillingRawLineDraft';

afterEach(cleanup);

const initialValues: BillingRawLineValues = {
  serviceDate: '2026-10-05', designation: '', vesselName: 'GOURY', quantity: 1, unitAmountHt: 0,
};

function renderDraft(disabled = false) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onChange = vi.fn();
  render(<table><BillingRawLineDraft initialValues={initialValues} vesselNames={['GOURY', 'JERSEY']} editing={false} disabled={disabled} onChange={onChange} onSave={onSave} onCancel={onCancel} /></table>);
  const draft = within(screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' }));
  const submit = () => fireEvent.submit(draft.getByRole('form', { name: 'Enregistrer la ligne brute' }));
  return { draft, submit, onSave, onCancel, onChange };
}

describe('billing raw line inline draft', () => {
  it('focuses the designation and saves the entered billing values with a trimmed designation', () => {
    const { draft, submit, onSave, onChange } = renderDraft();
    expect(draft.getByLabelText('Désignation libre')).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(draft.getByLabelText('Désignation libre'), { target: { value: '  Assistance portuaire  ' } });
    fireEvent.change(draft.getByLabelText('Date'), { target: { value: '2026-10-08' } });
    fireEvent.change(draft.getByLabelText('Navire'), { target: { value: 'JERSEY' } });
    fireEvent.change(draft.getByLabelText('Quantité'), { target: { value: '1.25' } });
    fireEvent.change(draft.getByLabelText('Prix unitaire HT'), { target: { value: '62.5' } });
    submit();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      serviceDate: '2026-10-08', designation: 'Assistance portuaire', vesselName: 'JERSEY', quantity: 1.25, unitAmountHt: 62.5,
    });
    expect(onChange).toHaveBeenLastCalledWith({
      serviceDate: '2026-10-08', designation: '  Assistance portuaire  ', vesselName: 'JERSEY', quantity: '1.25', unitAmountHt: '62.5',
    });
  });

  it('rejects incomplete dates, blank designations, zero quantity and negative prices while allowing a zero price', () => {
    const { draft, submit, onSave } = renderDraft();
    fireEvent.change(draft.getByLabelText('Désignation libre'), { target: { value: '   ' } });
    submit();
    expect(draft.getByRole('alert')).toHaveTextContent('Renseignez une désignation.');
    fireEvent.change(draft.getByLabelText('Désignation libre'), { target: { value: 'Assistance portuaire' } });
    fireEvent.change(draft.getByLabelText('Date'), { target: { value: '' } });
    submit();
    expect(draft.getByRole('alert')).toHaveTextContent('Renseignez une date valide.');
    fireEvent.change(draft.getByLabelText('Date'), { target: { value: '2026-10-05' } });
    fireEvent.change(draft.getByLabelText('Quantité'), { target: { value: '0' } });
    submit();
    expect(draft.getByRole('alert')).toHaveTextContent('La quantité doit être supérieure à zéro.');
    fireEvent.change(draft.getByLabelText('Quantité'), { target: { value: '1' } });
    fireEvent.change(draft.getByLabelText('Prix unitaire HT'), { target: { value: '-10' } });
    submit();
    expect(draft.getByRole('alert')).toHaveTextContent('Le prix unitaire HT doit être positif ou nul.');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(draft.getByLabelText('Prix unitaire HT'), { target: { value: '0' } });
    submit();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ ...initialValues, designation: 'Assistance portuaire' });
  });

  it('cancels on Escape without saving and blocks submission while disabled', () => {
    const { draft, onCancel, onSave, submit } = renderDraft(true);
    expect(draft.getByLabelText('Désignation libre')).toBeDisabled();
    expect(draft.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    submit();
    fireEvent.keyDown(draft.getByLabelText('Désignation libre'), { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    cleanup();
    const enabled = renderDraft();
    fireEvent.keyDown(enabled.draft.getByLabelText('Désignation libre'), { key: 'Escape' });
    expect(enabled.onCancel).toHaveBeenCalledOnce();
    expect(enabled.onSave).not.toHaveBeenCalled();
  });
});
