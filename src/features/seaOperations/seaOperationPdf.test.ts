// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, SEA_OPERATION_CHECKS } from './seaOperationModel';
import { generateSeaOperationPdf } from './seaOperationPdf';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';

function fixture(): SeaOperationRecord {
  const draft = emptySeaOperation();
  draft.project = 'P144 - Inspection en mer'; draft.client = 'Client maritime'; draft.clientContact = 'Chef de projet +33 2 00 00 00 00';
  draft.description = `Préparation de l’opération, vérifications et consignes.\n${'Compte rendu détaillé à conserver intégralement. '.repeat(120)}`;
  draft.vessel = { id: '42', name: 'GOURY', captainName: 'Capitaine de test', registrationImo: 'IMO1234567', departurePort: 'Le Havre', departureQuay: '1', arrivalPort: 'Caen', arrivalQuay: '2', etd: '2026-10-16T08:00', eta: '2026-10-16T18:00' };
  draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
  draft.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
  draft.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
  for (const check of SEA_OPERATION_CHECKS) draft.checks[check.id] = 'yes';
  draft.portServices = ['pilotage']; draft.mandatoryServicesNotified = true;
  draft.towedVesselBoarding = { required: 'yes', measures: 'specific', details: 'Ronde, zones balisées et EPI contrôlés.' };
  draft.supplies = { delegated: 'yes', shipchandlerName: 'Fournisseur maritime', shipchandlerContact: '02 00 00 00 01', items: ['provisions', 'drinkingWater'], suppliers: 'Fournisseurs prévenus', customerAccountsPrepared: true };
  draft.waypoints = Array.from({ length: 8 }, (_, index) => ({ id: String(index), number: String(index + 1), descriptionVhf: 'Point de route / VHF12', latitude: '49°29.00 N', longitude: '000°06.00 E', ukc: '2 m', eta: '12:00', denseTraffic: index === 1 }));
  draft.waypoints[0] = { ...draft.waypoints[0], latitude: '49.65 N', longitude: '1.62 W', eta: '2026-10-16T12:00',
    weather: { pointId: '0', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-16T10:00:00Z', fetchedAt: '2026-10-15T12:00:00Z',
      wind: { time: '2026-10-16T10:00:00Z', speedKnots: 12, gustKnots: 37, directionDegrees: 270 },
      waves: { time: '2026-10-16T10:00:00Z', heightMeters: .6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
      windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL,
      model: { name: 'MFWAM', referenceTime: '2026-10-15T06:00:00Z', latitude: 49.65, longitude: -1.625 } },
    radio: { version: 1, latitude: 49.65, longitude: -1.62, capturedAt: '2026-10-15T12:00:00Z', verifiedOn: '2026-10-15',
      contacts: [{ id: 'cherbourg-port', kind: 'port', name: 'Cherbourg · Capitainerie', area: 'Port', vhf: '12', phone: '+33 2 33 20 41 25',
        source: 'https://portsdenormandie.fr/en/harbour-masters-office/cherbourg', sourceLabel: 'Ports de Normandie', distanceNm: 0 }] } };
  const captured = draft.waypoints[0];
  draft.waypoints = draft.waypoints.map((point) => ({ ...point, latitude: captured.latitude, longitude: captured.longitude, eta: captured.eta,
    descriptionVhf: 'Point de route / VHF12. Approche du chenal commercial, changement de route et compte rendu à la capitainerie. Maintenir une veille renforcée sur les mouvements de navires.',
    weather: { ...structuredClone(captured.weather!), pointId: point.id },
    radio: { ...captured.radio!, contacts: [
      { ...captured.radio!.contacts[0], name: 'Port de commerce et de pêche de Cherbourg · Capitainerie' },
      { id: 'cross-jobourg', kind: 'rescue', name: 'CROSS Jobourg · Centre régional opérationnel de surveillance et de sauvetage', area: 'Manche centrale', vhf: '16', phone: '+33 2 33 52 16 16',
        source: 'https://mer.gouv.fr/regles-de-securite-pour-les-loisirs-nautiques-en-mer', sourceLabel: 'Ministère chargé de la Mer', distanceNm: 5 },
    ] },
  }));
  draft.decision = 'GO'; draft.signature = { captainName: 'Capitaine de test', date: '2026-10-16', place: 'Le Havre', acknowledged: true };
  return { id: 'pdf-fixture', companyId: 1, version: 3, status: 'signed', draft,
    createdBy: 'test', createdByName: 'Auteur test', createdAt: '2026-10-16T08:00:00Z', updatedBy: 'test', updatedByName: 'Auteur test', updatedAt: '2026-10-16T09:00:00Z',
    signedBy: 'test-captain', signedByName: 'Capitaine de test', signedAt: '2026-10-16T09:15:00Z', captainName: 'Capitaine de test', canEdit: false, canSign: false };
}
const template = () => readFile(new URL('../../../public/templates/sea-operation/word-header-footer.pdf', import.meta.url));
afterEach(() => vi.unstubAllGlobals());

describe('Sea operation PDF', () => {
  it('keeps portrait chapters and landscape Passage Plan pages with native-size Word chrome on every page', async () => {
    const generated = await generateSeaOperationPdf(fixture(), { templateBytes: await template() });
    const document = await PDFDocument.load(generated.bytes);
    expect(generated.pageCount).toBeGreaterThan(3);
    expect(document.getPageCount()).toBe(generated.pageCount);
    const orientations: string[] = [];
    const landscapeText: string[] = [];
    for (const page of document.getPages()) {
      const landscape = page.getWidth() > page.getHeight();
      orientations.push(landscape ? 'landscape' : 'portrait');
      expect(page.getWidth()).toBeCloseTo(landscape ? 841.92 : 595.32, 2);
      expect(page.getHeight()).toBeCloseTo(landscape ? 595.32 : 841.92, 2);
      const xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      expect(xObjects?.keys()).toHaveLength(3);
      if (xObjects) {
        const objects = xObjects.keys().map((key) => {
          const object = xObjects.lookup(key);
          if (!(object instanceof PDFRawStream)) throw new Error('Expected an embedded PDF stream');
          return object;
        });
        const boxes = objects.map((object) => object.dict.lookup(PDFName.of('BBox'), PDFArray).asArray().map((number) => Number(number.toString())));
        expect(boxes.slice(1)).toEqual([[0, 0, 595.32, 90], [0, 0, 595.32, 26]]);
        if (landscape) landscapeText.push(Buffer.from(decodePDFRawStream(objects[0]).decode()).toString('latin1'));
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray ? contents.asArray().map((reference) => {
          const stream = document.context.lookup(reference);
          if (!(stream instanceof PDFRawStream)) throw new Error('Expected a page content stream');
          return stream;
        }) : [contents as PDFRawStream];
        const transforms = streams.flatMap((stream) => [...Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1').matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) cm/g)]);
        expect(transforms.length).toBeGreaterThan(0);
        expect(transforms.every((match) => match.slice(1, 5).map(Number).join(',') === '1,0,0,1')).toBe(true);
      }
    }
    expect(orientations[0]).toBe('portrait');
    expect(orientations.at(-1)).toBe('portrait');
    expect(orientations.filter((orientation) => orientation === 'landscape').length).toBeGreaterThan(1);
    const passage = landscapeText.join('\n');
    expect(passage).toContain('(Waypoint)');
    expect(passage).toContain('(Contacts VHF)');
    expect(passage).toContain('(Conditions de vie');
    expect(passage).toContain('Houle Hs');
    expect(passage).toContain('Période');
    expect(passage).toContain('(Confortable)');
    expect(passage.match(/\(Confortable\)/g)).toHaveLength(8);
    expect(passage).toContain('MFWAM');
    expect(passage).toContain('portsdenormandie.fr');
    expect(passage).not.toMatch(/rafales/i);
    for (const text of landscapeText.filter((text) => text.includes('Point de route / VHF12'))) expect(text).toContain('(Waypoint)');
    const fonts = document.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFDict ? [object.get(PDFName.of('BaseFont'))?.toString() || ''] : []);
    expect(fonts.some((name) => name.includes('Aptos'))).toBe(true);
    expect(fonts.some((name) => name.includes('Calibri'))).toBe(true);
    expect(generated.filename).toBe('Operation-en-Mer-P144 - Inspection en mer-GOURY.pdf');
    if (process.env.SEAPILOT_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_QA_OUTPUT, generated.bytes);
  });

  it('keeps an old signed record unevaluated and reports a captured forecast outside its vessel matrix', async () => {
    const record = fixture();
    delete record.draft.vessel.weatherMatrix;
    record.draft.waypoints = record.draft.waypoints.slice(0, 2);
    record.draft.description = 'Opération';
    const old = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const textOf = async (bytes: Uint8Array) => {
      const doc = await PDFDocument.load(bytes);
      return doc.getPages().map((page) => {
        const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
        const body = objects.lookup(objects.keys()[0]);
        if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
        return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
      }).join('\n');
    };
    expect(await textOf(old.bytes)).not.toContain('Matrice non renseignée');
    expect(await textOf(old.bytes)).toContain('Houle Hs');
    record.draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    record.draft.waypoints[0].weather!.waves!.heightMeters = 4;
    const current = await textOf((await generateSeaOperationPdf(record, { templateBytes: await template() })).bytes);
    expect(current).toContain('(Hors matrice)');
    expect(current).toContain('(Confortable)');
    expect(current).toContain('GO - La mission peut');
  });

  it('fails explicitly if the source chrome is absent instead of fabricating a replacement header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(generateSeaOperationPdf(fixture())).rejects.toThrow('modèle Word d’en-tête et de pied de page est indisponible');
  });

  it('rejects an unreadable private signature rather than exporting a substitute image', async () => {
    await expect(generateSeaOperationPdf(fixture(), { templateBytes: await template(), signatureImage: 'data:image/png;base64,not-an-image' })).rejects.toThrow('image privée de signature RH ne peut pas être lue');
  });
});
