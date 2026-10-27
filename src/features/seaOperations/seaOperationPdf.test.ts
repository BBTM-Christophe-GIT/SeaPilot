// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, SEA_OPERATION_CHECKS } from './seaOperationModel';
import { generateSeaOperationPdf } from './seaOperationPdf';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput, type SeaOperationCopernicusProviderResult } from './seaOperationCopernicusModel';
import { buildSeaOperationRouteMap } from './seaOperationRouteMapGeometry';
import { resolveSeaOperationMapPorts } from './seaOperationMapPlaces';

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

function voyageFixture(): SeaOperationRecord {
  const record = fixture();
  record.draft.description = 'Vérification du récapitulatif du voyage conservé dans la fiche.';
  record.draft.vessel.etd = '2026-10-27T08:00'; record.draft.vessel.eta = '2026-10-27T18:00';
  record.draft.waypoints = [{ id: 'departure', number: '1', descriptionVhf: 'Départ', latitude: '50', longitude: '0', eta: '2026-10-27T08:00', ukc: '', denseTraffic: false },
    { id: 'arrival', number: '2', descriptionVhf: 'Arrivée', latitude: '51', longitude: '0', eta: '2026-10-29T11:50', ukc: '', denseTraffic: false }];
  return record;
}

it('preserves imported isolated points and zones in the PDF without connecting them to the route', async () => {
  const record = voyageFixture();
  record.draft.locationOverlay = { version: 1,
    points: [{ ...record.draft.waypoints[0], id: 'isole', descriptionVhf: 'POINT-ISOLE', latitude: '48.5', longitude: '-4', ukc: 'ANNOTATION-UKC-ISOLEE', eta: '2026-10-27T12:07', denseTraffic: true }],
    zones: [{ id: 'zone-projet', name: 'ZONE-PROJET', vertices: [{ latitude: '49', longitude: '-3' }, { latitude: '49.1', longitude: '-3.1' }, { latitude: '49.05', longitude: '-3.2' }] }],
  };
  const original = structuredClone(record.draft);
  const output = await generateSeaOperationPdf(record, { templateBytes: await template() });
  const bodies = (await landscapeBodies(output.bytes)).join('\n');
  expect(bodies).toContain('POINT-ISOLE'); expect(bodies).toContain('ZONE-PROJET');
  expect(bodies).toContain('hors calcul de navigation');
  const isolatedStart = bodies.indexOf('(Points isolés - hors calcul de navigation) Tj');
  expect(isolatedStart).toBeGreaterThan(0);
  const isolatedTable = bodies.slice(isolatedStart, bodies.indexOf('(Zones - hors calcul de navigation) Tj', isolatedStart));
  for (const omitted of ['ANNOTATION-UKC-ISOLEE', 'UKC', 'Contacts VHF', '12:07']) expect(isolatedTable).not.toContain(omitted);
  expect(record.draft).toEqual(original);
  if (process.env.SEAPILOT_PDF_ISOLATED_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_ISOLATED_QA_OUTPUT, output.bytes);
});

it('exports separate named zone tables and stable vertex identities without changing incomplete coordinates', async () => {
  const record = voyageFixture();
  record.draft.locationOverlay = { version: 1, points: [], zones: [
    { id: 'empty', name: 'Zone sans sommet', vertices: [] },
    { id: 'operation', name: 'Zone operationnelle', vertices: [{ latitude: '49.65', longitude: '-1.62' }, { latitude: 'invalide', longitude: '181' }, { latitude: '', longitude: '' }] },
    { id: 'unnamed', name: '', vertices: [{ latitude: '48° 30.500′ S', longitude: '002° 10.250′ E' }] },
  ] };
  const original = structuredClone(record), output = await generateSeaOperationPdf(record, { templateBytes: await template() });
  const bodies = (await landscapeBodies(output.bytes)).join('\n');
  const zoneTables = bodies.slice(bodies.indexOf('(Zones - hors calcul de navigation) Tj'));
  expect(zoneTables).toContain('Zone sans sommet'); expect(zoneTables).toContain('Aucun sommet renseigné');
  expect(zoneTables).toContain('Zone operationnelle'); expect(zoneTables).toContain('Zone 3');
  expect(zoneTables).not.toContain('Z1.1');
  for (const vertex of ['Z2.1', 'Z2.2', 'Z2.3', 'Z3.1']) expect(zoneTables).toContain(`(${vertex}) Tj`);
  for (const position of ["49° 39.000' N - 001° 37.200' W", "48° 30.500' S - 002° 10.250' E", 'invalide - 181', 'Latitude à renseigner - Longitude à renseigner']) expect(zoneTables).toContain(position);
  expect((zoneTables.match(/\(Point\) Tj/g) || [])).toHaveLength(3);
  expect((zoneTables.match(/\(Coordonnées\) Tj/g) || [])).toHaveLength(3);
  expect(record).toEqual(original);
  if (process.env.SEAPILOT_PDF_ZONE_TABLES_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_ZONE_TABLES_QA_OUTPUT, output.bytes);
});

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

it('lays out saved client coordinates as postal lines without changing the signed source', async () => {
  const record = fixture();
  record.draft.description = 'Mission courte';
  record.draft.clientContact = 'CONTACT-ALPHA · client@example.test · +33 2 00 00 00 00 · AGENCE LE HAVRE\nRoute du Mole Central, quai 372\n76600 Le Havre, France';
  const original = structuredClone(record), output = await generateSeaOperationPdf(record, { templateBytes: await template() });
  const body = (await generatedBodies(output.bytes))[0];
  for (const line of ['CONTACT-ALPHA', 'client@example.test', '+33 2 00 00 00 00', 'AGENCE LE HAVRE', 'Route du Mole Central, quai 372', '76600 Le Havre, France']) expect(body).toContain(`(${line}) Tj`);
  expect(record).toEqual(original);
  if (process.env.SEAPILOT_CLIENT_CONTACT_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_CLIENT_CONTACT_PDF_QA_OUTPUT, output.bytes);
});

function textPositions(body: string, text: string) {
  return [...body.matchAll(/BT\n([\s\S]*?)\nET/g)].filter((match) => match[1].includes(`(${text}) Tj`)).map((match) => {
    const position = /([\d.-]+) ([\d.-]+) Td/.exec(match[1]);
    if (!position) throw new Error(`Expected a text position for ${text}`);
    return { x: Number(position[1]), y: Number(position[2]), commands: match[1] };
  });
}
function tableRectangles(body: string) {
  return [...body.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re\n([BfS])/g)].map(match => ({
    index: match.index, x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]), mode: match[5],
    fill: [...body.slice(0, match.index).matchAll(/(?:^|\n)([\d.]+(?: [\d.]+){0,2}) (?:rg|g)\n/g)].at(-1)?.[1],
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe('Sea operation PDF', () => {
  it('draws defined departure and arrival ports even without waypoints and preserves a manual frame', async () => {
    const record = voyageFixture(); record.draft.vessel.departurePort = 'Cherbourg'; record.draft.vessel.arrivalPort = 'Brest';
    record.draft.waypoints = [];
    const original = structuredClone(record.draft);
    const automatic = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const autoMap = (await landscapeBodies(automatic.bytes)).find(body => body.includes('(Carte du parcours) Tj'))!;
    expect(autoMap).toContain('Cherbourg'); expect(autoMap).toContain('Brest'); expect(autoMap).toContain('W\nn');
    record.draft.mapViewport = { centerLatitude: 49.65, centerLongitude: -1.62, longitudeSpan: .2 };
    const manual = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const manualMap = (await landscapeBodies(manual.bytes)).find(body => body.includes('(Carte du parcours) Tj'))!;
    expect(manualMap).not.toContain('Brest'); expect(manualMap).toContain('W\nn');
    expect(record.draft).toEqual({ ...original, mapViewport: { centerLatitude: 49.65, centerLongitude: -1.62, longitudeSpan: .2 } });
  });
  it('draws a vector vigilance eye only beside marked map positions, including one shared badge for coincident waypoints', async () => {
    const record = fixture(); record.draft.description = 'Recette des points de passage en zone maritime à trafic dense.';
    const coordinates = [[49.65, -1.62], [49.65, -1.62], [49.72, -1.25], [49.82, -.95]];
    record.draft.waypoints = record.draft.waypoints.slice(0, 4).map((point, index) => ({ ...point,
      number: ['DEPART', 'GROUPED', 'CLEAR', 'DENSE'][index], latitude: String(coordinates[index][0]), longitude: String(coordinates[index][1]), denseTraffic: index === 1 || index === 3 }));
    const original = structuredClone(record), unmarked = structuredClone(record);
    unmarked.draft.waypoints.forEach(point => { point.denseTraffic = false; });
    const [generated, withoutEyes] = await Promise.all([
      generateSeaOperationPdf(record, { templateBytes: await template() }), generateSeaOperationPdf(unmarked, { templateBytes: await template() }),
    ]);
    const map = (await landscapeBodies(generated.bytes)).find(body => body.includes('(Carte du parcours) Tj'))!;
    const baseline = (await landscapeBodies(withoutEyes.bytes)).find(body => body.includes('(Carte du parcours) Tj'))!;
    expect(map.match(/0\.54 0\.38 0\. RG/g)).toHaveLength(2);
    expect(baseline).not.toContain('0.54 0.38 0. RG');
    for (const label of ['1/2', '3', '4', 'DEPART / GROUPED', 'CLEAR', 'DENSE']) {
      expect(textPositions(map, label)).toHaveLength(1);
      expect(textPositions(map, label)).toEqual(textPositions(baseline, label));
    }
    const badges = [...map.matchAll(/1\. 0\.98 0\.94 rg\n0\.54 0\.38 0\. RG\n0\.6 w\n([\d.-]+) ([\d.-]+) m\n/g)]
      .map(match => ({ x: Number(match[1]) + 4, y: Number(match[2]) - 5 }));
    expect(badges).toHaveLength(2);
    const frame = tableRectangles(map).find(rect => rect.x === 49 && rect.width > 700 && rect.height === -190)!;
    const geometry = buildSeaOperationRouteMap(record.draft.waypoints, frame.width, 190, record.draft.mapViewport,
      resolveSeaOperationMapPorts(record.draft.vessel.departurePort, record.draft.vessel.arrivalPort).ports.map(port => port.location));
    for (const badge of badges) {
      expect(badge.x - 7).toBeGreaterThan(frame.x); expect(badge.x + 7).toBeLessThan(frame.x + frame.width);
      expect(badge.y - 5).toBeGreaterThan(frame.y + frame.height); expect(badge.y + 5).toBeLessThan(frame.y);
      for (const segment of geometry.segments) {
        const from = { x: frame.x + segment.from.x, y: frame.y - segment.from.y }, to = { x: frame.x + segment.to.x, y: frame.y - segment.to.y };
        const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
        const fraction = lengthSquared ? Math.max(0, Math.min(1, ((badge.x - from.x) * dx + (badge.y - from.y) * dy) / lengthSquared)) : 0;
        expect(Math.hypot(badge.x - from.x - fraction * dx, badge.y - from.y - fraction * dy)).toBeGreaterThanOrEqual(9);
      }
    }
    expect(map).not.toContain('/Subtype /Image');
    expect(Math.abs(generated.bytes.length - withoutEyes.bytes.length)).toBeLessThan(4096);
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_MAP_VIGILANCE_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_MAP_VIGILANCE_QA_OUTPUT, generated.bytes);
  });

  it('centers Passage Plan headers, body values, UKC and unchanged weather cards, with a lightweight dense-traffic eye', async () => {
    const record = fixture(); record.draft.description = 'Recette de centrage du tableau Passage Plan.';
    record.draft.vessel.draftMeters = 2;
    record.draft.waypoints = record.draft.waypoints.slice(0, 2).map((point, index) => ({ ...point, number: index ? 'CLEAR' : 'DENSE',
      descriptionVhf: 'Description complète pour conserver une grande ligne et vérifier son centrage. '.repeat(8),
      ukc: '2,5', denseTraffic: index === 0 }));
    const original = structuredClone(record);
    const baseline = structuredClone(record); baseline.draft.waypoints[0].denseTraffic = false;
    const [generated, withoutTraffic] = await Promise.all([
      generateSeaOperationPdf(record, { templateBytes: await template() }), generateSeaOperationPdf(baseline, { templateBytes: await template() }),
    ]);
    if (process.env.SEAPILOT_PDF_ALIGNMENT_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_ALIGNMENT_QA_OUTPUT, generated.bytes);
    const bodies = (await landscapeBodies(generated.bytes)).filter(body => body.includes('(Waypoint) Tj'));
    const metrics = await PDFDocument.create();
    const bold = await metrics.embedFont(StandardFonts.HelveticaBold), normal = await metrics.embedFont(StandardFonts.Helvetica);
    expect(bodies.length).toBeGreaterThan(1);
    for (const body of bodies) {
      const rectangles = tableRectangles(body);
      const headerAnchor = rectangles.filter(rect => rect.index < body.indexOf('(Waypoint) Tj')).at(-1)!;
      const headers = rectangles.filter(rect => rect.y === headerAnchor.y && rect.height === headerAnchor.height);
      expect(headers).toHaveLength(9); expect(headers[7].width).toBe(200);
      for (const [index, labels] of [['Waypoint'], ['Description'], ['Latitude'], ['Longitude'], ['UKC'], ['ETA', 'Date - Heure'], ['Contacts VHF'], ['Météo à l\x92ETA'], ['Trafic', 'dense']].entries()) {
        const placements = labels.map(label => textPositions(body, label).find(position => position.y <= headerAnchor.y && position.y >= headerAnchor.y + headerAnchor.height)!);
        expect(placements.every(Boolean)).toBe(true);
        expect(placements.reduce((sum, position) => sum + position.y, 0) / placements.length + 8.5 * .275).toBeCloseTo(headerAnchor.y + headerAnchor.height / 2, 1);
        for (const [line, position] of placements.entries()) expect(position.x + bold.widthOfTextAtSize(labels[line].replace(/\x92/g, '’'), 8.5) / 2).toBeCloseTo(headers[index].x + headers[index].width / 2, 0);
      }
      const waypoint = textPositions(body, body.includes('(DENSE) Tj') ? 'DENSE' : 'CLEAR')[0];
      const row = rectangles.find(rect => rect.x === 49 && waypoint.y < rect.y && waypoint.y > rect.y + rect.height)!;
      expect(-row.height).toBeGreaterThan(250);
      expect(waypoint.x + normal.widthOfTextAtSize(body.includes('(DENSE) Tj') ? 'DENSE' : 'CLEAR', 8.5) / 2).toBeCloseTo(row.x + row.width / 2, 0);
      expect(waypoint.y + 8.5 * .275).toBeCloseTo(row.y + row.height / 2, 1);
      const ukc = textPositions(body, '2,5 m')[0];
      expect(ukc.y + 1.5).toBeCloseTo(row.y + row.height / 2, 1);
      expect(ukc.x + bold.widthOfTextAtSize('2,5 m', 7.5) / 2).toBeCloseTo(309 + 76 / 2 + 4, 0);
      const card = textPositions(body, 'MÉTÉO À L\x92ETA')[0];
      const weatherBody = body.slice(body.lastIndexOf('1. g', body.indexOf('(MÉTÉO À L\x92ETA) Tj')), body.indexOf('(MÉTÉO À L\x92ETA) Tj'));
      expect(weatherBody).toContain('200.');
      // The card retains its existing 190 pt width and sits symmetrically within the taller row.
      const frame = [...body.matchAll(/(?:^|\n)(567\.) ([\d.-]+) m\n([\s\S]*?)\nh\nB/g)].find(match => Number(match[2]) < row.y && Number(match[2]) > row.y + row.height)!;
      expect(frame).toBeDefined();
      const frameYs = [...frame[3].matchAll(/([\d.-]+) ([\d.-]+) [ml]/g)].map(match => Number(match[2]));
      const frameTop = Number(frame[2]), frameBottom = Math.min(...frameYs);
      expect((frameTop + frameBottom) / 2).toBeCloseTo(row.y + row.height / 2, 1);
      expect(card.y).toBeCloseTo(frameTop - 14, 1);
      if (body.includes('(DENSE) Tj')) {
        const pale = rectangles.filter(rect => rect.fill === '1. 0.98 0.94' && rect.mode !== 'S' && rect.y === row.y);
        expect(pale.map(rect => rect.x)).toEqual([49, 94, 189, 249, 309, 385, 461, 557, 757]);
        const traffic = textPositions(body, 'Traffic'); expect(traffic).toHaveLength(1);
        expect(traffic[0].commands).toContain('0.541 0.38 0. rg');
        expect(traffic[0].commands).toContain('(dense) Tj');
        expect(traffic[0].x + bold.widthOfTextAtSize('Traffic', 6.5) / 2).toBeCloseTo(757 + 35.92 / 2, 0);
        expect(traffic[0].y + 2).toBeCloseTo(row.y + row.height / 2, 1);
        expect(body).toContain('0.54 0.38 0. RG');
      } else {
        expect(body).not.toContain('(Traffic) Tj');
        const non = textPositions(body, 'Non').find(position => position.x > 757)!;
        expect(non.y + 8.5 * .275).toBeCloseTo(row.y + row.height / 2, 1);
      }
      expect(body).not.toContain('/Subtype /Image');
    }
    expect(Math.abs(generated.bytes.length - withoutTraffic.bytes.length)).toBeLessThan(2048);
    expect(record).toEqual(original);
  });

  it('exports a multi-day voyage summary using only the route and schedule retained in the declaration', async () => {
    const record = voyageFixture(); const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const bodies = await landscapeBodies(generated.bytes);
    const summary = bodies.find(body => body.includes('Récapitulatif du Passage Plan'))!;
    expect(summary).toContain('(Distance totale) Tj'); expect(summary).toContain('(Durée totale) Tj');
    expect(summary).toContain('(60,0 NM) Tj'); expect(summary).toContain('(2 jours 3 heures 50 minutes) Tj');
    expect(summary).toContain('(27/10/2026 - 08:00) Tj'); expect(summary).toContain('(29/10/2026 - 11:50) Tj');
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_VOYAGE_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_VOYAGE_QA_OUTPUT, generated.bytes);
  });

  it('prints Paris dates and the retained duration across a year boundary', async () => {
    const record = voyageFixture(); record.draft.vessel.etd = '2026-12-31T22:30Z';
    record.draft.waypoints[0].eta = '2026-12-31T23:30'; record.draft.waypoints[1].eta = '2027-01-01T01:00';
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const summary = (await landscapeBodies(generated.bytes)).find(body => body.includes('Récapitulatif du Passage Plan'))!;
    expect(summary).toContain('(31/12/2026 - 23:30) Tj'); expect(summary).toContain('(01/01/2027 - 01:00) Tj');
    expect(summary).toContain('(1 heure 30 minutes) Tj');
    if (process.env.SEAPILOT_PDF_VOYAGE_DATES_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_VOYAGE_DATES_QA_OUTPUT, generated.bytes);
  });

  it('leaves incomplete retained schedules and coordinates explicitly unavailable in the PDF summary', async () => {
    const record = voyageFixture(); record.draft.waypoints[1].eta = '11:50'; record.draft.waypoints[1].latitude = '';
    const original = structuredClone(record);
    const generated = await generateSeaOperationPdf(record, { templateBytes: await template() });
    const summary = (await landscapeBodies(generated.bytes)).find(body => body.includes('Récapitulatif du Passage Plan'))!;
    expect(summary).toContain('(Distance indisponible) Tj'); expect(summary).toContain('(Durée indisponible) Tj');
    expect(summary).toContain('(ETA indisponible) Tj'); expect(summary).toContain('(27/10/2026 - 08:00) Tj');
    expect(summary).not.toContain('2 jours 3 heures 50 minutes'); expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_VOYAGE_MISSING_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_VOYAGE_MISSING_QA_OUTPUT, generated.bytes);
  });

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
    const passage = bodies.find(body => body.includes('(Waypoint) Tj'))!;
    const waypoint = textPositions(passage, 'AUTO-1')[0];
    const row = tableRectangles(passage).find(rect => rect.x === 49 && waypoint.y < rect.y && waypoint.y > rect.y + rect.height)!;
    expect(textPositions(passage, '~ 19,62 m')[0].y - 10).toBeCloseTo(row.y + row.height / 2, 1);
    expect(textPositions(passage, 'Indicative')[0].y + 7).toBeCloseTo(row.y + row.height / 2, 1);
    expect(textPositions(passage, 'Indicative')[0].commands).toContain('(Annexe UKC) Tj');
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
      const row = tableRectangles(body).find(rect => rect.x === 49 && waypointPosition.y < rect.y && waypointPosition.y > rect.y + rect.height)!;
      expect(waypointPosition.y + 8.5 * .275).toBeCloseTo(row.y + row.height / 2, 1);
      expect(badge.y).toBeGreaterThan(row.y + row.height);
      expect(badge.y).toBeLessThan(row.y);
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
