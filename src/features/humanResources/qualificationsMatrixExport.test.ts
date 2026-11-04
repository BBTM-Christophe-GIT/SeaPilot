import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openQualificationsMatrix } from './qualificationsMatrixExport';
import { buildQualificationsMatrixPdf } from './qualificationsMatrixPdf';
import type { QualificationsMatrix } from './qualificationsMatrixModel';

vi.mock('./qualificationsMatrixPdf', () => ({ buildQualificationsMatrixPdf: vi.fn() }));
const matrix: QualificationsMatrix = { categories: [{ key: 'deck', label: 'Pont' }], groups: [], peopleCount: 0 };
const popup = () => ({ opener: {}, document: { title: '', body: { textContent: '' } },
  closed: false, close: vi.fn(), location: { replace: vi.fn() } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:qualification-matrix'), revokeObjectURL: vi.fn() });
  vi.mocked(buildQualificationsMatrixPdf).mockReset().mockResolvedValue({
    blob: new Blob(['synthetic PDF'], { type: 'application/pdf' }), fileName: 'Matrice-des-Qualifications-2026-11-04.pdf',
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('qualification matrix PDF opening', () => {
  it('opens before rendering, isolates the tab and releases the local PDF URL', async () => {
    const tab = popup();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const result = openQualificationsMatrix(matrix);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(tab.document.body.textContent).toContain('Préparation');
    expect(tab.opener).toBeNull();
    await expect(result).resolves.toBe(true);
    expect(buildQualificationsMatrixPdf).toHaveBeenCalledWith(matrix);
    expect(tab.location.replace).toHaveBeenCalledWith('blob:qualification-matrix');
    const file = vi.mocked(URL.createObjectURL).mock.calls[0][0] as File;
    expect(file.name).toBe('Matrice-des-Qualifications-2026-11-04.pdf');
    expect(file.type).toBe('application/pdf');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qualification-matrix');
  });

  it('reports a blocked popup before generating a document', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openQualificationsMatrix(matrix)).resolves.toBe(false);
    expect(buildQualificationsMatrixPdf).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('closes the temporary tab and preserves a rendering error', async () => {
    const tab = popup();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.mocked(buildQualificationsMatrixPdf).mockRejectedValue(new Error('PDF indisponible'));
    await expect(openQualificationsMatrix(matrix)).rejects.toThrow('PDF indisponible');
    expect(tab.close).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does not open a PDF after the user closes its tab', async () => {
    const tab = { ...popup(), closed: true };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    await expect(openQualificationsMatrix(matrix)).rejects.toThrow('La fenêtre de la matrice a été fermée');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
