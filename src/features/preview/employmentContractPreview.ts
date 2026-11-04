import type { HrSalaryGridRow } from '../humanResources/salaryGridQueries';

type DemoRow = Record<string, unknown>;
type DemoResult = { data: unknown; error: { code?: string; message: string } | null };
const BUCKET = 'hr-employment-contracts';
const SIGNATURE_PATH = 'preview-contracts/synthetic-signer.png';
const success = (data: unknown): DemoResult => ({ data, error: null });
const failure = (message: string, code = '22023'): DemoResult => ({ data: null, error: { code, message } });

/** Entirely fictitious payroll reference for the public demonstration bundle. */
export const EMPLOYMENT_PREVIEW_SALARY_ROWS: HrSalaryGridRow[] = Array.from({ length: 10 }, (_, index) => ({
  id: `demo-poste-${index + 1}`,
  positionLabel: `Poste de démonstration ${index + 1}`,
  ccn: index < 5 ? 'Officier' : 'PEX',
  enimCategory: index < 5 ? '15' : '5',
  conventionalAnnualBase: 30000 + 1000 * index,
  indexationPercent: 10,
  annualGross: 33000 + 1100 * index,
  annualPremium: 3000 + 100 * index,
  totalAnnualBase: 36000 + 1200 * index,
  active: true,
}));
/** Session-memory demonstration only; this adapter never contacts Supabase. */
export function createEmploymentContractPreview(options: { people: () => unknown[]; signaturePng: () => Blob }) {
  const details = new Map<number, DemoRow>();
  const contracts: DemoRow[] = [];
  const files = new Map<string, Blob>();
  const urls = new Map<string, string>();
  let nextId = 991100;
  let grid = { company_id: 1, rows: structuredClone(EMPLOYMENT_PREVIEW_SALARY_ROWS), revision: 1, updated_at: new Date().toISOString() };
  const hasPerson = (personId: number) => options.people().some(person => Number((person as DemoRow).id) === personId);
  const defaultDetails = (personId: number): DemoRow => ({ socialSecurityNumber: `DEMONSTRATION-${personId}`,
    vesselNames: 'Navire de démonstration', collectiveAgreement: 'CONVENTION COLLECTIVE DES OFFICIERS DE LA MARINE MARCHANDE',
    grossMonthlySalary: '3000.00', annualGrossSalary: '36000.00', salaryGridRowId: 'demo-poste-1',
    salaryGridRevision: '1', endDate: '', employerRepresentative: 'Benjamin BON' });
  const readDetails = (personId: number) => details.get(personId) || defaultDetails(personId);

  function from(table: string): object | null {
    if (!['people', 'hr_employment_contract_details', 'hr_employment_contracts'].includes(table)) return null;
    const filters: Array<[string, unknown]> = [];
    let inserted: DemoRow | null = null;
    let updated: DemoRow | null = null;
    let single = false;
    let unsupported = false;
    const query: object = new Proxy({}, { get(_target, property) {
      if (property === 'then') return (resolve: (result: DemoResult) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(() => {
        if (unsupported) return failure('Modification de démonstration non prise en charge.');
        if (updated) {
          const matching = (options.people() as DemoRow[]).filter(row => filters.every(([key, value]) => row[key] === value));
          if (!filters.some(([key]) => key === 'id') || matching.length !== 1
            || ['id', 'user_id', 'company_id'].some(key => key in updated!)) return failure('Collaborateur de démonstration introuvable.');
          Object.assign(matching[0], structuredClone(updated));
          return success(structuredClone(single ? matching[0] : matching));
        }
        if (inserted) {
          const personId = Number(inserted.person_id);
          if (table !== 'hr_employment_contracts' || !hasPerson(personId) || Number(inserted.company_id) !== 1 || !files.has(String(inserted.storage_path))) return failure('Fichier de démonstration introuvable.');
          if (!['CDI', 'CDD'].includes(String(inserted.contract_type)) || !String(inserted.file_name).endsWith('.pdf')) return failure('Contrat PDF de démonstration invalide.');
          if (contracts.some(contract => contract.storage_path === inserted!.storage_path)) return failure('Contrat de démonstration déjà classé.', '23505');
          const contract = { ...structuredClone(inserted), id: nextId++, created_at: new Date().toISOString() };
          contracts.push(contract);
          return success(structuredClone(single ? contract : [contract]));
        }
        if (table === 'people') return success(structuredClone(single ? options.people()[0] || null : options.people()));
        const rows = table === 'hr_employment_contract_details'
          ? options.people().map(person => ({ person_id: Number((person as DemoRow).id), input_data: readDetails(Number((person as DemoRow).id)) }))
          : contracts;
        const selected = rows.filter(row => filters.every(([key, value]) => (row as DemoRow)[key] === value));
        return success(structuredClone(single ? selected[0] || null : [...selected].reverse()));
      }).then(resolve, reject);
      if (property === 'eq') return (key: string, value: unknown) => { filters.push([key, value]); return query; };
      if (property === 'insert') return (row: DemoRow) => { inserted = structuredClone(row); return query; };
      if (property === 'update' && table === 'people') return (row: DemoRow) => { updated = structuredClone(row); return query; };
      if (property === 'single' || property === 'maybeSingle') return () => { single = true; return query; };
      if (['update', 'delete', 'upsert'].includes(String(property))) return () => { unsupported = true; return query; };
      return () => query;
    } });
    return query;
  }

  function rpc(name: string, args: DemoRow = {}): DemoResult | null {
    if (name === 'current_planning_company_id') return success(1);
    if (name === 'get_hr_salary_grid') return success(structuredClone(grid));
    if (name === 'save_hr_salary_grid') {
      if (args.p_expected_revision !== grid.revision) return failure('La grille a changé. Rechargez-la.', '40001');
      const rows = args.p_rows as HrSalaryGridRow[];
      const numericKeys = ['conventionalAnnualBase', 'indexationPercent', 'annualGross', 'annualPremium', 'totalAnnualBase'] as const;
      if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some(row => !row.id || !row.positionLabel || !row.ccn || !row.enimCategory
        || numericKeys.some(key => !Number.isFinite(row[key]) || row[key] < 0 || row[key] > (key === 'indexationPercent' ? 1000 : 100000000))
        || typeof row.active !== 'boolean') || new Set(rows.map(row => row.id)).size !== rows.length) return failure('Grille salariale de démonstration invalide.');
      grid = { ...grid, rows: structuredClone(rows), revision: grid.revision + 1, updated_at: new Date().toISOString() };
      return success(structuredClone(grid));
    }
    if (name === 'patch_hr_employment_contract_details') {
      const personId = Number(args.p_person_id), patch = args.p_patch as DemoRow;
      const keys = ['socialSecurityNumber', 'vesselNames', 'collectiveAgreement', 'grossMonthlySalary', 'endDate', 'employerRepresentative', 'salaryGridRowId', 'annualGrossSalary', 'salaryGridRevision'];
      if (!hasPerson(personId) || !patch || typeof patch !== 'object' || Array.isArray(patch)
        || Object.entries(patch).some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) return failure('Informations contractuelles de démonstration invalides.');
      const value = { ...readDetails(personId), ...structuredClone(patch) };
      details.set(personId, value);
      return success(structuredClone(value));
    }
    if (name === 'hr_employment_contract_signer') return success({ id: 991401, person_id: 991400,
      signer_name: 'Benjamin BON', storage_bucket: 'working-time-signatures', storage_path: SIGNATURE_PATH,
      mime_type: 'image/png', file_size_bytes: options.signaturePng().size, sha256: 'd'.repeat(64) });
    return null;
  }

  function download(bucket: string, path: string): DemoResult | null {
    if (bucket === 'working-time-signatures' && path === SIGNATURE_PATH) return success(options.signaturePng());
    if (bucket !== BUCKET) return null;
    return files.has(path) ? success(files.get(path)) : failure('PDF de démonstration introuvable.', '404');
  }
  function storage(bucket: string): object | null {
    if (bucket !== BUCKET) return null;
    return {
      upload: async (path: string, blob: Blob, settings?: { contentType?: string }) => {
        const personId = Number(path.split('/')[2]);
        if (!hasPerson(personId) || !path.startsWith(`1/people/${personId}/`) || !path.endsWith('.pdf') || !blob.size || blob.size > 10485760
          || blob.type !== 'application/pdf' || settings?.contentType !== 'application/pdf' || files.has(path)) return failure('PDF de démonstration invalide.');
        files.set(path, blob);
        return success({ path });
      },
      download: async (path: string) => download(bucket, path),
      remove: async (paths: string[]) => {
        paths.forEach(path => { files.delete(path); if (urls.has(path)) URL.revokeObjectURL(urls.get(path)!); urls.delete(path); });
        return success(paths.map(name => ({ name })));
      },
      createSignedUrl: async (path: string) => {
        const blob = files.get(path);
        if (!blob) return failure('PDF de démonstration introuvable.', '404');
        if (!urls.has(path)) urls.set(path, URL.createObjectURL(blob));
        return success({ signedUrl: urls.get(path) });
      },
    };
  }
  return { from, rpc, storage, download };
}
