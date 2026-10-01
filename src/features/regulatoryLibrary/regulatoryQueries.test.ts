import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRegulatoryLibrary, recordRegulatoryReview, saveRegulatoryText } from './regulatoryQueries';
import { REGULATORY_REFERENCE_TEXTS } from './regulatoryModel';

function clientFixture(result: { data: unknown; error: { message?: string; code?: string } | null }) {
  const query = {
    select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result), range: vi.fn().mockResolvedValue(result),
  };
  const from = vi.fn().mockReturnValue(query);
  return { client: { from } as unknown as SupabaseClient, from, query };
}

describe('regulatory library queries', () => {
  it('loads texts and persisted history without creating any review', async () => {
    const { client, from, query } = clientFixture({ data: [], error: null });
    expect(await fetchRegulatoryLibrary(client)).toEqual({ texts: [], reviews: [] });
    expect(from.mock.calls.map(([table]) => table)).toEqual(['regulatory_texts', 'regulatory_reviews']);
    expect(query.insert).not.toHaveBeenCalled();
  });

  it('loads review history past the first API page', async () => {
    const { client, from, query } = clientFixture({ data: [], error: null });
    const reviewsQuery = { ...query, range: vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }).mockResolvedValueOnce({ data: [{ id: 500 }], error: null }) };
    from.mockImplementation((table) => table === 'regulatory_reviews' ? reviewsQuery : query);
    // Chain methods must keep the independent review builder.
    reviewsQuery.select = vi.fn().mockReturnValue(reviewsQuery);
    reviewsQuery.order = vi.fn().mockReturnValue(reviewsQuery);
    const result = await fetchRegulatoryLibrary(client);
    expect(result.reviews).toHaveLength(501);
    expect(reviewsQuery.range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it('fails visibly when the shared library cannot be loaded', async () => {
    const { client } = clientFixture({ data: null, error: { message: 'Database unavailable' } });
    await expect(fetchRegulatoryLibrary(client)).rejects.toThrow('Database unavailable');
  });

  it('saves an additional HTTPS link and preserves omitted primary/source metadata on edit', async () => {
    const { client, query } = clientFixture({ data: REGULATORY_REFERENCE_TEXTS[0], error: null });
    await saveRegulatoryText(client, { category: 'safety', title: ' Source ', url: 'https://example.org/' }, 'id');
    expect(query.update).toHaveBeenCalledWith({ category: 'safety', title: 'Source', url: 'https://example.org/' });
    expect(query.eq).toHaveBeenCalledWith('id', 'id');
  });

  it('records the observation without accepting a browser timestamp or reviewer identity', async () => {
    const { client, query } = clientFixture({ data: { id: 'review' }, error: null });
    await recordRegulatoryReview(client, 'text', { has_updates: true, updates: ' Article modifié ' });
    expect(query.insert).toHaveBeenCalledWith({ text_id: 'text', has_updates: true, updates: 'Article modifié' });
  });

  it('rejects incomplete reviews before sending them and displays permission failures', async () => {
    const { client, query } = clientFixture({ data: null, error: { code: '42501' } });
    await expect(recordRegulatoryReview(client, 'text', { has_updates: true, updates: '' })).rejects.toThrow('Décrivez');
    expect(query.insert).not.toHaveBeenCalled();
    await expect(recordRegulatoryReview(client, 'text', { has_updates: false, updates: '' })).rejects.toThrow('Votre profil');
  });
});
