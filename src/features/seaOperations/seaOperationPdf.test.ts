// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, SEA_OPERATION_CHECKS } from './seaOperationModel';
import { generateSeaOperationPdf } from './seaOperationPdf';
import type { SeaOperationRecord } from './seaOperationQueries';

function fixture(): SeaOperationRecord {
  const draft = emptySeaOperation();
  draft.project = 'P144 - Inspection en mer'; draft.client = 'Client maritime'; draft.clientContact = 'Chef de projet +33 2 00 00 00 00';
  draft.description = `Préparation de l’opération, vérifications et consignes.\n${'Compte rendu détaillé à conserver intégralement. '.repeat(120)}`;
  draft.vessel = { id: '42', name: 'GOURY', captainName: 'Capitaine de test', registrationImo: 'IMO1234567', departurePort: 'Le Havre', departureQuay: '1', arrivalPort: 'Caen', arrivalQuay: '2', etd: '2026-10-16T08:00', eta: '2026-10-16T18:00' };
  draft.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
  draft.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
  for (const check of SEA_OPERATION_CHECKS) draft.checks[check.id] = 'yes';
  draft.portServices = ['pilotage']; draft.mandatoryServicesNotified = true;
  draft.towedVesselBoarding = { required: 'yes', measures: 'specific', details: 'Ronde, zones balisées et EPI contrôlés.' };
  draft.supplies = { delegated: 'yes', shipchandlerName: 'Fournisseur maritime', shipchandlerContact: '02 00 00 00 01', items: ['provisions', 'drinkingWater'], suppliers: 'Fournisseurs prévenus', customerAccountsPrepared: true };
  draft.waypoints = Array.from({ length: 8 }, (_, index) => ({ id: String(index), number: String(index + 1), descriptionVhf: 'Point de route / VHF12', latitude: '49°29.00 N', longitude: '000°06.00 E', ukc: '2 m', eta: '12:00', denseTraffic: index === 1 }));
  draft.decision = 'GO'; draft.signature = { captainName: 'Capitaine de test', date: '2026-10-16', place: 'Le Havre', acknowledged: true };
  return { id: 'pdf-fixture', companyId: 1, version: 3, status: 'signed', draft,
    createdBy: 'test', createdByName: 'Auteur test', createdAt: '2026-10-16T08:00:00Z', updatedBy: 'test', updatedByName: 'Auteur test', updatedAt: '2026-10-16T09:00:00Z',
    signedBy: 'test-captain', signedByName: 'Capitaine de test', signedAt: '2026-10-16T09:15:00Z', captainName: 'Capitaine de test', canEdit: false, canSign: false };
}
const template = () => readFile(new URL('../../../public/templates/sea-operation/word-header-footer.pdf', import.meta.url));
afterEach(() => vi.unstubAllGlobals());

describe('Sea operation PDF', () => {
  it('reuses the actual Word vector chrome and embedded Aptos/Calibri fonts on every A4 page', async () => {
    const generated = await generateSeaOperationPdf(fixture(), { templateBytes: await template() });
    const document = await PDFDocument.load(generated.bytes);
    expect(generated.pageCount).toBeGreaterThan(3);
    expect(document.getPageCount()).toBe(generated.pageCount);
    for (const page of document.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.32, 2);
      expect(page.getHeight()).toBeCloseTo(841.92, 2);
      const xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      expect(xObjects?.keys()).toHaveLength(2);
    }
    const fonts = document.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFDict ? [object.get(PDFName.of('BaseFont'))?.toString() || ''] : []);
    expect(fonts.some((name) => name.includes('Aptos'))).toBe(true);
    expect(fonts.some((name) => name.includes('Calibri'))).toBe(true);
    expect(generated.filename).toBe('Operation-en-Mer-P144 - Inspection en mer-GOURY.pdf');
    if (process.env.SEAPILOT_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_QA_OUTPUT, generated.bytes);
  });

  it('fails explicitly if the source chrome is absent instead of fabricating a replacement header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(generateSeaOperationPdf(fixture())).rejects.toThrow('modèle Word d’en-tête et de pied de page est indisponible');
  });

  it('rejects an unreadable private signature rather than exporting a substitute image', async () => {
    await expect(generateSeaOperationPdf(fixture(), { templateBytes: await template(), signatureImage: 'data:image/png;base64,not-an-image' })).rejects.toThrow('image privée de signature RH ne peut pas être lue');
  });
});
