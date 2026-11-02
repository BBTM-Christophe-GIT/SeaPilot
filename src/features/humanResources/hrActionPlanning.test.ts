import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchHrActions, hrActionIsBooked, hrActionIsOverdue, hrActionIssues, saveHrAction } from './hrActionPlanning';
import type { HrActionInput, HrActionRecord } from './hrActionPlanning';

const input: HrActionInput = {
  personId: 2, documentId: 8, kind: 'medical_visit', title: 'Visite médicale annuelle', status: 'planned',
  dueOn: '2026-12-31', scheduledOn: '2026-11-16', completedOn: '', location: 'Le Havre', ownerName: 'Armement', notes: 'Convocation reçue',
};

describe('RH shared action planning', () => {
  it('requires a real booking date and place, keeping the deadline distinct', () => {
    expect(hrActionIssues(input, '2026-11-01')).toEqual([]);
    expect(hrActionIssues({ ...input, scheduledOn: '', location: '' }, '2026-11-01')).toEqual([
      'Renseignez la date du rendez-vous.', 'Renseignez le lieu ou l’organisme.',
    ]);
    expect(hrActionIssues({ ...input, scheduledOn: '2026-02-30' }, '2026-11-01')).toContain('Saisissez une date valide.');
  });

  it('does not accept future or unproven completion', () => {
    expect(hrActionIssues({ ...input, status: 'completed' }, '2026-11-01')).toContain('Renseignez la date de réalisation.');
    expect(hrActionIssues({ ...input, status: 'completed', completedOn: '2026-11-02' }, '2026-11-01')).toContain('Une réalisation ne peut pas être datée dans le futur.');
    expect(hrActionIssues({ ...input, status: 'completed', completedOn: '2026-10-31' }, '2026-11-01')).toEqual([]);
  });

  it('distinguishes an upcoming booking from missed dates and cancelled actions', () => {
    const action: HrActionRecord = { ...input, id: 1 };
    expect(hrActionIsBooked(action, '2026-11-01')).toBe(true);
    expect(hrActionIsOverdue(action, '2026-11-01')).toBe(false);
    expect(hrActionIsBooked({ ...action, scheduledOn: '2026-10-31' }, '2026-11-01')).toBe(false);
    expect(hrActionIsOverdue({ ...action, scheduledOn: '2026-10-31' }, '2026-11-01')).toBe(true);
    expect(hrActionIsOverdue({ ...action, dueOn: '2026-10-31' }, '2026-11-01')).toBe(true);
    expect(hrActionIsOverdue({ ...action, status: 'cancelled', dueOn: '2026-10-31' }, '2026-11-01')).toBe(false);
    expect(hrActionIsBooked({ ...action, location: '' }, '2026-11-01')).toBe(false);
  });

  it('loads every action page and keeps the per-person scope on each page', async () => {
    const makeRow = (id: number) => ({ id, person_id: 2, document_id: null, kind: 'certificate', title: `Brevet ${id}`,
      status: 'planned', scheduled_on: null, due_on: null, completed_on: null, location: null, owner_name: null, notes: null });
    const eq = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => makeRow(i + 1)), error: null })
      .mockResolvedValueOnce({ data: [makeRow(501)], error: null });
    const range = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select: () => ({ order: () => ({ range }) }) })) } as unknown as SupabaseClient;
    const rows = await fetchHrActions(client, 2);
    expect(rows).toHaveLength(501);
    expect(rows[500]).toMatchObject({ id: 501, personId: 2, scheduledOn: '', location: '' });
    expect(eq).toHaveBeenNthCalledWith(1, 'person_id', 2);
    expect(eq).toHaveBeenNthCalledWith(2, 'person_id', 2);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it('does not silently present an unavailable action source as empty', async () => {
    const client = { from: () => ({ select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error('denied') }) }) }) }) } as unknown as SupabaseClient;
    await expect(fetchHrActions(client)).rejects.toThrow('denied');
  });

  it('writes the appointment only, without modifying a certificate validity', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: {
      id: 3, person_id: 2, document_id: 8, kind: input.kind, title: input.title, status: input.status,
      due_on: input.dueOn, scheduled_on: input.scheduledOn, completed_on: null,
      location: input.location, owner_name: input.ownerName, notes: input.notes,
    }, error: null }) }) }));
    const from = vi.fn(() => ({ insert }));
    const saved = await saveHrAction({ from } as unknown as SupabaseClient, input);
    expect(saved.documentId).toBe(8);
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('hr_action_plans');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ due_on: '2026-12-31', scheduled_on: '2026-11-16', completed_on: null }));
  });
});
