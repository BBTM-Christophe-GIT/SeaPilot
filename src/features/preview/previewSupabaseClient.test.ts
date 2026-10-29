import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from './previewSupabaseClient';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveRightsPeriod } from '../planning/planningAbsenceBalanceQueries';
import { fetchFleetVessels, saveFleetVessel } from '../fleet/fleetQueries';
import { fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, saveSeaOperation } from '../seaOperations/seaOperationQueries';
import { emptySeaOperation, emptySeaOperationWaypoint, seaOperationToday } from '../seaOperations/seaOperationModel';
import { cloneVesselWeatherMatrix, GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { emptyProjectLocationPlan } from '../projects/projectLocation';
import { saveProjectLocation } from '../projects/projectMutations';
import { fetchProjects } from '../projects/projectQueries';
import { fetchProjectSeaOperationDocuments, saveProjectSeaOperationDocuments } from '../projects/projectSeaOperationDocumentsQueries';

describe('previewSupabaseClient', () => {
  it('synchronizes demo project ports only on an atomic save and leaves conflicts unsaved', async () => {
    const { choices } = await fetchSeaOperationPlanning(previewSupabaseClient, seaOperationToday());
    const choice = choices[0];
    const baseline = { projectId: choice.projectId, departurePort: choice.vessel.departurePort, arrivalPort: choice.vessel.arrivalPort };
    const draft = emptySeaOperation();
    draft.project = choice.project;
    draft.planning = { date: seaOperationToday(), projectId: choice.projectId, operationId: choice.operationId, captainPersonId: '' };
    draft.vessel = { ...draft.vessel, ...choice.vessel, departurePort: 'Port de Brest' };
    let saved = await saveSeaOperation(previewSupabaseClient, draft, null, baseline);
    try {
      expect(saved.projectPorts).toEqual({ ...baseline, departurePort: 'Port de Brest' });
      expect((await fetchSeaOperationPlanning(previewSupabaseClient, seaOperationToday())).choices[0].vessel.departurePort).toBe('Port de Brest');
      await expect(saveSeaOperation(previewSupabaseClient, { ...draft, vessel: { ...draft.vessel, departurePort: 'Port de Caen' } },
        null, baseline)).rejects.toMatchObject({ message: expect.stringContaining('modifiés') });
      expect((await fetchSeaOperationDetail(previewSupabaseClient, saved.id)).version).toBe(saved.version);
      expect((await fetchSeaOperationPlanning(previewSupabaseClient, seaOperationToday())).choices[0].vessel.departurePort).toBe('Port de Brest');
    } finally {
      saved = await saveSeaOperation(previewSupabaseClient, { ...saved.draft, vessel: { ...saved.draft.vessel,
        departurePort: baseline.departurePort, arrivalPort: baseline.arrivalPort } }, saved, saved.projectPorts);
    }
    expect(saved.projectPorts).toEqual(baseline);
  });

  it('retains an explicit operational document selection without selecting later demo uploads', async () => {
    const original = await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001);
    expect(original.configured).toBe(false);
    expect(original.documents.map(document => document.id).sort()).toEqual(['generated:9451', 'generated:9452', 'project:9401']);
    expect(original.documents.every(document => !document.selected && document.projectId === '9001')).toBe(true);
    const generated = (await previewSupabaseClient.from('project_generated_documents').select('*')).data!;
    const imported = (await previewSupabaseClient.from('project_documents').select('*')).data!;
    const generatedCount = generated.length, importedCount = imported.length;
    try {
      const empty = await saveProjectSeaOperationDocuments(previewSupabaseClient, 9001, []);
      expect(empty.configured).toBe(true);
      expect(empty.documents.every(document => !document.selected)).toBe(true);
      expect(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001)).toEqual(empty);
      await saveProjectSeaOperationDocuments(previewSupabaseClient, 9001, ['generated:9452']);
      generated.push(
        { ...generated[0], id: 9471, file_name: 'Nouvelle consigne.pdf' },
        { ...generated[0], id: 9472, category_key: 'billing', file_name: 'Facture exclue.pdf' },
        { ...generated[0], id: 9473, document_type: 'commercial_offer', file_name: 'Offre exclue.pdf' },
        { ...generated[0], id: 9474, category_key: 'commercial_contract', file_name: 'Contrat exclu.pdf' },
        { ...generated[0], id: 9475, category_key: 'unknown', file_name: 'Classement inconnu.pdf' },
      );
      imported.push(
        { ...imported[0], id: 9476, is_folder: true, title: 'Dossier exclu' },
        { ...imported[0], id: 9477, category_key: 'billing', title: 'Facture importée exclue.pdf' },
      );
      const reloaded = await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001);
      expect(reloaded.documents.map(document => document.id).sort()).toEqual(['generated:9451', 'generated:9452', 'generated:9471', 'project:9401']);
      expect(reloaded.documents.filter(document => document.selected).map(document => document.id)).toEqual(['generated:9452']);
      const raw = await previewSupabaseClient.rpc('project_sea_operation_documents', { p_project_id: '9001' });
      expect(JSON.stringify(raw.data)).not.toMatch(/sharepoint|storage_|file_url|source_path/);
      const beforeInvalid = structuredClone(reloaded);
      for (const id of ['generated:9472', 'generated:9473', 'generated:9474', 'generated:9475', 'project:9476', 'project:9477', 'project:991011']) {
        const rejected = await previewSupabaseClient.rpc('set_project_sea_operation_documents', { p_project_id: '9001', p_document_ids: [id] });
        expect(rejected.error).toMatchObject({ code: '42501' });
        expect(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001)).toEqual(beforeInvalid);
      }
    } finally {
      generated.splice(generatedCount); imported.splice(importedCount);
      await saveProjectSeaOperationDocuments(previewSupabaseClient, 9001, original.documents.filter(document => document.selected).map(document => document.id));
    }
  });

  it('keeps document preferences scoped to exact Projects IDs and rejects malformed RPC arguments atomically', async () => {
    const before = await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001);
    for (const p_project_id of ['9001x', '9001.0', '09001', '9e3', '', null, [], {}, 9001.5, '9007199254740993']) {
      const result = await previewSupabaseClient.rpc('project_sea_operation_documents', { p_project_id });
      expect(result.error).toMatchObject({ code: '22023' });
    }
    for (const p_project_id of ['99101', '99102', '999999']) {
      expect((await previewSupabaseClient.rpc('project_sea_operation_documents', { p_project_id })).error).toMatchObject({ code: '42501' });
    }
    for (const p_document_ids of [null, 'generated:9451', [null], [['generated:9451']], ['generated:0'], Array(5001).fill('generated:9451')]) {
      const result = await previewSupabaseClient.rpc('set_project_sea_operation_documents', { p_project_id: '9001', p_document_ids });
      expect(result.error).toMatchObject({ code: '22023' });
    }
    expect(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001)).toEqual(before);
    expect(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9002)).toEqual({ configured: false, documents: [] });
  });

  it('changes one document checkbox atomically while preserving other selections and validating its boolean state', async () => {
    const original = await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001);
    const selectedIds = (value: typeof original) => value.documents.filter(document => document.selected).map(document => document.id).sort();
    try {
      await saveProjectSeaOperationDocuments(previewSupabaseClient, 9001, []);
      const updates = await Promise.all(['generated:9451', 'project:9401'].map(p_document_id => previewSupabaseClient.rpc('set_project_sea_operation_document', {
        p_project_id: '9001', p_document_id, p_selected: true,
      })));
      expect(updates.every(result => result.error === null)).toBe(true);
      expect(selectedIds(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001))).toEqual(['generated:9451', 'project:9401']);
      await previewSupabaseClient.rpc('set_project_sea_operation_document', { p_project_id: '9001', p_document_id: 'generated:9451', p_selected: false });
      const kept = await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001);
      expect(selectedIds(kept)).toEqual(['project:9401']);
      expect(kept.configured).toBe(true);
      for (const p_selected of [null, undefined, 0, 1, 'false', 'true', {}]) {
        const rejected = await previewSupabaseClient.rpc('set_project_sea_operation_document', { p_project_id: '9001', p_document_id: 'project:9401', p_selected });
        expect(rejected.error).toMatchObject({ code: '22023' });
      }
      expect((await previewSupabaseClient.rpc('set_project_sea_operation_document', { p_project_id: '9001', p_document_id: 'generated:0', p_selected: true })).error).toMatchObject({ code: '22023' });
      expect((await previewSupabaseClient.rpc('set_project_sea_operation_document', { p_project_id: '9001', p_document_id: 'project:991011', p_selected: true })).error).toMatchObject({ code: '42501' });
      expect(await fetchProjectSeaOperationDocuments(previewSupabaseClient, 9001)).toEqual(kept);
    } finally {
      await saveProjectSeaOperationDocuments(previewSupabaseClient, 9001, selectedIds(original));
    }
  });

  it('loads every project with a map concurrency token and saves an initially loaded P902 map', async () => {
    const projects = await fetchProjects(previewSupabaseClient);
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) expect(Number.isFinite(Date.parse(project.updatedAt)), project.projectCode).toBe(true);
    const source = projects.find(project => project.projectCode === 'P902')!;
    const plan = { ...emptyProjectLocationPlan(), waypoints: [{ ...emptySeaOperationWaypoint('p902-map-port'), number: '1', descriptionVhf: 'Port de Cherbourg', latitude: '49.65', longitude: '-1.62' }] };
    const saved = await saveProjectLocation(previewSupabaseClient, source.id, plan, source.updatedAt);
    const stored = (await fetchProjects(previewSupabaseClient)).find(project => project.id === source.id)!;
    expect(stored.updatedAt).toBe(saved.updatedAt); expect(stored.updatedAt).not.toBe(source.updatedAt);
    expect(stored.locationPlan).toEqual(plan);
    await saveProjectLocation(previewSupabaseClient, source.id, source.locationPlan ?? null, saved.updatedAt);
  });
  it('saves only a demo project location and rejects stale or malformed map writes', async () => {
    const rows = await previewSupabaseClient.from('projects').select('*').order('id');
    const source = structuredClone(rows.data!.find(project => project.project_code === 'P902')!);
    const plan = { ...emptyProjectLocationPlan(), charts: '7000', includeInPdf: true,
      zones: [{ id: 'preview-works', name: 'Zone de travaux', vertices: [{ latitude: '49.7', longitude: '-1.5' }] }] };
    const saved = await saveProjectLocation(previewSupabaseClient, Number(source.id), plan, String(source.updated_at));
    const reread = await previewSupabaseClient.from('projects').select('*').order('id');
    const stored = reread.data!.find(project => project.id === source.id)!;
    expect(stored.location_plan).toEqual(plan); expect(saved.updatedAt).toBe(stored.updated_at);
    const excludeLocation = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([key]) => !['location_plan', 'updated_at'].includes(key)));
    expect(excludeLocation(stored)).toEqual(excludeLocation(source));
    await expect(saveProjectLocation(previewSupabaseClient, Number(source.id), null, String(source.updated_at))).rejects.toThrow('modifié par un autre utilisateur');
    const malformed = await previewSupabaseClient.rpc('projects_set_location', { target_project_id: source.id, target_expected_updated_at: stored.updated_at, target_location_plan: { ...plan, version: 2 } });
    expect(malformed.error).toMatchObject({ code: '22023' });
    const foreign = await previewSupabaseClient.rpc('projects_set_location', { target_project_id: 999999, target_expected_updated_at: stored.updated_at, target_location_plan: plan });
    expect(foreign.error).toMatchObject({ code: 'P0002' });
    await saveProjectLocation(previewSupabaseClient, Number(source.id), (source.location_plan ?? null) as never, String(stored.updated_at));
  });
  it('seeds only demo GOURY and carries Navire matrix edits through overview, planning and canonical operation save', async () => {
    const original = (await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1)!;
    const input = { ...original, brochureOperations: original.brochureOperations.join('\n') };
    expect(original.weatherMatrix).toEqual(GOURY_WEATHER_MATRIX);
    expect((await fetchFleetVessels(previewSupabaseClient)).filter((vessel) => vessel.id !== 1).every((vessel) => vessel.weatherMatrix === null)).toBe(true);
    const edited = cloneVesselWeatherMatrix(GOURY_WEATHER_MATRIX); edited.levels[0][0] = 'unlivable';
    const expected = structuredClone(edited);
    try {
      await saveFleetVessel(previewSupabaseClient, { ...input, weatherMatrix: edited });
      edited.levels[0][0] = 'comfortable';
      const overview = await fetchSeaOperationData(previewSupabaseClient);
      expect(overview.vessels.find((vessel) => vessel.id === 9901)?.weatherMatrix).toEqual(expected);
      expect(overview.vessels.find((vessel) => vessel.id === 9902)?.weatherMatrix).toBeNull();
      const planning = await fetchSeaOperationPlanning(previewSupabaseClient, seaOperationToday());
      expect(planning.choices[0].vessel.weatherMatrix).toEqual(expected);
      expect(planning.choices[1].vessel.weatherMatrix).toBeNull();
      const draft = emptySeaOperation();
      draft.project = 'Mission de démonstration pour vérification';
      draft.description = 'Conserver les champs manuels.';
      draft.vessel = { ...draft.vessel, ...planning.choices[0].vessel, weatherMatrix: cloneVesselWeatherMatrix(GOURY_WEATHER_MATRIX) };
      draft.waypoints = [{ ...emptySeaOperationWaypoint('matrix-demo'), ukc: 'UKC validée manuellement' }];
      const saved = await saveSeaOperation(previewSupabaseClient, draft);
      expect(saved.draft.vessel.weatherMatrix).toEqual(expected);
      expect(saved.draft.description).toBe(draft.description);
      expect(saved.draft.waypoints).toEqual(draft.waypoints);
      expect(saved.draft.decision).toBe(''); expect(saved.draft.signature.acknowledged).toBe(false);
      expect(draft.vessel.weatherMatrix).toEqual(GOURY_WEATHER_MATRIX);
      await saveFleetVessel(previewSupabaseClient, { ...input, weatherMatrix: null });
      expect((await fetchSeaOperationDetail(previewSupabaseClient, saved.id)).draft.vessel.weatherMatrix).toEqual(expected);
      const other = await saveSeaOperation(previewSupabaseClient, { ...draft, vessel: { ...draft.vessel, ...planning.choices[1].vessel, weatherMatrix: expected } });
      expect(other.draft.vessel.weatherMatrix).toBeNull();
    } finally { await saveFleetVessel(previewSupabaseClient, { ...input, weatherMatrix: original.weatherMatrix }); }
  });

  it('propagates an explicit matrix clear through demo planning and save without a GOURY fallback', async () => {
    const original = (await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1)!;
    const input = { ...original, brochureOperations: original.brochureOperations.join('\n') };
    try {
      await saveFleetVessel(previewSupabaseClient, { ...input, weatherMatrix: null });
      expect((await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1)?.weatherMatrix).toBeNull();
      expect((await fetchSeaOperationData(previewSupabaseClient)).vessels.find((vessel) => vessel.id === 9901)?.weatherMatrix).toBeNull();
      const { choices } = await fetchSeaOperationPlanning(previewSupabaseClient, seaOperationToday());
      expect(choices[0].vessel.weatherMatrix).toBeNull();
      const draft = emptySeaOperation(); draft.vessel = { ...draft.vessel, ...choices[0].vessel, weatherMatrix: cloneVesselWeatherMatrix(GOURY_WEATHER_MATRIX) };
      expect((await saveSeaOperation(previewSupabaseClient, draft)).draft.vessel.weatherMatrix).toBeNull();
    } finally { await saveFleetVessel(previewSupabaseClient, { ...input, weatherMatrix: original.weatherMatrix }); }
  });

  it('rejects malformed or oversized generic preview matrix updates atomically', async () => {
    const original = await fetchFleetVessels(previewSupabaseClient);
    for (const weather_matrix of [false, { version: 1 }, { ...GOURY_WEATHER_MATRIX, extra: 'x'.repeat(32769) }]) {
      const result = await previewSupabaseClient.from('vessels').update({ weather_matrix, draft_m: 7 }).eq('id', 1).select('*').single();
      expect(result.error).toMatchObject({ message: expect.stringContaining('invalide') });
      expect(await fetchFleetVessels(previewSupabaseClient)).toEqual(original);
    }
  });

  it('retains a Navire draught edit and clear across Fleet reloads and sea-operation preview references', async () => {
    const original = (await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1)!;
    const input = { ...original, brochureOperations: original.brochureOperations.join('\n') };
    try {
      const saved = await saveFleetVessel(previewSupabaseClient, { ...input, draftMeters: 2.25 });
      expect(saved).toMatchObject({ id: 1, name: 'GOURY', draftMeters: 2.25 });
      const reopened = (await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1);
      expect(reopened?.draftMeters).toBe(2.25);
      const sea = await fetchSeaOperationData(previewSupabaseClient);
      expect(sea.vessels).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 9901, name: 'GOURY', draftMeters: 2.25 }),
        expect.objectContaining({ id: 9902, name: 'LE ROZEL', draftMeters: 1.4 }),
      ]));
      await saveFleetVessel(previewSupabaseClient, { ...input, draftMeters: null });
      expect((await fetchFleetVessels(previewSupabaseClient)).find((vessel) => vessel.id === 1)?.draftMeters).toBeNull();
      expect((await fetchSeaOperationData(previewSupabaseClient)).vessels.find((vessel) => vessel.id === 9901)?.draftMeters).toBeNull();
    } finally {
      await saveFleetVessel(previewSupabaseClient, { ...input, draftMeters: original.draftMeters ?? null });
    }
  });

  it('refuses an invalid preview vessel measurement without changing another demonstration vessel', async () => {
    const before = await fetchFleetVessels(previewSupabaseClient);
    const update = await previewSupabaseClient.from('vessels').update({ draft_m: -1 }).eq('id', 1).select('*').single();
    expect(update.error).toMatchObject({ message: expect.stringContaining('invalide') });
    expect(await fetchFleetVessels(previewSupabaseClient)).toEqual(before);
  });

  it('refreshes both dedicated annual counters after an adjustment', async () => {
    const draft = { personId: 111, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25, rttEntitlement: 0 };
    expect((await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, draft.personId)).requestBalanceKind).toBe('leave_rtt');
    await savePlanningLeaveRightsPeriod(previewSupabaseClient, draft);
    const initial = await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, draft.personId);
    expect(initial.kind).toBe('leave_rtt');
    expect(initial.counterPeriods.map((period) => period.entitlement)).toEqual([25, 0]);
    await savePlanningLeaveRightsPeriod(previewSupabaseClient, { ...draft, leaveEntitlement: 27.5, rttEntitlement: 9 });
    const adjusted = await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, draft.personId);
    expect(adjusted.counterPeriods.map((period) => period.id)).toEqual(initial.counterPeriods.map((period) => period.id));
    expect(adjusted.counterPeriods.map((period) => period.entitlement)).toEqual([27.5, 9]);
    await expect(savePlanningLeaveRightsPeriod(previewSupabaseClient, { ...draft, startsOn: '2026-06-01', endsOn: '2027-05-31', rttEntitlement: NaN })).rejects.toThrow();
    expect((await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, draft.personId)).counterPeriods).toEqual(adjusted.counterPeriods);
  });
  it('uses crew display for other people and refuses annual rights without inventing a balance', async () => {
    const context = await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, 101);
    expect(context).toMatchObject({ kind: 'crew', requestBalanceKind: 'crew', counterPeriods: [], crewCheckpoints: [] });
    await expect(savePlanningLeaveRightsPeriod(previewSupabaseClient, { personId: 101, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25, rttEntitlement: 10 })).rejects.toThrow('ne peut pas modifier');
    expect((await fetchPlanningAbsenceBalanceContext(previewSupabaseClient, 101)).counterPeriods).toEqual([]);
  });
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
    expect(catalog.data).toHaveLength(57);
    expect(catalog.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'Pont' }),
      expect.objectContaining({ category: 'Machine' }),
      expect.objectContaining({ category: 'Formation de Sécurité' }),
      expect.objectContaining({ category: 'Ressources Humaines' }),
      expect.objectContaining({ category: 'Ressources Humaines', name: 'Dérogation', source_item_id: 56 }),
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
