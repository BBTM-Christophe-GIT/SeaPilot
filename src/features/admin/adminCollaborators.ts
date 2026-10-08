import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUser } from './adminQueries';

export interface AdminCollaboratorRow {
  id: number;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  function_label: string | null;
  active: boolean;
  hired_on: string | null;
  departed_on: string | null;
}

export type AdminPopulation = 'current' | 'former' | 'all';
export type AdminEmploymentStatus = 'current' | 'former' | 'upcoming';

export function adminToday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function adminEmploymentStatus(person: AdminCollaboratorRow, today = adminToday()): AdminEmploymentStatus {
  if (!person.active || (person.departed_on && person.departed_on <= today)) return 'former';
  if (person.hired_on && person.hired_on > today) return 'upcoming';
  return 'current';
}

function normalizeEmail(email: string | null): string {
  return email?.trim().toLowerCase() || '';
}

export function hasBbtmEmail(email: string | null): boolean {
  return /^[^\s@]+@bbtm\.fr$/i.test(email?.trim() || '');
}

export function mapAdminCollaborators(people: AdminCollaboratorRow[], users: AdminUser[], today = adminToday()) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.filter((user) => normalizeEmail(user.email))
    .map((user) => [normalizeEmail(user.email), user]));

  return people.map((person) => {
    // An existing account may not yet be explicitly linked to its HR record.
    const account = person.user_id
      ? usersById.get(person.user_id)
      : usersByEmail.get(normalizeEmail(person.email));
    const email = person.email?.trim() || '';
    const accountEmail = account?.email.trim() || '';

    return {
      id: person.id,
      displayName: `${person.first_name} ${person.last_name}`.trim(),
      functionLabel: person.function_label?.trim() || '',
      active: person.active,
      employmentStatus: adminEmploymentStatus(person, today),
      departedOn: person.departed_on || '',
      userId: person.user_id || account?.id || null,
      email,
      accountEmail: normalizeEmail(accountEmail) !== normalizeEmail(email) ? accountEmail : '',
      hasAccount: Boolean(person.user_id || account),
      hasBbtmEmail: hasBbtmEmail(email) || hasBbtmEmail(accountEmail),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, 'fr'));
}

export type AdminCollaborator = ReturnType<typeof mapAdminCollaborators>[number];

export function adminUserEmploymentStatus(user: AdminUser, collaborators: AdminCollaborator[]): AdminEmploymentStatus | 'unlinked' {
  const matches = collaborators.filter((person) => person.userId === user.id);
  if (!matches.length) return 'unlinked';
  // A current HR record takes precedence over an older contract for the same account.
  if (matches.some((person) => person.employmentStatus === 'current')) return 'current';
  if (matches.some((person) => person.employmentStatus === 'upcoming')) return 'upcoming';
  return 'former';
}

export function filterAdminUsers(users: AdminUser[], collaborators: AdminCollaborator[], population: AdminPopulation): AdminUser[] {
  return users.filter((user) => {
    if (population === 'all') return true;
    const status = adminUserEmploymentStatus(user, collaborators);
    return status === population || (population === 'current' && status === 'unlinked');
  });
}

export async function fetchAdminCollaborators(client: SupabaseClient): Promise<AdminCollaboratorRow[]> {
  const people: AdminCollaboratorRow[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('people')
      .select('id, user_id, first_name, last_name, email, function_label, active, hired_on, departed_on')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as AdminCollaboratorRow[];
    people.push(...page);
    if (page.length < pageSize) return people;
  }
}
