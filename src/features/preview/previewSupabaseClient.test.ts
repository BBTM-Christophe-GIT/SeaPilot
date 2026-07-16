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

  it('exposes a safe Projects catalog for visual preview without enabling writes', async () => {
    const projects = await previewSupabaseClient.from('projects').select('*').order('id');
    const documents = await previewSupabaseClient.from('project_documents').select('*').order('id');
    const occurrences = await previewSupabaseClient.from('planning_projects').select('*').order('id');
    const write = await previewSupabaseClient.rpc('projects_save', { target_title: 'Forbidden preview write' });

    expect(projects.error).toBeNull();
    expect(projects.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_code: 'P901', source_label: 'sharepoint' }),
      expect.objectContaining({ project_code: 'P902', source_label: 'seapilot' }),
    ]));
    expect(documents.data).toEqual([
      expect.objectContaining({
        file_url: expect.stringContaining('bbtm668.sharepoint.com/sites/QHSE/'),
        is_folder: false,
      }),
    ]);
    expect(occurrences.data?.filter((occurrence) => occurrence.catalog_project_id === 9001)).toHaveLength(2);
    expect(write.error).toMatchObject({ message: expect.stringContaining('ne peuvent pas être enregistrées') });
  });
});
