// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateExpenseNotePdf } from './expenseNotePdf';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';

describe('expense PDF archive', () => {
  it.each([
    ['aabbccdd-1234-4abc-8def-0123456789a1', 'NGMHRG0KK1'],
    ['aabbccdd-1234-4abc-8def-0123456789a2', 'NAL4KQH9M2'],
  ])('prints a short reference for note %s', async (id, reference) => {
    const output = await generateExpenseNotePdf({ ...EXPENSE_NOTE_PREVIEW[0], id }, []);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(await output.arrayBuffer()), useSystemFonts: true });
    try {
      const page = await (await task.promise).getPage(1);
      const text = (await page.getTextContent()).items.flatMap((item) => 'str' in item && item.str.trim() ? [item.str.trim()] : []);
      const label = text.indexOf('Référence');
      expect(label).toBeGreaterThanOrEqual(0);
      expect(text[label + 1]).toBe(reference);
      expect(text.join(' ')).not.toContain(id);
    } finally {
      await task.destroy();
    }
  });

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
