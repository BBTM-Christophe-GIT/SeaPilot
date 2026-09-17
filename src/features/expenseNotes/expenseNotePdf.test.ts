// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateExpenseNotePdf } from './expenseNotePdf';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';

describe('expense PDF archive', () => {
  it('preserves PDF receipt pages before the note summary', async () => {
    const receipt = await PDFDocument.create(); receipt.addPage([222, 333]); receipt.addPage([444, 555]);
    const file = new File([new Uint8Array(await receipt.save())], 'recu.pdf', { type: 'application/pdf' });
    const output = await generateExpenseNotePdf({ ...EXPENSE_NOTE_PREVIEW[0], receipt_count: 1 }, [file]);
    const doc = await PDFDocument.load(await output.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: 222, height: 333 });
    expect(doc.getAuthor()).toBe('Camille Martin');
  });
  it('handles long descriptions without cutting off content', async () => {
    const output = await generateExpenseNotePdf({ ...EXPENSE_NOTE_PREVIEW[0], description: 'Dépense détaillée '.repeat(250) }, []);
    expect((await PDFDocument.load(await output.arrayBuffer())).getPageCount()).toBeGreaterThan(1);
  });
  it('rejects unreadable PDF receipts before issuance', async () => {
    await expect(generateExpenseNotePdf(EXPENSE_NOTE_PREVIEW[0], [new File(['not a pdf'], 'illisible.pdf', { type: 'application/pdf' })])).rejects.toThrow('illisible.pdf');
  });
});
