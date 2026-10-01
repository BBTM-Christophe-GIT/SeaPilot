import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegulatoryReview, RegulatoryReviewDraft, RegulatoryText, RegulatoryTextDraft } from './regulatoryModel';
import { validateRegulatoryReviewDraft, validateRegulatoryTextDraft } from './regulatoryModel';

export type { RegulatoryCategory, RegulatoryReview, RegulatoryReviewDraft, RegulatoryText, RegulatoryTextDraft } from './regulatoryModel';

export interface RegulatoryLibraryData {
  texts: RegulatoryText[];
  reviews: RegulatoryReview[];
}

const TEXT_SELECT = 'id,category,title,url,is_primary,sort_order';
const REVIEW_SELECT = 'id,text_id,reviewed_at,reviewer_name,has_updates,updates,title_snapshot,url_snapshot';
const PAGE_SIZE = 500;

function assertResult(error: { message?: string; code?: string } | null, fallback: string): void {
  if (!error) return;
  if (error.code === '42501') throw new Error('Votre profil ne permet pas cette action dans cette rubrique.');
  throw new Error(error.message || fallback);
}

async function fetchPages<T>(client: SupabaseClient, table: string, columns: string, sort: string, ascending: boolean): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns)
      .order(sort, { ascending }).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    assertResult(error, 'Impossible de charger la bibliothèque réglementaire.');
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchRegulatoryLibrary(client: SupabaseClient): Promise<RegulatoryLibraryData> {
  const [texts, reviews] = await Promise.all([
    fetchPages<RegulatoryText>(client, 'regulatory_texts', TEXT_SELECT, 'sort_order', true),
    fetchPages<RegulatoryReview>(client, 'regulatory_reviews', REVIEW_SELECT, 'reviewed_at', false),
  ]);
  return { texts, reviews };
}

export async function saveRegulatoryText(client: SupabaseClient, draft: RegulatoryTextDraft, id?: string): Promise<RegulatoryText> {
  const payload = validateRegulatoryTextDraft(draft);
  const query = id
    ? client.from('regulatory_texts').update(payload).eq('id', id)
    : client.from('regulatory_texts').insert(payload);
  const { data, error } = await query.select(TEXT_SELECT).single();
  assertResult(error, 'Impossible d’enregistrer ce lien.');
  if (!data) throw new Error('Le lien n’a pas été enregistré.');
  return data as RegulatoryText;
}

export async function recordRegulatoryReview(client: SupabaseClient, textId: string, draft: RegulatoryReviewDraft): Promise<RegulatoryReview> {
  const payload = validateRegulatoryReviewDraft(draft);
  // The database sets the timestamp, identity, company and original source snapshots.
  const { data, error } = await client.from('regulatory_reviews')
    .insert({ text_id: textId, ...payload }).select(REVIEW_SELECT).single();
  assertResult(error, 'Impossible d’enregistrer cette revue.');
  if (!data) throw new Error('La revue n’a pas été enregistrée.');
  return data as RegulatoryReview;
}
