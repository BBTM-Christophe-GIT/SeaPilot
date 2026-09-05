import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QhseReportComposer } from './QhseReportComposer';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import type { QhseReportSnapshot } from './qhseReportData';
import * as assembly from './qhseReportAssembly';
import * as pdf from './qhseReportPdf';

describe('Physical-page selection UI', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:qa-report'), revokeObjectURL: vi.fn() }));
  });
  it('allows exactly one page, disables empty exports and invalidates preparation on filter changes', async () => {
    const user = userEvent.setup();
    const prepared = { documents: [], pages: [
      { id: 'safety:0', reportId: 'safety', reportTitle: 'Sécurité', sourceIndex: 0, documentIndex: 0, number: 1 },
      { id: 'safety:1', reportId: 'safety', reportTitle: 'Sécurité', sourceIndex: 1, documentIndex: 0, number: 2 },
    ] };
    vi.spyOn(assembly, 'prepareQhseReport').mockResolvedValue(prepared);
    const compose = vi.spyOn(assembly, 'composeQhseReport').mockResolvedValue(new Blob(['PDF']));
    const download = vi.spyOn(pdf, 'downloadQhseBlob').mockImplementation(() => {});
    const props = { reports: [QHSE_REPORT_CATALOG[1]], options: {}, scopeKey: '2026:all', disabled: false, getSnapshot: vi.fn().mockResolvedValue({} as QhseReportSnapshot), onBusy: vi.fn() };
    const { rerender } = render(<QhseReportComposer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Préparer 1 rapport(s)' }));
    expect(await screen.findByText('2 / 2 pages sélectionnées')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aucune page' }));
    expect(screen.getByRole('button', { name: 'Exporter 0 page(s) en PDF' })).toBeDisabled();
    const checkboxes = within(screen.getByRole('group', { name: 'Pages réellement générées' })).getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole('button', { name: 'Exporter 1 page(s) en PDF' }));
    expect(compose).toHaveBeenLastCalledWith(prepared, ['safety:1']);
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'Rapport-QHSE-1-page.pdf');
    rerender(<QhseReportComposer {...props} scopeKey="2025:all" />);
    expect(screen.queryByRole('group', { name: 'Pages réellement générées' })).not.toBeInTheDocument();
  });
});
