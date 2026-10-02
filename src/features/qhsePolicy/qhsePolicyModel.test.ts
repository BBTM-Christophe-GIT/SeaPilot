import { describe, expect, it } from 'vitest';
import { validateQhsePolicyObjectiveDraft, validateQhsePolicyObjectiveUpdateDraft, validateQhsePolicyProcessDraft, validateQhsePolicyProgress, validateQhsePolicySettingsDraft } from './qhsePolicyModel';
const processId = 'a02c0000-0000-4000-8000-000000000001';
const objectiveId = 'a02c0000-0000-4000-8000-000000000002';

describe('policy objectives validation', () => {
  it('normalizes optional metadata without inventing policy text or rights', () => {
    expect(validateQhsePolicyProcessDraft({ name: '  Sécurité  ' })).toMatchObject({ id: null, name: 'Sécurité', description: '', position: 0, expectedRevision: null });
    expect(validateQhsePolicyObjectiveDraft({ processId, title: '  Réduire les accidents  ', ownerKind: 'office', ownerLabel: ' Armement - Cherbourg ' })).toMatchObject({ title: 'Réduire les accidents', ownerLabel: 'Armement - Cherbourg', dueOn: null, initialProgress: 0 });
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
