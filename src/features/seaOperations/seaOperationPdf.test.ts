// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, SEA_OPERATION_CHECKS } from './seaOperationModel';
import { generateSeaOperationPdf } from './seaOperationPdf';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput, type SeaOperationCopernicusProviderResult } from './seaOperationCopernicusModel';

function recordedObservation(pointId: string): ObservationResult {
  const common = { observedAt: '2026-10-16T10:15:00Z', station: { id: '62001',
    name: 'Bouée côtière de la Manche occidentale - station officielle de suivi des états de mer - LONG-STATION-END',
    latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId, latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-16T10:00:00Z', recordedAt: '2026-10-17T08:00:00Z',
    wind: { ...common, speedKnots: 22, directionDegrees: 280, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 4.2, periodSeconds: 11, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
}

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

async function landscapeBodies(bytes: Uint8Array): Promise<string[]> {
  const document = await PDFDocument.load(bytes);
  return document.getPages().filter((page) => page.getWidth() > page.getHeight()).map((page) => {
    const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const body = objects.lookup(objects.keys()[0]);
    if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
    return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
  });
}

async function generatedBodies(bytes: Uint8Array): Promise<string[]> {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => {
    const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const body = objects.lookup(objects.keys()[0]);
    if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
    return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
  });
}

function textPositions(body: string, text: string) {
  return [...body.matchAll(/BT\n([\s\S]*?)\nET/g)].filter((match) => match[1].includes(`(${text}) Tj`)).map((match) => {
    const position = /([\d.-]+) ([\d.-]+) Td/.exec(match[1]);
    if (!position) throw new Error(`Expected a text position for ${text}`);
    return { x: Number(position[1]), y: Number(position[2]), commands: match[1] };
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('Sea operation PDF', () => {
  it('uses port names, custom descriptions and a waypoint fallback without rewriting the declaration', async () => {
    const record = fixture(); record.draft.description = 'Vérification des descriptions du Passage Plan.';
    record.draft.waypoints = record.draft.waypoints.slice(0, 3).map((point, index) => ({ ...point,
      number: index === 2 ? 'A-3' : point.number,
      descriptionVhf: ['Port de Barfleur', 'Route personnalisée', '   '][index] }));
    const original = structuredClone(record);
    const bodies = await generatedBodies((await generateSeaOperationPdf(record, { templateBytes: await template() })).bytes);
    const text = bodies.join('\n');
    expect(text).toContain('(Port de Barfleur) Tj');
    expect(text).toContain('(Route personnalisée) Tj');
    expect(text).toContain('(Waypoint A-3) Tj');
    expect(record).toEqual(original);
  });

  it('exports the retained automatic UKC, compact indicative pill and model provenance annex without manual fallback', async () => {
    const source = JSON.parse(await readFile(new URL('./testFixtures/copernicus-ukc.json', import.meta.url), 'utf8')) as {
      input: SeaOperationCopernicusInput; provider: SeaOperationCopernicusProviderResult; fetchedAt: string;
    };
    const record = fixture(); record.draft.description = 'Contrôle visuel UKC automatique Copernicus.';
    record.signedAt = '2026-10-26T09:00:00Z';
    record.draft.planning = { date: '2026-10-27', operationId: '1', projectId: source.input.projectId, captainPersonId: '3' };
    record.draft.vessel.id = source.input.vesselId; record.draft.vessel.draftMeters = source.input.draftMeters;
    record.draft.waypoints = [{ id: source.input.pointId, number: 'AUTO-1', descriptionVhf: 'Approche', latitude: String(source.input.latitude), longitude: String(source.input.longitude), eta: source.input.eta,
      ukc: 'MANUAL-OLD', ukcMode: 'automatic', denseTraffic: false, ukcForecast: calculateSeaOperationCopernicusEstimate(source.input, source.provider, source.fetchedAt) }];
    const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const bodies = await generatedBodies(generated.bytes);
    const textBody = bodies.join('\n').replace(/\x92/g, '’');
    expect(textBody).toContain('(~ 19,62 m) Tj');
    expect(textBody).toContain('Annexe UKC - estimations statiques indicatives');
    expect(textBody).toContain('Incertitude totale non quantifiée');
    expect(textBody).toContain('version 202511');
    expect(textBody.replace(/\x92/g, '’')).toContain('niveau d’eau 1,62 m - tirant d’eau');
    expect(textBody).toContain('10.48670/moi-00054');
    expect(textBody).toContain('0.09 0.396 0.247 rg');
    expect(textBody).not.toContain('MANUAL-OLD');
    expect(textBody).not.toContain('95 %');
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_COPERNICUS_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_COPERNICUS_QA_OUTPUT, generated.bytes);
    record.draft.vessel.draftMeters = 3;
    const staleGenerated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const stale = (await generatedBodies(staleGenerated.bytes)).join('\n');
    expect(stale).toContain('(Indisponible) Tj');
    expect(stale).toContain('(Automatique) Tj');
    expect(stale).toContain('(Annexe UKC) Tj');
    expect(stale).not.toContain('MANUAL-OLD');
    expect(stale).not.toContain('(~ 19,62 m) Tj');
    if (process.env.SEAPILOT_PDF_UKC_UNAVAILABLE_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_UKC_UNAVAILABLE_QA_OUTPUT, staleGenerated.bytes);
  });
  it('draws compact UKC pills from the recorded draft reference and keeps historical values neutral without it', async () => {
    const record = fixture();
    record.draft.description = 'Contrôle visuel des seuils UKC et du tirant d’eau conservé.';
    record.draft.vessel.draftMeters = 2;
    const values = ['2', '2,5', '4', '4,000001', '-0,2', 'À vérifier'];
    record.draft.waypoints = values.map((ukc, index) => {
      const point = { ...record.draft.waypoints[index], number: `U${index + 1}`, descriptionVhf: 'Point de passage', ukc };
      delete point.weather; delete point.radio;
      return point;
    });
    const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const bodies = await generatedBodies(generated.bytes);
    const passage = bodies.filter((body) => body.includes('(Waypoint)')).join('\n');
    const ukcText = [...passage.matchAll(/BT\n([\s\S]*?)\nET/g)].map((match) => {
      const position = /([\d.-]+) ([\d.-]+) Td/.exec(match[1]);
      return { commands: match[1], x: Number(position?.[1]) };
    }).filter((item) => item.x > 309 && item.x < 385);
    const textBody = bodies.join('\n').replace(/\x92/g, '’');
    expect(textBody.includes('Tirant d’eau de référence conservé')).toBe(true);
    expect(textBody.includes('orange au-delà et jusqu’à +2 m inclus')).toBe(true);
    expect(ukcText.filter((item) => item.commands.includes('0.635 0.106 0.106 rg') && !item.commands.includes('(!) Tj'))).toHaveLength(2);
    expect(ukcText.filter((item) => item.commands.includes('0.541 0.255 0. rg') && !item.commands.includes('(!) Tj'))).toHaveLength(2);
    expect(ukcText.filter((item) => item.commands.includes('0.09 0.396 0.247 rg'))).toHaveLength(1);
    expect(ukcText.filter((item) => item.commands.includes('(!) Tj'))).toHaveLength(4);
    expect(ukcText.some((item) => item.commands.includes('(À vérifier) Tj') || item.commands.includes('(À) Tj') && item.commands.includes('(vérifier) Tj'))).toBe(true);
    expect(ukcText.some((item) => item.commands.includes('(4,000001) Tj') || item.commands.includes('(4,000001 m) Tj'))).toBe(true);
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_UKC_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_UKC_QA_OUTPUT, generated.bytes);
    delete record.draft.vessel.draftMeters;
    const historical = (await generatedBodies((await generateSeaOperationPdf(record, { templateBytes: await template() })).bytes)).join('\n');
    expect(historical).toContain('Non renseigné - indicateur UKC indisponible');
    expect(historical).not.toContain('0.635 0.106 0.106 rg');
    expect(historical).not.toContain('0.541 0.255 0. rg');
    expect(historical).not.toContain('0.09 0.396 0.247 rg');
    expect(historical.replace(/\) Tj\s*T\* \(/g, '').includes('4,000001')).toBe(true);
    expect(record.draft.decision).toBe('GO');
  });
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
    expect(passage).toContain('(Carte du parcours)');
    expect(passage).toContain('Natural Earth');
    expect(passage).toContain('(1/.../8)');
    expect(passage.indexOf('(Carte du parcours)')).toBeLessThan(passage.indexOf('(Waypoint)'));
    expect(passage).toContain('(Waypoint)');
    expect(passage).toContain('(Contacts VHF)');
    expect(passage).not.toContain('(Conditions de vie');
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
    expect(await textOf(old.bytes)).not.toContain('(Confortable)');
    expect(await textOf(old.bytes)).toContain('Houle Hs');
    record.draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    record.draft.waypoints[0].weather!.waves!.heightMeters = 4;
    const current = await textOf((await generateSeaOperationPdf(record, { templateBytes: await template() })).bytes);
    expect(current).toContain('(Hors matrice)');
    expect(current).toContain('(Confortable)');
    expect(current).toContain('GO - La mission peut');
  });

  it('uses nine columns and draws each captured assessment inside its own weather card, never in Waypoint', async () => {
    const record = fixture();
    record.draft.description = 'Opération';
    record.draft.waypoints = record.draft.waypoints.slice(0, 4);
    const [calm, rough, stale, undefinedBand] = record.draft.waypoints;
    [calm.number, rough.number, stale.number, undefinedBand.number] = ['S1', 'S2', 'S3', 'S4'];
    rough.weather!.waves!.heightMeters = 2.6;
    stale.weather!.etaUtc = '2026-10-16T11:00:00Z';
    undefinedBand.weather!.waves!.heightMeters = 1.2;
    record.draft.vessel.weatherMatrix!.levels[1][2] = null;
    const original = structuredClone(record);
    const bodies = await landscapeBodies((await generateSeaOperationPdf(record, { templateBytes: await template() })).bytes);
    const passage = bodies.join('\n');
    expect(passage).not.toContain('Conditions de vie');
    expect(passage).not.toContain('Condition non définie');
    expect(passage).not.toContain('Invivable');
    for (const [waypoint, label, color] of [
      ['S1', 'Confortable', '0.09 0.38 0.231 rg'],
      ['S2', 'Rude', '1. g'],
      ['S3', 'Hs / période indisponible', '0.275 0.314 0.373 rg'],
    ]) {
      const body = bodies.find((body) => textPositions(body, label).length > 0)!;
      const badges = textPositions(body, label);
      expect(badges).toHaveLength(1);
      const badge = badges[0];
      expect(badge.x).toBeGreaterThan(557);
      expect(badge.x).toBeLessThan(757);
      expect(badge.commands).toContain(color);
      const waypointPosition = textPositions(body, waypoint)[0];
      expect(waypointPosition).toBeDefined();
      expect(waypointPosition.x).toBeLessThan(94);
      expect(waypointPosition.y - badge.y).toBeGreaterThan(20);
      expect(waypointPosition.y - badge.y).toBeLessThan(45);
    }
    for (const body of bodies.filter((body) => body.includes('(Waypoint)'))) {
      const rectangles = [...body.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re\nB/g)].map((match) => ({ index: match.index, x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }));
      const header = rectangles.filter((rectangle) => rectangle.index < body.indexOf('(Waypoint)')).at(-1)!;
      const cells = rectangles.filter((rectangle) => rectangle.y === header.y && rectangle.height === header.height);
      expect(cells.map((cell) => cell.x)).toEqual([49, 94, 189, 249, 309, 385, 461, 557, 757]);
      expect(cells[4].width).toBe(76);
      expect(cells[7].width).toBe(200);
    }
    expect(record).toEqual(original);
  });

  it('prints the nearby marine cell inside its weather card without moving the waypoint or overlapping the measured annex', async () => {
    const record = fixture();
    record.draft.project = 'RECETTE - Position de la prévision marine';
    record.draft.description = 'Vérification de la maille météo marine proche, de sa distance au waypoint et de la séparation avec les mesures officielles.';
    record.draft.waypoints = record.draft.waypoints.slice(0, 3);
    const [nearby, coincident, unavailable] = record.draft.waypoints;
    [nearby.number, coincident.number, unavailable.number] = ['NEAR', 'GRID', 'H3'];
    nearby.weather!.model!.latitude = 49.7; nearby.weather!.model!.longitude = -1.62;
    coincident.weather!.model!.latitude = 49.65; coincident.weather!.model!.longitude = -1.62;
    unavailable.weather!.wind = null; unavailable.weather!.waves = null;
    unavailable.weather!.windMessage = unavailable.weather!.wavesMessage = 'Aucune prévision disponible : horizon dépassé.';
    delete unavailable.weather!.model;
    record.weatherObservations = [recordedObservation(nearby.id)];
    const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const document = await PDFDocument.load(generated.bytes);
    const bodies = await generatedBodies(generated.bytes);
    const nearBody = bodies.find((body) => textPositions(body, 'NEAR').length > 0)!;
    expect(nearBody).toContain("Point météo : 49° 42.000' N -");
    expect(nearBody).toContain("001° 37.200' W");
    expect(nearBody).toContain("(49° 39.000' N) Tj");
    expect(nearBody).toContain("(001° 37.200' W) Tj");
    const nearText = nearBody.replace(/\) Tj\s*T\* \(/g, ' ');
    expect(nearText).toContain('5,6 km');
    expect(nearText).toContain('position approchée.');
    expect(nearBody).toContain('MESURES APRÈS LE PASSAGE');
    const locations = [...nearBody.matchAll(/BT\n([\s\S]*?)\nET/g)]
      .filter((match) => match[1].includes("(Point météo : 49° 42.000' N -"))
      .map((match) => /([\d.-]+) ([\d.-]+) Td/.exec(match[1])!);
    expect(locations).toHaveLength(1);
    const location = { x: Number(locations[0][1]), y: Number(locations[0][2]) };
    expect(location.x).toBeGreaterThan(557); expect(location.x).toBeLessThan(757);
    expect(textPositions(nearBody, 'Vent moyen 10 m')[0].y - location.y).toBeGreaterThan(20);
    expect(location.y - textPositions(nearBody, 'MESURES APRÈS LE PASSAGE')[0].y).toBeGreaterThan(15);
    const exactBody = bodies.find((body) => textPositions(body, 'GRID').length > 0)!;
    expect(exactBody).toContain("49° 39.000' N -");
    expect(exactBody.replace(/\) Tj\s*T\* \(/g, ' ')).toContain('0,0 km');
    const unavailableBody = bodies.find((body) => textPositions(body, 'H3').length > 0)!;
    expect(unavailableBody).toContain('horizon dépassé.');
    expect(unavailableBody).not.toContain('Point météo');
    for (const [index, body] of bodies.entries()) {
      const page = document.getPage(index);
      for (const placement of [...body.matchAll(/BT\n([\s\S]*?)\nET/g)].map((match) => /([\d.-]+) ([\d.-]+) Td/.exec(match[1])).filter((match) => match !== null)) {
        expect(Number(placement[1])).toBeGreaterThanOrEqual(49);
        expect(Number(placement[1])).toBeLessThan(page.getWidth() - 49);
        expect(Number(placement[2])).toBeGreaterThanOrEqual(55);
        expect(Number(placement[2])).toBeLessThanOrEqual(page.getHeight() - 100);
      }
    }
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_MARINE_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_MARINE_QA_OUTPUT, generated.bytes);
  });

  it('fails explicitly if the source chrome is absent instead of fabricating a replacement header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(generateSeaOperationPdf(fixture())).rejects.toThrow('modèle Word d’en-tête et de pied de page est indisponible');
  });

  it('exports an official measured annex without changing the validated forecast, matrix or decision and keeps its long details in the page body', async () => {
    const record = fixture();
    record.draft.description = 'Opération de recette - prévision validée et mesures officielles après passage.';
    record.draft.waypoints = record.draft.waypoints.slice(0, 3);
    record.weatherObservations = record.draft.waypoints.map((point) => recordedObservation(point.id));
    const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    if (process.env.SEAPILOT_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_QA_OUTPUT, generated.bytes);
    const document = await PDFDocument.load(generated.bytes);
    const bodies = await generatedBodies(generated.bytes);
    const text = bodies.join('\n');
    expect(text).toContain('MESURES APRÈS LE PASSAGE');
    expect(text).toContain('Hs mer totale 4,20 m');
    expect(text).toContain('Tp 11 s');
    expect(text).toContain('Houle Hs');
    expect(text).toContain('(0,60 m)');
    expect(text.match(/\(Confortable\)/g)).toHaveLength(3);
    expect(text).not.toContain('(Rude)');
    expect(text).not.toContain('(Hors matrice)');
    expect(text).toContain('GO - La mission peut');
    expect(text).toContain('Vent mesuré à 3 m');
    expect(text).toContain('LONG-STATION-END');
    expect(text).toContain('16/10/2026 10:15 UTC');
    expect(text).toContain('Annexe mise à jour le 17/10/2026 08:00 UTC');
    expect(text).toContain('qualité');
    expect(text).toContain('non renseignée');
    expect(text).toContain(SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(text).toContain(SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL);
    expect(text).toContain('Licence Ouverte 2.0');
    expect(text).not.toMatch(/rafales|37 nd/i);
    for (const [index, body] of bodies.entries()) {
      const page = document.getPage(index);
      const placements = [...body.matchAll(/BT\n([\s\S]*?)\nET/g)].map((match) => /([\d.-]+) ([\d.-]+) Td/.exec(match[1])).filter((match) => match !== null);
      for (const placement of placements) {
        expect(Number(placement[1])).toBeGreaterThanOrEqual(49);
        expect(Number(placement[1])).toBeLessThan(page.getWidth() - 49);
        expect(Number(placement[2])).toBeGreaterThanOrEqual(55);
        expect(Number(placement[2])).toBeLessThanOrEqual(page.getHeight() - 100);
      }
      const observed = textPositions(body, 'MESURES APRÈS LE PASSAGE');
      if (observed.length) {
        const wind = textPositions(body, 'Vent moyen 10 m');
        expect(observed).toHaveLength(wind.length);
        observed.forEach((position, index) => expect(wind[index].y - position.y).toBeGreaterThan(30));
      }
    }
    expect(record).toEqual(original);
    const draft = await generatedBodies((await generateSeaOperationPdf({ ...record, status: 'draft' }, { templateBytes: await template() })).bytes);
    expect(draft.join('\n')).not.toContain('MESURES APRÈS LE PASSAGE');
    expect(draft.join('\n')).not.toContain('LONG-STATION-END');
    expect(draft.join('\n')).not.toContain(SEA_METEO_FRANCE_OBSERVATIONS_URL);
  });

  it('rejects an unreadable private signature rather than exporting a substitute image', async () => {
    await expect(generateSeaOperationPdf(fixture(), { templateBytes: await template(), signatureImage: 'data:image/png;base64,not-an-image' })).rejects.toThrow('image privée de signature RH ne peut pas être lue');
  });

  it('exports the recorded route offline and explicitly reports waypoints whose coordinates cannot be placed', async () => {
    const record = fixture();
    record.draft.description = 'Opération';
    record.draft.waypoints = [
      { ...record.draft.waypoints[0], number: 'Brest', latitude: '48.36', longitude: '-4.53' },
      { ...record.draft.waypoints[1], number: 'À préciser', latitude: '', longitude: '' },
      { ...record.draft.waypoints[2], number: 'Plymouth', latitude: '50.35', longitude: '-4.15' },
    ];
    const original = structuredClone(record.draft);
    const fetcher = vi.fn().mockRejectedValue(new Error('Unexpected network access'));
    vi.stubGlobal('fetch', fetcher);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const document = await PDFDocument.load(generated.bytes);
    const landscapeBodies = document.getPages().filter((page) => page.getWidth() > page.getHeight()).map((page) => {
      const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      const body = objects.lookup(objects.keys()[0]);
      if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
      return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
    });
    const routeText = landscapeBodies.join('\n');
    expect(landscapeBodies[0]).not.toContain('(Waypoint)');
    expect(landscapeBodies[1]).toContain('(Waypoint)');
    expect(routeText).toContain('(Carte du parcours)');
    expect(routeText).toContain('Natural Earth');
    expect(routeText).toContain('(Brest)');
    expect(routeText).toContain('(Plymouth)');
    expect(routeText).toContain('1 waypoint non placé');
    expect(routeText).toContain('Le tracé est interrompu');
    expect(fetcher).not.toHaveBeenCalled();
    expect(record.draft).toEqual(original);
  });

  it('bounds a coincident marker for a large route while retaining every waypoint in the table', async () => {
    const record = fixture();
    record.draft.description = 'Opération';
    const point = structuredClone(record.draft.waypoints[0]);
    delete point.weather; delete point.radio;
    record.draft.waypoints = Array.from({ length: 100 }, (_, index) => ({ ...point, id: `group-${index}`, number: String(index + 1), descriptionVhf: 'Point de route' }));
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const document = await PDFDocument.load(generated.bytes);
    const bodyText = document.getPages().filter((page) => page.getWidth() > page.getHeight()).map((page) => {
      const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      const body = objects.lookup(objects.keys()[0]);
      if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
      return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
    }).join('\n');
    expect(bodyText).toContain('(1/.../100)');
    expect(bodyText).not.toContain(Array.from({ length: 100 }, (_, index) => index + 1).join('/'));
    expect(bodyText).toContain('(100)');
    expect(record.draft.waypoints).toHaveLength(100);
  });
});
