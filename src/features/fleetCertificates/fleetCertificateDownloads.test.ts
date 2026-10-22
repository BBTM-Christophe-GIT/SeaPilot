import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFleetCertificateDocuments, type FleetCertificateRecord } from './fleetCertificateQueries';

function certificate(index: number): FleetCertificateRecord {
  return {
    id: index, storageBucket: 'fleet-certificates', storagePath: `1/GRY/${index}.pdf`,
    fileName: `GOURY - Certificat ${index}.pdf`, documentTitle: `Certificat ${index}`,
  } as FleetCertificateRecord;
}

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:fleet-download');

beforeEach(() => {
  createObjectURL.mockClear();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fleet certificate download preparation', () => {
  it('limits a vessel download to three requests at once and includes every file in order', async () => {
    let active = 0;
    let peakActive = 0;
    const pending: Array<() => void> = [];
    const download = vi.fn((path: string) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      return new Promise<{ data: Blob; error: null }>((resolve) => {
        pending.push(() => {
          active -= 1;
          resolve({ data: new Blob([path]), error: null });
        });
      });
    });
    const client = { storage: { from: vi.fn(() => ({ download })) } };
    const preparation = downloadFleetCertificateDocuments(client as never, Array.from({ length: 7 }, (_, index) => certificate(index + 1)));
    expect(download).toHaveBeenCalledTimes(3);
    pending.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(6));
    pending.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(7));
    pending.splice(0).forEach((resolve) => resolve());
    await preparation;

    expect(peakActive).toBe(3);
    const archive = await JSZip.loadAsync(await createObjectURL.mock.calls[0][0].arrayBuffer());
    expect(Object.keys(archive.files)).toEqual(Array.from({ length: 7 }, (_, index) => `GOURY - Certificat ${index + 1}.pdf`));
    expect(await archive.file('GOURY - Certificat 7.pdf')!.async('string')).toBe('1/GRY/7.pdf');
  });

  it('identifies the unavailable certificate and stops before preparing an incomplete archive', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(['PDF']), error: null });
    download.mockResolvedValueOnce({ data: null, error: { message: 'Accès refusé.', status: 403 } });
    const client = { storage: { from: vi.fn(() => ({ download })) } };

    await expect(downloadFleetCertificateDocuments(client as never, [1, 2, 3, 4].map(certificate)))
      .rejects.toThrow('Impossible de télécharger « Certificat 1 ». Accès refusé.');
    expect(download).toHaveBeenCalledTimes(3);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
