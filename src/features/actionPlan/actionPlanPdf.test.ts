import { describe, expect, it } from 'vitest';
import {
  actionSheetCompletion,
  actionSheetCompletionPercent,
  actionSheetFileName,
  actionSheetReference,
  buildActionSheetPdf,
  type ActionSheetData,
} from './actionPlanPdf';

const completeCreationData: ActionSheetData = {
  id: 42,
  title: 'Signalétique dégradée sur le pont',
  description: 'Deux panneaux doivent être remplacés.',
  correctiveAction: 'Remplacer les panneaux et contrôler la zone.',
  occurredAt: '2026-08-27T14:35:00+02:00',
  dueOn: '2026-09-10',
  vesselName: 'M/V Démonstration',
  vesselManeuver: 'Navire à quai',
  weatherConditions: 'Vent 12 nœuds, mer belle',
  issuerName: 'Paul SIMON',
  ownerName: '',
  anomalyCause: '',
  actionTypeKey: 'action_progress',
  actionType: 'Action de Progrès - BBTM',
  deviationType: "Proposition d'Amélioration",
  status: 'Brouillon',
  findingPhotos: [{ label: 'Vue générale', source: new Blob(['photo'], { type: 'image/png' }) }],
};

describe('actionPlanPdf', () => {
  it('tracks creation, approval and future closure sections', () => {
    const completion = actionSheetCompletion(completeCreationData);

    expect(completion).toHaveLength(12);
    expect(completion.filter((item) => item.complete).map((item) => item.key)).toEqual([
      'identification', 'vessel-weather', 'qualification', 'finding', 'photos', 'proposal',
    ]);
    expect(actionSheetCompletionPercent(completeCreationData)).toBe(50);
  });

  it('formats the printable reference and file name', () => {
    expect(actionSheetReference(completeCreationData)).toBe('ACT-000042');
    expect(actionSheetFileName(completeCreationData)).toBe('act-000042-Signaletique-degradee-sur-le-pont.pdf');
  });

  it('generates an A4 PDF blob even when an evidence image cannot be decoded', async () => {
    const blob = await buildActionSheetPdf({ ...completeCreationData, findingPhotos: [] });

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1_000);
  });
});
