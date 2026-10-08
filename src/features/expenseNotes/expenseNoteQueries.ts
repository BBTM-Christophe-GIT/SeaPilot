import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { ExpenseInputError, PAYMENT_METHODS, validateExpenseFiles, type ExpenseNote, type ExpenseNoteInput } from './expenseNoteModel';

export const EXPENSE_PDF_BUCKET = 'expense-note-pdfs';
export interface ExpenseIdentity { id: string; name: string }
export interface ExpenseVessel { id: number; name: string }
export interface ExpensePerson { id: number; name: string; is_current: boolean }
export interface ExpenseSettings { company_id: number; payment_methods: string[]; default_payment_method: string }
export async function fetchExpensePeople(client: SupabaseClient): Promise<ExpensePerson[]> {
  const { data, error } = await client.rpc('expense_note_people');
  if (error) throw error;
  return data || [];
}
export async function fetchExpenseSettings(client: SupabaseClient): Promise<ExpenseSettings> {
  const { data, error } = await client.from('expense_note_settings').select('company_id,payment_methods,default_payment_method').maybeSingle();
  if (error) throw error;
  if (data) return data;
  const company = await client.rpc('current_planning_company_id');
  if (company.error || !company.data) throw new Error('Société indisponible.');
  return { company_id: Number(company.data), payment_methods: PAYMENT_METHODS, default_payment_method: 'CB-Perso' };
}
export async function saveExpenseSettings(client: SupabaseClient, settings: ExpenseSettings): Promise<void> {
  const { error } = await client.from('expense_note_settings').upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
  if (error) throw error;
}

export async function fetchExpenseIdentity(client: SupabaseClient): Promise<ExpenseIdentity> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Veuillez vous reconnecter pour consulter vos notes.');
  const { data, error } = await client.from('profiles').select('display_name,email').eq('id', auth.user.id).single();
  if (error) throw error;
  return { id: auth.user.id, name: data.display_name || data.email };
}

export async function fetchExpenseVessels(client: SupabaseClient): Promise<ExpenseVessel[]> {
  const { data, error } = await client.from('vessels').select('id,name,length_overall,asset_kind').eq('active', true).order('name');
  if (error) throw error;
  return [...(data || []) as ExpenseVessel[]].sort(compareFleetAssets);
}

export async function fetchExpenseNotes(client: SupabaseClient): Promise<ExpenseNote[]> {
  const notes: ExpenseNote[] = [];
  // Do not truncate a person's history at the PostgREST row limit. RLS scopes every page.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('expense_notes').select('*').eq('status', 'issued')
      .order('issued_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw error;
    const page = (data || []) as ExpenseNote[];
    notes.push(...page.map((note) => ({ ...note, amount: Number(note.amount) })));
    if (page.length < 500) return notes;
  }
}

export async function submitExpenseNote(client: SupabaseClient, input: ExpenseNoteInput, files: File[]): Promise<ExpenseNote> {
  validateExpenseFiles(files);
  // The form keeps this ID across retries, including uncertain network responses.
  const existing = await client.from('expense_notes').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === 'issued') return existing.data as ExpenseNote;
  let note = existing.data as ExpenseNote | null;
  if (!note) {
    const inserted = await client.from('expense_notes').insert(input).select('*').single();
    if (inserted.error) throw inserted.error;
    note = inserted.data as ExpenseNote;
  }
  const { generateExpenseNotePdf } = await import('./expenseNotePdf');
  let pdf: Blob;
  try { pdf = await generateExpenseNotePdf(note, files); }
  catch (failure) {
    if (!existing.data) {
      // No upload or issuance was attempted. Allow correction of a bad/oversized receipt.
      await client.from('expense_notes').delete().eq('id', note.id).eq('status', 'preparing');
      throw new ExpenseInputError((failure as Error).message);
    }
    throw failure;
  }
  const uploaded = await client.storage.from(EXPENSE_PDF_BUCKET).upload(note.pdf_path, pdf, { contentType: 'application/pdf', upsert: false });
  // An earlier attempt may have uploaded successfully before its response was lost.
  if (uploaded.error && String(uploaded.error.statusCode) !== '409' && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error;
  const issued = await client.from('expense_notes').update({ status: 'issued' }).eq('id', note.id).eq('status', 'preparing').select('*').maybeSingle();
  if (issued.error) throw issued.error;
  if (issued.data) return issued.data as ExpenseNote;
  const confirmed = await client.from('expense_notes').select('*').eq('id', note.id).single();
  if (confirmed.error || confirmed.data.status !== 'issued') throw new Error('Émission non confirmée. Réessayez avec ce formulaire.');
  return confirmed.data as ExpenseNote;
}

export async function transmitExpenseNote(client: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await client.functions.invoke('expense-note-send', { body: { noteId: id } });
  if (error) {
    const context = error.context;
    if (context instanceof Response) {
      const detail = await context.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw new Error('La note est enregistrée. La transmission à la comptabilité reste à reprendre.');
  }
  if (!data?.ok) throw new Error(data?.error || 'Transmission non confirmée.');
  return data.message || 'Note transmise à la comptabilité.';
}

export async function downloadExpenseNote(client: SupabaseClient, note: ExpenseNote): Promise<void> {
  const { data, error } = await client.storage.from(EXPENSE_PDF_BUCKET).download(note.pdf_path);
  if (error || !data) throw error || new Error('PDF indisponible.');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `NDF-${note.expense_on}-${note.id.slice(0, 8)}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
