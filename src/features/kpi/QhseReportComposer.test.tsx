import { act, render, screen, waitFor as waitForCondition } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QhseReportComposer } from './QhseReportComposer';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import type { QhseReportSnapshot } from './qhseReportData';
import * as assembly from './qhseReportAssembly';
import * as pdf from './qhseReportPdf';
vi.mock('./KpiPdfPreview', () => ({ default: () => <div title="Aperçu du rapport QHSE" /> }));
// Preparation is debounced. Allow a busy CI/Windows event loop to service that timer.
const waitFor = (assertion: () => void) => waitForCondition(assertion, { timeout: 5000 });

const prepared = { documents: [], pages: [0, 1].map((i) => ({ id: `consumption:${i}`, reportId: 'consumption', reportTitle: 'Consommation', sourceIndex: i, documentIndex: 0, number: i + 1 })) };
const blob = new Blob(['PDF']);
const props = () => ({ reports: [QHSE_REPORT_CATALOG.find((r) => r.id === 'consumption')!], options: {}, scopeKey: '2026:all', disabled: false, getSnapshot: vi.fn().mockResolvedValue({} as QhseReportSnapshot) });
describe('QHSE report workshop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:qa-report'), revokeObjectURL: vi.fn() }));
    vi.spyOn(assembly, 'prepareQhseReport').mockResolvedValue(prepared);
    vi.spyOn(assembly, 'composeQhseReport').mockResolvedValue(blob);
    vi.spyOn(pdf, 'downloadQhseBlob').mockImplementation(() => {});
  });
  it('previews exact physical pages, permits one page and exports the reviewed bytes without rebuilding', async () => {
    const user = userEvent.setup(); render(<QhseReportComposer {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter 2 pages en PDF' })).toBeEnabled());
    expect(await screen.findByTitle('Aperçu du rapport QHSE')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Pages à exporter/ }));
    await user.click(screen.getByRole('button', { name: 'Aucune page' }));
    expect(screen.getByRole('button', { name: 'Exporter 0 page en PDF' })).toBeDisabled();
    expect(screen.queryByTitle('Aperçu du rapport QHSE')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Page 2 · Consommation/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter 1 page en PDF' })).toBeEnabled());
    expect(assembly.composeQhseReport).toHaveBeenLastCalledWith(prepared, ['consumption:1']);
    const count = vi.mocked(assembly.composeQhseReport).mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Exporter 1 page en PDF' }));
    expect(pdf.downloadQhseBlob).toHaveBeenCalledWith(blob, 'Rapport-QHSE-1-page.pdf');
    expect(assembly.composeQhseReport).toHaveBeenCalledTimes(count);
  });
  it('keeps trend and forecast independent and invalidates old preview immediately', async () => {
    const user = userEvent.setup(); const parameters = props(); const { rerender } = render(<QhseReportComposer {...parameters} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Exporter 2/ })).toBeEnabled());
    await user.click(screen.getByRole('switch', { name: 'Tendance Fuel consommé' }));
    expect(screen.getByRole('switch', { name: 'Prévision Fuel consommé' })).not.toBeChecked();
    expect(screen.queryByTitle('Aperçu du rapport QHSE')).not.toBeInTheDocument();
    await waitFor(() => expect(assembly.prepareQhseReport).toHaveBeenLastCalledWith(parameters.reports, {}, expect.objectContaining({ trend: expect.objectContaining({ fuel: true }) }), expect.any(Function)));
    await waitFor(() => expect(screen.getByRole('button', { name: /Exporter 2/ })).toBeEnabled());
    rerender(<QhseReportComposer {...parameters} scopeKey="2025:goury" disabled />);
    expect(screen.queryByTitle('Aperçu du rapport QHSE')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter.*en PDF/ })).toBeDisabled();
  });
  it('ignores a slow preparation returned after filters change', async () => {
    let resolve!: (value: typeof prepared) => void;
    vi.mocked(assembly.prepareQhseReport).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const parameters = props(); const { rerender } = render(<QhseReportComposer {...parameters} />);
    await waitFor(() => expect(assembly.prepareQhseReport).toHaveBeenCalled());
    rerender(<QhseReportComposer {...parameters} scopeKey="2025:all" disabled />);
    await act(async () => resolve(prepared));
    expect(assembly.composeQhseReport).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Aperçu du rapport QHSE')).not.toBeInTheDocument();
  });
  it('disables generation and export when no reports are selected', async () => {
    const user = userEvent.setup(); render(<QhseReportComposer {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Aucun' }));
    expect(screen.getByRole('button', { name: /Exporter.*en PDF/ })).toBeDisabled();
    expect(screen.getByText('Choisissez un rapport')).toBeInTheDocument();
  });
});
