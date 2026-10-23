import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationPrint } from './SeaOperationPrint';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';

describe('Opération en Mer printable content', () => {
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
      signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-10-22T12:00:00Z', captainName: 'Capitaine', canEdit: false, canSign: false };
    const { container, rerender } = render(<SeaOperationPrint record={record} />);
    const passage = within(container.querySelector('.so-print-passage-section')!);
    const table = passage.getByRole('table', { name: 'Points de passage, contacts VHF et météo à l’ETA' });
    const map = container.querySelector('.so-print-route-map')!;
    expect(map.textContent).toContain('Carte du parcours');
    expect(map.querySelector('svg')).not.toBeNull();
    expect(map.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(map.querySelector('iframe, image')).toBeNull();
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Waypoint', 'Description', 'Latitude', 'Longitude', 'UKC', 'ETA – Date et heure', 'Contacts VHF', 'Météo à l’ETA', 'Trafic dense']);
    expect(within(table).getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(9);
    expect(within(table).queryByRole('columnheader', { name: 'Conditions de vie à bord' })).not.toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '<Approche du port>' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: /Cherbourg · Capitainerie · Ch 12/ })).toBeInTheDocument();
    const weatherCell = within(table).getByRole('cell', { name: /État de mer prévu[\s\S]*Houle Hs/ });
    expect(weatherCell.textContent).toMatch(/Période(?:moyenne)?6 s/);
    expect(weatherCell.textContent).toContain('Houle Hs0,60 m');
    expect(weatherCell.textContent).toContain('Vent moyen 10 m12 nd');
    expect(within(weatherCell).getByText('Confortable')).toHaveClass('so-sea-state', 'is-success');
    const waypointCell = within(table).getByRole('cell', { name: 'WP1' });
    expect(waypointCell.textContent).toBe('WP1');
    expect(waypointCell.querySelector('.so-sea-state')).toBeNull();
    expect(table.querySelectorAll('.so-sea-state')).toHaveLength(1);
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
    expect(passage.getByRole('cell', { name: /État de mer prévu[\s\S]*Prévisions météo non enregistrées/ })).toBeInTheDocument();
    expect(within(weatherCell).getByText('Hs / période indisponible')).toHaveClass('so-sea-state');
    expect(passage.queryByText(/Cherbourg|CROSS/)).not.toBeInTheDocument();
    delete draft.vessel.weatherMatrix;
    draft.waypoints[0].weather = capturedWeather;
    rerender(<SeaOperationPrint record={record} />);
    expect(passage.queryByText('Matrice non renseignée')).not.toBeInTheDocument();
    expect(container.querySelector('.so-print-passage .so-sea-state')).toBeNull();
    expect(weatherCell.textContent).toContain('Houle Hs0,60 m');
    expect(weatherCell.textContent).toMatch(/Période(?:moyenne)?6 s/);
  });
});
