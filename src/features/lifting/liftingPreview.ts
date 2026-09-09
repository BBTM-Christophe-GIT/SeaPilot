import type { SupabaseClient } from '@supabase/supabase-js';
import { accessoryDefinition } from './liftingControls';
import { defaultChecks, INSPECTOR, type LiftingInspection, type LiftingItem, type LiftingVessel, type InspectionEntry } from './liftingModel';

// Independent demonstration data. No customer inventory or signature is bundled into public previews.
export const demoVessel: LiftingVessel = { id: 90001, company_id: 1, name: 'NAVIRE DÉMONSTRATION', acronym: 'DEMO', registration_number: 'Démonstration', call_sign: 'DEMO', registration_port: 'Marseille' };
export const secondDemoVessel: LiftingVessel = { ...demoVessel, id: 90002, name: 'SECOND NAVIRE DÉMONSTRATION', acronym: 'DEMO2' };
export function createLiftingPreviewClient(): SupabaseClient {
  const items: LiftingItem[] = [
    ['1','lifting','Élingue','ÉLINGUE TEXTILE RONDE — 3 M',3],
    ['2','lifting','Manille','MANILLE LYRE — 6,5 T',6.5],
    ['3','lifting','Croc','CROCHET À LINGUET — 2 T',2],
    ['1','towing','Remorque','REMORQUE TEXTILE — 200 M',null],
  ].map(([reference,kind,type,description,swl],index) => ({ id: index+1,company_id:1,vessel_id:demoVessel.id,kind,reference,material_type:accessoryDefinition(String(type))?.fr || type,towing_type:kind === 'towing' ? 'textile_line' : null,description,swl_tonnes:swl,serial_number:'',location:'Pont principal',notes:'Matériel de démonstration',active:true,source_label:'Démonstration',updated_at:'' } as LiftingItem));
  items.push({ ...items[1], id: 5, vessel_id: secondDemoVessel.id, reference: '1', description: 'MANILLE DU SECOND NAVIRE' });
  const counters: Record<string, number> = { [`${demoVessel.id}:lifting`]: 3, [`${demoVessel.id}:towing`]: 1, [`${secondDemoVessel.id}:lifting`]: 1 };
  const reports: LiftingInspection[] = [];
  const entries: InspectionEntry[] = [];
  const tables = { lifting_inventory: items, lifting_inspections: reports, lifting_inspection_entries: entries };
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
      if (name === 'lifting_available_vessels') return { data: [demoVessel, secondDemoVessel], error: null };
      if (name === 'save_lifting_item') {
        const draft = args.p_item as Partial<LiftingItem>;
        const old = items.find((i) => i.id === args.p_id);
        const kind = String(args.p_kind);
        const counterKey = `${args.p_vessel_id}:${kind}`;
        const reference = old && old.kind === kind ? old.reference : String(counters[counterKey] = (counters[counterKey] || 0) + 1);
        if (old) Object.assign(old, draft, { reference, kind });
        else items.push({ ...items[0], ...draft, reference, id: items.length+1, vessel_id: Number(args.p_vessel_id), kind } as LiftingItem);
        return { data: old?.id || items.at(-1)?.id, error: null };
      }
      if (name === 'set_lifting_item_active') { const item = items.find((i) => i.id === args.p_id); if (item) item.active = Boolean(args.p_active); return { data: null, error: null }; }
      if (name === 'start_lifting_inspection') {
        const year = Number(String(args.p_issued_on).slice(0,4));
        const vessel = [demoVessel, secondDemoVessel].find((v) => v.id === args.p_vessel_id);
        if (!vessel || !items.some((item) => item.vessel_id === vessel.id && item.kind === args.p_kind && item.active)) return { data: null, error: { message: 'Ajoutez du matériel avant de démarrer un contrôle.' } };
        const report: LiftingInspection = { id: reports.length+1,company_id:1,vessel_id:vessel.id,kind:args.p_kind as LiftingInspection['kind'],inspection_year:year,issued_on:String(args.p_issued_on),expires_on:String(args.p_expires_on),inspector_name:INSPECTOR,status:'draft',revision:1,vessel_snapshot:vessel,notes:'Démonstration',certificate_id:null,storage_path:null,published_at:null };
        reports.push(report);
        items.filter((i) => i.vessel_id === report.vessel_id && i.kind === report.kind && i.active).forEach((i) => entries.push({ id:entries.length+1,inspection_id:report.id,item_id:i.id,item_snapshot:structuredClone(i),condition:'pending',checks:defaultChecks(i),checklist_version:2,observations:'' }));
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
    storage: { from: () => ({ download: async () => ({data:null,error:{message:'La signature est disponible uniquement dans votre espace connecté.'}}) }) },
  } as unknown as SupabaseClient;
}
