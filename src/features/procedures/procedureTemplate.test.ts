import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProcedureTemplateFile, PROCEDURE_TEMPLATE_URL } from './procedureTemplate';

afterEach(() => vi.unstubAllGlobals());

describe('procedure template', () => {
  it('copies the supplied DOCX byte for byte with a safe document filename', async () => {
    const original = readFileSync('public/templates/procedure.docx');
    const fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Uint8Array.from(original).buffer });
    vi.stubGlobal('fetch', fetch);

    const file = await createProcedureTemplateFile('URG 02-A', 'Préparation / urgence');
    expect(fetch).toHaveBeenCalledWith(PROCEDURE_TEMPLATE_URL);
    expect(file.name).toBe('URG 02-A - Préparation - urgence.docx');
    expect(file.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const copied = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    expect(Buffer.from(copied)).toEqual(original);
  });

  it('rejects a missing template', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(createProcedureTemplateFile('', '')).rejects.toThrow('indisponible');
  });

  it.each(['', '<html>SPA fallback</html>'])('rejects an invalid successful response %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode(body).buffer }));
    await expect(createProcedureTemplateFile('', '')).rejects.toThrow('invalide');
  });
});
