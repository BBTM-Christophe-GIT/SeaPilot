import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProcedureTagCatalogueDialog } from './ProcedureTagCatalogueDialog';

function dialogProps() {
  return { names: ['MARPOL', 'Pollution'], loading: false, loadError: '', onRetry: vi.fn(), onCreate: vi.fn().mockResolvedValue('THOMSEA'), onRemove: vi.fn().mockResolvedValue(undefined), onClose: vi.fn() };
}

describe('ProcedureTagCatalogueDialog', () => {
  it('adds a named tag and explains that catalogue removal preserves assigned documents', async () => {
    const user = userEvent.setup();
    const props = dialogProps();
    render(<ProcedureTagCatalogueDialog {...props} />);
    expect(screen.getByText(/restent associés aux documents/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter le tag' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nouveau tag'), { target: { value: '  THOMSEA  ' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le tag' }));
    expect(props.onCreate).toHaveBeenCalledWith('  THOMSEA  ');
    expect(await screen.findByText('Tag « THOMSEA » ajouté.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau tag')).toHaveValue('');
    await user.click(screen.getByLabelText('Supprimer le tag MARPOL'));
    expect(props.onRemove).toHaveBeenCalledWith('MARPOL');
    expect(await screen.findByText('Tag « MARPOL » supprimé de la liste.')).toBeInTheDocument();
  });

  it('preserves the input and reports errors when adding or removing a tag fails', async () => {
    const user = userEvent.setup();
    const props = dialogProps();
    props.onCreate.mockRejectedValue(new Error('Le nom du tag est invalide.'));
    props.onRemove.mockRejectedValue(new Error('La suppression a échoué.'));
    render(<ProcedureTagCatalogueDialog {...props} />);
    fireEvent.change(screen.getByLabelText('Nouveau tag'), { target: { value: 'Deux, tags' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le tag' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le nom du tag est invalide.');
    expect(screen.getByLabelText('Nouveau tag')).toHaveValue('Deux, tags');
    await user.click(screen.getByLabelText('Supprimer le tag Pollution'));
    expect(await screen.findByRole('alert')).toHaveTextContent('La suppression a échoué.');
    expect(screen.getByRole('list', { name: 'Tags pré-enregistrés' })).toHaveTextContent('Pollution');
  });

  it('disables writes and closing while adding a tag, then restores keyboard closing', async () => {
    const user = userEvent.setup();
    const props = dialogProps();
    let finish!: (name: string) => void;
    props.onCreate.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
    render(<ProcedureTagCatalogueDialog {...props} />);
    fireEvent.change(screen.getByLabelText('Nouveau tag'), { target: { value: 'THOMSEA' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le tag' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Nouveau tag')).toBeDisabled();
    expect(screen.getByLabelText('Supprimer le tag MARPOL')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    finish('THOMSEA');
    await screen.findByText('Tag « THOMSEA » ajouté.');
    expect(screen.getByLabelText('Nouveau tag')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('distinguishes loading and failures from an empty catalogue and offers retry', async () => {
    const user = userEvent.setup();
    const props = { ...dialogProps(), names: [], loading: true };
    const { rerender } = render(<ProcedureTagCatalogueDialog {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des tags pré-enregistrés…');
    expect(screen.queryByText('Aucun tag pré-enregistré pour le moment.')).not.toBeInTheDocument();
    rerender(<ProcedureTagCatalogueDialog {...props} loading={false} loadError="Impossible de charger les tags pré-enregistrés." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.queryByText('Aucun tag pré-enregistré pour le moment.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer le chargement des tags' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    rerender(<ProcedureTagCatalogueDialog {...props} loading={false} />);
    expect(screen.getByText('Aucun tag pré-enregistré pour le moment.')).toBeInTheDocument();
  });
});
