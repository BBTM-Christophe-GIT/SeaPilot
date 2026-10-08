import { describe, expect, it, vi } from 'vitest';
import { createProcedureTag, fetchProcedureTagCatalogue, removeProcedureTag } from './procedureTagCatalogue';

describe('procedure tag catalogue', () => {
  it('loads saved names and presents unique choices in French alphabetical order', async () => {
    const order = vi.fn().mockResolvedValue({ data: [
      { name: ' Sécurité ' }, { name: 'securite' }, { name: 'Maintenance' }, { name: 'Évacuation' }, { name: '' },
    ], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    expect(await fetchProcedureTagCatalogue({ from } as never)).toEqual(['Évacuation', 'Maintenance', 'Sécurité']);
    expect(from).toHaveBeenCalledWith('procedure_tag_catalogue');
    expect(select).toHaveBeenCalledWith('name');
    expect(eq).toHaveBeenCalledWith('active', true);
    expect(order).toHaveBeenCalledWith('name');
  });

  it('propagates failures instead of confusing an unavailable catalogue with an empty one', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: null, error: new Error('Catalogue indisponible') }) }) }) }) };
    await expect(fetchProcedureTagCatalogue(client as never)).rejects.toThrow('Catalogue indisponible');
  });

  it('creates or restores a normalized tag through the unique catalogue key', async () => {
    const single = vi.fn().mockResolvedValue({ data: { name: 'Rôle à bord' }, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    expect(await createProcedureTag({ from } as never, '  Rôle   à bord  ')).toBe('Rôle à bord');
    expect(from).toHaveBeenCalledWith('procedure_tag_catalogue');
    expect(upsert).toHaveBeenCalledWith({ name: 'Rôle à bord', active: true }, { onConflict: 'name_key' });
    expect(single).toHaveBeenCalledOnce();
  });

  it.each(['', '  ', 'Rôle, Pollution', 'Rôle; Pollution'])('rejects invalid catalogue names before writing %j', async value => {
    const from = vi.fn();
    await expect(createProcedureTag({ from } as never, value)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it('removes a choice by its accent-insensitive key without modifying documents', async () => {
    const single = vi.fn().mockResolvedValue({ data: { name: 'Rôle' }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    await removeProcedureTag({ from } as never, ' RÔLE ');
    expect(from).toHaveBeenCalledExactlyOnceWith('procedure_tag_catalogue');
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('name_key', 'role');
  });

  it('reports rejected catalogue management writes', async () => {
    const single = async () => ({ data: null, error: new Error('Refusé') });
    const client = { from: () => ({
      upsert: () => ({ select: () => ({ single }) }),
      update: () => ({ eq: () => ({ select: () => ({ single }) }) }),
    }) };
    await expect(createProcedureTag(client as never, 'Rôle')).rejects.toThrow('Refusé');
    await expect(removeProcedureTag(client as never, 'Rôle')).rejects.toThrow('Refusé');
  });
});
