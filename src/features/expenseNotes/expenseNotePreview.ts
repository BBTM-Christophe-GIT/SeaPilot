import type { ExpenseNote } from './expenseNoteModel';

const base: ExpenseNote = {
  id: 'demo-note-1', company_id: 1, created_by: 'demo-1', creator_name: 'Camille Martin', issuer_person_id: 1, issuer_name: 'Camille Martin', vessel_id: 1, vessel_name: 'GOURY',
  kind: 'expense', expense_on: '2026-09-16', title: 'Fournitures pour la passerelle', description: '', payment_method: 'CB-Perso',
  amount: 86.4, mileage: null, receipt_count: 2, pdf_path: '', status: 'issued', issued_at: '2026-09-16T09:00:00Z',
  created_at: '2026-09-16T09:00:00Z', delivery_status: 'sent', delivered_at: '2026-09-16T09:01:00Z', delivery_error: null,
};
// Deliberately synthetic. Preview data is never evidence for real-profile access rules.
export const EXPENSE_NOTE_PREVIEW: ExpenseNote[] = [
  base,
  { ...base, id: 'demo-note-2', created_by: 'demo-2', issuer_person_id: 2, issuer_name: 'Alex Bernard', title: 'Petit matériel de pont', amount: 142.9, receipt_count: 1, delivery_status: 'pending', delivered_at: null },
  { ...base, id: 'demo-note-3', vessel_id: 2, vessel_name: 'SUROIT', title: 'Déplacement vers le navire', kind: 'mileage', amount: 98.12, receipt_count: 1 },
  { ...base, id: 'demo-note-4', vessel_id: null, vessel_name: 'Hors navire', created_by: 'demo-3', issuer_person_id: 3, issuer_name: 'Louise Robert', title: 'Fournitures de bureau — armement', amount: 34.5, delivery_status: 'failed', delivered_at: null },
];
