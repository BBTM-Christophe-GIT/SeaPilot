import { SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, getActiveSeaOperationChecks } from './seaOperationModel';
import type { SeaOperationPayload } from './seaOperationModel';

export interface SeaOperationRequirement {
  id: string;
  label: string;
  step: number;
  complete: boolean;
  section?: string;
}

const filled = (value: string) => Boolean(value.trim());
const dateValid = (value: string) => filled(value) && Number.isFinite(Date.parse(value));
const signatureDateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && dateValid(value)
  && new Date(value).toISOString().slice(0, 10) === value;

/** Counts required answers and fields, independently of the captain's risk decision or signature. */
export function getSeaOperationCompletion(form: SeaOperationPayload) {
  const requirements: SeaOperationRequirement[] = [];
  const add = (id: string, label: string, step: number, complete: boolean, section?: string) => {
    requirements.push({ id, label, step, complete, section });
  };
  const field = (id: string, label: string, value: string, step = 0, section?: string) => add(id, label, step, filled(value), section);

  field('project', 'Projet', form.project);
  field('client', 'Client', form.client);
  field('clientContact', 'Coordonnées du client', form.clientContact);
  field('description', 'Description de l’opération', form.description);
  add('dapaq.method', 'Mode de réalisation de la DAPAQ', 0, form.dapaq.method !== '');
  add('dapaq.preparedBy', 'Responsable de la DAPAQ', 0, form.dapaq.preparedBy !== ''
    && !(form.dapaq.method === 'nomade' && form.dapaq.preparedBy === 'agent'));
  if (form.dapaq.preparedBy === 'agent') {
    field('dapaq.agentName', 'Nom de l’agent consignataire', form.dapaq.agentName);
    field('dapaq.agentContact', 'Coordonnées de l’agent consignataire', form.dapaq.agentContact);
  }
  form.specialPersonnel.forEach((contact, index) => {
    field(`person.${index}.name`, `Nom du personnel spécial n° ${index + 1}`, contact.name);
    field(`person.${index}.phone`, `Téléphone du personnel spécial n° ${index + 1}`, contact.phone);
  });
  add('vessel.id', 'Navire', 0, filled(form.vessel.id) && filled(form.vessel.name));
  for (const [key, label] of [
    ['registrationImo', 'Immatriculation / IMO'], ['captainName', 'Capitaine'],
    ['departurePort', 'Port de départ'], ['departureQuay', 'Quai de départ'],
    ['arrivalPort', 'Port d’arrivée'], ['arrivalQuay', 'Quai d’arrivée'],
  ] as const) field(`vessel.${key}`, label, form.vessel[key]);
  add('vessel.etd', 'Date et heure de départ', 0, dateValid(form.vessel.etd));
  add('vessel.eta', 'Date et heure d’arrivée après le départ', 0, dateValid(form.vessel.eta)
    && (!dateValid(form.vessel.etd) || Date.parse(form.vessel.eta) >= Date.parse(form.vessel.etd)));

  for (const section of SEA_OPERATION_SECTIONS) {
    if (section.applicability) add(`applicability.${section.applicability}`, `${section.title} : préciser si applicable`, 1,
      form.applicability[section.applicability] !== '', section.id);
  }
  for (const check of getActiveSeaOperationChecks(form)) {
    const value = form.checks[check.id];
    add(`check.${check.id}`, check.label, 1, check.yesOnly ? value === 'yes' : value !== '', check.section);
    if (check.justifyNo && value === 'no') field(`justification.${check.id}`, `Justification : ${check.label}`, form.justifications[check.id], 1, check.section);
  }
  if (form.applicability.towing === 'yes') {
    add('boarding.required', 'Besoin d’aller sur le remorqué', 1, form.towedVesselBoarding.required !== '', '2.5');
    if (form.towedVesselBoarding.required === 'yes') {
      add('boarding.measures', 'Mesures de sécurité sur le remorqué', 1, form.towedVesselBoarding.measures !== '', '2.5');
      if (form.towedVesselBoarding.measures === 'specific') field('boarding.details', 'Détail des mesures sur le remorqué', form.towedVesselBoarding.details, 1, '2.5');
    }
  }
  add('portServices', 'Services portuaires requis ou absence de besoin', 1, form.portServices.length > 0
    && !(form.portServices.includes('none') && form.portServices.length > 1), '2.7');
  if (form.portServices.some((service) => service !== 'none')) add('portServices.notified', 'Services portuaires obligatoires prévenus', 1, form.mandatoryServicesNotified, '2.7');
  if (form.applicability.supplies === 'yes') {
    add('supplies.delegated', 'Prise en charge de l’approvisionnement / avitaillement', 1, form.supplies.delegated !== '', '2.8');
    if (form.supplies.delegated === 'yes') {
      field('supplies.name', 'Nom du shipchandler', form.supplies.shipchandlerName, 1, '2.8');
      field('supplies.contact', 'Coordonnées du shipchandler', form.supplies.shipchandlerContact, 1, '2.8');
    }
    add('supplies.items', 'Besoins d’approvisionnement / avitaillement identifiés', 1, form.supplies.items.length > 0, '2.8');
    if (form.supplies.delegated === 'no') field('supplies.suppliers', 'Liste des fournisseurs', form.supplies.suppliers, 1, '2.8');
  }

  field('charts', 'Numéro des cartes marines', form.charts, 2);
  if (!form.waypoints.length) add('waypoints', 'Au moins un point de passage', 2, false);
  form.waypoints.forEach((point, index) => {
    for (const [key, label] of [
      ['number', 'Numéro'], ['descriptionVhf', 'Description / Contact VHF'], ['latitude', 'Latitude'],
      ['longitude', 'Longitude'], ['ukc', 'UKC'],
    ] as const) field(`waypoint.${index}.${key}`, `${label} du point ${index + 1}`, point[key], 2);
    add(`waypoint.${index}.eta`, `ETA du point ${index + 1}`, 2, /^([01]\d|2[0-3]):[0-5]\d$/.test(point.eta) || dateValid(point.eta));
  });

  add('decision', 'Décision du Capitaine', 3, form.decision !== '');
  field('signature.captainName', 'Prénom NOM du Capitaine signataire', form.signature.captainName, 3);
  add('signature.date', 'Date de la décision', 3, signatureDateValid(form.signature.date));
  field('signature.place', 'Lieu de la décision', form.signature.place, 3);
  if (form.decision === 'NO_GO') field('risks', 'Risques ou motif de NO GO à transmettre à l’Armement', form.risks, 3);

  const completeCount = requirements.filter((requirement) => requirement.complete).length;
  const steps = ['Armement et voyage', 'Contrôles avant appareillage', 'Plan de passage', 'Décision du Capitaine'].map((title, index) => {
    const fields = requirements.filter((requirement) => requirement.step === index);
    const completed = fields.filter((requirement) => requirement.complete).length;
    return { index, title, total: fields.length, completed, complete: completed === fields.length };
  });
  const sections = SEA_OPERATION_SECTIONS.map((section) => {
    const fields = requirements.filter((requirement) => requirement.section === section.id);
    const completed = fields.filter((requirement) => requirement.complete).length;
    return { id: section.id, title: section.title, total: fields.length, completed, complete: completed === fields.length };
  });
  const blockingChecks = SEA_OPERATION_CHECKS.filter((check) => check.blocking
    && (!check.applicability || form.applicability[check.applicability] === 'yes') && form.checks[check.id] === 'no');
  return {
    requirements, missing: requirements.filter((requirement) => !requirement.complete),
    completed: completeCount, total: requirements.length,
    percentage: Math.round(100 * completeCount / requirements.length),
    completedSteps: steps.filter((step) => step.complete).length,
    steps, sections, blockingChecks,
  };
}
