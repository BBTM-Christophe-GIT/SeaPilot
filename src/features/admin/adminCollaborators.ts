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
}

function normalizeEmail(email: string | null): string {
  return email?.trim().toLowerCase() || '';
}

export function hasBbtmEmail(email: string | null): boolean {
  return /^[^\s@]+@bbtm\.fr$/i.test(email?.trim() || '');
}

export function mapAdminCollaborators(people: AdminCollaboratorRow[], users: AdminUser[]) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.filter((user) => normalizeEmail(user.email))
    .map((user) => [normalizeEmail(user.email), user]));

  return people.filter((person) => person.active).map((person) => {
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
      email,
      accountEmail: normalizeEmail(accountEmail) !== normalizeEmail(email) ? accountEmail : '',
      hasAccount: Boolean(person.user_id || account),
      hasBbtmEmail: hasBbtmEmail(email) || hasBbtmEmail(accountEmail),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, 'fr'));
}

export async function fetchAdminCollaborators(client: SupabaseClient): Promise<AdminCollaboratorRow[]> {
  const people: AdminCollaboratorRow[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('people')
      .select('id, user_id, first_name, last_name, email, function_label, active')
      .eq('active', true)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as AdminCollaboratorRow[];
    people.push(...page);
    if (page.length < pageSize) return people;
  }
}
