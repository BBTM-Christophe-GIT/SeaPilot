import type { PersonRecord } from './peopleQueries';
import { EMPLOYMENT_CONTRACT_TEXT } from './employmentContractText';

export type EmploymentContractType = 'CDI' | 'CDD';

export interface EmploymentContractDraft {
  type: EmploymentContractType;
  personId: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  postalAddress: string;
  socialSecurityNumber: string;
  sailorNumber: string;
  functionLabel: string;
  vesselNames: string;
  enimCategory: string;
  enimFunctionCode: string;
  collectiveAgreement: string;
  grossMonthlySalary: string;
  startDate: string;
  endDate: string;
  signatureDate: string;
  employerRepresentative: string;
}

export type EmploymentContractFieldKey = Exclude<keyof EmploymentContractDraft, 'type' | 'personId'>;

export type EmploymentContractDetails = Pick<EmploymentContractDraft,
  'socialSecurityNumber' | 'vesselNames' | 'collectiveAgreement' | 'grossMonthlySalary' | 'endDate' | 'employerRepresentative'> & {
  salaryGridRowId?: string;
  annualGrossSalary?: string;
  salaryGridRevision?: string;
};

export interface EmploymentContractField {
  key: EmploymentContractFieldKey;
  label: string;
  type: 'text' | 'date' | 'textarea' | 'decimal';
  group: 'Identité' | 'Engagement' | 'Rémunération et signature';
  fromHr: boolean;
  cddOnly?: boolean;
}

export const EMPLOYMENT_CONTRACT_FIELDS: readonly EmploymentContractField[] = [
  { key: 'lastName', label: 'Nom', type: 'text', group: 'Identité', fromHr: true },
  { key: 'firstName', label: 'Prénom', type: 'text', group: 'Identité', fromHr: true },
  { key: 'birthDate', label: 'Date de naissance', type: 'date', group: 'Identité', fromHr: true },
  { key: 'birthPlace', label: 'Lieu de naissance', type: 'text', group: 'Identité', fromHr: true },
  { key: 'postalAddress', label: 'Adresse', type: 'textarea', group: 'Identité', fromHr: true },
  { key: 'socialSecurityNumber', label: 'Numéro de sécurité sociale', type: 'text', group: 'Identité', fromHr: false },
  { key: 'sailorNumber', label: 'Numéro de marin', type: 'text', group: 'Identité', fromHr: true },
  { key: 'startDate', label: 'Date de début', type: 'date', group: 'Engagement', fromHr: true },
  { key: 'endDate', label: 'Date de fin', type: 'date', group: 'Engagement', fromHr: false, cddOnly: true },
  { key: 'functionLabel', label: 'Poste', type: 'text', group: 'Engagement', fromHr: true },
  { key: 'vesselNames', label: 'Navire(s) d’affectation', type: 'textarea', group: 'Engagement', fromHr: false },
  { key: 'enimCategory', label: 'Catégorie ENIM', type: 'text', group: 'Engagement', fromHr: true },
  { key: 'enimFunctionCode', label: 'Code fonction ENIM', type: 'text', group: 'Engagement', fromHr: true },
  { key: 'collectiveAgreement', label: 'Convention collective applicable', type: 'textarea', group: 'Rémunération et signature', fromHr: false },
  { key: 'grossMonthlySalary', label: 'Salaire mensuel brut à l’embauche (€)', type: 'decimal', group: 'Rémunération et signature', fromHr: false },
  { key: 'signatureDate', label: 'Date de signature', type: 'date', group: 'Rémunération et signature', fromHr: false },
  { key: 'employerRepresentative', label: 'Représentant de l’armateur', type: 'text', group: 'Rémunération et signature', fromHr: false },
];

/** Only recorded RH facts are prefilled; financial and assignment values remain explicit. */
export function createEmploymentContractDraft(
  person: PersonRecord,
  type: EmploymentContractType = person.contractType.toUpperCase() === 'CDD' ? 'CDD' : 'CDI',
  details: Partial<EmploymentContractDetails> = {},
): EmploymentContractDraft {
  return {
    type, personId: person.id,
    firstName: person.firstName, lastName: person.lastName,
    birthDate: person.birthDate, birthPlace: person.birthPlace, postalAddress: person.postalAddress,
    socialSecurityNumber: details.socialSecurityNumber || '', sailorNumber: person.sailorNumber, functionLabel: person.functionLabel,
    vesselNames: details.vesselNames || '', enimCategory: person.enimCategory === null ? '' : String(person.enimCategory),
    enimFunctionCode: person.enimFunctionCode,
    collectiveAgreement: details.collectiveAgreement || 'CONVENTION COLLECTIVE PERSONNELS EXECUTION',
    grossMonthlySalary: details.grossMonthlySalary || '', startDate: person.hiredOn, endDate: type === 'CDD' ? details.endDate || '' : '',
    signatureDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date()),
    employerRepresentative: details.employerRepresentative || 'Benjamin BON - Président',
  };
}

export function isEmploymentContractDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type EmploymentContractDurationUnit = 'days' | 'weeks' | 'months';

/**
 * The end date is inclusive. Calendar months end the day before the anniversary;
 * when that day does not exist in the target month, use its final calendar day.
 */
export function calculateEmploymentContractEndDate(
  startDate: string,
  amount: string,
  unit: EmploymentContractDurationUnit,
): string {
  if (!isEmploymentContractDate(startDate)) {
    throw new Error('La date de début enregistrée dans la fiche RH est invalide.');
  }
  const trimmedAmount = amount.trim();
  const count = Number(trimmedAmount);
  if (!/^\d+$/.test(trimmedAmount) || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error('La durée du CDD doit être un nombre entier strictement positif.');
  }
  if (!['days', 'weeks', 'months'].includes(unit)) {
    throw new Error('Choisissez une durée en jours, semaines ou mois.');
  }

  const end = new Date(`${startDate}T12:00:00Z`);
  if (unit === 'months') {
    const originalDay = end.getUTCDate();
    const targetMonthIndex = end.getUTCFullYear() * 12 + end.getUTCMonth() + count;
    const targetYear = Math.floor(targetMonthIndex / 12);
    const targetMonth = targetMonthIndex % 12;
    // Start from day one to prevent January 31 from overflowing February.
    end.setUTCDate(1);
    end.setUTCFullYear(targetYear, targetMonth + 1, 0);
    const lastDay = end.getUTCDate();
    end.setUTCFullYear(targetYear, targetMonth, Math.min(originalDay, lastDay));
    if (originalDay <= lastDay) end.setUTCDate(end.getUTCDate() - 1);
  } else {
    const days = count * (unit === 'weeks' ? 7 : 1);
    end.setUTCDate(end.getUTCDate() + days - 1);
  }
  if (!Number.isFinite(end.getTime()) || end.getUTCFullYear() > 9999) {
    throw new Error('La durée du CDD dépasse la plage de dates prise en charge.');
  }
  return end.toISOString().slice(0, 10);
}

export function parseEmploymentContractSalary(value: string): number {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function validateEmploymentContractDraft(draft: EmploymentContractDraft): string[] {
  const errors: string[] = [];
  if (!['CDI', 'CDD'].includes(draft.type)) errors.push('Choisissez un contrat CDI ou CDD.');
  if (!Number.isSafeInteger(draft.personId) || draft.personId <= 0) errors.push('La fiche RH est introuvable.');
  for (const field of EMPLOYMENT_CONTRACT_FIELDS) {
    if (field.cddOnly && draft.type !== 'CDD') continue;
    const value = draft[field.key].trim();
    if (!value) errors.push(`${field.label} : renseignez ce champ.`);
    else if (field.type === 'date' && !isEmploymentContractDate(value)) errors.push(`${field.label} : date invalide.`);
    else if (value.length > (field.type === 'textarea' ? 1200 : 240)) errors.push(`${field.label} : texte trop long.`);
    if (Array.from(value).some((character) => character.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(character))) {
      errors.push(`${field.label} : caractère non autorisé.`);
    }
  }
  if (draft.type === 'CDD' && isEmploymentContractDate(draft.startDate) && isEmploymentContractDate(draft.endDate) && draft.endDate < draft.startDate) {
    errors.push('La date de fin du CDD doit être postérieure ou égale à la date de début.');
  }
  if (isEmploymentContractDate(draft.birthDate) && isEmploymentContractDate(draft.startDate) && draft.birthDate >= draft.startDate) {
    errors.push('La date de naissance doit précéder la date de début.');
  }
  const salary = parseEmploymentContractSalary(draft.grossMonthlySalary);
  if (draft.grossMonthlySalary.trim() && (!Number.isFinite(salary) || salary <= 0 || salary > 1_000_000)) {
    errors.push('Le salaire mensuel brut doit être un montant positif avec deux décimales au maximum.');
  }
  return errors;
}

export function formatEmploymentContractDate(value: string, long = false): string {
  if (!isEmploymentContractDate(value)) return value;
  return new Intl.DateTimeFormat('fr-FR', long
    ? { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }
  ).format(new Date(`${value}T12:00:00Z`));
}

export function employmentContractValues(draft: EmploymentContractDraft): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, String(value).trim()])),
    fullName: `${draft.firstName.trim()} ${draft.lastName.trim()}`,
    startDate: formatEmploymentContractDate(draft.startDate),
    endDate: draft.type === 'CDD' ? formatEmploymentContractDate(draft.endDate) : '',
    birthDate: formatEmploymentContractDate(draft.birthDate),
    signatureDate: formatEmploymentContractDate(draft.signatureDate, true),
    headerDate: formatEmploymentContractDate(draft.signatureDate),
    grossMonthlySalary: Number.isFinite(parseEmploymentContractSalary(draft.grossMonthlySalary))
      ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseEmploymentContractSalary(draft.grossMonthlySalary))
      : draft.grossMonthlySalary,
  };
}

export function buildEmploymentContractPreview(draft: EmploymentContractDraft): string[] {
  const values = employmentContractValues(draft);
  return EMPLOYMENT_CONTRACT_TEXT[draft.type].map((paragraph) =>
    paragraph.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key: string) => values[key] || 'À renseigner'),
  );
}

export function buildEmploymentContractFileName(draft: EmploymentContractDraft): string {
  const person = `${draft.lastName}-${draft.firstName}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  return `Contrat-${draft.type}-${person || `profil-${draft.personId}`}-${draft.startDate}.pdf`;
}
