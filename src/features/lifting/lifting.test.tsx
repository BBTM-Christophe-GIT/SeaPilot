import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel, secondDemoVessel } from './liftingPreview';
import { matchesLiftingItem } from './liftingSearch';
import { annualExpiry, canManageLifting, defaultChecks, emptyChecks, entryComplete, entryUnsatisfactory, INSPECTOR, type InspectionEntry, type LiftingInspection } from './liftingModel';
import { fetchInspectionEntries, fetchLiftingRegister, publishLiftingInspection, saveLiftingItem, startLiftingInspection } from './liftingQueries';
import { ACCESSORIES, TOWING_TYPES, applicableCodes } from './liftingControls';
import { buildLiftingPdf, liftingReportFilename } from './liftingPdf';

describe('lifting annual workflow', () => {
  it('starts on the vessel selected inside the dialog and opens only that vessel’s equipment', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.click(screen.getByRole('button', { name: 'Nouveau contrôle annuel' }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Navire / site à contrôler'), String(secondDemoVessel.id));
    await user.click(screen.getByRole('button', { name: 'Démarrer le contrôle' }));
    await screen.findByRole('heading', { name: /Contrôle annuel/ });
    expect(screen.getByLabelText('Navire')).toHaveValue(String(secondDemoVessel.id));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('MANILLE DU SECOND NAVIRE')).toBeInTheDocument();
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).inspections).toHaveLength(0);
    const register = await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting');
    expect(register.inspections).toHaveLength(1);
    expect((await fetchInspectionEntries(client, register.inspections[0].id))[0].item_snapshot.vessel_id).toBe(secondDemoVessel.id);
  });
  it('groups and filters the inventory by accessory, with accent-insensitive keyword matching', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['Crocs', 'Élingues / Sangles textiles', 'Manilles']);
    await user.selectOptions(screen.getByLabelText('Type d’accessoire — inventaire'), 'Manilles');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await user.type(screen.getByLabelText('Rechercher un matériel'), 'ELINGUE ronde');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('ÉLINGUE TEXTILE RONDE — 3 M')).toBeInTheDocument();
  });
  it('saves only visible controls, preserves hidden edits and leaves hidden pending equipment unapproved', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.click(screen.getByRole('button', { name: 'Nouveau contrôle annuel' }));
    await user.click(screen.getByRole('button', { name: 'Démarrer le contrôle' }));
    const sling = await screen.findByRole('article', { name: 'Matériel 1' });
    await user.type(within(sling).getByLabelText('Observation'), 'Repère à conserver');
    await user.selectOptions(screen.getByLabelText('Type d’accessoire — contrôle'), 'Manilles');
    expect(screen.getByText(/modifications non enregistrées/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les contrôles affichés' }));
    await waitFor(() => expect(screen.getByText('1 / 3 matériels contrôlés')).toBeInTheDocument());
    const rows = await fetchInspectionEntries(client, 1);
    expect(rows.find((row) => row.item_snapshot.reference === '2')?.condition).toBe('good');
    expect(rows.filter((row) => row.condition === 'pending')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Finaliser et classer le rapport' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(within(screen.getByRole('article', { name: 'Matériel 1' })).getByLabelText('Observation')).toHaveValue('Repère à conserver');
    await user.type(screen.getByLabelText('Rechercher dans le contrôle'), 'repere');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect((await fetchInspectionEntries(client, 1)).filter((row) => row.condition === 'pending')).toHaveLength(2);
  });
  it('searches historical identity and serial, location, notes and observations', async () => {
    const item = (await fetchLiftingRegister(createLiftingPreviewClient(), demoVessel.id, 'lifting')).items[0];
    const enriched = { ...item, legacy_reference: 'SRC-41', serial_number: 'ABC-123', location: 'Atelier', notes: 'À examiner' };
    expect(matchesLiftingItem(enriched, 'src-41 ABC atelier examiner', '', 'Réparation')).toBe(true);
    expect(matchesLiftingItem(enriched, 'reparation', '', 'Réparation')).toBe(true);
    expect(matchesLiftingItem(enriched, 'introuvable')).toBe(false);
    expect(matchesLiftingItem(enriched, 'atelier', 'Manilles')).toBe(false);
  });
  it('uses the supplied ring and plate-clamp guidance and leaves grapples awaiting their notice', () => {
    expect(applicableCodes({ material_type: 'Anneau' })).toEqual(['EG', 'ID']);
    expect(applicableCodes({ material_type: 'Pinces à tôles' })).toEqual(['EG', 'ID', 'V1', 'V2', 'V3']);
    expect(applicableCodes({ material_type: 'Grappins' })).toEqual([]);
  });
  it('preserves the day and handles a leap-year expiry', () => {
    expect(annualExpiry('2024-02-29')).toBe('2025-02-28');
    expect(annualExpiry('2026-11-26')).toBe('2027-11-26');
  });
  it('requires complete checks and prohibits good condition with a defect', () => {
    const entry = { condition: 'good', checks: emptyChecks(), checklist_version:2, item_snapshot: { material_type:'Crocs' }, observations: '' } as InspectionEntry;
    expect(entryComplete(entry)).toBe(false);
    entry.checks = defaultChecks(entry.item_snapshot);
    expect(entryComplete(entry)).toBe(true);
    entry.checks.EG = 'defect'; expect(entryComplete(entry)).toBe(false);
    entry.condition = 'repair'; expect(entryComplete(entry)).toBe(false);
    entry.observations = 'Remplacer le linguet.'; expect(entryComplete(entry)).toBe(true);
    entry.condition = 'not_present'; entry.checks = emptyChecks(); expect(entryComplete(entry)).toBe(false);
  });
  it('reserves inventory administration and publication for office profiles', () => {
    for (const role of ['admin','direction','armement'] as const) expect(canManageLifting([role])).toBe(true);
    for (const role of ['capitaine','marin'] as const) expect(canManageLifting([role])).toBe(false);
  });
  it('isolates towing equipment and keeps annual item snapshots after an inventory edit', async () => {
    const client = createLiftingPreviewClient();
    const register = await fetchLiftingRegister(client,demoVessel.id,'lifting');
    expect(register.items).toHaveLength(3);
    expect(register.items.every((item) => item.kind === 'lifting')).toBe(true);
    const id = await startLiftingInspection(client,demoVessel.id,'lifting','2026-09-09','2027-09-09');
    const old = register.items[0];
    await saveLiftingItem(client,demoVessel.id,'lifting',{ ...old, description:'Replaced equipment' },old.id);
    const entries = await fetchInspectionEntries(client,id);
    expect(entries[0].item_snapshot.description).toBe(old.description);
  });
  it.each(['lifting','towing'] as const)('creates independent %s inspections in the same year and on the same day', async (kind) => {
    const client = createLiftingPreviewClient();
    const first = await startLiftingInspection(client,demoVessel.id,kind,'2026-09-09','2027-09-09');
    const original = await fetchInspectionEntries(client,first);
    const item = (await fetchLiftingRegister(client,demoVessel.id,kind)).items[0];
    await saveLiftingItem(client,demoVessel.id,kind,{...item,description:'Updated before repeat inspection'},item.id);
    const second = await startLiftingInspection(client,demoVessel.id,kind,'2026-09-09','2027-09-09');
    const third = await startLiftingInspection(client,demoVessel.id,kind,'2026-10-01','2027-10-01');
    expect(new Set([first,second,third]).size).toBe(3);
    expect(await fetchInspectionEntries(client,first)).toEqual(original);
    const latest = await fetchInspectionEntries(client,second);
    expect(latest[0].item_snapshot.description).toBe('Updated before repeat inspection');
    expect(latest.every((entry) => entry.condition==='pending')).toBe(true);
    const {inspections} = await fetchLiftingRegister(client,demoVessel.id,kind);
    expect(inspections).toHaveLength(3);
    expect(new Set(inspections.map((report) => liftingReportFilename(report))).size).toBe(3);
    expect(inspections.map((report) => liftingReportFilename(report))).toEqual(expect.arrayContaining([
      expect.stringContaining(`2026-09-09 - LEV-${first}.pdf`),
      expect.stringContaining(`2026-09-09 - LEV-${second}.pdf`),
    ]));
  });
  it('groups all items, prechecks only applicable codes, and marks the code and item red when unchecked', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={['admin']} /></MemoryRouter>);
    expect(screen.getByRole('button',{name:/Examen à fond - Grue/})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Remorques/})).toBeInTheDocument();
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.click(screen.getByRole('button',{name:'Nouveau contrôle annuel'}));
    const start = screen.getByRole('dialog');
    await user.clear(within(start).getByLabelText('Date d’émission'));
    await user.type(within(start).getByLabelText('Date d’émission'),'2026-09-09');
    await user.click(within(start).getByRole('button',{name:'Démarrer le contrôle'}));
    await screen.findByRole('heading',{name:/Contrôle annuel 2026 · LEV-\d+/});
    expect(screen.getByRole('button',{name:'Finaliser et classer le rapport'})).toBeDisabled();
    const shackle = screen.getByRole('article',{name:'Matériel 2'});
    expect(within(shackle).getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual(['EG','ID','V1']);
    within(shackle).getAllByRole('checkbox').forEach((box) => expect(box).toBeChecked());
    const sling = screen.getByRole('article',{name:'Matériel 1'});
    expect(within(sling).getAllByRole('checkbox')).toHaveLength(7);
    const decisions = within(sling).getByRole('combobox',{name:'Décision pour ce matériel'});
    expect(within(decisions).getAllByRole('option').map((option) => option.textContent)).toEqual(['Maintien en service','Maintien en service après réparation','Mise au rebut']);
    await user.click(within(sling).getByRole('checkbox',{name:'V1'}));
    expect(within(sling).getByText('Résultat insatisfaisant')).toBeInTheDocument();
    expect(within(sling).getByLabelText('V1 : insatisfaisant')).toBeInTheDocument();
    expect(sling).toHaveClass('is-unsatisfactory');
    expect(decisions).toHaveValue('repair');
    await user.click(within(sling).getByLabelText('Observation'));
    await user.paste('Enveloppe coupée, remplacement nécessaire.');
    await user.click(screen.getByRole('button',{name:'Enregistrer tous les contrôles'}));
    await waitFor(() => expect(screen.getByRole('button',{name:'Finaliser et classer le rapport'})).toBeEnabled());
    expect(within(sling).getByText('Résultat insatisfaisant')).toBeInTheDocument();
    expect(within(sling).getByLabelText('Observation')).toHaveValue('Enveloppe coupée, remplacement nécessaire.');
    await user.click(within(sling).getByRole('checkbox',{name:'V1'}));
    expect(within(sling).queryByText('Résultat insatisfaisant')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Finaliser et classer le rapport'})).toBeDisabled();
  });
  it('uses the supplied towing codes including identification for textile bridles', () => {
    expect(applicableCodes({material_type:'Remorque',towing_type:'chain_bridle'})).toEqual(['EG','NID','V1','V2']);
    for (const towing_type of ['textile_line','towing_wire','winch_wire'] as const) expect(applicableCodes({material_type:'Remorque',towing_type})).toEqual(['EG','NID']);
    const item = {material_type:'Remorque',towing_type:'textile_bridle'} as const;
    expect(applicableCodes(item)).toEqual(['EG','NID','V1','V2','V3','V4','V5']);
    const entry = {item_snapshot:item,checks:defaultChecks(item),condition:'good',checklist_version:2,observations:''} as InspectionEntry;
    expect(entry.checks.NID).toBe('ok');
    expect(entryComplete(entry)).toBe(true);
    entry.checks.NID='na'; expect(entryComplete(entry)).toBe(false);
    entry.checks.NID='defect'; expect(entryUnsatisfactory(entry)).toBe(true);
    expect(entryComplete(entry)).toBe(false);
    for (const type of [...ACCESSORIES,...TOWING_TYPES]) for (const point of Object.values(type.checks)) { expect(point.fr).toBeTruthy(); expect(point.en).toBeTruthy(); }
  });
  it('derives an unsatisfactory result from any one applicable failed code, independently of the decision', () => {
    const item = {material_type:'Remorque',towing_type:'textile_line'} as const;
    const entry = {item_snapshot:item,checks:defaultChecks(item),condition:'repair',checklist_version:2,observations:'Repair'} as InspectionEntry;
    expect(entryUnsatisfactory(entry)).toBe(false);
    entry.checks.NID='defect'; expect(entryUnsatisfactory(entry)).toBe(true);
    entry.condition='withdrawn'; expect(entryUnsatisfactory(entry)).toBe(true);
    entry.checks.NID='ok'; entry.checks.V5='defect'; expect(entryUnsatisfactory(entry)).toBe(false);
  });
  it('assigns a read-only number automatically, with independent register sequences', async () => {
    const client=createLiftingPreviewClient();
    const old=(await fetchLiftingRegister(client,demoVessel.id,'lifting')).items[0];
    const id=await saveLiftingItem(client,demoVessel.id,'lifting',{...old,reference:'999'});
    expect((await fetchLiftingRegister(client,demoVessel.id,'lifting')).items.find((item) => item.id===id)?.reference).toBe('4');
    await saveLiftingItem(client,demoVessel.id,'lifting',{...old,reference:'777'},old.id);
    expect((await fetchLiftingRegister(client,demoVessel.id,'lifting')).items.find((item) => item.id===old.id)?.reference).toBe('1');
    const towing=(await fetchLiftingRegister(client,demoVessel.id,'towing')).items[0];
    const tid=await saveLiftingItem(client,demoVessel.id,'towing',{...towing});
    expect((await fetchLiftingRegister(client,demoVessel.id,'towing')).items.find((item) => item.id===tid)?.reference).toBe('2');
  });
  it('hides inventory management from a real-profile Marin component fixture', async () => {
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={['marin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    expect(screen.queryByRole('button',{name:'Ajouter un matériel'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Modifier 1'})).not.toBeInTheDocument();
  });
  it('sends the uploaded PDF to the atomic publication RPC with its revision', async () => {
    const upload = vi.fn().mockResolvedValue({error:null});
    const rpc = vi.fn().mockResolvedValue({data:99,error:null});
    const client = { storage:{from:vi.fn().mockReturnValue({upload})},rpc } as unknown as ReturnType<typeof createLiftingPreviewClient>;
    const report = {id:12,revision:5,company_id:1,vessel_id:4,vessel_snapshot:{...demoVessel,acronym:'SUR'}} as LiftingInspection;
    expect(await publishLiftingInspection(client,report,new Blob(['%PDF-1.7']), 'Rapport.pdf')).toBe(99);
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^1\/SUR\/lifting\/12\/5-.+\.pdf$/),expect.any(Blob),{contentType:'application/pdf',upsert:false});
    expect(rpc).toHaveBeenCalledWith('publish_lifting_inspection',expect.objectContaining({p_id:12,p_revision:5,p_file_name:'Rapport.pdf'}));
  });
  it('produces a paginated PDF with the inspector, dates and a draft marker', async () => {
    const client = createLiftingPreviewClient();
    const id = await startLiftingInspection(client,demoVessel.id,'lifting','2026-09-09','2027-09-09');
    const report = (await fetchLiftingRegister(client,demoVessel.id,'lifting')).inspections[0];
    const rows = await fetchInspectionEntries(client,id);
    const result = await buildLiftingPdf(report,Array.from({length:75},(_,i) => ({...rows[i%3],id:i})));
    expect(result.filename).toContain('BROUILLON');
    expect(result.blob.size).toBeGreaterThan(10000);
    expect(report.inspector_name).toBe(INSPECTOR);
  });
});
