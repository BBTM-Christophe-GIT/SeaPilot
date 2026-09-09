import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyChecks, INSPECTOR, type LiftingInspection, type LiftingItem, type LiftingVessel, type InspectionEntry } from './liftingModel';

// Independent demonstration data. No customer inventory or signature is bundled into public previews.
export const demoVessel: LiftingVessel = { id: 90001, company_id: 1, name: 'NAVIRE DÉMONSTRATION', acronym: 'DEMO', registration_number: 'Démonstration', call_sign: 'DEMO', registration_port: 'Marseille' };
export function createLiftingPreviewClient(): SupabaseClient {
  const items: LiftingItem[] = [
    ['D-101','lifting','Élingue','ÉLINGUE TEXTILE RONDE — 3 M',3],
    ['D-102','lifting','Manille','MANILLE LYRE — 6,5 T',6.5],
    ['D-103','lifting','Croc','CROCHET À LINGUET — 2 T',2],
    ['D-201','towing','Remorque','REMORQUE TEXTILE — 200 M',null],
  ].map(([reference,kind,type,description,swl],index) => ({ id: index+1,company_id:1,vessel_id:demoVessel.id,kind,reference,material_type:type,description,swl_tonnes:swl,serial_number:'',location:'Pont principal',notes:'Matériel de démonstration',active:true,source_label:'Démonstration',updated_at:'' } as LiftingItem));
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
      if (name === 'lifting_available_vessels') return { data: [demoVessel], error: null };
      if (name === 'save_lifting_item') {
        const draft = args.p_item as Partial<LiftingItem>;
        const old = items.find((i) => i.id === args.p_id);
        if (old) Object.assign(old, draft);
        else items.push({ ...items[0], ...draft, id: items.length+1, vessel_id: Number(args.p_vessel_id), kind: args.p_kind } as LiftingItem);
        return { data: old?.id || items.at(-1)?.id, error: null };
      }
      if (name === 'set_lifting_item_active') { const item = items.find((i) => i.id === args.p_id); if (item) item.active = Boolean(args.p_active); return { data: null, error: null }; }
      if (name === 'start_lifting_inspection') {
        const year = Number(String(args.p_issued_on).slice(0,4));
        if (reports.some((r) => r.kind === args.p_kind && r.inspection_year === year)) return { data: null,error:{ message:'Un contrôle existe déjà pour cette année.' } };
        const report: LiftingInspection = { id: reports.length+1,company_id:1,vessel_id:demoVessel.id,kind:args.p_kind as LiftingInspection['kind'],inspection_year:year,issued_on:String(args.p_issued_on),expires_on:String(args.p_expires_on),inspector_name:INSPECTOR,status:'draft',revision:1,vessel_snapshot:demoVessel,notes:'Démonstration',certificate_id:null,storage_path:null,published_at:null };
        reports.push(report);
        items.filter((i) => i.kind === report.kind && i.active).forEach((i) => entries.push({ id:entries.length+1,inspection_id:report.id,item_id:i.id,item_snapshot:structuredClone(i),condition:'pending',checks:emptyChecks(),observations:'' }));
        return { data:report.id,error:null };
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
