import { render, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationPrint } from './SeaOperationPrint';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput, type SeaOperationCopernicusProviderResult } from './seaOperationCopernicusModel';

function recordedObservation(): ObservationResult {
  const common = { observedAt: '2026-10-23T10:15:00Z', station: { id: '62001', name: 'Bouée Manche', latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId: 'recorded-wp', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z',
    wind: { ...common, speedKnots: 22, directionDegrees: 280, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 4.2, periodSeconds: 11, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
}

describe('Opération en Mer printable content', () => {
  it('prints the saved Transit client and manually adapted voyage instead of project defaults', () => {
    const draft = emptySeaOperation();
    draft.project = 'Transit'; draft.transit = { date: '2026-10-27', captainPersonId: '3' };
    draft.dapaq.method = 's_wing';
    draft.clientId = '7'; draft.client = 'Client Transit'; draft.clientContact = 'Contact adapté · client@example.test · Agence\n12 quai du Port, 76600 Le Havre'; draft.description = 'Convoyage saisi manuellement';
    Object.assign(draft.vessel, { id: '1', name: 'Navire sélectionné', registrationImo: 'FR-123', departurePort: 'Départ adapté', arrivalPort: 'Arrivée adaptée', departureQuay: 'Quai A', arrivalQuay: 'Quai B', etd: '2026-10-27T08:00', eta: '2026-10-28T10:00' });
    const record: SeaOperationRecord = { id: 'transit-print', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-27T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: '', canEdit: true, canSign: false };
    const original = structuredClone(record), { container } = render(<SeaOperationPrint record={record} />);
    for (const value of ['Transit', 'Client Transit', 'Contact adapté', 'Convoyage saisi manuellement', 'Navire sélectionné', 'FR-123', 'Départ adapté', 'Arrivée adaptée', 'Quai A', 'Quai B', 'S-WING']) expect(container).toHaveTextContent(value);
    const contact = within(container).getByText('Coordonnées du client – informations opérationnelles').closest('div')!;
    expect(contact.querySelector('dd')?.textContent).toBe('Contact adapté\nclient@example.test\nAgence\n12 quai du Port, 76600 Le Havre');
    expect(container).toHaveTextContent('27/10/2026'); expect(container).toHaveTextContent('28/10/2026');
    expect(record).toEqual(original);
  });
  it('prints the retained isolated points and zones independently from the route', () => {
    const draft = emptySeaOperation();
    draft.locationOverlay = { version: 1, points: [{ id: 'isolated', number: 'P1', descriptionVhf: 'Balise isolée', latitude: '49.65', longitude: '-1.62', ukc: '3', eta: '2026-10-27T12:07', denseTraffic: true }],
      zones: [{ id: 'zone', name: 'Zone conservée', vertices: [{ latitude: '49.65', longitude: '-1.62' }] }] };
    const record: SeaOperationRecord = { id: 'location-print', companyId: 1, version: 1, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-27T09:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-27T09:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const original = structuredClone(record), { container } = render(<SeaOperationPrint record={record} />);
    const location = within(container.querySelector('[aria-label="Localisation de la mission"]')!);
    expect(location.getByRole('heading', { name: 'Zone conservée' })).toBeInTheDocument();
    expect(location.getByRole('cell', { name: 'Balise isolée' })).toBeInTheDocument();
    expect(location.getByRole('cell', { name: '49° 39.000′ N — 001° 37.200′ W' })).toBeInTheDocument();
    const isolated = location.getAllByRole('table')[0];
    expect(within(isolated).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Point', 'Description', 'Latitude', 'Longitude']);
    expect(within(isolated).getAllByRole('cell')).toHaveLength(4); expect(isolated).not.toHaveTextContent('12:07');
    expect(container.querySelector('.so-print-passage')).toBeNull(); expect(record).toEqual(original);
  });
  it('prints one named vertex table per zone with stable Z indices, including empty and invalid geometry', () => {
    const draft = emptySeaOperation();
    draft.locationOverlay = { version: 1, points: [], zones: [
      { id: 'empty', name: 'Zone sans sommet', vertices: [] },
      { id: 'operation', name: 'Zone opérationnelle', vertices: [{ latitude: '49.65', longitude: '-1.62' }, { latitude: 'invalide', longitude: '181' }, { latitude: '', longitude: '' }] },
      { id: 'unnamed', name: '', vertices: [{ latitude: '48° 30.500′ S', longitude: '002° 10.250′ E' }] },
    ] };
    const record: SeaOperationRecord = { id: 'zone-tables', companyId: 1, version: 1, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-27T09:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-27T09:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const original = structuredClone(record), { container } = render(<SeaOperationPrint record={record} />);
    const location = within(container.querySelector('[aria-label="Localisation de la mission"]')!);
    const empty = within(location.getByRole('region', { name: 'Zone Z1 : Zone sans sommet' }));
    expect(empty.getByRole('heading', { name: 'Zone sans sommet' })).toBeInTheDocument();
    expect(empty.getByRole('cell', { name: 'Aucun sommet renseigné' })).toHaveAttribute('colspan', '2');
    const operation = within(location.getByRole('region', { name: 'Zone Z2 : Zone opérationnelle' }));
    expect(operation.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Sommet', 'Coordonnées']);
    expect(operation.getByRole('cell', { name: 'Z2.1' })).toBeInTheDocument(); expect(operation.getByRole('cell', { name: 'Z2.2' })).toBeInTheDocument();
    expect(operation.getByRole('cell', { name: '49° 39.000′ N — 001° 37.200′ W' })).toBeInTheDocument();
    expect(operation.getByRole('cell', { name: 'invalide — 181' })).toBeInTheDocument();
    expect(operation.getByRole('cell', { name: 'Z2.3' })).toBeInTheDocument();
    expect(operation.getByRole('cell', { name: 'Latitude à renseigner — Longitude à renseigner' })).toBeInTheDocument();
    const unnamed = within(location.getByRole('region', { name: 'Zone Z3 : Zone 3' }));
    expect(unnamed.getByRole('heading', { name: 'Zone 3' })).toBeInTheDocument(); expect(unnamed.getByRole('cell', { name: 'Z3.1' })).toBeInTheDocument();
    expect(unnamed.getByRole('cell', { name: '48° 30.500′ S — 002° 10.250′ E' })).toBeInTheDocument();
    expect(location.queryByRole('cell', { name: 'Z1.1' })).not.toBeInTheDocument(); expect(record).toEqual(original);
  });

  it('centres all nine Passage Plan cells and marks only retained dense-traffic rows with accessible vigilance', () => {
    const draft = emptySeaOperation(); draft.vessel.draftMeters = 2;
    draft.waypoints = [
      { id: 'dense', number: 'WP1', descriptionVhf: 'Approche du port', latitude: '50', longitude: '1', eta: '2026-10-27T10:00', ukc: '2,5', denseTraffic: true },
      { id: 'clear', number: 'WP2', descriptionVhf: 'Au large', latitude: '50.1', longitude: '1.1', eta: '2026-10-27T11:00', ukc: '', ukcMode: 'automatic', denseTraffic: false },
    ];
    const record: SeaOperationRecord = { id: 'passage-alignment', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-27T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false };
    const original = structuredClone(record);
    const { container } = render(<SeaOperationPrint record={record} />);
    const table = within(container.querySelector('.so-print-passage')!);
    expect(table.getAllByRole('columnheader')).toHaveLength(9);
    expect(table.getByRole('columnheader', { name: 'Waypoint' }).querySelector('br')).toBeNull();
    expect(table.getByRole('columnheader', { name: 'ETA Date - Heure' }).querySelectorAll('br')).toHaveLength(1);
    const rows = table.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveClass('is-dense-traffic'); expect(rows[1]).not.toHaveClass('is-dense-traffic');
    expect(rows[0].querySelectorAll('td')).toHaveLength(9); expect(rows[1].querySelectorAll('td')).toHaveLength(9);
    const warning = within(rows[0]).getByRole('img', { name: 'Vigilance : trafic dense, risque de collision' });
    expect(warning.querySelector('small')).toHaveTextContent(/^Traffic dense$/); expect(warning.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(within(rows[1]).getByRole('cell', { name: 'Non' })).toBe(rows[1].lastElementChild);
    expect(within(rows[1]).queryByRole('img')).not.toBeInTheDocument();
    expect(rows[0].querySelector('.so-print-ukc-cell .so-ukc-pill')).toHaveTextContent('2,5 m');
    expect(rows[1].querySelector('.so-print-ukc-note')).toHaveTextContent('AutomatiqueAnnexe UKC');
    expect(rows[0].querySelector('.so-print-weather-cell > .so-waypoint-weather-card')).not.toBeNull();
    expect(record).toEqual(original);
  });

  it('scopes centring and vigilance styles to the printed Passage Plan while preserving weather card composition and widths', () => {
    const css = readFileSync('src/features/seaOperations/seaOperationPrint.css', 'utf8');
    const declarations = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(match => match[1].split(',').some(item => item.trim() === selector)).map(match => match[2]).join(';');
    for (const selector of ['.so-print table.so-print-passage > thead > tr > th', '.so-print table.so-print-passage > tbody > tr > td']) {
      expect(declarations(selector)).toContain('text-align: center');
      expect(declarations(selector)).toContain('vertical-align: middle');
    }
    expect(declarations('.so-print table.so-print-passage > thead > tr > th:first-child')).toContain('white-space: nowrap');
    expect(declarations('.so-print table.so-print-passage .so-print-eta-header')).toContain('white-space: nowrap');
    expect(declarations('.so-print table.so-print-passage > tbody > tr.is-dense-traffic > td')).toContain('background: #fffaf0');
    expect(declarations('.so-print .so-print-passage .so-print-traffic-warning')).toContain('color: #8a6100');
    expect(declarations('.so-print-traffic-warning small')).toContain('white-space: normal');
    expect(declarations('.so-print-traffic-warning small')).toContain('max-width: 100%');
    expect(declarations('.so-print .so-print-passage .so-print-ukc-note')).toContain('justify-items: center');
    expect(declarations('.so-print table.so-print-passage > tbody > tr > .so-print-weather-cell > .so-waypoint-weather-card')).toContain('text-align: left');
    expect(declarations('.so-print table.so-print-passage > tbody > tr > .so-print-weather-cell > .so-waypoint-weather-card')).not.toMatch(/width:|grid|padding/);
    expect(declarations('.so-print .so-print-passage th:nth-child(8)')).toContain('width: 26.9%');
  });

  it('summarizes the retained route and multi-day Paris schedule without reading or changing a vessel', () => {
    const draft = emptySeaOperation();
    draft.vessel.etd = '2026-10-27T08:00'; draft.vessel.eta = '2026-10-27T18:00';
    draft.waypoints = [{ id: 'departure', number: '1', descriptionVhf: 'Départ', latitude: '50', longitude: '0', eta: '2026-10-27T08:00', ukc: '', denseTraffic: false },
      { id: 'arrival', number: '2', descriptionVhf: 'Arrivée', latitude: '51', longitude: '0', eta: '2026-10-29T11:50', ukc: '', denseTraffic: false }];
    const record: SeaOperationRecord = { id: 'summary-print', companyId: 1, version: 2, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-26T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-26T09:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-26T09:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const original = structuredClone(record);
    const { rerender } = render(<SeaOperationPrint record={record} />);
    const summary = within(document.querySelector('[aria-label="Récapitulatif du Passage Plan"]') as HTMLElement);
    expect(summary.getByText('Distance totale').nextElementSibling).toHaveTextContent('60,0 NM');
    expect(summary.getByText('Durée totale').nextElementSibling).toHaveTextContent('2 jours 3 heures 50 minutes');
    expect(summary.getByText('ETD (heure de Paris)').nextElementSibling).toHaveTextContent('27/10/2026 – 08:00');
    expect(summary.getByText('ETA (heure de Paris)').nextElementSibling).toHaveTextContent('29/10/2026 – 11:50');
    expect(record).toEqual(original);
    const changed = structuredClone(record);
    changed.draft.vessel.etd = '2026-12-31T22:30Z';
    changed.draft.waypoints[0].eta = '2026-12-31T23:30'; changed.draft.waypoints[1].eta = '2027-01-01T01:00';
    rerender(<SeaOperationPrint record={changed} />);
    expect(summary.getByText('Durée totale').nextElementSibling).toHaveTextContent('1 heure 30 minutes');
    expect(summary.getByText('ETD (heure de Paris)').nextElementSibling).toHaveTextContent('31/12/2026 – 23:30');
    expect(summary.getByText('ETA (heure de Paris)').nextElementSibling).toHaveTextContent('01/01/2027 – 01:00');
    changed.draft.waypoints[1].eta = '01:00';
    rerender(<SeaOperationPrint record={changed} />);
    expect(summary.getByText('Durée indisponible')).toBeInTheDocument();
    expect(summary.getByText('ETA indisponible')).toBeInTheDocument();
    changed.draft.waypoints[1].latitude = '';
    rerender(<SeaOperationPrint record={changed} />);
    expect(summary.getByText('Distance indisponible')).toBeInTheDocument();
  });

  it('keeps descriptive waypoint labels and automatic UKC status in separate readable blocks', () => {
    const draft = emptySeaOperation(); draft.vessel.draftMeters = 2;
    draft.waypoints = [{ id: 'port', number: '1', descriptionVhf: 'Port de Barfleur', latitude: '', longitude: '', eta: '', ukc: '2,5', denseTraffic: false },
      { id: 'custom', number: '2', descriptionVhf: 'Route personnalisée', latitude: '', longitude: '', eta: '', ukc: '4,000001', denseTraffic: false },
      { id: 'blank', number: 'A-3', descriptionVhf: '   ', latitude: '', longitude: '', eta: '', ukc: '', ukcMode: 'automatic', denseTraffic: false }];
    const record: SeaOperationRecord = { id: 'ukc-layout', companyId: 1, version: 2, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-27T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false };
    const original = structuredClone(record);
    const { container } = render(<SeaOperationPrint record={record} />);
    const rows = container.querySelectorAll('.so-print-passage tbody tr');
    expect(rows[0].children[1]).toHaveTextContent('Port de Barfleur');
    expect(rows[1].children[1]).toHaveTextContent('Route personnalisée');
    expect(rows[2].children[1]).toHaveTextContent('Waypoint A-3');
    expect(rows[0].children[4].querySelector('.so-ukc-pill')).toHaveTextContent('2,5 m');
    const unavailable = rows[2].children[4];
    expect(unavailable.querySelector('.so-print-ukc-value')).toHaveTextContent('Indisponible');
    expect([...unavailable.querySelectorAll('.so-print-ukc-note span')].map(span => span.textContent)).toEqual(['Automatique', 'Annexe UKC']);
    expect(record).toEqual(original);
  });

  it('prints only the retained automatic UKC and its provenance annex, with no manual fallback after an input changes', () => {
    const source = JSON.parse(readFileSync('src/features/seaOperations/testFixtures/copernicus-ukc.json', 'utf8')) as {
      input: SeaOperationCopernicusInput; provider: SeaOperationCopernicusProviderResult; fetchedAt: string;
    };
    const draft = emptySeaOperation();
    draft.planning = { date: '2026-10-27', operationId: '1', projectId: source.input.projectId, captainPersonId: '3' };
    draft.vessel.id = source.input.vesselId; draft.vessel.draftMeters = source.input.draftMeters;
    draft.waypoints = [{ id: source.input.pointId, number: '1', descriptionVhf: '', latitude: String(source.input.latitude), longitude: String(source.input.longitude), eta: source.input.eta,
      ukc: 'MANUAL-OLD', ukcMode: 'automatic', denseTraffic: false, ukcForecast: calculateSeaOperationCopernicusEstimate(source.input, source.provider, source.fetchedAt) }];
    const record: SeaOperationRecord = { id: 'ukc-auto-print', companyId: 1, version: 2, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-26T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-26T09:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-26T09:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const original = structuredClone(record);
    const { container, rerender } = render(<SeaOperationPrint record={record} />);
    const cell = container.querySelector('.so-print-passage tbody tr')!.children[4];
    expect(cell.querySelector('.so-ukc-pill')).toHaveClass('is-success');
    expect(cell.textContent).toContain('≈ 19,62 m');
    expect(container.textContent).toContain('Annexe UKC');
    expect(container.textContent).toContain('Incertitude totale non quantifiée');
    expect(container.textContent).toContain('version 202511');
    expect(container.textContent).toContain('49° 39.000′ N — 001° 37.200′ W');
    expect(container.querySelector('a[href="https://doi.org/10.48670/moi-00054"]')).not.toBeNull();
    expect(container.textContent).not.toContain('MANUAL-OLD');
    expect(record).toEqual(original);
    draft.vessel.draftMeters = 3;
    rerender(<SeaOperationPrint record={record} />);
    expect(cell.textContent).toContain('Indisponible');
    expect(cell.querySelector('.so-ukc-pill')).toBeNull();
    expect(container.textContent).not.toContain('MANUAL-OLD');
  });
  it('prints the recorded draft reference and UKC pills without changing the captain decision', () => {
    const draft = emptySeaOperation(); draft.vessel.draftMeters = 2; draft.decision = 'GO';
    const values = ['2', '2,000001', '3', '4', '4,000001', '-0,2', 'À vérifier'];
    draft.waypoints = values.map((ukc, index) => ({ id: `ukc-print-${index}`, number: String(index + 1), descriptionVhf: '', latitude: '', longitude: '', eta: '', ukc, denseTraffic: false }));
    const record: SeaOperationRecord = { id: 'ukc-print', companyId: 1, version: 2, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-23T08:00:00Z', updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-23T09:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-23T09:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const original = structuredClone(record);
    const { container, rerender } = render(<SeaOperationPrint record={record} />);
    const table = container.querySelector('.so-print-passage')!;
    const cells = Array.from(table.querySelectorAll('tbody tr')).map((row) => row.children[4]);
    for (const [index, level] of ['danger', 'warning', 'warning', 'warning', 'success', 'danger'].entries()) {
      expect(cells[index].querySelector('.so-ukc-pill')).toHaveClass(`is-${level}`);
      expect(cells[index].querySelector('svg') !== null).toBe(level !== 'success');
    }
    expect(cells[4].textContent).toBe('4,000001 m');
    expect(cells[6].textContent).toBe('À vérifier');
    expect(cells[6].querySelector('.so-ukc-pill')).toBeNull();
    expect(within(container).getByText('Tirant d’eau de référence conservé').nextElementSibling).toHaveTextContent('2 m');
    expect(container.textContent).toContain('GO – La mission peut être réalisée.');
    expect(record).toEqual(original);
    delete draft.vessel.draftMeters;
    rerender(<SeaOperationPrint record={record} />);
    expect(table.querySelectorAll('.so-ukc-pill')).toHaveLength(0);
    expect(cells[4].textContent).toBe('4,000001');
    expect(container.textContent).toContain('Non renseigné – indicateur UKC indisponible');
  });
  it('shows the prepared RH image without claiming a decision signature, and uses only the recorded snapshot once signed', () => {
    const draft = emptySeaOperation();
    const record: SeaOperationRecord = {
      id: 'signature-fixture', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-16T08:00:00Z',
      updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-16T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    };
    const { container, rerender } = render(<SeaOperationPrint record={record} signatureImageUrl="https://private.test/prepared.png" />);
    const print = within(container.querySelector('article')!);
    expect(print.getByRole('img', { name: 'Aperçu de la signature RH du Capitaine sélectionné, non apposée' })).toHaveAttribute('src', 'https://private.test/prepared.png');
    expect(print.getByText('Signature RH préparée – décision non signée')).toBeInTheDocument();
    expect(print.queryByText('Identité du compte signataire')).not.toBeInTheDocument();
    rerender(<SeaOperationPrint record={{ ...record, status: 'signed', signatureUrl: 'https://private.test/immutable-snapshot.png' }} signatureImageUrl="https://private.test/other-captain.png" />);
    expect(print.getByRole('img', { name: 'Signature RH du Capitaine enregistrée avec cette décision' })).toHaveAttribute('src', 'https://private.test/immutable-snapshot.png');
    expect(container.querySelector('img[src="https://private.test/other-captain.png"]')).toBeNull();
  });

  it('retains long multiline fields as safe text with all recorded details outside form controls', () => {
    const draft = emptySeaOperation();
    const description = `<script>window.injected = true</script>\n${'Description opérationnelle détaillée. '.repeat(150)}`;
    const risks = `Risque identifié\n${'Mesure de sécurité à conserver intégralement. '.repeat(100)}`;
    const justification = `Justification complète\n${'Information à transmettre à l’Armement. '.repeat(80)}`;
    draft.project = 'Mission <inspection>';
    draft.description = description;
    draft.risks = risks;
    draft.checks.operationEquipment = 'no';
    draft.justifications.operationEquipment = justification;
    draft.specialPersonnel = [{ name: '<img src=x onerror=alert(1)>', phone: '+33 1 02 03 04 05' }];
    draft.waypoints = [{ id: 'waypoint-print-test', number: '1', descriptionVhf: 'Contact VHF\nCanal 16', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: true }];
    draft.decision = 'NO_GO';
    const record: SeaOperationRecord = {
      id: 'printed-draft', companyId: 1, version: 2, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-16T08:00:00Z',
      updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-16T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    };
    const { container } = render(<SeaOperationPrint record={record} />);
    const print = within(container.querySelector('article')!);
    expect(print.getByText('Description de l’opération', { selector: 'dt' }).nextElementSibling?.textContent).toBe(description);
    expect(print.getByText('Risques identifiés et informations à transmettre à l’Armement', { selector: 'dt' }).nextElementSibling?.textContent).toBe(risks);
    expect(print.getByText('Justification :').parentElement?.textContent).toBe(`Justification : ${justification}`);
    expect(print.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(print.getByRole('cell', { name: /Contact VHF\s+Canal 16/ }).textContent).toBe('Contact VHF\nCanal 16');
    expect(print.getByText('12:00')).toBeInTheDocument();
    expect(print.getByText('Contacts VHF proposés par proximité')).toBeInTheDocument();
    expect(print.getByRole('cell', { name: 'CROSS Jobourg' })).toBeInTheDocument();
    expect(print.getByText('Brouillon – cette décision n’a pas été signée.')).toBeInTheDocument();
    expect(print.queryByText('Identité du compte signataire')).not.toBeInTheDocument();
    expect(container.querySelector('script, img[onerror], input, textarea, select')).toBeNull();
    expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual(['/templates/sea-operation/word-header.png', '/templates/sea-operation/word-footer.png']);
  });

  it('keeps nine landscape columns with the captured indicator inside ETA weather, never Waypoint, without filling signed history from live data', () => {
    const draft = emptySeaOperation();
    draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    draft.waypoints = [{ id: 'recorded-wp', number: 'WP1', descriptionVhf: '<Approche du port>', latitude: '49.65 N', longitude: '1.62 W', eta: '2026-10-23T12:00', ukc: '2 m', denseTraffic: true,
      weather: { pointId: 'recorded-wp', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-22T12:00:00Z',
        wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: 37, directionDegrees: 270 },
        waves: { time: '2026-10-23T10:00:00Z', heightMeters: .6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
        windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL,
        model: { name: 'MFWAM', referenceTime: '2026-10-22T06:00:00Z', latitude: 49.65, longitude: -1.625 } },
      radio: { version: 1, latitude: 49.65, longitude: -1.62, capturedAt: '2026-10-22T12:00:00Z', verifiedOn: '2026-10-22',
        contacts: [{ id: 'cherbourg-port', kind: 'port', name: 'Cherbourg · Capitainerie', area: 'Port', vhf: '12', phone: '+33 2 33 20 41 25',
          source: 'https://portsdenormandie.fr/en/harbour-masters-office/cherbourg', sourceLabel: 'Ports de Normandie', distanceNm: 0 }] } }];
    const record: SeaOperationRecord = { id: 'recorded-weather', companyId: 1, version: 1, status: 'signed', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-22T08:00:00Z', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: '2026-10-22T12:00:00Z',
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-22T12:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false, weatherObservations: [recordedObservation()] };
    draft.decision = 'GO';
    const original = structuredClone(record);
    const { container, rerender } = render(<SeaOperationPrint record={record} />);
    const passage = within(container.querySelector('.so-print-passage-section')!);
    const table = passage.getByRole('table', { name: 'Points de passage, contacts VHF et météo à l’ETA' });
    const map = container.querySelector('.so-print-route-map')!;
    expect(map.textContent).toContain('Carte du parcours');
    expect(map.querySelector('svg')).not.toBeNull();
    expect(map.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(map.querySelector('iframe, image')).toBeNull();
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Waypoint', 'Description', 'Latitude', 'Longitude', 'UKC', 'ETADate - Heure', 'Contacts VHF', 'Météo à l’ETA', 'Trafic dense']);
    expect(within(table).getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(9);
    expect(within(table).queryByRole('columnheader', { name: 'Conditions de vie à bord' })).not.toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '<Approche du port>' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '49° 39.000′ N' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '001° 37.200′ W' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: /Cherbourg · Capitainerie · Ch 12/ })).toBeInTheDocument();
    const weatherCell = within(table).getByRole('cell', { name: /Prévision conservée à la validation[\s\S]*Houle Hs/ });
    expect(weatherCell.textContent).toMatch(/Période(?:moyenne)?6 s/);
    expect(weatherCell.textContent).toContain('Houle Hs0,60 m');
    expect(weatherCell.textContent).toContain('Vent moyen 10 m12 nd');
    expect(within(weatherCell).getByText('Confortable')).toHaveClass('so-sea-state', 'is-success');
    const waypointCell = within(table).getByRole('cell', { name: 'WP1' });
    expect(waypointCell.textContent).toBe('WP1');
    expect(waypointCell.querySelector('.so-sea-state')).toBeNull();
    expect(table.querySelectorAll('.so-sea-state')).toHaveLength(1);
    expect(within(weatherCell).getByText('Hs de mer totale observée')).toBeInTheDocument();
    expect(within(weatherCell).getByText('4,2 m · période de pic : 11 s')).toBeInTheDocument();
    expect(within(weatherCell).getByText('Vent mesuré à 3 m')).toBeInTheDocument();
    expect(within(weatherCell).getAllByText('Bouée Manche · 5,8 km · 23/10/2026 10:15 UTC')).toHaveLength(2);
    expect(within(weatherCell).getAllByRole('link', { name: 'Licence Ouverte 2.0' })[0]).toHaveAttribute('href', SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL);
    expect(passage.getByText(/Météo-France · consultée le/)).toHaveTextContent(SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(container.textContent).toContain('GO');
    expect(record).toEqual(original);
    expect(passage.getByText(/Météo-France · consultée le/)).toHaveTextContent('MFWAM');
    expect(passage.getByText(/Annuaire vérifié le/)).toHaveTextContent('Ports de Normandie');
    expect(table.textContent).not.toMatch(/rafales|37 nd/i);
    draft.vessel.weatherMatrix.levels[1][1] = null;
    rerender(<SeaOperationPrint record={record} />);
    expect(container.querySelector('.so-print-passage .so-sea-state')).toBeNull();
    expect(weatherCell.textContent).toContain('Houle Hs0,60 m');
    draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    const capturedWeather = draft.waypoints[0].weather;
    delete draft.waypoints[0].radio; delete draft.waypoints[0].weather;
    rerender(<SeaOperationPrint record={record} />);
    expect(passage.getByRole('cell', { name: 'Contacts VHF non enregistrés.' })).toBeInTheDocument();
    expect(passage.getByRole('cell', { name: /Prévision conservée à la validation[\s\S]*Prévisions météo non enregistrées/ })).toBeInTheDocument();
    expect(within(weatherCell).getByText('Hs / période indisponible')).toHaveClass('so-sea-state');
    expect(passage.queryByText(/Cherbourg|CROSS/)).not.toBeInTheDocument();
    delete draft.vessel.weatherMatrix;
    draft.waypoints[0].weather = capturedWeather;
    rerender(<SeaOperationPrint record={record} />);
    expect(passage.queryByText('Matrice non renseignée')).not.toBeInTheDocument();
    expect(container.querySelector('.so-print-passage .so-sea-state')).toBeNull();
    expect(weatherCell.textContent).toContain('Houle Hs0,60 m');
    expect(weatherCell.textContent).toMatch(/Période(?:moyenne)?6 s/);
    rerender(<SeaOperationPrint record={{ ...record, status: 'draft' }} />);
    expect(passage.queryByText('Mesures officielles après le passage')).not.toBeInTheDocument();
    expect(passage.queryByText('Hs de mer totale observée')).not.toBeInTheDocument();
    expect(passage.queryByRole('link', { name: 'Licence Ouverte 2.0' })).not.toBeInTheDocument();
    expect(passage.getByText(/Météo-France · consultée le/)).not.toHaveTextContent(SEA_METEO_FRANCE_OBSERVATIONS_URL);
  });
});
