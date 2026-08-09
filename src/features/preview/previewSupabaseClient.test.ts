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
    expect(catalog.data).toHaveLength(54);
    expect(catalog.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'Pont' }),
      expect.objectContaining({ category: 'Machine' }),
      expect.objectContaining({ category: 'Formation de Sécurité' }),
      expect.objectContaining({ category: 'Ressources Humaines' }),
      expect.objectContaining({ file_name: 'CFBS', source_item_id: 25 }),
      expect.objectContaining({ file_name: 'Visite Médicale', source_item_id: 37 }),
    ]));
    expect(write.error).toMatchObject({ message: expect.stringContaining('ne peuvent pas être enregistrées') });
  });

  it('exposes a synthetic HR file for local document workflow checks', async () => {
    const people = await previewSupabaseClient.from('people').select('*').order('last_name');
    const documents = await previewSupabaseClient.from('hr_documents').select('*').order('expires_on');

    expect(people.error).toBeNull();
    expect(documents.error).toBeNull();
    expect(people.data).toEqual(expect.arrayContaining([expect.objectContaining({ last_name: 'DEMO' })]));
    expect(documents.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Arthur DEMO - CFBS - 2029.pdf', storage_bucket: 'hr-documents' }),
      ]),
    );
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

  it("exposes action plan data and exposure-linked HSE categories in preview", async () => {
    const actions = await previewSupabaseClient.from('action_items').select('*').order('due_on');
    const actionTypes = await previewSupabaseClient.from('action_type_catalog').select('*').eq('active', true);
    const summary = await previewSupabaseClient.rpc('hse_kpi_summary', { methodology_id: 9851 });
    const profile = await previewSupabaseClient.from('people').select('id,first_name,last_name').eq('user_id', 'preview-user').maybeSingle();

    expect(actions.error).toBeNull();
    expect(actions.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ sharepoint_list_title: "Plan d'Action", status: 'Non soldé' }),
      expect.objectContaining({ sharepoint_list_title: 'Indicateurs QHSE', action_type_key: 'first-aid-case' }),
    ]));
    expect(actionTypes.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ hse_classification: 'LWDC', tracks_exposure_rate: true }),
      expect.objectContaining({ hse_classification: 'FAC', tracks_exposure_rate: true }),
    ]));
    expect(summary.data).toMatchObject({ exposure_hours: 12480, LWDC: 1, FAC: 3 });
    expect(profile.data).toMatchObject({ first_name: 'Arthur', last_name: 'DEMO' });
  });
});
