import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from './previewSupabaseClient';

describe('previewSupabaseClient', () => {
  it('keeps a sold urgent purchase request for alert-regression checks', async () => {
    const requests = await previewSupabaseClient.from('purchase_requests').select('*').order('id');

    expect(requests.error).toBeNull();
    expect(requests.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 9955, status: 'Traitée', urgent: true, received_on: '2026-07-20' }),
    ]));
  });

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

  it('updates fleet certificate metadata for the interactive preview', async () => {
    const before = await previewSupabaseClient.from('fleet_certificates').select('*').order('id');
    const certificate = before.data?.find((item) => item.id === 5000);
    const update = await previewSupabaseClient.rpc('update_fleet_certificate_document_metadata', {
      p_certificate_id: 5000,
      p_vessel_id: 7,
      p_category_key: '06-incendie',
      p_category_label: '06 - Incendie',
      p_document_title: 'Rapport incendie annuel',
      p_issued_on: '2026-08-19',
      p_expires_on: null,
    });

    expect(certificate).toBeDefined();
    expect(update.error).toBeNull();
    expect(update.data).toBe(5000);
    expect(certificate).toMatchObject({
      vessel_name: 'SUROIT',
      category_key: '06-incendie',
      document_title: 'Rapport incendie annuel',
      issued_on: '2026-08-19',
      expires_on: null,
      alarm_on: null,
      status: 'valid',
    });
  });

  it('creates a missing fleet certificate line without a file in preview mode', async () => {
    const creation = await previewSupabaseClient.rpc('create_fleet_certificate_line', {
      p_vessel_id: 1,
      p_category_key: '16-2-fiches-donnee-securite',
      p_category_label: '16.2 - Fiches de Donnée de Sécurité',
      p_document_title: 'FDS peintures atelier',
      p_issued_on: null,
      p_expires_on: null,
    });
    const rows = await previewSupabaseClient.from('fleet_certificates').select('*').order('id');
    const created = rows.data?.find((item) => item.id === creation.data);

    expect(creation.error).toBeNull();
    expect(created).toMatchObject({
      vessel_name: 'GOURY',
      category_key: '16-2-fiches-donnee-securite',
      category_label: '16.2 - Fiches de Donnée de Sécurité',
      document_title: 'FDS peintures atelier',
      status: 'missing',
      storage_path: null,
      current_version_no: 0,
    });
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
      expect.objectContaining({ sharepoint_list_title: 'Indicateurs QHSE', action_type_key: 'first_aid_case' }),
      expect.objectContaining({ workflow_status: 'pending_approval', approver_person_id: 9301 }),
    ]));
    expect(actionTypes.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ hse_classification: 'LWDC', tracks_exposure_rate: true }),
      expect.objectContaining({ hse_classification: 'FAC', tracks_exposure_rate: true }),
    ]));
    expect(summary.data).toMatchObject({ exposure_hours: 12480, LWDC: 1, FAC: 3 });
    expect(profile.data).toMatchObject({ first_name: 'Arthur', last_name: 'DEMO' });
  });

  it('exposes an active Captain as the nominated DPR validator in preview', async () => {
    const context = await previewSupabaseClient.rpc('dpr_validator_context', { target_date: '2026-08-12' });

    expect(context.error).toBeNull();
    expect(context.data).toMatchObject({
      defaultValidatorPersonId: 9301,
      people: [expect.objectContaining({ id: 9301, functionLabel: 'Capitaine', isDprValidator: true })],
    });
  });
});
