import {
  Archive, Bell, CalendarDays, Check, ChevronDown, ChevronRight,
  ClipboardList, Download, FilePlus2, FileText, FolderKanban, Fuel, Home,
  PackageCheck, Pencil, Plus, ReceiptText, RefreshCw, RotateCcw, Save, Search, Settings2,
  ShieldCheck, Ship, ShoppingCart, SlidersHorizontal, Trash2, Users, X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect, useId, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from 'react';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../../components/ModuleRibbon';
import {
  billingRawLineTotal, defaultProjectClientReference, generateBillingExportPackage,
  type BillingExportFormat, type ProjectBillingDocument, type ProjectBillingRawLine,
} from '../projectBilling';
import { billingReferenceScope } from '../projectBillingReferences';
import { createPreviewStorageClient } from './previewStorageClient';
import { PROJECT_STATUSES } from '../projectStatus';
import { compareFleetNames } from '../../fleet/fleetDisplay';
import PreviewPdf from './PreviewPdf';
import {
  buildBillingView, createDemoProjects, INITIAL_BILLING_OPTIONS,
  type BillingDemoOptions, type DemoExpense, type DemoOperation, type DemoProject,
} from './billingDemo';

type Tab = 'identity' | 'operations' | 'billing' | 'contract' | 'documents';
type Selection = { kind: 'operation' | 'expense' | 'service' | 'raw'; id: number } | null;
type MenuItem = { label: string; icon?: LucideIcon; action: () => void; disabled?: boolean; danger?: boolean };
type FormField = { name: string; label: string; value?: string | number; type?: string; required?: boolean; options?: string[] };
type Editor = { title: string; fields: FormField[]; submit: (data: FormData) => string | void; note?: string };
type MonthData = Pick<DemoProject, 'period' | 'expenses' | 'services' | 'rawLines'>;

const demoVesselNames = ['GOURY', 'JERSEY', 'BBTM Pioneer'].sort(compareFleetNames);

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'identity', label: 'Identité', icon: ClipboardList },
  { id: 'operations', label: 'Opérations', icon: CalendarDays },
  { id: 'billing', label: 'Facturation', icon: ReceiptText },
  { id: 'contract', label: 'Offre & contrat', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FolderKanban },
];
const navigation: { label: string; icon: LucideIcon; href: string }[] = [
  { label: 'Accueil', icon: Home, href: '/' },
  { label: 'QHSE', icon: ShieldCheck, href: '/modules/qhse' },
  { label: 'Audits', icon: ClipboardList, href: '/modules/internalAudits' },
  { label: 'Opérations', icon: CalendarDays, href: '/modules/dpr' },
  { label: 'Navires', icon: Ship, href: '/modules/fleet' },
  { label: 'Achats', icon: ShoppingCart, href: '/modules/purchaseRequests' },
  { label: 'Planning', icon: CalendarDays, href: '/modules/planning' },
  { label: 'Ressources humaines', icon: Users, href: '/modules/humanResources' },
];
const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value);
const date = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
const number = (data: FormData, name: string) => Number(text(data, name));
const monthKey = (projectId: number, month: string) => `${projectId}:${month}`;
function initialMonths(demos: DemoProject[]) {
  return Object.fromEntries(demos.map(({ project, period, expenses, services, rawLines }) => [monthKey(project.id, period.periodMonth.slice(0, 7)), { period, expenses, services, rawLines }]));
}
const referenceKey = (id: number, period: DemoProject['period']) => `${id}:${billingReferenceScope(period)}`;
const initialReferences = (demos: DemoProject[]) => Object.fromEntries(demos.map(({ project, period }) => [referenceKey(project.id, period), period.clientReference]));
const currencyAmounts = (amounts: Map<string, number>) => amounts.size ? [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => money(value, currency)).join(' · ') : money(0);
function Status({ value }: { value: string }) {
  const tone = value === 'Validé' ? 'validated' : value === 'Facturé' ? 'invoiced' : value === 'Stand-by météo' ? 'weather' : 'unvalidated';
  return <span className={`pp-status ${tone}`}>{value}</span>;
}
function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, button, a')?.focus();
    return () => { previous?.focus(); };
  }, []);
  return <div className="pp-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="pp-dialog" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []);
      const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className="pp-dialog-header"><h2 id={id}>{title}</h2><button className="pp-button icon" aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </div>;
}
function EditorDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [error, setError] = useState('');
  return <Dialog title={editor.title} onClose={onClose}>
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); const result = editor.submit(new FormData(event.currentTarget));
      if (result) setError(result); else onClose();
    }}>
      <div className="pp-dialog-body">
        {editor.note && <p className="pp-muted">{editor.note}</p>}
        <div className="pp-grid-two">{editor.fields.map((field) => <label key={field.name} className="pp-field">
          {field.label}{field.options
            ? <select name={field.name} defaultValue={field.value} required={field.required}>{field.options.map((value) => <option key={value}>{value}</option>)}</select>
            : field.type === 'textarea' ? <textarea name={field.name} defaultValue={field.value} rows={3} />
              : <input name={field.name} type={field.type || 'text'} defaultValue={field.value} required={field.required} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? '0.001' : undefined} />}
        </label>)}</div>
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className="pp-dialog-actions"><button className="pp-button" type="button" onClick={onClose}>Annuler</button><button className="pp-button primary" type="submit"><Save size={17} />Enregistrer</button></footer>
    </form>
  </Dialog>;
}

export function ProjectPreview() {
  const [demos, setDemos] = useState(createDemoProjects);
  const [months, setMonths] = useState<Record<string, MonthData>>(() => initialMonths(createDemoProjects()));
  const [references, setReferences] = useState<Record<string, string>>(() => initialReferences(createDemoProjects()));
  const [selectedId, setSelectedId] = useState(264);
  const [tab, setTab] = useState<Tab>(() => new URLSearchParams(window.location.search).get('tab') === 'operations' ? 'operations' : 'billing');
  const [options, setOptions] = useState<BillingDemoOptions>({ ...INITIAL_BILLING_OPTIONS });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState({ operations: true, expenses: false, services: false, raw: false });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dialog, setDialog] = useState<{ title: string; content: ReactNode } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [format, setFormat] = useState<BillingExportFormat>('merged-pdf');
  const [proofs, setProofs] = useState<Record<number, { blob: Blob; name: string }>>({});
  const upload = useRef<HTMLInputElement>(null);
  const base = demos.find((item) => item.project.id === selectedId) ?? demos[0];
  const key = monthKey(base.project.id, options.month);
  const monthly = months[key] ?? {
    period: { ...base.period, id: 0, periodMonth: `${options.month}-01`, excludedOperationKeys: [], includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true, includeRawInPdf: true },
    expenses: [], services: [], rawLines: [],
  };
  const demo = { ...base, ...monthly };
  const view = useMemo(() => buildBillingView(demo, options), [demo, options]);
  const saved = Boolean(demo.period.id);
  const archived = Boolean(demo.project.archivedAt);
  const selectedOperation = demo.operations.find((item) => selection?.kind === 'operation' && item.id === selection.id);
  const selectedExpense = demo.expenses.find((item) => selection?.kind === 'expense' && item.id === selection.id);
  const selectedService = demo.services.find((item) => selection?.kind === 'service' && item.id === selection.id);
  const selectedRawLine = demo.rawLines.find((item) => selection?.kind === 'raw' && item.id === selection.id);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: MouseEvent) => { if (!(event.target as Element).closest('.pp-menu-wrap')) setMenu(''); };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, [menu]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function update(change: (current: DemoProject) => DemoProject) {
    const next = change(demo);
    setDemos((current) => current.map((item) => item.project.id === selectedId ? next : item));
    setMonths((current) => ({ ...current, [key]: { period: next.period, expenses: next.expenses, services: next.services, rawLines: next.rawLines } }));
    if (billingReferenceScope(next.period) !== billingReferenceScope(demo.period)) setOptions((current) => ({ ...current, clientReference: references[referenceKey(next.project.id, next.period)] ?? defaultProjectClientReference(next.project) }));
    setPreviewUrl('');
  }
  function chooseProject(id: number) {
    const item = demos.find((value) => value.project.id === id)!;
    setSelectedId(id); setSelection(null); setMenu(''); setPreviewUrl('');
    setOptions((current) => ({ ...current, clientReference: references[referenceKey(id, months[monthKey(id, current.month)]?.period ?? item.period)] ?? defaultProjectClientReference(item.project), vesselName: item.project.primaryVesselName, completeMissingDays: false }));
  }
  function chooseMonth(month: string) {
    if (!month) return;
    const period = months[monthKey(selectedId, month)]?.period ?? { ...demo.period, includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true, includeRawInPdf: true };
    setOptions((current) => ({ ...current, month, clientReference: references[referenceKey(selectedId, period)] ?? defaultProjectClientReference(demo.project), completeMissingDays: false }));
    setSelection(null); setPreviewUrl('');
  }
  function notify(message: string) { setToast(message); }
  function reset() {
    const fresh = createDemoProjects(); setDemos(fresh); setMonths(initialMonths(fresh)); setReferences(initialReferences(fresh));
    setSelectedId(264); setOptions({ ...INITIAL_BILLING_OPTIONS }); setSelection(null);
    setQuery(''); setStatusFilter(''); setShowArchived(false); setPreviewUrl(''); setProofs({});
    notify('Les données de démonstration ont été réinitialisées.');
  }
  function menuControl(id: string, label: string, Icon: LucideIcon, items: MenuItem[], primary = false, disabled = false) {
    return <div className="pp-menu-wrap">
      <button type="button" className={`pp-button ${primary ? 'primary' : ''}`} disabled={disabled} aria-haspopup="menu" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? '' : id)}><Icon size={18} />{label}<ChevronDown size={14} /></button>
      {menu === id && <div role="menu" aria-label={label} className="pp-menu" onKeyDown={(event) => {
        if (event.key === 'Escape') { setMenu(''); (event.currentTarget.previousElementSibling as HTMLElement)?.focus(); }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
        nodes[next]?.focus();
      }}>{items.map((item) => { const ItemIcon = item.icon; return <button role="menuitem" type="button" className={`pp-menu-item ${item.danger ? 'danger' : ''}`} key={item.label} disabled={item.disabled} onClick={() => { setMenu(''); item.action(); }}>{ItemIcon && <ItemIcon size={17} />}{item.label}</button>; })}</div>}
    </div>;
  }
  function projectEditor(create = false) {
    setEditor({ title: create ? 'Nouveau projet' : 'Modifier le projet', note: 'Les modifications de cette préversion restent dans la démonstration.', fields: [
      { name: 'title', label: 'Nom du projet', value: create ? '' : demo.project.title, required: true },
      { name: 'client', label: 'Client', value: create ? '' : demo.project.clientName, required: true },
      { name: 'vessel', label: 'Navire principal', value: create ? 'GOURY' : demo.project.primaryVesselName, options: demoVesselNames, required: true },
      { name: 'contract', label: 'Type de contrat', value: create ? 'BIMCO' : demo.project.contractType, options: ['BIMCO', 'Contrat de remorquage', 'Affrètement coque nue', 'Affrètement à temps'] },
      { name: 'start', label: 'Livraison', value: create ? '2026-10-08T08:00' : demo.project.deliveryAt, type: 'datetime-local', required: true },
      { name: 'end', label: 'Restitution', value: create ? '2026-10-23T18:00' : demo.project.redeliveryAt, type: 'datetime-local', required: true },
      { name: 'hire', label: 'Loyer contractuel EUR / jour', value: create ? 2400 : demo.contract.charterHire ?? 0, type: 'number', required: true },
      { name: 'status', label: 'Statut', value: create ? 'Non validé' : demo.project.status, options: [...PROJECT_STATUSES] },
    ], submit(data) {
      if (text(data, 'end') < text(data, 'start')) return 'La restitution doit suivre la livraison.';
      const project = { ...demo.project, title: text(data, 'title'), clientName: text(data, 'client'), primaryVesselName: text(data, 'vessel'), contractType: text(data, 'contract'), deliveryAt: text(data, 'start'), redeliveryAt: text(data, 'end'), startsOn: text(data, 'start').slice(0, 10), endsOn: text(data, 'end').slice(0, 10), status: text(data, 'status') };
      const contract = { ...demo.contract, charterHire: number(data, 'hire') };
      if (create) {
        const id = Math.max(...demos.map((item) => item.project.id)) + 1;
        project.id = id; project.projectCode = `P${id}`; project.archivedAt = '';
        contract.id = id; contract.projectId = id; contract.hirePeriods = [];
        const operation = { ...demo.operations[0], id: Date.now(), projectId: id, title: project.title, description: project.title, startsOn: project.startsOn, endsOn: project.endsOn, primaryVesselName: project.primaryVesselName, vesselNames: [project.primaryVesselName], charterHire: contract.charterHire, charterHireOverride: false, status: 'Non validé', documentCount: 0 };
        const period = { ...demo.period, id: 0, projectId: id, periodMonth: `${options.month}-01`, clientReference: '', excludedOperationKeys: [] };
        const created: DemoProject = { project, contract, operations: [operation], dprs: [], period, expenses: [], services: [], rawLines: [] };
        setDemos((current) => [...current, created]); setSelectedId(id); setSelection(null); setQuery('');
        setOptions((current) => ({ ...current, clientReference: '', vesselName: project.primaryVesselName }));
      } else update((current) => ({ ...current, project, contract }));
      notify(create ? 'Projet et première opération créés dans la démonstration.' : 'Projet modifié. Les loyers des opérations existantes sont conservés.');
    } });
  }
  function operationEditor(operation?: DemoOperation) {
    setEditor({ title: operation ? 'Modifier l’opération' : 'Nouvelle opération', fields: [
      { name: 'title', label: 'Description / mission', value: operation?.title ?? '', required: true },
      { name: 'start', label: 'Début', value: operation?.startsOn ?? '2026-10-08', type: 'date', required: true },
      { name: 'end', label: 'Fin', value: operation?.endsOn ?? '2026-10-09', type: 'date', required: true },
      { name: 'vessel', label: 'Navire', value: operation?.primaryVesselName ?? demo.project.primaryVesselName, options: demoVesselNames },
      { name: 'hire', label: 'Loyer EUR / jour', value: operation?.charterHire ?? demo.contract.charterHire ?? 0, type: 'number', required: true },
      { name: 'status', label: 'Statut', value: operation?.status ?? 'Non validé', options: [...PROJECT_STATUSES] },
    ], note: 'Chaque opération est indépendante. Le loyer contractuel est copié lors de sa création.', submit(data) {
      if (text(data, 'end') < text(data, 'start')) return 'La fin doit suivre le début.';
      const next: DemoOperation = { ...(operation ?? demo.operations[0]), id: operation?.id ?? Date.now(), projectId: demo.project.id, title: text(data, 'title'), description: text(data, 'title'), startsOn: text(data, 'start'), endsOn: text(data, 'end'), primaryVesselName: text(data, 'vessel'), vesselNames: [text(data, 'vessel')], vesselIds: [1], primaryVesselId: 1, status: text(data, 'status'), charterHire: number(data, 'hire'), hireCurrency: 'EUR', hireUnit: 'jour', sourceLabel: 'Démonstration locale', createdAt: operation?.createdAt ?? new Date().toISOString(), documentCount: operation?.documentCount ?? 0, charterHireOverride: operation ? operation.charterHireOverride || number(data, 'hire') !== operation.charterHire : number(data, 'hire') !== demo.contract.charterHire };
      update((current) => ({ ...current, operations: operation ? current.operations.map((item) => item.id === operation.id ? next : item) : [...current.operations, next] }));
      setSelection({ kind: 'operation', id: next.id }); notify('Opération enregistrée dans la démonstration.');
    } });
  }
  function expenseEditor(expense?: DemoExpense) {
    setEditor({ title: expense ? 'Modifier le frais imputable' : 'Ajouter un frais imputable', fields: [
      { name: 'supplier', label: 'Fournisseur', value: expense?.supplier ?? '', required: true },
      { name: 'specialty', label: 'Spécialité', value: expense?.supplierSpecialties.join(' · ') ?? '' },
      { name: 'category', label: 'Catégorie', value: expense?.category ?? 'other', options: ['fuel', 'port', 'water', 'other'] },
      { name: 'date', label: 'Date de facture', value: expense?.invoiceDate ?? '2026-10-08', type: 'date', required: true },
      { name: 'invoice', label: 'N° facture', value: expense?.invoiceNumber ?? '' },
      { name: 'amount', label: 'Montant HT', value: expense?.amountHt ?? '', type: 'number', required: true },
      { name: 'ttc', label: 'Montant TTC', value: expense?.amountTtc ?? '', type: 'number' },
      { name: 'currency', label: 'Devise', value: expense?.currency ?? 'EUR', options: ['EUR', 'USD', 'GBP'] },
      { name: 'quantity', label: 'Quantité', value: expense?.quantity ?? '', type: 'number' },
      { name: 'unit', label: 'Unité', value: expense?.unit ?? '', options: ['', 'Unité', 'm²', 'm³', 'L'] },
      { name: 'comments', label: 'Commentaires', value: expense?.comments ?? '', type: 'textarea' },
    ], submit(data) {
      if (number(data, 'amount') <= 0) return 'Le montant HT doit être supérieur à zéro.';
      const period = ensurePeriod(demo).period;
      const next: DemoExpense = { id: expense?.id ?? Date.now(), billingPeriodId: period.id, supplier: text(data, 'supplier'), supplierSpecialties: text(data, 'specialty') ? [text(data, 'specialty')] : [], category: text(data, 'category') as DemoExpense['category'], nature: '', invoiceDate: text(data, 'date'), invoiceNumber: text(data, 'invoice'), amountHt: number(data, 'amount'), amountTtc: text(data, 'ttc') ? number(data, 'ttc') : null, currency: text(data, 'currency'), quantity: text(data, 'quantity') ? number(data, 'quantity') : null, unit: text(data, 'unit'), comments: text(data, 'comments'), dprReportId: null, includeInPdf: expense?.includeInPdf !== false, attachmentName: expense?.attachmentName ?? '' };
      update((current) => ({ ...current, period, expenses: expense ? current.expenses.map((item) => item.id === expense.id ? next : item) : [...current.expenses, next] }));
      setExpanded((current) => ({ ...current, expenses: true })); setSelection({ kind: 'expense', id: next.id }); notify('Frais enregistré dans la démonstration.');
    } });
  }
  function serviceEditor(id?: number) {
    const service = demo.services.find((item) => item.id === id);
    setEditor({ title: service ? 'Modifier la prestation BBTM' : 'Ajouter une prestation BBTM', fields: [
      { name: 'category', label: 'Catégorie du catalogue', value: service?.category ?? 'Assistance technique', options: ['Assistance technique', 'Services portuaires', 'SPREAD ANTIPOLLUTION'] },
      { name: 'price', label: 'Montant unitaire HT', value: service?.unitAmountHt ?? 85, type: 'number', required: true },
      { name: 'quantity', label: 'Nombre d’unités', value: service?.quantity ?? view.rows.length, type: 'number', required: true },
    ], submit(data) {
      const period = ensurePeriod(demo).period;
      const next = { id: service?.id ?? Date.now(), billingPeriodId: period.id, serviceCatalogId: 1, category: text(data, 'category'), descriptionHtml: '', unitAmountHt: number(data, 'price'), quantity: number(data, 'quantity'), includeInPdf: service?.includeInPdf !== false };
      update((current) => ({ ...current, period, services: service ? current.services.map((item) => item.id === service.id ? next : item) : [...current.services, next] }));
      setExpanded((current) => ({ ...current, services: true })); setSelection({ kind: 'service', id: next.id }); notify('Prestation enregistrée dans la démonstration.');
    } });
  }
  function ensurePeriod(current: DemoProject): DemoProject {
    return { ...current, period: { ...current.period, id: current.period.id || Date.now(), clientReference: options.clientReference } };
  }
  function saveReference() {
    const key = referenceKey(demo.project.id, demo.period);
    const reference = options.clientReference.trim();
    if (references[key] === reference) return;
    setReferences((current) => ({ ...current, [key]: reference }));
    update((current) => { const next = ensurePeriod(current); return { ...next, period: { ...next.period, clientReference: reference } }; });
  }
  function rawLineEditor(line?: ProjectBillingRawLine, catalogItem?: { category: string; amount: number; vessel: string }) {
    setEditor({ title: line ? 'Modifier la ligne brute' : 'Ajouter une ligne brute', fields: [
      { name: 'designation', label: 'Désignation libre', value: line?.designation ?? catalogItem?.category ?? '', required: true },
      { name: 'date', label: 'Date', value: line?.serviceDate ?? view.startDate, type: 'date', required: true },
      { name: 'vessel', label: 'Navire', value: line?.vesselName ?? catalogItem?.vessel ?? options.vesselName, options: ['', ...['GOURY', 'JERSEY', 'BBTM Pioneer'].sort(compareFleetNames)] },
      { name: 'quantity', label: 'Quantité', value: line?.quantity ?? 1, type: 'number', required: true },
      { name: 'price', label: 'Prix unitaire HT', value: line?.unitAmountHt ?? catalogItem?.amount ?? 0, type: 'number', required: true },
    ], note: 'Montants en EUR. La case Saisie brute contrôle l’inclusion de toutes les lignes dans le PDF.', submit(data) {
      if (number(data, 'quantity') <= 0) return 'La quantité doit être supérieure à zéro.';
      const period = ensurePeriod(demo).period;
      const next: ProjectBillingRawLine = { id: line?.id ?? Date.now(), billingPeriodId: period.id, serviceCatalogId: null, serviceDate: text(data, 'date'), designation: text(data, 'designation'), vesselName: text(data, 'vessel'), vesselId: null, unitAmountHt: number(data, 'price'), quantity: number(data, 'quantity'), includeInPdf: true };
      update((current) => ({ ...current, period, rawLines: line ? current.rawLines.map((item) => item.id === line.id ? next : item) : [...current.rawLines, next] }));
      setExpanded((current) => ({ ...current, raw: true })); setSelection({ kind: 'raw', id: next.id }); notify('Ligne brute enregistrée dans la démonstration.');
    } });
  }
  function saveParameters() {
    if (!options.month || view.endDate < view.startDate) { notify('Vérifiez la période avant de l’enregistrer.'); return; }
    setReferences((current) => ({ ...current, [referenceKey(demo.project.id, demo.period)]: options.clientReference.trim() }));
    update((current) => ensurePeriod(current));
    notify('Paramètres enregistrés dans la démonstration.');
  }
  function removeSelection() {
    if (!selection) return;
    const label = selectedExpense?.supplier ?? selectedService?.category ?? selectedRawLine?.designation ?? selectedOperation?.title ?? '';
    setConfirm({ title: 'Confirmer la suppression', message: `Supprimer « ${label} » de la démonstration ?`, action: () => {
      update((current) => ({ ...current,
        operations: selection.kind === 'operation' ? current.operations.filter((item) => item.id !== selection.id) : current.operations,
        expenses: selection.kind === 'expense' ? current.expenses.filter((item) => item.id !== selection.id) : current.expenses,
        services: selection.kind === 'service' ? current.services.filter((item) => item.id !== selection.id) : current.services,
        rawLines: selection.kind === 'raw' ? current.rawLines.filter((item) => item.id !== selection.id) : current.rawLines,
      })); setSelection(null); notify('Ligne supprimée dans la démonstration.');
    } });
  }
  async function proofBlob(expense: DemoExpense) {
    if (proofs[expense.id]) return proofs[expense.id].blob;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF(); pdf.setFontSize(19); pdf.text('JUSTIFICATIF DE DEMONSTRATION', 15, 25);
    pdf.setFontSize(12); pdf.text([expense.supplier, expense.invoiceNumber, date(expense.invoiceDate), `Montant HT : ${money(expense.amountHt, expense.currency)}`, 'Document fictif pour tester les annexes de la preversion.'], 15, 45);
    return pdf.output('blob');
  }
  async function showProof(expense: DemoExpense) {
    const blob = await proofBlob(expense);
    const url = URL.createObjectURL(blob);
    const fileName = proofs[expense.id]?.name || expense.attachmentName || 'Justificatif.pdf';
    setPreviewFileName(fileName); setPreviewBlob(blob); setPreviewUrl(url);
    setDialog({ title: fileName, content: blob.type.startsWith('image/') ? <div className="pp-dialog-body"><img className="pp-proof-image" src={url} alt={`Justificatif ${expense.supplier}`} /></div> : null });
  }
  async function exportBilling(mode: 'preview' | 'download', selectedFormat = format) {
    if (view.endDate < view.startDate) { notify('Vérifiez la période avant l’export.'); return; }
    setBusy(true);
    try {
      const exportDemo = ensurePeriod(demo);
      if (!saved) update(() => exportDemo);
      const exportView = buildBillingView(exportDemo, options);
      const documents: ProjectBillingDocument[] = exportDemo.expenses.filter((expense) => expense.includeInPdf !== false && (expense.attachmentName || proofs[expense.id]) && exportDemo.period.includeExpensesInPdf).map((expense) => ({ id: expense.id, billingPeriodId: exportDemo.period.id, chargeableExpenseId: expense.id, documentKind: 'chargeable_expense', bucketName: 'local-demo', objectPath: String(expense.id), fileName: proofs[expense.id]?.name || expense.attachmentName, mimeType: proofs[expense.id]?.blob.type || 'application/pdf', fileSizeBytes: proofs[expense.id]?.blob.size || 0 }));
      const localClient = createPreviewStorageClient(async (path) => {
        const expense = exportDemo.expenses.find((item) => item.id === Number(path));
        if (!expense) throw new Error('Justificatif de démonstration introuvable.');
        return proofBlob(expense);
      });
      const result = await generateBillingExportPackage(localClient, exportView.exportInput, documents, mode === 'preview' ? 'pdf' : selectedFormat);
      if (mode === 'preview') { setPreviewFileName(`${demo.project.projectCode}-Demonstration.pdf`); setPreviewBlob(result.blob); setPreviewUrl(URL.createObjectURL(result.blob)); setDialog({ title: 'Aperçu des éléments de facturation', content: null }); }
      else { const url = URL.createObjectURL(result.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${demo.project.projectCode}-Demonstration-${options.month}.${result.extension}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 5000); notify('Export de démonstration téléchargé.'); }
    } catch (error) { notify(error instanceof Error ? error.message : 'L’export est indisponible.'); }
    finally { setBusy(false); }
  }
  function catalog(label: string) {
    const items = label === 'Clients' ? demos.map((item) => item.project.clientName) : label === 'Remorqués' ? ['Ponton Démonstration', 'Barge Atlantique'] : ['Assistance technique — 85,00 € HT', 'Services portuaires', 'SPREAD ANTIPOLLUTION'];
    setDialog({ title: `Référentiel — ${label}`, content: <div className="pp-dialog-body"><p className="pp-muted">Extrait du catalogue de démonstration.</p><ul>{[...new Set(items)].map((item) => <li key={item}>{item}</li>)}</ul></div> });
  }
  function inclusion(field: 'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'includeRawInPdf', label: string) {
    return <label className="pp-include"><input type="checkbox" aria-label={label} checked={demo.period[field] !== false} disabled={archived || busy} onChange={(event) => update((current) => ({ ...ensurePeriod(current), period: { ...ensurePeriod(current).period, [field]: event.target.checked } }))} />Inclure dans le PDF</label>;
  }
  function accordionHeading(id: keyof typeof expanded, label: string, Icon: LucideIcon, amount: number | Map<string, number>, field: 'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'includeRawInPdf', subtitle?: string) {
    return <div className="pp-accordion-header"><button type="button" aria-expanded={expanded[id]} onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}><Icon size={21} /><strong>{label}</strong>{subtitle && <small>{subtitle}</small>}</button>{inclusion(field, `Inclure ${label} dans le PDF`)}<strong>{amount instanceof Map ? currencyAmounts(amount) : money(amount, id === 'operations' ? demo.contract.hireCurrency || 'EUR' : 'EUR')} HT</strong><button type="button" aria-label={`${expanded[id] ? 'Replier' : 'Déplier'} ${label}`} onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}><ChevronDown size={18} style={{ transform: expanded[id] ? 'rotate(180deg)' : undefined }} /></button></div>;
  }
  const filtered = demos.filter(({ project }) => (showArchived || !project.archivedAt) && (!statusFilter || project.status === statusFilter) && `${project.projectCode} ${project.title} ${project.clientName} ${project.primaryVesselName}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));

  return <div className={`pp-app ${compact ? 'pp-compact' : ''}`}>
    <aside className="pp-sidebar"><div className="pp-brand"><img src="/previews/project-brand.png" alt="SeaPilot by BBTM" /></div>
      <nav className="pp-navigation" aria-label="Modules SeaPilot">{navigation.map(({ label, icon: Icon, href }) => <div key={label}>
        <a className={`pp-nav-item ${label === 'Opérations' ? 'expanded' : ''}`} href={href} title={label}><Icon size={22} /><span>{label}</span>{label === 'Opérations' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</a>
        {label === 'Opérations' && <><a className="pp-nav-item sub" href="/modules/dpr"><CalendarDays size={18} /><span>Daily Progress Report</span></a><button className="pp-nav-item active pp-current-module" onClick={() => setTab('operations')}><FolderKanban size={20} /><span>Projets</span></button></>}
      </div>)}</nav><div className="pp-sidebar-footer">SeaPilot by BBTM<span>Préversion</span></div>
    </aside>
    <div className="pp-shell">
      <header className="pp-topbar"><span>Opérations <ChevronRight size={14} /> <strong>Projets</strong></span><div className="pp-header-actions"><span className="pp-demo-notice">Démonstration</span><Bell size={20} /><span className="pp-avatar">AD</span><span>Arthur DEMO<small className="pp-muted">Administration</small></span></div></header>
      <main className="pp-main">
        <header className="pp-module-header"><div><small>MODULE</small><h1>Projets</h1><p>Contrats, opérations, facturation et documents.</p></div></header>
        <ModuleRibbon ariaLabel="Menu des projets" className="pp-module-ribbon" singleRow>
          <ModuleRibbonGroup label="Projet">
            <ModuleRibbonCommand icon={<Plus aria-hidden="true" size={22} />} label="Nouveau projet" onClick={() => projectEditor(true)} />
            <ModuleRibbonCommand icon={<Pencil aria-hidden="true" size={22} />} label="Modifier le projet" disabled={archived} onClick={() => projectEditor()} />
            <ModuleRibbonCommand icon={<Archive aria-hidden="true" size={22} />} label="Archiver le projet" disabled={archived} onClick={() => setConfirm({ title: 'Archiver le projet', message: `Archiver ${demo.project.projectCode} dans la démonstration ?`, action: () => { update((current) => ({ ...current, project: { ...current.project, archivedAt: new Date().toISOString() } })); setShowArchived(true); notify('Projet archivé dans la démonstration.'); } })} />
            <ModuleRibbonCommand icon={<RefreshCw aria-hidden="true" size={22} />} label="Actualiser" onClick={() => notify('Données de démonstration actualisées.')} />
            <ModuleRibbonCommand icon={<RotateCcw aria-hidden="true" size={22} />} label="Réinitialiser la démonstration" onClick={reset} />
          </ModuleRibbonGroup>
          <ModuleRibbonGroup label="Catalogue">
            <ModuleRibbonCommand icon={<Users aria-hidden="true" size={22} />} label="Clients" onClick={() => catalog('Clients')} />
            <ModuleRibbonCommand icon={<Ship aria-hidden="true" size={22} />} label="Remorqués" onClick={() => catalog('Remorqués')} />
            <ModuleRibbonCommand icon={<PackageCheck aria-hidden="true" size={22} />} label="Prestations" onClick={() => catalog('Prestations')} />
          </ModuleRibbonGroup>
        </ModuleRibbon>
        <div className="pp-workspace">
          <aside className="pp-portfolio"><h2>Portefeuille</h2><label className="pp-search"><Search size={17} /><input aria-label="Rechercher un projet" placeholder="Rechercher un projet…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className="pp-filter-row"><button className="pp-button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17} />Filtres</button><button className="pp-button icon" aria-label="Réinitialiser les filtres" onClick={() => { setQuery(''); setStatusFilter(''); setShowArchived(false); }}><RefreshCw size={17} /></button><button className="pp-button icon" aria-label="Changer la densité" aria-pressed={compact} onClick={() => setCompact(!compact)}><Settings2 size={17} /></button></div>
            {filtersOpen && <div className="pp-billing-controls"><label className="pp-field">Statut<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tous</option>{PROJECT_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="pp-include"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Voir les archives</label></div>}
            <p className="pp-muted">{filtered.length} projet{filtered.length > 1 ? 's' : ''}</p>
            <div className="pp-contracts">{filtered.map(({ project, operations }) => <button className={`pp-project-item ${project.id === selectedId ? 'selected' : ''}`} key={project.id} aria-pressed={project.id === selectedId} onClick={() => chooseProject(project.id)}><strong>{project.projectCode} — {project.title}</strong><span>{project.clientName}</span><div><Status value={project.status} /><small>{project.archivedAt ? 'Archivé' : `${operations.length} opération${operations.length > 1 ? 's' : ''}`}</small></div></button>)}{!filtered.length && <p className="pp-empty">Aucun projet ne correspond aux filtres.</p>}</div>
          </aside>
          <section className="pp-detail" aria-label="Dossier du projet">
            <header className="pp-project-header"><h2>{demo.project.projectCode} — {demo.project.title} <Status value={demo.project.status} />{archived && <small>Archivé</small>}</h2><p className="pp-project-meta">{demo.project.clientName}<span>•</span>{demo.project.contractType}<span>•</span>{date(demo.project.startsOn)} – {date(demo.project.endsOn)}<span>•</span>Loyer contractuel : {money(demo.contract.charterHire ?? 0)} / jour</p>
              <div className="pp-tabs" role="tablist" aria-label="Rubriques du projet">{tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`pp-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`pp-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={`pp-tab ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMenu(''); setSelection(null); }} onKeyDown={(event) => { const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (!offset) return; event.preventDefault(); const next = tabs[(index + offset + tabs.length) % tabs.length].id; setTab(next); setSelection(null); document.getElementById(`pp-tab-${next}`)?.focus(); }}><Icon size={20} />{label}</button>)}</div>
            </header>
            <div className="pp-content" id={`pp-panel-${tab}`} role="tabpanel" aria-labelledby={`pp-tab-${tab}`}>
              {tab === 'billing' && <>
                <div className="pp-billing-header">
                  <div className="pp-billing-title"><h2>Facturation mensuelle</h2><label className="pp-field pp-billing-month"><input aria-label="Mois de facturation" type="month" value={options.month} onChange={(event) => chooseMonth(event.target.value)} /></label></div>
                  <div className="pp-commandbar pp-billing-commandbar" aria-label="Commandes de facturation">
                  {menuControl('add', 'Ajouter', Plus, [{ label: 'Ajouter un frais', icon: Fuel, action: () => expenseEditor() }, { label: 'Ajouter une prestation BBTM', icon: PackageCheck, action: () => serviceEditor() }, { label: 'Ajouter une ligne brute', icon: FilePlus2, action: () => rawLineEditor() }], false, archived || busy)}
                  {menuControl('edit', 'Modifier', Pencil, [{ label: 'Modifier la ligne sélectionnée', icon: Pencil, action: () => selectedExpense ? expenseEditor(selectedExpense) : selectedRawLine ? rawLineEditor(selectedRawLine) : serviceEditor(selectedService?.id) }, { label: 'Ajouter un justificatif', icon: FilePlus2, action: () => upload.current?.click(), disabled: !selectedExpense }, { label: 'Supprimer la ligne', icon: Trash2, danger: true, action: removeSelection }], false, archived || busy || (!selectedExpense && !selectedService && !selectedRawLine))}
                  {menuControl('save', 'Enregistrer', Save, [{ label: 'Enregistrer les paramètres', icon: Save, action: saveParameters }], false, busy || archived)}
                  <button className="pp-button" disabled={busy} onClick={() => void exportBilling('preview')}><FileText size={18} />{busy ? 'Génération…' : 'Aperçu'}</button>
                  {menuControl('export', 'Exporter', Download, [{ label: 'PDF standard', action: () => void exportBilling('download', 'pdf') }, { label: 'PDF + annexes PDF', action: () => void exportBilling('download', 'merged-pdf') }, { label: 'ZIP + toutes les pièces', action: () => void exportBilling('download', 'zip') }], true, busy)}
                  </div>
                </div>
                {!saved && <p className="pp-demo-notice" role="status">La fiche du mois sera créée automatiquement à la première action.</p>}
                <div className={`pp-billing-controls ${options.periodMode === 'custom' ? 'custom-period' : 'calendar-period'}`}>
                  <label className="pp-field">Période<select value={options.periodMode} onChange={(event) => { setOptions((current) => ({ ...current, periodMode: event.target.value as BillingDemoOptions['periodMode'], completeMissingDays: false })); setPreviewUrl(''); }}><option value="calendar-month">Mois calendaire</option><option value="custom">Personnalisée</option></select></label>
                  {options.periodMode === 'custom' && <><label className="pp-field">Début<input type="date" value={options.startDate} onChange={(event) => setOptions((current) => ({ ...current, startDate: event.target.value, completeMissingDays: false }))} /></label><label className="pp-field">Fin<input type="date" value={options.endDate} onChange={(event) => setOptions((current) => ({ ...current, endDate: event.target.value, completeMissingDays: false }))} /></label></>}
                  <label className="pp-field">Navire<select value={options.vesselName} onChange={(event) => setOptions((current) => ({ ...current, vesselName: event.target.value }))}><option value="">Navire de l’opération</option>{[...new Set(demo.operations.map((operation) => operation.primaryVesselName))].sort(compareFleetNames).map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label className="pp-field pp-billing-reference">Référence client<input value={options.clientReference} onBlur={saveReference} onChange={(event) => setOptions((current) => ({ ...current, clientReference: event.target.value }))} /></label>
                  <label className="pp-field pp-billing-format">Format<select value={format} onChange={(event) => setFormat(event.target.value as BillingExportFormat)}><option value="pdf">PDF standard</option><option value="merged-pdf">PDF + annexes PDF</option><option value="zip">ZIP + toutes les pièces</option></select></label>
                </div>
                {view.endDate < view.startDate ? <p role="alert">La fin de période doit suivre le début.</p> : view.missingDates.length > 0 && <label className="pp-include"><input type="checkbox" checked={options.completeMissingDays ?? false} onChange={(event) => setOptions((current) => ({ ...current, completeMissingDays: event.target.checked }))} />Compléter les {view.missingDates.length} jours sans DPR avec « 24/24 Operation » au tarif applicable.</label>}
                <section className="pp-accordion">{accordionHeading('operations', 'Loyers & journées DPR', CalendarDays, view.operationTotal, 'includeOperationsInPdf')}{expanded.operations && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>PDF</th><th>Date</th><th>Opération</th><th>Loyer HT</th></tr></thead><tbody>{view.rows.map((row) => <tr key={row.key}><td><input type="checkbox" aria-label={`Inclure la journée du ${row.dpr.reportDate}`} disabled={busy} checked={row.included} onChange={() => update((current) => ({ ...current, period: { ...current.period, excludedOperationKeys: row.included ? [...(current.period.excludedOperationKeys ?? []), row.key] : (current.period.excludedOperationKeys ?? []).filter((value) => value !== row.key) } }))} /></td><td>{date(row.dpr.reportDate)}</td><td>{row.operation}{row.comments && <small className="pp-muted">{row.comments}</small>}</td><td>{money(row.amountHt)}</td></tr>)}{!view.rows.length && <tr><td colSpan={4}>Aucun DPR pour cette période et ce navire.</td></tr>}</tbody></table></div>}</section>
                <section className="pp-accordion">{accordionHeading('expenses', 'Services refacturables', Fuel, view.expenseTotalsByCurrency, 'includeExpensesInPdf', `${demo.expenses.length} frais`)}{expanded.expenses && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>PDF</th><th>Fournisseur / spécialité</th><th>Date / facture</th><th>Montant HT</th><th>Pièces</th></tr></thead><tbody>{demo.expenses.map((expense) => <tr key={expense.id} className={selectedExpense?.id === expense.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'expense', id: expense.id })}><td><input type="checkbox" aria-label={`Inclure le frais ${expense.supplier}`} disabled={busy} checked={expense.includeInPdf !== false} onChange={(event) => update((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === expense.id ? { ...item, includeInPdf: event.target.checked } : item) }))} /></td><td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${expense.supplier}`} checked={selectedExpense?.id === expense.id} onChange={() => setSelection({ kind: 'expense', id: expense.id })} /> {expense.supplier}</label><small className="pp-muted">{expense.supplierSpecialties.join(' · ')}</small></td><td>{date(expense.invoiceDate)}<small className="pp-muted">{expense.invoiceNumber}</small></td><td>{money(expense.amountHt, expense.currency)}</td><td>{expense.attachmentName || proofs[expense.id] ? <a href="#justificatif" onClick={(event) => { event.preventDefault(); void showProof(expense); }}>1 fichier</a> : 'Aucune pièce'}</td></tr>)}{!demo.expenses.length && <tr><td colSpan={5}>Aucun frais pour ce mois. Utilisez Ajouter dans la barre de commandes.</td></tr>}</tbody></table></div>}</section>
                <section className="pp-accordion">{accordionHeading('services', 'Prestations BBTM', PackageCheck, view.serviceTotal, 'includeBbtmInPdf', `${demo.services.length} prestation${demo.services.length > 1 ? 's' : ''}`)}{expanded.services && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Catégorie</th><th>Prix unitaire HT</th><th>Unités</th><th>Total HT</th></tr></thead><tbody>{view.services.map((service) => <tr key={service.id} className={selectedService?.id === service.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'service', id: service.id })}><td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${service.category}`} checked={selectedService?.id === service.id} onChange={() => setSelection({ kind: 'service', id: service.id })} /> {service.category}</label></td><td>{money(service.unitAmountHt)}</td><td>{service.quantity}</td><td>{money(service.unitAmountHt * service.quantity)}</td></tr>)}{!demo.services.length && <tr><td colSpan={4}>Aucune prestation pour ce mois.</td></tr>}</tbody></table></div>}</section>
                {(demo.rawLines.length > 0 || expanded.raw) && <section className="pp-accordion">{accordionHeading('raw', 'Saisie brute', FilePlus2, view.rawTotal, 'includeRawInPdf', `${demo.rawLines.length} ligne${demo.rawLines.length > 1 ? 's' : ''}`)}{expanded.raw && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Date</th><th>Désignation</th><th>Navire</th><th>Quantité</th><th>Prix unitaire HT</th><th>Total HT</th></tr></thead><tbody>{demo.rawLines.map((line) => <tr key={line.id} className={selectedRawLine?.id === line.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'raw', id: line.id })}><td>{date(line.serviceDate)}</td><td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${line.designation}`} checked={selectedRawLine?.id === line.id} onChange={() => setSelection({ kind: 'raw', id: line.id })} />{line.designation}</label></td><td>{line.vesselName || '—'}</td><td>{line.quantity}</td><td>{money(line.unitAmountHt)}</td><td>{money(billingRawLineTotal(line))}</td></tr>)}{!demo.rawLines.length && <tr><td colSpan={6}>Ajoutez une ligne brute depuis la barre de commandes.</td></tr>}</tbody></table></div>}</section>}
                <footer className="pp-total"><span className="pp-muted">Sélection pour l’export : loyers, frais et prestations BBTM{demo.rawLines.length > 0 ? ', saisie brute' : ''}</span><span>Total HT sélectionné <strong data-testid="billing-total">{currencyAmounts(view.totalsByCurrency)}</strong></span></footer>
                <input ref={upload} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" aria-label="Ajouter un justificatif" onChange={(event) => { const file = event.target.files?.[0]; if (file && selectedExpense) { setProofs((current) => ({ ...current, [selectedExpense.id]: { blob: file, name: file.name } })); update((current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === selectedExpense.id ? { ...expense, attachmentName: file.name } : expense) })); notify('Justificatif ajouté à la démonstration locale.'); } event.currentTarget.value = ''; }} />
              </>}
              {tab === 'operations' && <><div className="pp-section-heading"><div><h2>Opérations</h2><p className="pp-muted">Chaque opération est indépendante et liée au Planning.</p></div></div><div className="pp-commandbar"><button className="pp-button primary" disabled={archived} onClick={() => operationEditor()}><Plus size={18} />Nouvelle opération</button>{menuControl('operation', 'Opération sélectionnée', CalendarDays, [{ label: 'Modifier l’opération', icon: Pencil, action: () => operationEditor(selectedOperation) }, { label: 'Ouvrir dans Planning', icon: CalendarDays, action: () => setDialog({ title: 'Occurrence Planning — démonstration', content: <div className="pp-dialog-body"><h3>{selectedOperation?.title}</h3><p>{date(selectedOperation?.startsOn ?? '')} – {date(selectedOperation?.endsOn ?? '')}</p><p>{selectedOperation?.primaryVesselName}</p><Status value={selectedOperation?.status ?? 'Non validé'} /></div> }) }, { label: 'Supprimer l’opération', icon: Trash2, danger: true, action: removeSelection }], false, !selectedOperation || archived)}</div><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Mission</th><th>Période</th><th>Navire</th><th>Loyer</th><th>Documents</th><th>Statut</th></tr></thead><tbody>{[...demo.operations].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map((operation) => <tr key={operation.id} className={selectedOperation?.id === operation.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'operation', id: operation.id })}><td><label><input type="radio" name="operation" aria-label={`Sélectionner ${operation.title}`} checked={selectedOperation?.id === operation.id} onChange={() => setSelection({ kind: 'operation', id: operation.id })} /><strong>{operation.title}</strong></label></td><td>{date(operation.startsOn)}<small className="pp-muted">{date(operation.endsOn)}</small></td><td>{operation.primaryVesselName}</td><td>{money(operation.charterHire ?? 0)} / jour<small className="pp-muted">{operation.charterHireOverride ? 'Tarif personnalisé' : 'Barème contractuel copié'}</small></td><td>{operation.documentCount} fichier{operation.documentCount > 1 ? 's' : ''}</td><td><Status value={operation.status} /></td></tr>)}</tbody></table></div></>}
              {tab === 'identity' && <><h2>Identité du projet</h2><dl className="pp-grid-two">{[['Client', demo.project.clientName], ['Navire principal', demo.project.primaryVesselName], ['Livraison', `${date(demo.project.startsOn)} — ${demo.project.deliveryPort}`], ['Restitution', `${date(demo.project.endsOn)} — ${demo.project.redeliveryPort}`], ['Zone d’opération', demo.project.operationArea], ['Type de contrat', demo.project.contractType]].map(([label, value]) => <div key={label}><dt className="pp-muted">{label}</dt><dd>{value}</dd></div>)}</dl><p>{demo.project.description}</p><p className="pp-muted">La modification du dossier est accessible dans le menu Projet.</p></>}
              {tab === 'contract' && <><h2>Offre & contrat</h2><p className="pp-muted">L’offre commerciale est facultative et indépendante du contrat.</p><div className="pp-commandbar">{menuControl('contract', 'Documents', FileText, [{ label: 'Prévisualiser le contrat', action: () => setDialog({ title: `${demo.project.contractType} — démonstration`, content: <div className="pp-dialog-body"><h3>{demo.project.projectCode} — {demo.project.title}</h3><p>Armateur : {demo.contract.ownerIdentity}</p><p>Affréteur : {demo.project.clientName}</p><p>Navire : {demo.project.primaryVesselName}</p><p>Livraison : {date(demo.project.startsOn)}</p><p>Restitution : {date(demo.project.endsOn)}</p><p>Loyer : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Résumé de démonstration. La génération contractuelle complète reste celle du module existant.</p></div> }) }, { label: 'Consulter l’offre commerciale', action: () => setDialog({ title: 'Offre commerciale — démonstration', content: <div className="pp-dialog-body"><h3>{demo.project.title}</h3><p>Client : {demo.project.clientName}</p><p>Loyer proposé : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Cette consultation est indépendante du choix et de l’enregistrement du contrat.</p></div> }) }])}</div><h3>Contrat retenu</h3><p><strong>{demo.project.contractType}</strong></p><p>Navire : {demo.project.primaryVesselName}</p><p>Loyer contractuel : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Le type de contrat est enregistré depuis Modifier le projet.</p></>}
              {tab === 'documents' && <><h2>Documents du projet</h2><div className="pp-commandbar">{menuControl('documents', 'Documents', FileText, [{ label: 'Aperçu des éléments de facturation', action: () => void exportBilling('preview'), disabled: busy }, { label: 'Ouvrir SharePoint', action: () => window.open('https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets', '_blank', 'noopener,noreferrer') }])}</div><p className="pp-muted">Pièces de démonstration associées aux frais du mois.</p><ul>{demo.expenses.filter((expense) => expense.attachmentName || proofs[expense.id]).map((expense) => <li key={expense.id}><a href="#justificatif" onClick={(event) => { event.preventDefault(); void showProof(expense); }}>{proofs[expense.id]?.name || expense.attachmentName}</a> — {expense.supplier}</li>)}</ul></>}
            </div>
          </section>
        </div>
        <p className="pp-muted pp-bottom-note">Préversion interactive — données de démonstration. Les changements restent dans cette session.</p>
      </main>
    </div>
    {toast && <div className="pp-toast" role="status"><Check size={18} />{toast}</div>}
    {editor && <EditorDialog editor={editor} onClose={() => setEditor(null)} />}
    {confirm && <Dialog title={confirm.title} onClose={() => setConfirm(null)}><div className="pp-dialog-body"><p>{confirm.message}</p></div><footer className="pp-dialog-actions"><button className="pp-button" onClick={() => setConfirm(null)}>Annuler</button><button className="pp-button danger" onClick={() => { confirm.action(); setConfirm(null); }}>Confirmer</button></footer></Dialog>}
    {dialog && <Dialog title={dialog.title} onClose={() => { setDialog(null); setPreviewUrl(''); setPreviewBlob(null); }}>{dialog.content ?? (previewBlob && <PreviewPdf blob={previewBlob} />)}<footer className="pp-dialog-actions">{previewUrl && <a className="pp-button" href={previewUrl} download={previewFileName}><Download size={17} />{previewBlob?.type.startsWith('image/') ? 'Télécharger la pièce' : 'Télécharger le PDF'}</a>}<button className="pp-button" onClick={() => { setDialog(null); setPreviewUrl(''); setPreviewBlob(null); }}>Fermer</button></footer></Dialog>}
  </div>;
}
