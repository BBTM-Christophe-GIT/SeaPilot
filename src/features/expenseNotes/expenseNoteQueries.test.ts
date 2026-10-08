import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExpenseNotes, submitExpenseNote } from './expenseNoteQueries';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';
import { ExpenseInputError, type ExpenseNoteInput } from './expenseNoteModel';

const pdf = vi.hoisted(() => vi.fn());
vi.mock('./expenseNotePdf', () => ({ generateExpenseNotePdf: pdf }));
const issued = { ...EXPENSE_NOTE_PREVIEW[0], id: 'aa100000-0000-4000-8000-000000000001', pdf_path: 'company/user/id/note.pdf' };
const prepared = { ...issued, status: 'preparing', issued_at: null };
const input: ExpenseNoteInput = { id: issued.id, kind: 'expense', issuer_name: 'Camille Martin', issuer_person_id: 1, vessel_id: 1, expense_on: '2026-09-17', title: 'Test', description: '', payment_method: 'CB-Perso', amount: 25, receipt_count: 0, mileage: null };
function chain(data: unknown, error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  return query;
}
beforeEach(() => { vi.clearAllMocks(); pdf.mockResolvedValue(new Blob(['%PDF-fixture'], { type: 'application/pdf' })); });
describe('issuance and history queries', () => {
  it('fetches every page instead of truncating the history at a server limit', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ ...issued, id: String(i) })), error: null }).mockResolvedValueOnce({ data: [issued], error: null });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range };
    expect(await fetchExpenseNotes({ from: () => query } as never)).toHaveLength(501);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it('confirms an already issued attempt without another upload or insert', async () => {
    const insert = vi.fn(); const upload = vi.fn();
    const client = { from: () => ({ ...chain(issued), insert }), storage: { from: () => ({ upload }) } };
    expect(await submitExpenseNote(client as never, input, [])).toEqual(issued);
    expect(insert).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(pdf).not.toHaveBeenCalled();
  });
  it('uploads the canonical server note before marking it issued', async () => {
    const update = vi.fn(() => chain(issued)); const upload = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn(() => chain(prepared));
    const from = vi.fn().mockReturnValueOnce(chain(null)).mockReturnValueOnce({ insert }).mockReturnValueOnce({ update });
    await expect(submitExpenseNote({ from, storage: { from: () => ({ upload }) } } as never, input, [])).resolves.toEqual(issued);
    expect(pdf).toHaveBeenCalledWith(prepared, []);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });
  it('does not mark the note issued when upload fails', async () => {
    const update = vi.fn();
    const from = vi.fn().mockReturnValueOnce(chain(prepared)).mockReturnValue({ update });
    const upload = vi.fn().mockResolvedValue({ error: { message: 'network lost', statusCode: '503' } });
    await expect(submitExpenseNote({ from, storage: { from: () => ({ upload }) } } as never, input, [])).rejects.toMatchObject({ message: 'network lost' });
    expect(update).not.toHaveBeenCalled();
  });
  it('allows correction of an invalid receipt before any upload or issuance', async () => {
    pdf.mockRejectedValueOnce(new Error('Justificatif illisible.'));
    const deletion = { eq: vi.fn().mockReturnThis() };
    const remove = vi.fn(() => deletion);
    const upload = vi.fn();
    const from = vi.fn().mockReturnValueOnce(chain(null))
      .mockReturnValueOnce({ insert: () => chain(prepared) }).mockReturnValueOnce({ delete: remove });
    await expect(submitExpenseNote({ from, storage: { from: () => ({ upload }) } } as never, input, [])).rejects.toBeInstanceOf(ExpenseInputError);
    expect(deletion.eq).toHaveBeenCalledWith('id', prepared.id);
    expect(deletion.eq).toHaveBeenCalledWith('status', 'preparing');
    expect(upload).not.toHaveBeenCalled();
  });
  it('can finish a retry after an upload response was lost', async () => {
    const update = vi.fn(() => chain(issued));
    const from = vi.fn().mockReturnValueOnce(chain(prepared)).mockReturnValueOnce({ update });
    const upload = vi.fn().mockResolvedValue({ error: { message: 'The resource already exists', statusCode: '409' } });
    await expect(submitExpenseNote({ from, storage: { from: () => ({ upload }) } } as never, input, [])).resolves.toEqual(issued);
  });
});
