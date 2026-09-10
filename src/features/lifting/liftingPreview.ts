import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import type { LiftingCertificate, UploadedLiftingCertificate } from './liftingCertificateQueries';
import { accessoryDefinition } from './liftingControls';
import { annualExpiry, canManageLifting, todayLocal, defaultChecks, INSPECTOR, type LiftingInspection, type LiftingItem, type LiftingVessel, type InspectionEntry } from './liftingModel';

// Independent demonstration data. No customer inventory or signature is bundled into public previews.
export const demoVessel: LiftingVessel = { id: 90001, company_id: 1, name: 'NAVIRE DÉMONSTRATION', acronym: 'DEMO', registration_number: 'Démonstration', call_sign: 'DEMO', registration_port: 'Marseille' };
export const secondDemoVessel: LiftingVessel = { ...demoVessel, id: 90002, name: 'SECOND NAVIRE DÉMONSTRATION', acronym: 'DEMO2' };
export function createLiftingPreviewClient(options: { roles?: RoleKey[]; inspectorGrant?: boolean } = {}): SupabaseClient {
  const roles = options.roles || ['admin'];
  const manager = canManageLifting(roles);
  const canStart = manager || (roles.includes('capitaine') && Boolean(options.inspectorGrant));
  const denied = () => ({ data: null, error: { message: 'Accès refusé.' } });
  const items: LiftingItem[] = [
    ['1','lifting','Élingue','ÉLINGUE TEXTILE RONDE — 3 M',3],
    ['2','lifting','Manille','MANILLE LYRE — 6,5 T',6.5],
    ['3','lifting','Croc','CROCHET À LINGUET — 2 T',2],
    ['1','towing','Remorque','REMORQUE TEXTILE — 200 M',null],
  ].map(([reference,kind,type,description,swl],index) => ({ id: index+1,company_id:1,vessel_id:demoVessel.id,kind,reference,material_type:accessoryDefinition(String(type))?.fr || type,towing_type:kind === 'towing' ? 'textile_line' : null,description,swl_tonnes:swl,serial_number:'',location:'Pont principal',notes:'Matériel de démonstration',active:true,source_label:'Démonstration',updated_at:'' } as LiftingItem));
  items.push({ ...items[1], id: 5, vessel_id: secondDemoVessel.id, reference: '1', description: 'MANILLE DU SECOND NAVIRE' });
  items.forEach((item) => Object.assign(item, { added_on: todayLocal(), commissioned_on: todayLocal(), service_version: 1, inspection_due_on: annualExpiry(todayLocal()) }));
  const counters: Record<string, number> = { [`${demoVessel.id}:lifting`]: 3, [`${demoVessel.id}:towing`]: 1, [`${secondDemoVessel.id}:lifting`]: 1 };
  const reports: LiftingInspection[] = [];
  const entries: InspectionEntry[] = [];
  let nextReportId = 1; let nextEntryId = 1;
  const certificates: LiftingCertificate[] = [];
  const files = new Map<string, Blob>();
  const tables = { lifting_inventory: items, lifting_inspections: reports, lifting_inspection_entries: entries, lifting_item_certificates: certificates };
  function query(rows: unknown[]) {
    let selected = [...rows] as Record<string, unknown>[];
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; },
      order: () => chain,
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve),
    };
    return chain;
  }
  return {
    from: (name: keyof typeof tables) => query(tables[name] || []),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'lifting_can_start_inspection') return { data: canStart, error: null };
      if (['set_lifting_item_active', 'delete_lifting_inspection_draft', 'replace_lifting_item'].includes(name) && !manager) return denied();
      if (name === 'add_lifting_item_certificate') {
        const item = items.find((row) => row.id === args.p_item_id);
        const path = String(args.p_storage_path);
        if (!item || !path.startsWith(`${item.company_id}/${item.vessel_id}/${item.id}/${item.service_version}/`) || !files.has(path)) return denied();
        const id = crypto.randomUUID();
        certificates.push({ id, item_id: item.id, service_version: item.service_version || 1, storage_path: path, file_name: String(args.p_file_name), mime_type: String(args.p_mime_type), file_size: Number(args.p_file_size), created_at: new Date().toISOString() });
        return { data: id, error: null };
      }
      if (name === 'replace_lifting_item') {
        const item = items.find((row) => row.id === args.p_id);
        const date = String(args.p_commissioned_on);
        if (!item?.active || item.service_version !== args.p_service_version || !date || date > todayLocal() || date < (item.commissioned_on || '')) return denied();
        const uploaded = (args.p_certificates || []) as UploadedLiftingCertificate[];
        if (!uploaded.length && certificates.some((file) => file.item_id === item.id && file.service_version === item.service_version)) return { data: null, error: { message: 'Joignez un nouveau certificat pour remplacer les pièces jointes existantes.' } };
        const version = (item.service_version || 1) + 1;
        if (uploaded.some((file) => !file.storage_path.startsWith(`${item.company_id}/${item.vessel_id}/${item.id}/${version}/`) || !files.has(file.storage_path))) return denied();
        Object.assign(item, { commissioned_on: date, replaced_on: date, last_control_on: null, service_version: (item.service_version || 1) + 1, inspection_due_on: annualExpiry(date) });
        certificates.push(...uploaded.map((file) => ({ ...file, id: crypto.randomUUID(), item_id: item.id, service_version: version, created_at: new Date().toISOString() })));
        return { data: null, error: null };
      }
      if (name === 'lifting_available_vessels') return { data: [demoVessel, secondDemoVessel], error: null };
      if (name === 'save_lifting_item') {
        if (args.p_id && !manager) return denied();
        const draft = args.p_item as Partial<LiftingItem>;
        const old = items.find((i) => i.id === args.p_id);
        const kind = String(args.p_kind);
        const counterKey = `${args.p_vessel_id}:${kind}`;
        const reference = old && old.kind === kind ? old.reference : String(counters[counterKey] = (counters[counterKey] || 0) + 1);
        if (old) Object.assign(old, draft, { reference, kind });
        else items.push({ ...items[0], ...draft, reference, id: items.length+1, vessel_id: Number(args.p_vessel_id), kind,
          added_on: todayLocal(), commissioned_on: draft.commissioned_on || todayLocal(), last_control_on: null,
          replaced_on: null, service_version: 1, inspection_due_on: annualExpiry(todayLocal()),
        } as LiftingItem);
        return { data: old?.id || items.at(-1)?.id, error: null };
      }
      if (name === 'set_lifting_item_active') { const item = items.find((i) => i.id === args.p_id); if (item) item.active = Boolean(args.p_active); return { data: null, error: null }; }
      if (name === 'delete_lifting_inspection_draft') {
        const index = reports.findIndex((r) => r.id === args.p_id); const report = reports[index];
        if (!report) return { data: null, error: { message: 'Brouillon introuvable ou accès refusé.' } };
        if (report.status !== 'draft' || report.certificate_id || report.storage_path || report.published_at) return { data: null, error: { message: 'Seul un brouillon peut être supprimé. Ce rapport est déjà finalisé ou classé.' } };
        if (report.revision !== args.p_revision) return { data: null, error: { message: 'Ce brouillon a été modifié depuis un autre appareil. Rechargez les rapports avant de le supprimer.' } };
        for (let i = entries.length - 1; i >= 0; i--) if (entries[i].inspection_id === report.id) entries.splice(i, 1);
        reports.splice(index, 1); return { data: null, error: null };
      }
      if (name === 'start_lifting_inspection') {
        if (!canStart) return denied();
        const year = Number(String(args.p_issued_on).slice(0,4));
        const vessel = [demoVessel, secondDemoVessel].find((v) => v.id === args.p_vessel_id);
        if (!vessel || !items.some((item) => item.vessel_id === vessel.id && item.kind === args.p_kind && item.active)) return { data: null, error: { message: 'Ajoutez du matériel avant de démarrer un contrôle.' } };
        const report: LiftingInspection = { id: nextReportId++,company_id:1,vessel_id:vessel.id,kind:args.p_kind as LiftingInspection['kind'],inspection_year:year,issued_on:String(args.p_issued_on),expires_on:String(args.p_expires_on),inspector_name:INSPECTOR,status:'draft',revision:1,vessel_snapshot:vessel,notes:'Démonstration',certificate_id:null,storage_path:null,published_at:null };
        reports.push(report);
        items.filter((i) => i.vessel_id === report.vessel_id && i.kind === report.kind && i.active).forEach((i) => entries.push({ id:nextEntryId++,inspection_id:report.id,item_id:i.id,item_snapshot:structuredClone(i),condition:'pending',checks:defaultChecks(i),checklist_version:2,observations:'' }));
        return { data:report.id,error:null };
      }
      if (name === 'save_lifting_inspection_entries') {
        const report = reports.find((r) => r.id === args.p_inspection_id);
        if (!report || report.revision !== args.p_revision) return {data:null,error:{message:'Ce contrôle a été modifié depuis un autre appareil.'}};
        const rows = args.p_entries as InspectionEntry[];
        if (rows.some((row) => !entries.some((e) => e.id === row.id && e.inspection_id === report.id))) return {data:null,error:{message:'Matériel absent de ce contrôle.'}};
        if (rows.some((row) => row.condition === 'good' && Object.values(row.checks).includes('defect'))) return {data:null,error:{message:'Un matériel présentant un défaut ne peut pas être maintenu en service sans réserve.'}};
        rows.forEach((row) => Object.assign(entries.find((e) => e.id === row.id)!, row)); report.revision += rows.length;
        return {data:report.revision,error:null};
      }
      if (name === 'save_lifting_inspection_entry') {
        const report = reports.find((r) => r.id === args.p_inspection_id); const entry = entries.find((e) => e.id === args.p_entry_id);
        if (!report || !entry) return {data:null,error:{message:'Contrôle introuvable.'}};
        Object.assign(entry,{ condition:args.p_condition,checks:args.p_checks,observations:args.p_observations }); report.revision += 1;
        return {data:report.revision,error:null};
      }
      return { data:null,error:{message:'La publication est disponible dans votre espace connecté.'} };
    },
    storage: { from: (bucket: string) => ({
      upload: async (path: string, file: Blob) => { if (bucket !== 'lifting-certificates' || files.has(path)) return denied(); files.set(path, file); return { data: { path }, error: null }; },
      download: async (path: string) => bucket === 'lifting-certificates' && files.has(path) ? { data: files.get(path), error: null } : {data:null,error:{message:'La signature est disponible uniquement dans votre espace connecté.'}},
    }) },
  } as unknown as SupabaseClient;
}
