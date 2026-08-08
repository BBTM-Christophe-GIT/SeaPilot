import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeImportWorkbook } from './workingTimeExcelImportModel';
import { WorkingTimeImportWizard } from './WorkingTimeImportWizard';
import {
  commitWorkingTimeImport,
  createWorkingTimeImportBatchAndUpload,
  fetchWorkingTimeImportPeople,
  previewWorkingTimeImport,
  sha256WorkingTimeImportFile,
} from './workingTimeImportQueries';

vi.mock('./workingTimeImportQueries', () => ({
  fetchWorkingTimeImportPeople: vi.fn(), sha256WorkingTimeImportFile: vi.fn(),
  createWorkingTimeImportBatchAndUpload: vi.fn(), previewWorkingTimeImport: vi.fn(),
  commitWorkingTimeImport: vi.fn(),
}));

const workbook: WorkingTimeImportWorkbook = {
  sourceFileName: 'Alexandre ROUPSARD - 2026.xlsm', detectedPersonName: 'Alexandre ROUPSARD',
  detectedYear: 2026, gridYear: 2025, fileNameYear: 2026,
  warnings: ['L’année du fichier diffère de la grille.'], macroPresent: true, macroExecution: 'disabled',
  parserVersion: 'seapilot-xlsm-v2', sheetNames: ['Janvier'], detectedWorkSeconds: 7200, reportedWorkSeconds: 7200,
  rows: [{ date: '2026-01-01', sourceSheet: 'Janvier', sourceRow: 5, detectedPhases: [{ startMinute: 480, endMinute: 600 }], reportedWorkSeconds: 7200, detectedWorkSeconds: 7200, captainName: 'Capitaine', vesselName: 'GOURY', imoNumber: '9213870', flagState: 'France', sourceComment: '', issues: ['source_year_mismatch'] }],
};

describe('WorkingTimeImportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkingTimeImportPeople).mockResolvedValue([{ id: 9, name: 'Alexandre ROUPSARD', functionLabel: 'Marin' }]);
    vi.mocked(sha256WorkingTimeImportFile).mockResolvedValue('a'.repeat(64));
    vi.mocked(createWorkingTimeImportBatchAndUpload).mockResolvedValue({ batchId: 42, storageBucket: 'working-time-imports', storagePath: '1/user/42/file.xlsm' });
    vi.mocked(previewWorkingTimeImport).mockResolvedValue({ batchId: 42, status: 'preview_ready', summary: { totalRows: 1, readyRows: 1, replacementRows: 0, excludedRows: 0, duplicateRows: 0, inconsistentRows: 0, blockedRows: 0, reportedWorkSeconds: 7200, effectiveWorkSeconds: 7200 }, rows: [{ id: 1, localWorkDate: '2026-01-01', effectiveWorkSeconds: 7200, vesselName: 'GOURY', watchGroup: 'Bordée 1', status: 'ready', issueCodes: [] }] });
    vi.mocked(commitWorkingTimeImport).mockResolvedValue({
      importedRows: 1, importedIntervals: 1, replacedRows: 0, replacedIntervals: 0,
      identicalRows: 0, approvedRegisters: 1, blockedDuringCommit: 0, remainingRows: 0,
    });
  });

  it('requires an explicit server preview before the final import', async () => {
    const parseWorkbook = vi.fn().mockResolvedValue(workbook);
    render(<WorkingTimeImportWizard client={{} as SupabaseClient} parseWorkbook={parseWorkbook} roles={['admin']} />);
    await waitFor(() => expect(fetchWorkingTimeImportPeople).toHaveBeenCalled());

    const file = new File(['xlsm'], workbook.sourceFileName);
    fireEvent.change(screen.getByLabelText(/Déposer le classeur annuel XLSM/), { target: { files: [file] } });
    await screen.findByText('Alexandre ROUPSARD');
    expect(screen.getByRole('alert')).toHaveTextContent('diffère');
    expect(screen.getByRole('button', { name: 'Valider l’import' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Contrôler l’import' }));
    await screen.findByText('Prête');
    expect(createWorkingTimeImportBatchAndUpload).toHaveBeenCalledTimes(1);
    expect(previewWorkingTimeImport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      personId: 9, replaceExistingDays: true,
    }));
    expect(screen.getByRole('button', { name: 'Valider l’import' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Valider l’import' }));
    await waitFor(() => expect(commitWorkingTimeImport).toHaveBeenCalledWith(expect.anything(), 42));
    expect(screen.getByText(/1 journée\(s\) approuvée\(s\) importée\(s\)/)).toBeInTheDocument();
  });

  it('replaces existing days without asking for a reason or reopening', async () => {
    render(<WorkingTimeImportWizard client={{} as SupabaseClient} parseWorkbook={vi.fn().mockResolvedValue(workbook)} roles={['admin']} />);
    await waitFor(() => expect(fetchWorkingTimeImportPeople).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/Déposer le classeur annuel XLSM/), { target: { files: [new File(['xlsm'], workbook.sourceFileName)] } });
    await screen.findByText('Alexandre ROUPSARD');

    expect(screen.getByRole('checkbox', { name: /Remplacer les journées existantes différentes/ })).toBeChecked();
    expect(screen.queryByLabelText('Motif d’audit')).not.toBeInTheDocument();
    expect(screen.getByText(/quel que soit le statut du registre, sans réouverture ni justification/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contrôler l’import' }));

    await waitFor(() => expect(previewWorkingTimeImport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      replaceExistingDays: true,
    })));
  });

  it('replaces the previous control success with an actionable validation error', async () => {
    vi.mocked(commitWorkingTimeImport).mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    render(<WorkingTimeImportWizard client={{} as SupabaseClient} parseWorkbook={vi.fn().mockResolvedValue(workbook)} roles={['admin']} />);
    await waitFor(() => expect(fetchWorkingTimeImportPeople).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/Déposer le classeur annuel XLSM/), { target: { files: [new File(['xlsm'], workbook.sourceFileName)] } });
    await screen.findByText('Alexandre ROUPSARD');

    fireEvent.click(screen.getByRole('button', { name: 'Contrôler l’import' }));
    await screen.findByText(/Contrôle serveur terminé/);
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’import' }));

    expect(await screen.findByText(/La validation de l’import a dépassé le délai serveur/)).toBeInTheDocument();
    expect(screen.queryByText(/Contrôle serveur terminé/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’import' })).toBeEnabled();
  });

  it('allows the server control when declared totals differ from detected phases', async () => {
    const mismatchWorkbook: WorkingTimeImportWorkbook = {
      ...workbook,
      detectedWorkSeconds: 7200,
      reportedWorkSeconds: 9000,
      rows: [{
        ...workbook.rows[0],
        reportedWorkSeconds: 9000,
        issues: ['source_year_mismatch', 'total_mismatch'],
      }],
    };
    vi.mocked(previewWorkingTimeImport).mockResolvedValueOnce({
      batchId: 42,
      status: 'preview_ready',
      summary: { totalRows: 1, readyRows: 0, replacementRows: 0, excludedRows: 0, duplicateRows: 0, inconsistentRows: 1, blockedRows: 0, reportedWorkSeconds: 9000, effectiveWorkSeconds: 0 },
      rows: [{ id: 1, localWorkDate: '2026-01-01', effectiveWorkSeconds: 7200, vesselName: 'GOURY', watchGroup: 'Bordée 1', status: 'inconsistent', issueCodes: ['total_mismatch'] }],
    });
    render(<WorkingTimeImportWizard client={{} as SupabaseClient} parseWorkbook={vi.fn().mockResolvedValue(mismatchWorkbook)} roles={['admin']} />);
    await waitFor(() => expect(fetchWorkingTimeImportPeople).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/Déposer le classeur annuel XLSM/), { target: { files: [new File(['xlsm'], mismatchWorkbook.sourceFileName)] } });
    await screen.findByText(/1 écart\(s\) de total seront analysés/);
    const controlButton = screen.getByRole('button', { name: 'Contrôler l’import' });
    expect(controlButton).toBeEnabled();

    fireEvent.click(controlButton);
    await screen.findByText('Incohérente');
    expect(screen.getByText(/corrigez les phases ou excluez-les/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’import' })).toBeDisabled();
  });

  it('is not rendered for a sailor', () => {
    const { container } = render(<WorkingTimeImportWizard client={{} as SupabaseClient} roles={['marin']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is not rendered for an armement profile', () => {
    const { container } = render(<WorkingTimeImportWizard client={{} as SupabaseClient} roles={['armement']} />);
    expect(container).toBeEmptyDOMElement();
  });
});
