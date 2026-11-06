import type { SupabaseClient } from '@supabase/supabase-js';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { blankMedicalDraft, normalizedMedicalDraft, validateMedicalDraft, type MedicalDraft, type MedicalEntry, type MedicalHistory, type MedicalMedicationChoice, type MedicalMedicationSnapshot, type MedicalSignatureSnapshot } from './medicalLogbookModel';
import { DEMO_SIGNATURE_BASE64, DEMO_SIGNATURE_SHA256, DEMO_SIGNATURE_SIZE, demoMedicalSignatureBytes } from './medicalPreviewSignature';

// Every name and medical event here is invented. This client never reaches a network or browser storage.
export function createMedicalPreviewClient(): SupabaseClient {
  const vessels = demoFleetVessels.filter((vessel) => !/^YARD|BUREAU/i.test(vessel.name)).map((vessel) => ({ ...vessel, can_write: true }));
  const histories = new Map<number, MedicalHistory[]>();
  const requests = new Map<string, MedicalEntry>();
  const pharmacy = new Map<number, MedicalMedicationChoice[]>(vessels.map((vessel) => [vessel.id, [
    { item_id: 1, designation: 'Article Démo A', brand: '', lot_number: 'DEMO-A', stock_unit: 'comprimé', strength: '300 mg', package_size: 3, stock_quantity: 20 },
    { item_id: 2, designation: 'Article Démo B', brand: '', lot_number: 'DEMO-B', stock_unit: 'unité', strength: '', package_size: null, stock_quantity: 10 },
  ]]));
  let nextId = 10000;
  let nextHistoryId = 1;
  const stamp = () => new Date().toISOString();
  const signature: MedicalSignatureSnapshot = { signature_id: 99001, version_number: 1, signer_person_id: 99999,
    signer_user_id: 'ba870000-0000-4000-8000-000000000001', signer_name: 'Arthur DEMO', storage_bucket: 'working-time-signatures',
    storage_path: '1/99999/demo-signature.png', mime_type: 'image/png', file_size_bytes: DEMO_SIGNATURE_SIZE,
    sha256: DEMO_SIGNATURE_SHA256, valid_from: '2026-10-14T08:00:00Z' };
  const entries: MedicalEntry[] = vessels.flatMap((vessel) => [
    { patient_name: 'Patient Démo A', injury_illness: 'Événement fictif pour illustrer le registre.',
      treatment_medicines: 'Compte rendu fictif des soins apportés.', occurred_time: '10:00' },
    { patient_name: 'Patient Démo B', injury_illness: 'Deuxième événement fictif.',
      treatment_medicines: 'Observation fictive consignée au registre.', occurred_time: '14:30' },
  ].map((sample) => ({ ...blankMedicalDraft(), ...sample, first_aider_name: signature.signer_name, signature_name: signature.signer_name,
    signature_version_id: signature.signature_id, signature_snapshot: structuredClone(signature),
    id: nextId++, company_id: vessel.company_id, vessel_id: vessel.id, revision: 1, archived: false, created_at: stamp(), updated_at: stamp() })));
  function audit(entry: MedicalEntry, action: MedicalHistory['action']) {
    const history = histories.get(entry.id) || [];
    history.push({ id: nextHistoryId++, revision: entry.revision, action, changed_at: stamp(), actor_name: 'Compte Démo', entry: structuredClone(entry) });
    histories.set(entry.id, history);
  }
  entries.forEach((entry) => audit(entry, 'created'));
  const failure = (code: string, message?: string) => ({ data: null, error: { code, message } });
  return {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'get_medical_logbook_vessels') return { data: structuredClone(vessels), error: null };
      if (name === 'get_medical_logbook_signer') return { data: { person_id: signature.signer_person_id, signer_name: signature.signer_name, signature: structuredClone(signature) }, error: null };
      if (name === 'list_medical_logbook_entries') {
        if (!vessels.some((vessel) => vessel.id === args.p_vessel_id)) return failure('42501');
        return { data: structuredClone(entries.filter((entry) => entry.vessel_id === args.p_vessel_id)), error: null };
      }
      if (name === 'list_medical_logbook_medications') {
        const items = pharmacy.get(Number(args.p_vessel_id));
        return items ? { data: structuredClone(items), error: null } : failure('42501');
      }
      if (name === 'save_medical_logbook_entry') {
        const vessel = vessels.find((vessel) => vessel.id === args.p_vessel_id);
        const draft = args.p_entry as MedicalDraft;
        if (!vessel) return failure('42501');
        if (!draft || validateMedicalDraft(draft) || draft.first_aider_name !== signature.signer_name) return failure('22023');
        const existing = entries.find((entry) => entry.id === args.p_entry_id);
        const requestKey = !existing && draft.create_request_id ? `${vessel.id}:${draft.create_request_id}` : '';
        if (args.p_entry_id != null && (!existing || existing.vessel_id !== vessel.id)) return failure('42501');
        if (existing && existing.revision !== args.p_expected_revision) return failure('40001');
        if (existing?.archived) return failure('22023');
        if (requestKey && requests.has(requestKey)) return { data: structuredClone(requests.get(requestKey)), error: null };
        const items = pharmacy.get(vessel.id)!;
        const before = new Map(existing?.medications?.map((item) => [item.item_id, item.stock_quantity]));
        const medications: MedicalMedicationSnapshot[] = [];
        for (const row of draft.medications ?? existing?.medications ?? []) {
          const item = items.find((choice) => choice.item_id === row.item_id);
          if (!item || item.stock_quantity === null) return failure('22023', 'MEDICAL_LOGBOOK_MEDICATION_UNAVAILABLE');
          if (row.unit === 'package' && !item.package_size) return failure('22023', 'MEDICAL_LOGBOOK_MEDICATION_PACKAGE_UNAVAILABLE');
          const stockQuantity = row.quantity * (row.unit === 'package' ? item.package_size! : 1);
          if (stockQuantity > item.stock_quantity + (before.get(row.item_id) ?? 0)) return failure('22023', 'MEDICAL_LOGBOOK_INSUFFICIENT_STOCK');
          medications.push({ ...item, ...row, stock_quantity: stockQuantity });
        }
        for (const item of items) {
          if (item.stock_quantity !== null) item.stock_quantity = Math.round((item.stock_quantity + (before.get(item.item_id) ?? 0)
            - (medications.find((row) => row.item_id === item.item_id)?.stock_quantity ?? 0)) * 1000) / 1000;
        }
        const signed = { ...normalizedMedicalDraft(draft), medications, signature_name: signature.signer_name, signature_version_id: signature.signature_id,
          signature_snapshot: structuredClone(signature) };
        const entry: MedicalEntry = existing
          ? Object.assign(existing, signed, { revision: existing.revision + 1, updated_at: stamp() })
          : { ...signed, id: nextId++, company_id: vessel.company_id, vessel_id: vessel.id,
            revision: 1, archived: false, created_at: stamp(), updated_at: stamp() };
        if (!existing) entries.push(entry);
        if (requestKey) requests.set(requestKey, entry);
        audit(entry, existing ? 'updated' : 'created');
        return { data: structuredClone(entry), error: null };
      }
      if (name === 'get_medical_logbook_history' || name === 'set_medical_logbook_entry_archived') {
        const entry = entries.find((entry) => entry.id === args.p_entry_id);
        if (!entry) return failure('42501');
        if (name === 'get_medical_logbook_history') return { data: structuredClone(histories.get(entry.id) || []).reverse(), error: null };
        if (entry.revision !== args.p_expected_revision) return failure('40001');
        if (typeof args.p_archived !== 'boolean') return failure('22023');
        if (entry.archived !== args.p_archived) {
          entry.archived = args.p_archived; entry.revision += 1; entry.updated_at = stamp();
          audit(entry, entry.archived ? 'archived' : 'restored');
        }
        return { data: structuredClone(entry), error: null };
      }
      return failure('22023');
    },
    storage: { from: (bucket: string) => ({
      createSignedUrl: async (path: string) => bucket === signature.storage_bucket && path === signature.storage_path
        ? { data: { signedUrl: `data:image/png;base64,${DEMO_SIGNATURE_BASE64}` }, error: null } : failure('42501'),
      download: async (path: string) => bucket === signature.storage_bucket && path === signature.storage_path
        ? { data: new Blob([new Uint8Array(demoMedicalSignatureBytes())], { type: 'image/png' }), error: null } : failure('42501'),
    }) },
  } as unknown as SupabaseClient;
}
