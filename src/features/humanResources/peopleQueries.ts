import type { SupabaseClient } from '@supabase/supabase-js';

const PEOPLE_SELECT = [
  'id',
  'user_id',
  'first_name',
  'last_name',
  'email',
  'function_label',
  'grade_label',
  'role_label',
  'register_label',
  'sex',
  'sailor_number',
  'm365_account',
  'phone',
  'contract_type',
  'hired_on',
  'departed_on',
  'emergency_contact_name',
  'emergency_contact_phone',
  'active',
].join(', ');

const HR_DOCUMENT_SELECT = [
  'id',
  'person_id',
  'category_key',
  'title',
  'status',
  'issued_on',
  'expires_on',
  'requires_captain_validation',
  'source_label',
  'notes',
  'file_url',
].join(', ');

export const HR_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  administrative: 'Documents administratifs',
  certificate: 'Certificats',
  deck: 'Pont',
  engine: 'Machine',
  lifting: 'Levage',
  medical_visit: 'Visite Medicale',
  safety_training: 'Formation de Securite',
  safety_induction: 'Safety Induction',
};

type HrDocumentStatus = 'valid' | 'renew_due' | 'expired' | 'missing' | 'pending_validation';

interface PersonRow {
  id: number;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  function_label: string | null;
  grade_label: string | null;
  role_label: string | null;
  register_label: string | null;
  sex: string | null;
  sailor_number: string | null;
  m365_account: string | null;
  phone: string | null;
  contract_type: string | null;
  hired_on: string | null;
  departed_on: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  active: boolean;
}

interface HrDocumentRow {
  id: number;
  person_id: number;
  category_key: string | null;
  title: string;
  status: string | null;
  issued_on: string | null;
  expires_on: string | null;
  requires_captain_validation: boolean | null;
  source_label: string | null;
  notes: string | null;
  file_url: string | null;
}

export interface PersonRecord {
  id: number;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel: string;
  registerLabel: string;
  sex: string;
  sailorNumber: string;
  m365Account: string;
  phone: string;
  contractType: string;
  hiredOn: string;
  departedOn: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  active: boolean;
}

export interface HrDocumentRecord {
  id: number;
  personId: number;
  categoryKey: string;
  title: string;
  status: HrDocumentStatus;
  issuedOn: string;
  expiresOn: string;
  requiresCaptainValidation: boolean;
  sourceLabel: string;
  notes: string;
  fileUrl: string;
}

export interface PersonCategorySummary {
  key: string;
  label: string;
  count: number;
  urgentCount: number;
  renewalDueCount: number;
}

export interface PersonDashboardRecord extends PersonRecord {
  documents: HrDocumentRecord[];
  categorySummaries: PersonCategorySummary[];
}

export interface HumanResourcesDashboardGroup {
  label: string;
  people: PersonDashboardRecord[];
}

export interface HumanResourcesDashboardMetrics {
  activePeople: number;
  sedentaryPeople: number;
  seafarerPeople: number;
  trainees: number;
  documents: number;
  renewalDue: number;
  urgent: number;
  missing: number;
}

export interface HumanResourcesDashboard {
  metrics: HumanResourcesDashboardMetrics;
  groups: HumanResourcesDashboardGroup[];
}

export interface HumanResourcesData {
  people: PersonRecord[];
  documents: HrDocumentRecord[];
}

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel?: string;
  registerLabel?: string;
  sex?: string;
  sailorNumber?: string;
  m365Account?: string;
}

function nullableText(value: string | null | undefined): string {
  return value || '';
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

function normalizeStatus(status: string | null): HrDocumentStatus {
  if (
    status === 'valid' ||
    status === 'renew_due' ||
    status === 'expired' ||
    status === 'missing' ||
    status === 'pending_validation'
  ) {
    return status;
  }

  return 'valid';
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function getHrDocumentCategoryLabel(categoryKey: string): string {
  return HR_DOCUMENT_CATEGORY_LABELS[categoryKey] || categoryKey;
}

export function isHrDocumentUrgent(document: HrDocumentRecord): boolean {
  return document.status === 'expired' || document.status === 'missing';
}

export function isHrDocumentRenewalDue(document: HrDocumentRecord): boolean {
  return document.status === 'expired' || document.status === 'renew_due';
}

export function formatPersonName(person: PersonRecord): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

export function mapPersonRows(rows: PersonRow[]): PersonRecord[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: nullableText(row.email),
    functionLabel: nullableText(row.function_label),
    gradeLabel: nullableText(row.grade_label),
    roleLabel: nullableText(row.role_label),
    registerLabel: nullableText(row.register_label),
    sex: nullableText(row.sex),
    sailorNumber: nullableText(row.sailor_number),
    m365Account: nullableText(row.m365_account),
    phone: nullableText(row.phone),
    contractType: nullableText(row.contract_type),
    hiredOn: nullableText(row.hired_on),
    departedOn: nullableText(row.departed_on),
    emergencyContactName: nullableText(row.emergency_contact_name),
    emergencyContactPhone: nullableText(row.emergency_contact_phone),
    active: row.active,
  }));
}

export function mapHrDocumentRows(rows: HrDocumentRow[]): HrDocumentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    categoryKey: row.category_key || 'administrative',
    title: row.title,
    status: normalizeStatus(row.status),
    issuedOn: nullableText(row.issued_on),
    expiresOn: nullableText(row.expires_on),
    requiresCaptainValidation: row.requires_captain_validation === true,
    sourceLabel: nullableText(row.source_label),
    notes: nullableText(row.notes),
    fileUrl: nullableText(row.file_url),
  }));
}

function isSedentary(person: PersonRecord): boolean {
  const searchable = normalizeSearchValue(`${person.roleLabel} ${person.functionLabel}`);
  return searchable.includes('sedentaire') || searchable.includes('direction') || searchable.includes('yard manager');
}

function isTrainee(person: PersonRecord): boolean {
  return normalizeSearchValue(`${person.roleLabel} ${person.functionLabel} ${person.gradeLabel}`).includes('stagiaire');
}

function buildCategorySummaries(documents: HrDocumentRecord[]): PersonCategorySummary[] {
  const summaries = documents.reduce<Map<string, PersonCategorySummary>>((result, document) => {
    const current = result.get(document.categoryKey) || {
      key: document.categoryKey,
      label: getHrDocumentCategoryLabel(document.categoryKey),
      count: 0,
      urgentCount: 0,
      renewalDueCount: 0,
    };

    current.count += 1;
    current.urgentCount += isHrDocumentUrgent(document) ? 1 : 0;
    current.renewalDueCount += isHrDocumentRenewalDue(document) ? 1 : 0;
    result.set(document.categoryKey, current);

    return result;
  }, new Map<string, PersonCategorySummary>());

  return [...summaries.values()].sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export function buildHumanResourcesDashboard(
  people: PersonRecord[],
  documents: HrDocumentRecord[],
): HumanResourcesDashboard {
  const documentsByPersonId = documents.reduce<Map<number, HrDocumentRecord[]>>((result, document) => {
    result.set(document.personId, (result.get(document.personId) || []).concat(document));
    return result;
  }, new Map<number, HrDocumentRecord[]>());

  const dashboardPeople = people.map<PersonDashboardRecord>((person) => {
    const personDocuments = documentsByPersonId.get(person.id) || [];

    return {
      ...person,
      documents: personDocuments,
      categorySummaries: buildCategorySummaries(personDocuments),
    };
  });

  const activePeople = dashboardPeople.filter((person) => person.active);
  const groupMap = dashboardPeople.reduce<Map<string, PersonDashboardRecord[]>>((result, person) => {
    const groupLabel = person.functionLabel || 'Fonction non renseignee';
    result.set(groupLabel, (result.get(groupLabel) || []).concat(person));
    return result;
  }, new Map<string, PersonDashboardRecord[]>());

  return {
    metrics: {
      activePeople: activePeople.length,
      sedentaryPeople: activePeople.filter(isSedentary).length,
      seafarerPeople: activePeople.filter((person) => !isSedentary(person) && !isTrainee(person)).length,
      trainees: activePeople.filter(isTrainee).length,
      documents: documents.length,
      renewalDue: documents.filter(isHrDocumentRenewalDue).length,
      urgent: documents.filter(isHrDocumentUrgent).length,
      missing: documents.filter((document) => document.status === 'missing').length,
    },
    groups: [...groupMap.entries()]
      .map(([label, peopleInGroup]) => ({
        label,
        people: peopleInGroup.sort((left, right) => formatPersonName(left).localeCompare(formatPersonName(right), 'fr')),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'fr')),
  };
}

export async function fetchPeople(client: SupabaseClient): Promise<PersonRecord[]> {
  const { data, error } = await client
    .from('people')
    .select(PEOPLE_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPersonRows((data || []) as unknown as PersonRow[]);
}

export async function fetchHrDocuments(client: SupabaseClient): Promise<HrDocumentRecord[]> {
  const { data, error } = await client.from('hr_documents').select(HR_DOCUMENT_SELECT).order('expires_on', {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw error;
  }

  return mapHrDocumentRows((data || []) as unknown as HrDocumentRow[]);
}

export async function fetchHumanResourcesData(client: SupabaseClient): Promise<HumanResourcesData> {
  const [people, documents] = await Promise.all([fetchPeople(client), fetchHrDocuments(client)]);

  return { people, documents };
}

export async function createPerson(client: SupabaseClient, input: CreatePersonInput): Promise<PersonRecord> {
  const payload = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: optionalText(input.email),
    function_label: optionalText(input.functionLabel),
    grade_label: optionalText(input.gradeLabel),
    role_label: optionalText(input.roleLabel),
    register_label: optionalText(input.registerLabel),
    sex: optionalText(input.sex),
    sailor_number: optionalText(input.sailorNumber),
    m365_account: optionalText(input.m365Account),
  };
  const { data, error } = await client.from('people').insert(payload).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as unknown as PersonRow])[0];
}

export async function updatePersonActive(
  client: SupabaseClient,
  personId: number,
  active: boolean,
): Promise<PersonRecord> {
  const { data, error } = await client.from('people').update({ active }).eq('id', personId).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as unknown as PersonRow])[0];
}
