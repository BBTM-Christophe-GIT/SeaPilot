import type { SupabaseClient } from '@supabase/supabase-js';

const PEOPLE_SELECT = 'id, user_id, first_name, last_name, email, function_label, grade_label, active';

interface PersonRow {
  id: number;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  function_label: string | null;
  grade_label: string | null;
  active: boolean;
}

export interface PersonRecord {
  id: number;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
  active: boolean;
}

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
}

export function mapPersonRows(rows: PersonRow[]): PersonRecord[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email || '',
    functionLabel: row.function_label || '',
    gradeLabel: row.grade_label || '',
    active: row.active,
  }));
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

  return mapPersonRows((data || []) as PersonRow[]);
}

export async function createPerson(client: SupabaseClient, input: CreatePersonInput): Promise<PersonRecord> {
  const payload = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email.trim() || null,
    function_label: input.functionLabel.trim() || null,
    grade_label: input.gradeLabel.trim() || null,
  };
  const { data, error } = await client.from('people').insert(payload).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as PersonRow])[0];
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

  return mapPersonRows([data as PersonRow])[0];
}
