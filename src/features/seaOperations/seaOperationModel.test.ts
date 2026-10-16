import { describe, expect, it } from 'vitest';
import {
  DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS,
  emptySeaOperation, emptySeaOperationWaypoint, getActiveSeaOperationChecks,
  getSeaOperationAssessment, isSeaOperationPayload, validateSeaOperation, seaOperationToday,
} from './seaOperationModel';
import type { SeaOperationCheckId } from './seaOperationModel';

function completePayload() {
  const payload = emptySeaOperation();
  Object.assign(payload, {
    project: 'P144 – Travaux en mer', client: 'Client maritime', clientContact: 'Chef de projet, +33 2 00 00 00 00',
    description: 'Transit et opération de remorquage.', charts: '7420 / 7421', decision: 'GO',
  });
  payload.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
  payload.vessel = {
    id: '42', name: 'Navire 42', registrationImo: 'IMO 1234567', captainName: 'Camille Martin',
    departurePort: 'Le Havre', departureQuay: 'Quai 1', arrivalPort: 'Caen', arrivalQuay: 'Quai 2',
    etd: '2026-10-16T08:00', eta: '2026-10-16T17:00',
  };
  payload.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
  for (const check of SEA_OPERATION_CHECKS) payload.checks[check.id] = 'yes';
  payload.towedVesselBoarding.required = 'no';
  payload.portServices = ['none'];
  payload.supplies = {
    delegated: 'yes', shipchandlerName: 'Fournisseur maritime', shipchandlerContact: '+33 2 00 00 00 01',
    items: ['provisions'], suppliers: '', customerAccountsPrepared: false,
  };
  payload.waypoints = [{
    ...emptySeaOperationWaypoint('point-1'), number: '1', descriptionVhf: 'Sortie port, VHF 12',
    latitude: '49°29.00 N', longitude: '000°06.00 E', ukc: '2 m', eta: '09:00',
  }];
  payload.signature = { captainName: 'Camille Martin', date: '2026-10-16', place: 'Le Havre', acknowledged: true };
  return payload;
}

describe('sea operation form model', () => {
  it('defaults the signature date to today in Paris, including the UTC day boundary', () => {
    expect(emptySeaOperation().signature.date).toBe(seaOperationToday());
    expect(seaOperationToday(new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17');
    expect(seaOperationToday(new Date('2026-01-16T23:30:00Z'))).toBe('2026-01-17');
  });
  it('starts with an independent unanswered draft and never implies a GO', () => {
    const first = emptySeaOperation();
    const second = emptySeaOperation();
    expect(validateSeaOperation(first)).toEqual([]);
    expect(getSeaOperationAssessment(first)).toMatchObject({ status: 'incomplete', canGo: false, completedChecks: 0 });
    first.checks.weather = 'yes';
    first.applicability.towing = 'no';
    first.specialPersonnel.push({ name: 'Personne', phone: '0123' });
    expect(second.checks.weather).toBe('');
    expect(second.applicability.towing).toBe('');
    expect(second.specialPersonnel).toEqual([]);
  });

  it('rejects malformed JSON and unrecognized answer values even in drafts', () => {
    expect(isSeaOperationPayload({})).toBe(false);
    expect(validateSeaOperation({} as ReturnType<typeof emptySeaOperation>, 'DRAFT')).toHaveLength(1);
    const payload = completePayload();
    expect(isSeaOperationPayload(payload)).toBe(true);
    const malformed = structuredClone(payload) as unknown as { checks: Record<string, unknown> };
    malformed.checks.weather = true;
    expect(isSeaOperationPayload(malformed)).toBe(false);
    malformed.checks.weather = 'yes';
    malformed.checks.provisions = 'confirmed';
    expect(isSeaOperationPayload(malformed)).toBe(false);
    expect(isSeaOperationPayload({ ...payload, planning: { date: '2026-10-16', operationId: '1:42', projectId: '7', captainPersonId: '5' } })).toBe(true);
    expect(isSeaOperationPayload({ ...payload, planning: { date: 20261016, operationId: '1:42', projectId: '7', captainPersonId: '5' } })).toBe(false);
    expect(isSeaOperationPayload({ ...payload, planning: null })).toBe(false);
  });

  it('preserves all source sections, controls and medical kit entries', () => {
    expect(SEA_OPERATION_SECTIONS.map((section) => section.id)).toEqual(['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9']);
    expect(new Set(SEA_OPERATION_CHECKS.map((check) => check.id)).size).toBe(26);
    expect(SEA_OPERATION_CHECKS.filter((check) => check.blocking)).toHaveLength(12);
    expect(SEA_OPERATION_CHECKS.filter((check) => check.yesOnly).map((check) => check.id)).toEqual(['provisions', 'water', 'fuel', 'standingOrders']);
    expect(SEA_OPERATION_SUPPLY_ITEMS).toHaveLength(10);
    expect(DIVING_MEDICAL_KIT).toHaveLength(6);
    expect(DIVING_MEDICAL_KIT[0].detail).toContain('200 bars');
    expect(DIVING_MEDICAL_KIT.every((item) => item.quantity === 1)).toBe(true);
  });

  it('accepts a completed applicable form with the captain’s positive standing orders attestation', () => {
    const payload = completePayload();
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    expect(getSeaOperationAssessment(payload)).toMatchObject({ status: 'GO', canGo: true, completedChecks: 26, totalChecks: 26 });
  });

  it.each(SEA_OPERATION_CHECKS.filter((check) => check.blocking))('prevents departure for the source blocking negative: $id', (check) => {
    const payload = completePayload();
    payload.checks[check.id] = 'no';
    const assessment = getSeaOperationAssessment(payload);
    expect(assessment.status).toBe('NO_GO');
    expect(assessment.blockingChecks.map((item) => item.id)).toEqual([check.id]);
    expect(assessment.canGo).toBe(false);
    expect(validateSeaOperation(payload, 'GO')).toContain(`NO GO automatique : ${check.label}.`);
    payload.risks = 'Non-conformité identifiée, opération reportée pour correction.';
    expect(validateSeaOperation(payload, 'NO_GO')).toEqual([]);
  });

  it('ignores stale answers and explanations in inapplicable sections', () => {
    const payload = completePayload();
    payload.applicability = { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' };
    payload.checks.divingMedicalKit = 'no';
    payload.checks.towingAuthorization = 'no';
    payload.checks.cargoStability = 'no';
    payload.supplies.delegated = '';
    payload.towedVesselBoarding.required = '';
    expect(getActiveSeaOperationChecks(payload)).toHaveLength(18);
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    expect(getSeaOperationAssessment(payload).blockingChecks).toEqual([]);
  });

  it.each(SEA_OPERATION_CHECKS.filter((check) => check.justifyNo))('requires an Armement explanation for the source negative: $id', (check) => {
    const payload = completePayload();
    payload.checks[check.id] = 'no';
    expect(getSeaOperationAssessment(payload).missingJustifications.map((item) => item.id)).toContain(check.id);
    expect(validateSeaOperation(payload, 'GO').some((error) => error.startsWith('Une justification'))).toBe(true);
    payload.justifications[check.id] = 'Solution alternative définie et communiquée à l’Armement.';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    expect(getSeaOperationAssessment(payload).blockingChecks).toEqual([]);
  });

  it('does not invent blocking negatives for non-red towing answers or a non-dangerous cargo', () => {
    const payload = completePayload();
    for (const id of ['towingLimits', 'towingPlan', 'towingInsurance', 'dangerousGoods'] as SeaOperationCheckId[]) payload.checks[id] = 'no';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
  });

  it('keeps an unanswered active control incomplete', () => {
    const payload = completePayload();
    payload.checks.towingPlan = '';
    expect(getSeaOperationAssessment(payload)).toMatchObject({ status: 'incomplete', canGo: false, completedChecks: 25 });
    expect(getSeaOperationAssessment(payload).unansweredChecks.map((check) => check.id)).toEqual(['towingPlan']);
  });

  it('requires affirmative stock and standing orders confirmations without creating extra automatic NO GO rules', () => {
    const payload = completePayload();
    payload.checks.standingOrders = 'no';
    const assessment = getSeaOperationAssessment(payload);
    expect(assessment.status).toBe('incomplete');
    expect(assessment.blockingChecks).toEqual([]);
    expect(assessment.canGo).toBe(false);
  });

  it('allows an interrupted inspection to be signed NO GO with mission, vessel, risks and captain identity', () => {
    const payload = emptySeaOperation();
    payload.project = 'P144';
    payload.vessel.id = '42';
    payload.vessel.name = 'Navire 42';
    payload.risks = 'Dégradation météo, appareillage annulé avant inspection.';
    payload.signature = { captainName: 'Camille Martin', date: '2026-10-16', place: 'Le Havre', acknowledged: true };
    expect(validateSeaOperation(payload, 'NO_GO')).toEqual([]);
    expect(validateSeaOperation(payload, 'GO').length).toBeGreaterThan(0);
    payload.signature.acknowledged = false;
    expect(validateSeaOperation(payload, 'NO_GO')).toContain('Le Capitaine doit confirmer sa signature et sa décision.');
    payload.signature.acknowledged = true;
    payload.risks = ' ';
    expect(validateSeaOperation(payload, 'NO_GO').some((error) => error.includes('motif de NO GO'))).toBe(true);
  });

  it('requires the agent contact only when an agent prepares an email DAPAQ', () => {
    const payload = completePayload();
    payload.dapaq = { method: 'email', preparedBy: 'agent', agentName: '', agentContact: '' };
    expect(validateSeaOperation(payload, 'GO')).toEqual(expect.arrayContaining([
      'Le nom de l’agent consignataire est obligatoire.', 'Les coordonnées de l’agent consignataire sont obligatoires.',
    ]));
    payload.dapaq.agentName = 'Agent';
    payload.dapaq.agentContact = 'agent@example.test';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.dapaq.method = 'nomade';
    expect(validateSeaOperation(payload, 'GO')).toContain('La DAPAQ dans NOMADE doit être préparée par l’Armement ou le Capitaine.');
  });

  it('requires specific remorqué measures only when boarding is needed', () => {
    const payload = completePayload();
    payload.towedVesselBoarding = { required: 'yes', measures: 'specific', details: '' };
    expect(validateSeaOperation(payload, 'GO')).toContain('Le détail des mesures spécifiques sur le remorqué est obligatoire.');
    payload.towedVesselBoarding.details = 'Ronde de sécurité, balisage des zones et EPI vérifiés.';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.towedVesselBoarding = { required: 'yes', measures: 'sms', details: '' };
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
  });

  it('keeps no-service exclusive and requires required port services to have been notified', () => {
    const payload = completePayload();
    payload.portServices = ['pilotage'];
    expect(validateSeaOperation(payload, 'GO')).toContain('Le Capitaine doit confirmer que les services portuaires obligatoires ont été prévenus.');
    payload.mandatoryServicesNotified = true;
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.portServices.push('none');
    expect(validateSeaOperation(payload, 'DRAFT')).toContain('L’absence de service portuaire ne peut pas être combinée avec un service.');
  });

  it('validates supply ownership and supplier details only for a declared need', () => {
    const payload = completePayload();
    payload.supplies = { delegated: 'no', shipchandlerName: '', shipchandlerContact: '', items: ['drinkingWater'], suppliers: '', customerAccountsPrepared: false };
    expect(validateSeaOperation(payload, 'GO')).toContain('La liste des fournisseurs est obligatoire.');
    payload.supplies.suppliers = 'Eau potable : fournisseur du port';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.supplies.items = [];
    expect(validateSeaOperation(payload, 'GO')).toContain('Au moins un besoin d’approvisionnement / avitaillement doit être identifié.');
  });

  it('requires complete special-personnel contacts only for inserted people', () => {
    const payload = completePayload();
    payload.specialPersonnel = [{ name: 'Personne embarquée', phone: '' }];
    expect(validateSeaOperation(payload, 'GO')).toContain('Le téléphone du personnel spécial n° 1 est obligatoire.');
    payload.specialPersonnel[0].phone = '+33 6 00 00 00 00';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
  });

  it('requires passage-plan points and accepts the source same-day ETA time', () => {
    const payload = completePayload();
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.waypoints[0].eta = '25:00';
    expect(validateSeaOperation(payload, 'GO').some((error) => error.includes('HH:mm'))).toBe(true);
    payload.waypoints[0].eta = '2026-10-16T09:00';
    expect(validateSeaOperation(payload, 'GO')).toEqual([]);
    payload.waypoints = [];
    expect(validateSeaOperation(payload, 'GO')).toContain('Le passage plan doit comporter au moins un point.');
  });

  it('rejects reversed voyage times and impossible signature dates', () => {
    const payload = completePayload();
    payload.vessel.eta = '2026-10-15T17:00';
    expect(validateSeaOperation(payload, 'DRAFT')).toContain('L’ETA ne peut pas précéder l’ETD.');
    payload.signature.date = '2026-02-31';
    expect(validateSeaOperation(payload, 'GO')).toContain('La date de signature doit être valide.');
  });
});
