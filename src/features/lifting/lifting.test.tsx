import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel } from './liftingPreview';
import { annualExpiry, canManageLifting, emptyChecks, entryComplete, INSPECTOR, type InspectionEntry, type LiftingInspection } from './liftingModel';
import { fetchInspectionEntries, fetchLiftingRegister, publishLiftingInspection, saveLiftingItem, startLiftingInspection } from './liftingQueries';
import { buildLiftingPdf } from './liftingPdf';

describe('lifting annual workflow', () => {
  it('preserves the day and handles a leap-year expiry', () => {
    expect(annualExpiry('2024-02-29')).toBe('2025-02-28');
    expect(annualExpiry('2026-11-26')).toBe('2027-11-26');
  });
  it('requires complete checks and prohibits good condition with a defect', () => {
    const entry = { condition: 'good', checks: emptyChecks(), observations: '' } as InspectionEntry;
    expect(entryComplete(entry)).toBe(false);
    entry.checks = { EG:'ok', NID:'ok', V1:'na', V2:'na', V3:'na', V4:'na', V5:'na' };
    expect(entryComplete(entry)).toBe(true);
    entry.checks.EG = 'defect'; expect(entryComplete(entry)).toBe(false);
    entry.condition = 'repair'; expect(entryComplete(entry)).toBe(false);
    entry.observations = 'Remplacer le linguet.'; expect(entryComplete(entry)).toBe(true);
    entry.condition = 'not_present'; entry.checks = emptyChecks(); expect(entryComplete(entry)).toBe(true);
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
  it('renders the three sections and saves a partial inspection from the item form', async () => {
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
    await screen.findByRole('heading',{name:'Contrôle annuel 2026'});
    expect(screen.getByRole('button',{name:'Finaliser et classer le rapport'})).toBeDisabled();
    await user.click(screen.getAllByRole('button',{name:'Contrôler'})[0]);
    const form = screen.getByRole('dialog');
    await user.selectOptions(within(form).getByLabelText('Décision pour ce matériel'),'repair');
    await user.type(within(form).getByLabelText('Observations et actions à réaliser'),'Usure à vérifier');
    await user.click(within(form).getByRole('button',{name:'Enregistrer le contrôle'}));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Usure à vérifier')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Finaliser et classer le rapport'})).toBeDisabled();
  });
  it('hides inventory management from a real-profile Marin component fixture', async () => {
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={['marin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    expect(screen.queryByRole('button',{name:'Ajouter un matériel'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Modifier D-101'})).not.toBeInTheDocument();
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
