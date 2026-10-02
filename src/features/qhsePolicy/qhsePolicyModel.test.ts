import { describe, expect, it } from 'vitest';
import { validateQhsePolicyObjectiveDraft, validateQhsePolicyObjectiveUpdateDraft, validateQhsePolicyProcessDraft, validateQhsePolicyProgress, validateQhsePolicySettingsDraft, validateQhsePolicyProcessOrder, validateQhsePolicyProcessDeletion, type QhsePolicyAxisIconKey, type QhsePolicyProcess } from './qhsePolicyModel';
const processId = 'a02c0000-0000-4000-8000-000000000001';
const objectiveId = 'a02c0000-0000-4000-8000-000000000002';
const axis: QhsePolicyProcess = { id: processId, name: 'Sécurité', description: '', position: 0, archived: false, revision: 1, updatedAt: '' };

describe('policy objectives validation', () => {
  it('normalizes optional metadata without inventing policy text or rights', () => {
    expect(validateQhsePolicyProcessDraft({ name: '  Sécurité  ' })).toMatchObject({ id: null, name: 'Sécurité', description: '', position: 0, expectedRevision: null, iconKey: 'general' });
    expect(validateQhsePolicyObjectiveDraft({ processId, title: '  Réduire les accidents  ', ownerKind: 'office', ownerLabel: ' Armement - Cherbourg ' })).toMatchObject({ title: 'Réduire les accidents', ownerLabel: 'Armement - Cherbourg', dueOn: null, initialProgress: 0 });
  });
  it.each(['safety', 'ethics', 'health', 'environment', 'customer', 'cybersecurity', 'general'] as const)('accepts the explicit %s axis icon', (iconKey) => {
    expect(validateQhsePolicyProcessDraft({ name: 'Sécurité', iconKey }).iconKey).toBe(iconKey);
  });
  it('refuses arbitrary icon values and accepts complete ordering with archived axes', () => {
    expect(() => validateQhsePolicyProcessDraft({ name: 'Sécurité', iconKey: 'unsafe' as QhsePolicyAxisIconKey })).toThrow('icône');
    expect(validateQhsePolicyProcessDraft({ id: processId, expectedRevision: 1, name: 'Sécurité' }).iconKey).toBeNull();
    expect(validateQhsePolicyProcessOrder([{ ...axis, archived: true }, { ...axis, id: objectiveId, revision: 3 }])).toEqual([{ id: processId, revision: 1 }, { id: objectiveId, revision: 3 }]);
    expect(validateQhsePolicyProcessOrder([])).toEqual([]);
    expect(() => validateQhsePolicyProcessOrder([axis, axis])).toThrow('une seule fois');
    expect(() => validateQhsePolicyProcessOrder([{ ...axis, revision: NaN }])).toThrow('Actualisez');
  });
  it('requires a distinct active transfer target and preserves the source/target concurrency tokens', () => {
    expect(validateQhsePolicyProcessDeletion(axis)).toEqual({ id: processId, expectedRevision: 1, transferTo: null, transferExpectedRevision: null });
    expect(validateQhsePolicyProcessDeletion({ ...axis, archived: true }, { ...axis, id: objectiveId, revision: 2 })).toEqual({ id: processId, expectedRevision: 1, transferTo: objectiveId, transferExpectedRevision: 2 });
    expect(() => validateQhsePolicyProcessDeletion(axis, axis)).toThrow('autre axe');
    expect(() => validateQhsePolicyProcessDeletion(axis, { ...axis, id: objectiveId, archived: true })).toThrow('actif');
  });
  it.each([0, 100, 42.25])('accepts valid percentage %s', (value) => expect(validateQhsePolicyProgress(value)).toBe(value));
  it.each([-1, 101, 20.123, NaN, Infinity])('rejects invalid percentage %s', (value) => expect(() => validateQhsePolicyProgress(value)).toThrow('pourcentage'));
  it('requires revisions for editing and makes progress changes go through history', () => {
    expect(() => validateQhsePolicyObjectiveDraft({ id: objectiveId, processId, title: 'Sécurité' })).toThrow('Actualisez');
    expect(() => validateQhsePolicyObjectiveDraft({ id: objectiveId, processId, title: 'Sécurité', expectedRevision: 1, initialProgress: 40 })).toThrow('historique');
    expect(validateQhsePolicyObjectiveDraft({ id: objectiveId, processId, title: 'Sécurité', expectedRevision: 1 }).initialProgress).toBeNull();
  });
  it.each([{ name: '' }, { name: 'x'.repeat(201) }, { name: 'Sécurité', position: -1 }, { name: 'Sécurité', id: processId }])('rejects invalid process %j', (value) => expect(() => validateQhsePolicyProcessDraft(value)).toThrow());
  it('requires a dated, nonempty follow-up and rejects future records', () => {
    const update = { objectiveId, progress: 50, occurredOn: '2026-10-02', note: '  Formation terminée  ', expectedRevision: 2 };
    expect(validateQhsePolicyObjectiveUpdateDraft(update, '2026-10-02').note).toBe('Formation terminée');
    expect(() => validateQhsePolicyObjectiveUpdateDraft({ ...update, occurredOn: '2026-10-03' }, '2026-10-02')).toThrow('futur');
    expect(() => validateQhsePolicyObjectiveUpdateDraft({ ...update, note: ' ' }, '2026-10-02')).toThrow();
    expect(() => validateQhsePolicyObjectiveUpdateDraft({ ...update, occurredOn: '2026-02-30' }, '2026-10-02')).toThrow();
  });
  it('accepts one documentary source and rejects unsafe or mixed sources', () => {
    expect(validateQhsePolicySettingsDraft({ publicationId: 46 })).toMatchObject({ publicationId: 46, documentUrl: '' });
    for (const documentUrl of ['javascript:alert(1)', 'https://evil.example/file.pdf', 'https://drive.google.com/file/d/1234567890abcdef/view']) expect(() => validateQhsePolicySettingsDraft({ publicationId: null, documentUrl })).toThrow('PDF publié');
  });
  it('requires a structured owner on creation and rejects mixed references', () => {
    expect(() => validateQhsePolicyObjectiveDraft({ processId, title: 'Sécurité' })).toThrow('responsable');
    expect(() => validateQhsePolicyObjectiveDraft({ processId, title: 'Sécurité', ownerKind: 'office', ownerLabel: ' ' })).toThrow();
    expect(() => validateQhsePolicyObjectiveDraft({ processId, title: 'Sécurité', ownerKind: 'person', ownerPersonId: 1, ownerVesselId: 2 })).toThrow();
    expect(validateQhsePolicyObjectiveDraft({ processId, title: 'Sécurité', ownerKind: 'person', ownerPersonId: 1 })).toMatchObject({ ownerKind: 'person', ownerPersonId: 1, ownerVesselId: null });
    expect(validateQhsePolicyObjectiveDraft({ processId, title: 'Sécurité', ownerKind: 'vessel', ownerVesselId: 2 })).toMatchObject({ ownerKind: 'vessel', ownerPersonId: null, ownerVesselId: 2 });
  });
});
