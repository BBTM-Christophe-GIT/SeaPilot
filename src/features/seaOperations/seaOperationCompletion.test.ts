import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, SEA_OPERATION_CHECKS } from './seaOperationModel';
import { getSeaOperationCompletion } from './seaOperationCompletion';

function filledForm() {
  const form = emptySeaOperation();
  Object.assign(form, { project: 'P144', client: 'Client', clientContact: 'Contact', description: 'Transit', charts: '7420', decision: 'GO' });
  form.dapaq.method = 'nomade';
  form.dapaq.preparedBy = 'captain';
  form.vessel = { id: '42', name: 'Navire', registrationImo: 'IMO1234567', captainName: 'Capitaine', departurePort: 'Le Havre', departureQuay: '1', arrivalPort: 'Caen', arrivalQuay: '2', etd: '2026-10-16T08:00', eta: '2026-10-16T18:00' };
  form.applicability = { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' };
  for (const check of SEA_OPERATION_CHECKS) form.checks[check.id] = 'yes';
  form.portServices = ['none'];
  form.waypoints = [{ ...emptySeaOperationWaypoint('1'), number: '1', descriptionVhf: 'Sortie, VHF12', latitude: '49N', longitude: '0E', ukc: '2m', eta: '09:00' }];
  form.signature = { captainName: 'Capitaine', date: '2026-10-16', place: 'Le Havre', acknowledged: false };
  return form;
}

describe('getSeaOperationCompletion', () => {
  it('counts only the default decision date and routes missing fields to all four steps', () => {
    const completion = getSeaOperationCompletion(emptySeaOperation());
    expect(completion.completed).toBe(1);
    expect(completion.requirements.filter((field) => field.complete).map((field) => field.id)).toEqual(['signature.date']);
    expect(completion.completedSteps).toBe(0);
    expect(new Set(completion.missing.map((field) => field.step))).toEqual(new Set([0, 1, 2, 3]));
    expect(completion.sections.every((section) => !section.complete)).toBe(true);
  });

  it('reaches full preparation completeness without claiming a signature or GO assessment', () => {
    const form = filledForm();
    const completion = getSeaOperationCompletion(form);
    expect(completion.percentage).toBe(100);
    expect(completion.completedSteps).toBe(4);
    expect(completion.missing).toEqual([]);
    expect(completion).not.toHaveProperty('status');
    expect(completion.requirements.some((field) => field.id === 'signature.acknowledged')).toBe(false);
  });

  it('counts a red negative as an answered field while reporting the departure blocker separately', () => {
    const form = filledForm();
    form.checks.weather = 'no';
    const completion = getSeaOperationCompletion(form);
    expect(completion.percentage).toBe(100);
    expect(completion.blockingChecks.map((check) => check.id)).toEqual(['weather']);
  });

  it('does not count inactive towing, cargo or diving answers or stale negatives', () => {
    const form = filledForm();
    form.checks.divingMedicalKit = 'no';
    form.checks.towingPlan = '';
    const completion = getSeaOperationCompletion(form);
    expect(completion.percentage).toBe(100);
    expect(completion.blockingChecks).toEqual([]);
    expect(completion.requirements.some((field) => field.id === 'check.towingPlan')).toBe(false);
    expect(completion.sections.filter((section) => section.complete)).toHaveLength(9);
  });

  it('adds applicable confirmations and explanations to their control section', () => {
    const form = filledForm();
    form.applicability.towing = 'yes';
    form.checks.towingAuthorization = 'no';
    const completion = getSeaOperationCompletion(form);
    expect(completion.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'justification.towingAuthorization', step: 1, section: '2.2' }),
      expect.objectContaining({ id: 'boarding.required', step: 1, section: '2.5' }),
    ]));
    expect(completion.sections.find((section) => section.id === '2.2')?.complete).toBe(false);
  });

  it('requires risks when NO GO is chosen without removing unfilled preparation fields', () => {
    const form = emptySeaOperation();
    form.decision = 'NO_GO';
    const completion = getSeaOperationCompletion(form);
    expect(completion.missing).toContainEqual(expect.objectContaining({ id: 'risks', step: 3 }));
    expect(completion.percentage).toBeLessThan(100);
  });

  it('keeps chronology and impossible decision dates incomplete', () => {
    const form = filledForm();
    form.vessel.eta = '2026-10-15T18:00';
    form.signature.date = '2026-02-31';
    expect(getSeaOperationCompletion(form).missing.map((field) => field.id)).toEqual(['vessel.eta', 'signature.date']);
  });

  it('requires supplier ownership only when supplies are applicable', () => {
    const form = filledForm();
    form.applicability.supplies = 'yes';
    form.supplies.delegated = 'yes';
    expect(getSeaOperationCompletion(form).missing.map((field) => field.id)).toEqual(['supplies.name', 'supplies.contact', 'supplies.items']);
  });
});
