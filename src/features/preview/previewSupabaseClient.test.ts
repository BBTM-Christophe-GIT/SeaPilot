import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from './previewSupabaseClient';

describe('previewSupabaseClient', () => {
  it('exposes the P1.1 planning catalog without enabling writes', async () => {
    const catalog = await previewSupabaseClient
      .from('stcw_certificates')
      .select('*')
      .eq('active', true)
      .order('category')
      .order('name');
    const write = await previewSupabaseClient.rpc('save_planning_manning_matrix', {});

    expect(catalog.error).toBeNull();
    expect(catalog.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'Pont' }),
      expect.objectContaining({ category: 'Machine' }),
      expect.objectContaining({ category: 'Formation de Sécurité' }),
      expect.objectContaining({ category: 'Radiocommunications' }),
    ]));
    expect(write.error).toMatchObject({ message: expect.stringContaining('ne peuvent pas être enregistrées') });
  });
});
