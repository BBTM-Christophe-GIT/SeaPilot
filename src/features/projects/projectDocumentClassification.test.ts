import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { saveProjectDocumentClassification, type ProjectDocumentClassificationInput } from './projectDocumentClassification';

const input: ProjectDocumentClassificationInput = { projectId: 144, documentId: 'generated:91', categoryKey: 'hse', subcategoryKey: 'hse_procedure',
  expectedCategoryKey: 'billing', expectedSubcategoryKey: null };
const acknowledgement = (value = input) => ({ project_id: String(value.projectId), document_id: value.documentId,
  category_key: value.categoryKey, subcategory_key: value.subcategoryKey });

describe('project document classification', () => {
  it.each(['generated:91', 'project:92', 'contract:93'])('saves %s with its previous classification and verifies the acknowledgement', async documentId => {
    const value = { ...input, documentId };
    const rpc = vi.fn().mockResolvedValue({ data: acknowledgement(value), error: null });
    expect(await saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient, value)).toEqual({
      projectId: 144, documentId, categoryKey: 'hse', subcategoryKey: 'hse_procedure',
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_set_document_category', {
      target_project_id: '144', target_document_id: documentId, target_category_key: 'hse', target_subcategory_key: 'hse_procedure',
      target_expected_category_key: 'billing', target_expected_subcategory_key: null,
    });
  });

  it('clears a subcategory explicitly and preserves an unclassified baseline', async () => {
    const value = { ...input, subcategoryKey: null, expectedCategoryKey: '', expectedSubcategoryKey: '' };
    const rpc = vi.fn().mockResolvedValue({ data: acknowledgement(value), error: null });
    await saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient, value);
    expect(rpc.mock.calls[0][1]).toMatchObject({ target_subcategory_key: null, target_expected_category_key: null, target_expected_subcategory_key: null });
  });

  it.each([
    { projectId: 0 }, { projectId: 1.5 }, { documentId: 'generated:0' }, { documentId: 'other:91' },
    { documentId: 'project:9223372036854775808' }, { categoryKey: '' }, { categoryKey: 'Missing category' }, { subcategoryKey: '' },
  ])('rejects malformed input without sending a write: %j', async invalid => {
    const rpc = vi.fn();
    await expect(saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient, { ...input, ...invalid })).rejects.toThrow('invalide');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports permission and conflict errors without retrying a write', async () => {
    for (const error of [{ code: '40001', message: 'Le classement a été modifié. Rechargez la liste.' }, { code: '42501', message: 'Modification refusée.' }]) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error });
      await expect(saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient, input)).rejects.toMatchObject(error);
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it('does not coerce runtime values into category keys before sending a write', async () => {
    const rpc = vi.fn();
    for (const value of [{ ...input, categoryKey: 123 }, { ...input, subcategoryKey: 123 }]) {
      await expect(saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient,
        value as unknown as ProjectDocumentClassificationInput)).rejects.toThrow('invalide');
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { ...acknowledgement(), document_id: 'project:91' }, { ...acknowledgement(), project_id: '287' },
    { ...acknowledgement(), category_key: 'billing' }, { ...acknowledgement(), subcategory_key: null }])('refuses a missing or mismatched server acknowledgement: %j', async data => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(saveProjectDocumentClassification({ rpc } as unknown as SupabaseClient, input)).rejects.toThrow('classement enregistré');
  });
});
