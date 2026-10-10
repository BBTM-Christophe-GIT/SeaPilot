import {
  Archive, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronRight,
  ClipboardList, Copy, Download, FilePlus2, FileText, FolderKanban, Fuel, Home,
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
import { billingReferenceScope, billingReferenceScopeLabel } from '../projectBillingReferences';
import { createPreviewStorageClient } from './previewStorageClient';
import { PROJECT_STATUSES } from '../projectStatus';
import { compareFleetNames } from '../../fleet/fleetDisplay';
import PreviewPdf from './PreviewPdf';
import BillingStatement, { type BillingSectionField } from './BillingStatement';
import BillingPeriodCalendar from './BillingPeriodCalendar';
import BillingRawLineDraft, { type BillingRawLineDraftValues, type BillingRawLineValues } from './BillingRawLineDraft';
import BillingExpenseAttachments, { createExpenseAttachments, EXPENSE_ATTACHMENT_ACCEPT, type ExpenseAttachment } from './BillingExpenseAttachments';
import {
  billingDemoRange, billingDemoReferenceKey, buildBillingView, createCurrentBillingOptions, createDemoProjects, INITIAL_BILLING_OPTIONS,
  type BillingDemoOptions, type DemoExpense, type DemoOperation, type DemoProject,
} from './billingDemo';

type Tab = 'identity' | 'operations' | 'billing' | 'contract' | 'documents';
type Selection = { kind: 'operation' | 'expense' | 'service' | 'raw'; id: number } | null;
type MenuItem = { label: string; icon?: LucideIcon; action: () => void; disabled?: boolean; danger?: boolean };
type FormField = { name: string; label: string; value?: string | number; type?: string; required?: boolean; options?: string[] };
type Editor = { title: string; fields: FormField[]; submit: (data: FormData, attachments: ExpenseAttachment[]) => string | void; note?: string; attachments?: ExpenseAttachment[] };
type MonthData = Pick<DemoProject, 'period' | 'expenses' | 'services' | 'rawLines'>;
type RawLineDraft = { scope: string; line?: ProjectBillingRawLine; values: BillingRawLineDraftValues };

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
const emptyMonth = (demo: DemoProject, month: string): MonthData => ({
  period: { ...demo.period, id: 0, periodMonth: `${month}-01`, excludedOperationKeys: [], includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true, includeRawInPdf: true },
  expenses: [], services: [], rawLines: [],
});
const initialReferences = (demos: DemoProject[]) => Object.fromEntries(demos.map((demo) => [billingDemoReferenceKey(demo, { ...INITIAL_BILLING_OPTIONS, vesselName: demo.project.primaryVesselName }), demo.period.clientReference]));
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
  const [attachments, setAttachments] = useState(editor.attachments ?? []);
  return <Dialog title={editor.title} onClose={onClose}>
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); const result = editor.submit(new FormData(event.currentTarget), attachments);
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
        {editor.attachments !== undefined && <BillingExpenseAttachments value={attachments} onChange={setAttachments} />}
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
  const [options, setOptions] = useState<BillingDemoOptions>(createCurrentBillingOptions);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [rawDraft, setRawDraft] = useState<RawLineDraft | null>(null);
  const [expanded, setExpanded] = useState({ operations: true, expenses: false, services: false, raw: true });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dialog, setDialog] = useState<{ title: string; content: ReactNode } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [format, setFormat] = useState<BillingExportFormat>('merged-pdf');
  const [proofs, setProofs] = useState<Record<number, ExpenseAttachment[]>>({});
  const upload = useRef<HTMLInputElement>(null);
  const uploadExpenseId = useRef<number | null>(null);
  const base = demos.find((item) => item.project.id === selectedId) ?? demos[0];
  const key = monthKey(base.project.id, options.month);
  const activeRawDraft = rawDraft?.scope === key ? rawDraft : null;
  const monthly = months[key] ?? emptyMonth(base, options.month);
  const demo = { ...base, ...monthly };
  const view = useMemo(() => buildBillingView(demo, options), [demo, options]);
  const referenceScope = billingReferenceScope({ ...demo.period, includeRawInPdf: demo.period.includeRawInPdf !== false && view.rawLines.length > 0 });
  const currentReferenceKey = `${demo.project.id}:${referenceScope}`;
  const previousReferenceKey = useRef(currentReferenceKey);
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
  useEffect(() => {
    if (previousReferenceKey.current === currentReferenceKey) return;
    previousReferenceKey.current = currentReferenceKey;
    setOptions((current) => ({ ...current, clientReference: references[currentReferenceKey] ?? defaultProjectClientReference(demo.project) }));
  }, [currentReferenceKey, references, demo.project]);

  function update(change: (current: DemoProject) => DemoProject) {
    const next = change(demo);
    setDemos((current) => current.map((item) => item.project.id === selectedId ? next : item));
    setMonths((current) => ({ ...current, [key]: { period: next.period, expenses: next.expenses, services: next.services, rawLines: next.rawLines } }));
    setPreviewUrl('');
  }
  function chooseProject(id: number) {
    const item = demos.find((value) => value.project.id === id)!;
    setSelectedId(id); setSelection(null); setRawDraft(null); setMenu(''); setPreviewUrl('');
    setOptions((current) => {
      const nextOptions = { ...current, vesselName: item.project.primaryVesselName, completeMissingDays: false };
      const nextDemo = { ...item, ...(months[monthKey(id, current.month)] ?? emptyMonth(item, current.month)) };
      return { ...nextOptions, clientReference: references[billingDemoReferenceKey(nextDemo, nextOptions)] ?? defaultProjectClientReference(item.project) };
    });
  }
  function chooseMonth(month: string) {
    if (!month) return;
    setOptions((current) => {
      const nextOptions = { ...current, month, periodMode: 'calendar-month' as const, completeMissingDays: false };
      Object.assign(nextOptions, billingDemoRange(nextOptions));
      const nextDemo = { ...base, ...(months[monthKey(selectedId, month)] ?? emptyMonth(base, month)) };
      return { ...nextOptions, clientReference: references[billingDemoReferenceKey(nextDemo, nextOptions)] ?? defaultProjectClientReference(demo.project) };
    });
    setSelection(null); setRawDraft(null); setPreviewUrl('');
  }
  function notify(message: string) { setToast(message); }
  function chooseRange(startDate: string, endDate: string) {
    setOptions((current) => ({ ...current, periodMode: 'custom', startDate, endDate, completeMissingDays: false }));
    setPreviewUrl('');
  }
  function reset() {
    const fresh = createDemoProjects(); setDemos(fresh); setMonths(initialMonths(fresh)); setReferences(initialReferences(fresh));
    setSelectedId(264); setOptions(createCurrentBillingOptions()); setSelection(null); setRawDraft(null);
    setQuery(''); setStatusFilter(''); setShowArchived(false); setPreviewUrl(''); setProofs({});
    notify('Les données de démonstration ont été réinitialisées.');
  }
  function menuControl(id: string, label: string, Icon: LucideIcon, items: MenuItem[], primary = false, disabled = false, accessibleLabel = label) {
    return <div className="pp-menu-wrap">
      <button type="button" className={`pp-button ${primary ? 'primary' : ''}`} disabled={disabled} aria-label={accessibleLabel} aria-haspopup="menu" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? '' : id)}><Icon size={18} />{label}<ChevronDown size={14} /></button>
      {menu === id && <div role="menu" aria-label={accessibleLabel} className="pp-menu" onKeyDown={(event) => {
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
    setEditor({ title: expense ? 'Modifier le frais imputable' : 'Ajouter un frais imputable', attachments: expense ? expenseProofs(expense) : [], fields: [
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
    ], submit(data, attachments) {
      if (number(data, 'amount') <= 0) return 'Le montant HT doit être supérieur à zéro.';
      const period = ensurePeriod(demo).period;
      const expenseId = expense?.id ?? Math.max(Date.now(), ...Object.values(months).flatMap((month) => month.expenses.map((item) => item.id)), ...Object.keys(proofs).map(Number)) + 1;
      const next: DemoExpense = { id: expenseId, billingPeriodId: period.id, supplier: text(data, 'supplier'), supplierSpecialties: text(data, 'specialty') ? [text(data, 'specialty')] : [], category: text(data, 'category') as DemoExpense['category'], nature: '', invoiceDate: text(data, 'date'), invoiceNumber: text(data, 'invoice'), amountHt: number(data, 'amount'), amountTtc: text(data, 'ttc') ? number(data, 'ttc') : null, currency: text(data, 'currency'), quantity: text(data, 'quantity') ? number(data, 'quantity') : null, unit: text(data, 'unit'), comments: text(data, 'comments'), dprReportId: null, includeInPdf: expense?.includeInPdf !== false, attachmentName: attachments[0]?.name ?? '' };
      setProofs((current) => ({ ...current, [next.id]: attachments }));
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
    const key = currentReferenceKey;
    const reference = options.clientReference.trim();
    if (references[key] === reference) return;
    setReferences((current) => ({ ...current, [key]: reference }));
    update((current) => { const next = ensurePeriod(current); return { ...next, period: { ...next.period, clientReference: reference } }; });
  }
  function rawLineEditor(line?: ProjectBillingRawLine, catalogItem?: { category: string; amount: number; vessel: string }) {
    if (archived || busy || activeRawDraft) return;
    setRawDraft({ scope: key, line, values: {
      designation: line?.designation ?? catalogItem?.category ?? '',
      serviceDate: line?.serviceDate ?? view.startDate,
      vesselName: line?.vesselName ?? catalogItem?.vessel ?? options.vesselName,
      quantity: String(line?.quantity ?? 1),
      unitAmountHt: String(line?.unitAmountHt ?? catalogItem?.amount ?? 0),
    } });
    setExpanded((current) => ({ ...current, raw: true }));
  }
  function saveRawLine(values: BillingRawLineValues) {
    if (!activeRawDraft || archived || busy) return;
    const line = activeRawDraft.line;
    const period = ensurePeriod(demo).period;
    const next: ProjectBillingRawLine = {
      ...values,
      id: line?.id ?? Math.max(Date.now(), ...demo.rawLines.map((item) => item.id)) + 1,
      billingPeriodId: period.id,
      serviceCatalogId: line?.serviceCatalogId ?? null,
      vesselId: line?.vesselName === values.vesselName ? line.vesselId ?? null : null,
      includeInPdf: line?.includeInPdf !== false,
    };
    update((current) => ({ ...current, period, rawLines: line ? current.rawLines.map((item) => item.id === line.id ? next : item) : [...current.rawLines, next] }));
    setRawDraft(null);
    setSelection({ kind: 'raw', id: next.id });
    notify('Ligne brute enregistrée dans la démonstration.');
  }
  function duplicateRawLine() {
    const previous = demo.rawLines.at(-1);
    if (!previous || archived || busy || activeRawDraft) return;
    const period = ensurePeriod(demo).period;
    const copy = { ...previous, id: Math.max(Date.now(), ...demo.rawLines.map((item) => item.id)) + 1, billingPeriodId: period.id };
    update((current) => ({ ...current, period, rawLines: [...current.rawLines, copy] }));
    setExpanded((current) => ({ ...current, raw: true }));
    setSelection({ kind: 'raw', id: copy.id });
    notify('La dernière ligne a été dupliquée à l’identique.');
  }
  function removeSelection(target: Selection = selection) {
    if (!target || archived || busy || (target.kind === 'raw' && activeRawDraft)) return;
    const label = target.kind === 'expense' ? demo.expenses.find((item) => item.id === target.id)?.supplier
      : target.kind === 'service' ? demo.services.find((item) => item.id === target.id)?.category
        : target.kind === 'raw' ? demo.rawLines.find((item) => item.id === target.id)?.designation
          : demo.operations.find((item) => item.id === target.id)?.title;
    if (label === undefined) return;
    setConfirm({ title: 'Confirmer la suppression', message: `Supprimer « ${label} » de la démonstration ?`, action: () => {
      update((current) => ({ ...current,
        operations: target.kind === 'operation' ? current.operations.filter((item) => item.id !== target.id) : current.operations,
        expenses: target.kind === 'expense' ? current.expenses.filter((item) => item.id !== target.id) : current.expenses,
        services: target.kind === 'service' ? current.services.filter((item) => item.id !== target.id) : current.services,
        rawLines: target.kind === 'raw' ? current.rawLines.filter((item) => item.id !== target.id) : current.rawLines,
      })); setSelection(null); notify('Ligne supprimée dans la démonstration.');
    } });
  }
  function expenseProofs(expense: DemoExpense): ExpenseAttachment[] {
    return proofs[expense.id] ?? (expense.attachmentName ? [{ id: `demo-${expense.id}`, name: expense.attachmentName }] : []);
  }
  async function proofBlob(expense: DemoExpense, attachment: ExpenseAttachment) {
    if (attachment.blob) return attachment.blob;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF(); pdf.setFontSize(19); pdf.text('JUSTIFICATIF DE DEMONSTRATION', 15, 25);
    pdf.setFontSize(12); pdf.text([expense.supplier, expense.invoiceNumber, date(expense.invoiceDate), `Montant HT : ${money(expense.amountHt, expense.currency)}`, 'Document fictif pour tester les annexes de la preversion.'], 15, 45);
    return pdf.output('blob');
  }
  async function showProof(expense: DemoExpense, attachment: ExpenseAttachment) {
    const blob = await proofBlob(expense, attachment);
    const url = URL.createObjectURL(blob);
    const fileName = attachment.name;
    const isPdf = blob.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    setPreviewFileName(fileName); setPreviewBlob(blob); setPreviewUrl(url);
    setDialog({ title: fileName, content: blob.type.startsWith('image/') ? <div className="pp-dialog-body"><img className="pp-proof-image" src={url} alt={`Justificatif ${expense.supplier}`} /></div> : isPdf ? null : <div className="pp-dialog-body"><p>{fileName}</p><p className="pp-muted">Téléchargez cette pièce pour l’ouvrir avec votre application.</p></div> });
  }
  function showExpenseProofs(expense: DemoExpense) {
    setPreviewUrl(''); setPreviewBlob(null);
    setDialog({ title: `Pièces jointes — ${expense.supplier}`, content: <div className="pp-dialog-body"><ul className="pp-attachment-list">{expenseProofs(expense).map((attachment) => <li key={attachment.id}><span>{attachment.name}</span><button type="button" className="pp-button" aria-label={`Ouvrir ${attachment.name}`} onClick={() => void showProof(expense, attachment)}>Ouvrir</button></li>)}</ul></div> });
  }
  async function exportBilling(mode: 'preview' | 'download', selectedFormat = format) {
    if (view.endDate < view.startDate) { notify('Vérifiez la période avant l’export.'); return; }
    setBusy(true);
    try {
      const exportDemo = ensurePeriod(demo);
      if (!saved) update(() => exportDemo);
      const exportView = buildBillingView(exportDemo, options);
      const exportedProofs = exportDemo.expenses.filter((expense) => expense.includeInPdf !== false && exportDemo.period.includeExpensesInPdf).flatMap((expense) => expenseProofs(expense).map((attachment) => ({ expense, attachment, path: `${expense.id}/${attachment.id}` })));
      const documents: ProjectBillingDocument[] = exportedProofs.map(({ expense, attachment, path }, index) => ({ id: index + 1, billingPeriodId: exportDemo.period.id, chargeableExpenseId: expense.id, documentKind: 'chargeable_expense', bucketName: 'local-demo', objectPath: path, fileName: attachment.name, mimeType: attachment.blob ? attachment.blob.type || 'application/octet-stream' : 'application/pdf', fileSizeBytes: attachment.blob?.size || 0 }));
      const localClient = createPreviewStorageClient(async (path) => {
        const proof = exportedProofs.find((item) => item.path === path);
        if (!proof) throw new Error('Justificatif de démonstration introuvable.');
        return proofBlob(proof.expense, proof.attachment);
      });
      const result = await generateBillingExportPackage(localClient, exportView.exportInput, documents, mode === 'preview' ? 'pdf' : selectedFormat);
      if (mode === 'preview') { setPreviewFileName(`${demo.project.projectCode}-Demonstration.pdf`); setPreviewBlob(result.blob); setPreviewUrl(URL.createObjectURL(result.blob)); setDialog({ title: 'Aperçu des éléments de facturation', content: null }); }
      else { const url = URL.createObjectURL(result.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${demo.project.projectCode}-Demonstration-${options.month}.${result.extension}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 5000); notify('Export de démonstration téléchargé.'); }
    } catch (error) { notify(error instanceof Error ? error.message : 'L’export est indisponible.'); }
    finally { setBusy(false); }
  }
  function catalog(label: string, title = `Référentiel — ${label}`) {
    const items = label === 'Clients' ? demos.map((item) => item.project.clientName) : label === 'Remorqués' ? ['Ponton Démonstration', 'Barge Atlantique'] : ['Assistance technique — 85,00 € HT', 'Services portuaires', 'SPREAD ANTIPOLLUTION'];
    setDialog({ title, content: <div className="pp-dialog-body"><p className="pp-muted">Extrait du catalogue de démonstration.</p><ul>{[...new Set(items)].map((item) => <li key={item}>{item}</li>)}</ul></div> });
  }
  function updateInclusion(field: BillingSectionField, included: boolean) {
    update((current) => ({ ...ensurePeriod(current), period: { ...ensurePeriod(current).period, [field]: included } }));
  }
  function accordionHeading(id: keyof typeof expanded, label: string, Icon: LucideIcon, amount: number | Map<string, number>, subtitle?: string) {
    const completionLabel = `Compléter les ${view.missingDates.length} jours sans DPR avec « 24/24 Operation » au tarif contractuel applicable à chaque journée`;
    return <div className="pp-accordion-header">
      <button type="button" aria-expanded={expanded[id]} onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}><Icon size={21} /><span className="pp-accordion-label"><strong>{label}</strong>{subtitle && <small>{subtitle}</small>}</span></button>
      {(id === 'expenses' || id === 'services') && <button type="button" className="pp-button pp-heading-action" disabled={archived || busy} aria-label={id === 'expenses' ? 'Ajouter un frais' : 'Ajouter une prestation BBTM'} onClick={() => id === 'expenses' ? expenseEditor() : serviceEditor()}><Plus size={17} />Ajouter</button>}
      {id === 'operations' && view.missingDates.length > 0 && <button type="button" className="pp-button pp-heading-action" disabled={archived || busy} aria-pressed={options.completeMissingDays ?? false} aria-label={options.completeMissingDays ? 'Retirer les journées complétées' : completionLabel} title={completionLabel} onClick={() => { setOptions((current) => ({ ...current, completeMissingDays: !current.completeMissingDays })); setPreviewUrl(''); }}>{options.completeMissingDays ? 'Retirer le complément' : `Compléter ${view.missingDates.length} jours`}</button>}
      <strong>{amount instanceof Map ? currencyAmounts(amount) : money(amount, id === 'operations' ? demo.contract.hireCurrency || 'EUR' : 'EUR')} HT</strong>
      <button type="button" aria-label={`${expanded[id] ? 'Replier' : 'Déplier'} ${label}`} onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}><ChevronDown size={18} style={{ transform: expanded[id] ? 'rotate(180deg)' : undefined }} /></button>
      {(id === 'services' || id === 'raw') && <div className="pp-heading-actions">
        <button type="button" className="pp-button" disabled={busy} onClick={() => catalog('Prestations', 'Catalogue des prestations')}><BookOpen size={17} />Catalogue des prestations</button>
      </div>}
    </div>;
  }
  function billingLineActions(kind: 'expense' | 'service' | 'raw', id: number, label: string, onEdit: () => void) {
    const subject = kind === 'expense' ? `le frais ${label}` : kind === 'service' ? `la prestation ${label}` : `la ligne brute ${label}`;
    const disabled = archived || busy || (kind === 'raw' && Boolean(activeRawDraft));
    return <td className="pp-row-actions-cell"><div className="pp-row-actions">
      <button type="button" className="pp-button icon danger" disabled={disabled} aria-label={`Supprimer ${subject}`} title={`Supprimer ${subject}`} onClick={(event) => { event.stopPropagation(); removeSelection({ kind, id }); }}><Trash2 size={16} /></button>
      <button type="button" className="pp-button icon" disabled={disabled} aria-label={`Modifier ${subject}`} title={`Modifier ${subject}`} onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={16} /></button>
    </div></td>;
  }
  function rawCreateActions() {
    return <div className="pp-section-actions" role="toolbar" aria-label="Actions de la saisie brute">
      <div className="pp-section-create-actions">
        <button type="button" className="pp-button" disabled={archived || busy || Boolean(activeRawDraft)} onClick={() => rawLineEditor()}><Plus size={17} />Ajouter une ligne</button>
        <button type="button" className="pp-button" disabled={archived || busy || Boolean(activeRawDraft) || !demo.rawLines.length} onClick={duplicateRawLine}><Copy size={17} />Dupliquer la ligne</button>
      </div>
    </div>;
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
                  <h2>Facturation mensuelle</h2>
                  <label className="pp-field pp-billing-vessel">Navire<select disabled={busy} value={options.vesselName} onChange={(event) => { setOptions((current) => ({ ...current, vesselName: event.target.value })); setPreviewUrl(''); }}><option value="">Navire de l’opération</option>{[...new Set(demo.operations.map((operation) => operation.primaryVesselName))].sort(compareFleetNames).map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label className="pp-field pp-billing-month">Mois<input aria-label="Mois de facturation" type="month" disabled={busy} value={options.month} onChange={(event) => chooseMonth(event.target.value)} /></label>
                  <BillingPeriodCalendar month={options.month} startDate={view.startDate} endDate={view.endDate} disabled={busy} onRangeChange={chooseRange} />

                </div>
                {!saved && <p className="pp-demo-notice" role="status">La fiche du mois sera créée automatiquement à la première action.</p>}
                {view.endDate < view.startDate && <p role="alert">La fin de période doit suivre le début.</p>}
                <div className="pp-billing-layout">
                <BillingStatement
                  month={options.month}
                  sections={[
                    { field: 'includeOperationsInPdf', label: 'Loyers D’affrètement', amount: money(view.operationTotal, demo.contract.hireCurrency || 'EUR'), included: demo.period.includeOperationsInPdf !== false },
                    { field: 'includeExpensesInPdf', label: 'Services refacturables', amount: currencyAmounts(view.expenseTotalsByCurrency), included: demo.period.includeExpensesInPdf !== false },
                    { field: 'includeBbtmInPdf', label: 'Prestation BBTM', amount: money(view.serviceTotal), included: demo.period.includeBbtmInPdf !== false },
                    { field: 'includeRawInPdf', label: 'Saisie brute', amount: money(view.rawTotal), included: demo.period.includeRawInPdf !== false },
                  ]}
                  total={currencyAmounts(view.totalsByCurrency)}
                  clientReference={options.clientReference}
                  referenceDescription={`${billingReferenceScopeLabel(referenceScope)} · Même emplacement dans le PDF.`}
                  format={format}
                  busy={busy}
                  editable={!archived}
                  onInclusionChange={updateInclusion}
                  onReferenceChange={(value) => setOptions((current) => ({ ...current, clientReference: value }))}
                  onReferenceSave={saveReference}
                  onFormatChange={setFormat}
                  onPreview={() => void exportBilling('preview')}
                  onExport={() => void exportBilling('download')}
                />
                <div className="pp-billing-sections">
                <section className="pp-accordion">{accordionHeading('operations', 'Loyers D’affrètement', CalendarDays, view.operationTotal)}{expanded.operations && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>PDF</th><th>Date</th><th>Opération</th><th>Loyer HT</th></tr></thead><tbody>{view.rows.map((row) => <tr key={row.key}><td><input type="checkbox" aria-label={`Inclure la journée du ${row.dpr.reportDate}`} disabled={busy} checked={row.included} onChange={() => update((current) => ({ ...current, period: { ...current.period, excludedOperationKeys: row.included ? [...(current.period.excludedOperationKeys ?? []), row.key] : (current.period.excludedOperationKeys ?? []).filter((value) => value !== row.key) } }))} /></td><td>{date(row.dpr.reportDate)}</td><td>{row.operation}{row.comments && <small className="pp-muted">{row.comments}</small>}</td><td>{money(row.amountHt)}</td></tr>)}{!view.rows.length && <tr><td colSpan={4}>Aucun DPR pour cette période et ce navire.</td></tr>}</tbody></table></div>}</section>
                <section className="pp-accordion">
                  {accordionHeading('expenses', 'Services refacturables', Fuel, view.expenseTotalsByCurrency, `${demo.expenses.length} frais`)}
                  {expanded.expenses && <div className="pp-table-wrap"><table className="pp-table">
                    <thead><tr><th>Actions</th><th>PDF</th><th>Fournisseur / spécialité</th><th>Date / facture</th><th>Montant HT</th><th>Pièces</th></tr></thead>
                    <tbody>{demo.expenses.map((expense) => <tr key={expense.id} className={selectedExpense?.id === expense.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'expense', id: expense.id })}>
                      {billingLineActions('expense', expense.id, expense.supplier, () => expenseEditor(expense))}
                      <td><input type="checkbox" aria-label={`Inclure le frais ${expense.supplier}`} disabled={busy} checked={expense.includeInPdf !== false} onChange={(event) => update((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === expense.id ? { ...item, includeInPdf: event.target.checked } : item) }))} /></td>
                      <td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${expense.supplier}`} checked={selectedExpense?.id === expense.id} onChange={() => setSelection({ kind: 'expense', id: expense.id })} /> {expense.supplier}</label><small className="pp-muted">{expense.supplierSpecialties.join(' · ')}</small></td>
                      <td>{date(expense.invoiceDate)}<small className="pp-muted">{expense.invoiceNumber}</small></td><td>{money(expense.amountHt, expense.currency)}</td>
                      <td><div className="pp-row-proof">{expenseProofs(expense).length ? <button type="button" className="pp-proof-link" aria-label={`Voir les ${expenseProofs(expense).length} pièces de ${expense.supplier}`} onClick={(event) => { event.stopPropagation(); showExpenseProofs(expense); }}>{expenseProofs(expense).length} fichier{expenseProofs(expense).length > 1 ? 's' : ''}</button> : <span>Aucune pièce</span>}<button type="button" className="pp-button icon" disabled={archived || busy} aria-label={`Ajouter un justificatif à ${expense.supplier}`} title={`Ajouter un justificatif à ${expense.supplier}`} onClick={(event) => { event.stopPropagation(); uploadExpenseId.current = expense.id; upload.current?.click(); }}><FilePlus2 size={16} /></button></div></td>
                    </tr>)}{!demo.expenses.length && <tr><td colSpan={6}>Aucun frais pour ce mois. Utilisez le bouton Ajouter de cette section.</td></tr>}</tbody>
                  </table></div>}
                </section>
                <section className="pp-accordion">
                  {accordionHeading('services', 'Prestation BBTM', PackageCheck, view.serviceTotal, `${demo.services.length} prestation${demo.services.length > 1 ? 's' : ''}`)}
                  {expanded.services && <div className="pp-table-wrap"><table className="pp-table">
                    <thead><tr><th>Actions</th><th>Catégorie</th><th>Prix unitaire HT</th><th>Unités</th><th>Total HT</th></tr></thead>
                    <tbody>{view.services.map((service) => <tr key={service.id} className={selectedService?.id === service.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'service', id: service.id })}>
                      {billingLineActions('service', service.id, service.category, () => serviceEditor(service.id))}
                      <td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${service.category}`} checked={selectedService?.id === service.id} onChange={() => setSelection({ kind: 'service', id: service.id })} /> {service.category}</label></td><td>{money(service.unitAmountHt)}</td><td>{service.quantity}</td><td>{money(service.unitAmountHt * service.quantity)}</td>
                    </tr>)}{!demo.services.length && <tr><td colSpan={5}>Aucune prestation pour ce mois.</td></tr>}</tbody>
                  </table></div>}
                </section>
                <section className="pp-accordion">
                  {accordionHeading('raw', 'Saisie brute', FilePlus2, view.rawTotal, `${demo.rawLines.length} ligne${demo.rawLines.length > 1 ? 's' : ''}`)}
                  {expanded.raw && <>
                    <div className="pp-table-wrap"><table className="pp-table">
                      <thead><tr><th>Actions</th><th>Date</th><th>Désignation</th><th>Navire</th><th>Quantité</th><th>Prix unitaire HT</th><th>Total HT</th></tr></thead>
                      <tbody>{demo.rawLines.filter((line) => line.id !== activeRawDraft?.line?.id).map((line) => <tr key={line.id} className={selectedRawLine?.id === line.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'raw', id: line.id })}>
                        {billingLineActions('raw', line.id, line.designation, () => rawLineEditor(line))}
                        <td>{date(line.serviceDate)}</td><td><label><input type="radio" name="billing-row" aria-label={`Sélectionner ${line.designation}`} checked={selectedRawLine?.id === line.id} onChange={() => setSelection({ kind: 'raw', id: line.id })} />{line.designation}</label></td>
                        <td>{line.vesselName || '—'}</td><td>{line.quantity}</td><td>{money(line.unitAmountHt)}</td><td>{money(billingRawLineTotal(line))}</td>
                      </tr>)}{!demo.rawLines.length && !activeRawDraft && <tr><td colSpan={7}>Utilisez Ajouter une ligne pour commencer la saisie.</td></tr>}</tbody>
                      {activeRawDraft && <BillingRawLineDraft key={activeRawDraft.line?.id ?? 'new'} initialValues={activeRawDraft.values} vesselNames={demoVesselNames} editing={Boolean(activeRawDraft.line)} disabled={archived || busy} onChange={(values) => setRawDraft((current) => current ? { ...current, values } : null)} onSave={saveRawLine} onCancel={() => setRawDraft(null)} />}
                    </table></div>
                    {rawCreateActions()}
                  </>}
                </section>
                </div>

                </div>
                <input ref={upload} type="file" hidden multiple accept={EXPENSE_ATTACHMENT_ACCEPT} aria-label="Ajouter un justificatif" onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const expenseId = uploadExpenseId.current;
                  const expense = demo.expenses.find((item) => item.id === expenseId);
                  if (files.length && expense && !archived && !busy) {
                    const attachments = [...expenseProofs(expense), ...createExpenseAttachments(files)];
                    setProofs((current) => ({ ...current, [expense.id]: attachments }));
                    update((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === expense.id ? { ...item, attachmentName: attachments[0]?.name ?? '' } : item) }));
                    notify('Pièces jointes ajoutées à la démonstration locale.');
                  }
                  uploadExpenseId.current = null; event.currentTarget.value = '';
                }} />
              </>}
              {tab === 'operations' && <><div className="pp-section-heading"><div><h2>Opérations</h2><p className="pp-muted">Chaque opération est indépendante et liée au Planning.</p></div></div><div className="pp-commandbar"><button className="pp-button primary" disabled={archived} onClick={() => operationEditor()}><Plus size={18} />Nouvelle opération</button>{menuControl('operation', 'Opération sélectionnée', CalendarDays, [{ label: 'Modifier l’opération', icon: Pencil, action: () => operationEditor(selectedOperation) }, { label: 'Ouvrir dans Planning', icon: CalendarDays, action: () => setDialog({ title: 'Occurrence Planning — démonstration', content: <div className="pp-dialog-body"><h3>{selectedOperation?.title}</h3><p>{date(selectedOperation?.startsOn ?? '')} – {date(selectedOperation?.endsOn ?? '')}</p><p>{selectedOperation?.primaryVesselName}</p><Status value={selectedOperation?.status ?? 'Non validé'} /></div> }) }, { label: 'Supprimer l’opération', icon: Trash2, danger: true, action: removeSelection }], false, !selectedOperation || archived)}</div><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Mission</th><th>Période</th><th>Navire</th><th>Loyer</th><th>Documents</th><th>Statut</th></tr></thead><tbody>{[...demo.operations].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map((operation) => <tr key={operation.id} className={selectedOperation?.id === operation.id ? 'pp-selected-row' : ''} onClick={() => setSelection({ kind: 'operation', id: operation.id })}><td><label><input type="radio" name="operation" aria-label={`Sélectionner ${operation.title}`} checked={selectedOperation?.id === operation.id} onChange={() => setSelection({ kind: 'operation', id: operation.id })} /><strong>{operation.title}</strong></label></td><td>{date(operation.startsOn)}<small className="pp-muted">{date(operation.endsOn)}</small></td><td>{operation.primaryVesselName}</td><td>{money(operation.charterHire ?? 0)} / jour<small className="pp-muted">{operation.charterHireOverride ? 'Tarif personnalisé' : 'Barème contractuel copié'}</small></td><td>{operation.documentCount} fichier{operation.documentCount > 1 ? 's' : ''}</td><td><Status value={operation.status} /></td></tr>)}</tbody></table></div></>}
              {tab === 'identity' && <><h2>Identité du projet</h2><dl className="pp-grid-two">{[['Client', demo.project.clientName], ['Navire principal', demo.project.primaryVesselName], ['Livraison', `${date(demo.project.startsOn)} — ${demo.project.deliveryPort}`], ['Restitution', `${date(demo.project.endsOn)} — ${demo.project.redeliveryPort}`], ['Zone d’opération', demo.project.operationArea], ['Type de contrat', demo.project.contractType]].map(([label, value]) => <div key={label}><dt className="pp-muted">{label}</dt><dd>{value}</dd></div>)}</dl><p>{demo.project.description}</p><p className="pp-muted">La modification du dossier est accessible dans le menu Projet.</p></>}
              {tab === 'contract' && <><h2>Offre & contrat</h2><p className="pp-muted">L’offre commerciale est facultative et indépendante du contrat.</p><div className="pp-commandbar">{menuControl('contract', 'Documents', FileText, [{ label: 'Prévisualiser le contrat', action: () => setDialog({ title: `${demo.project.contractType} — démonstration`, content: <div className="pp-dialog-body"><h3>{demo.project.projectCode} — {demo.project.title}</h3><p>Armateur : {demo.contract.ownerIdentity}</p><p>Affréteur : {demo.project.clientName}</p><p>Navire : {demo.project.primaryVesselName}</p><p>Livraison : {date(demo.project.startsOn)}</p><p>Restitution : {date(demo.project.endsOn)}</p><p>Loyer : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Résumé de démonstration. La génération contractuelle complète reste celle du module existant.</p></div> }) }, { label: 'Consulter l’offre commerciale', action: () => setDialog({ title: 'Offre commerciale — démonstration', content: <div className="pp-dialog-body"><h3>{demo.project.title}</h3><p>Client : {demo.project.clientName}</p><p>Loyer proposé : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Cette consultation est indépendante du choix et de l’enregistrement du contrat.</p></div> }) }])}</div><h3>Contrat retenu</h3><p><strong>{demo.project.contractType}</strong></p><p>Navire : {demo.project.primaryVesselName}</p><p>Loyer contractuel : {money(demo.contract.charterHire ?? 0)} / jour</p><p className="pp-muted">Le type de contrat est enregistré depuis Modifier le projet.</p></>}
              {tab === 'documents' && <><h2>Documents du projet</h2><div className="pp-commandbar">{menuControl('documents', 'Documents', FileText, [{ label: 'Aperçu des éléments de facturation', action: () => void exportBilling('preview'), disabled: busy }, { label: 'Ouvrir SharePoint', action: () => window.open('https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets', '_blank', 'noopener,noreferrer') }])}</div><p className="pp-muted">Pièces de démonstration associées aux frais du mois.</p><ul>{demo.expenses.flatMap((expense) => expenseProofs(expense).map((attachment) => <li key={`${expense.id}/${attachment.id}`}><button type="button" className="pp-proof-link" onClick={() => void showProof(expense, attachment)}>{attachment.name}</button> — {expense.supplier}</li>))}</ul></>}
            </div>
          </section>
        </div>
        <p className="pp-muted pp-bottom-note">Préversion interactive — données de démonstration. Les changements restent dans cette session.</p>
      </main>
    </div>
    {toast && <div className="pp-toast" role="status"><Check size={18} />{toast}</div>}
    {editor && <EditorDialog editor={editor} onClose={() => setEditor(null)} />}
    {confirm && <Dialog title={confirm.title} onClose={() => setConfirm(null)}><div className="pp-dialog-body"><p>{confirm.message}</p></div><footer className="pp-dialog-actions"><button className="pp-button" onClick={() => setConfirm(null)}>Annuler</button><button className="pp-button danger" onClick={() => { confirm.action(); setConfirm(null); }}>Confirmer</button></footer></Dialog>}
    {dialog && <Dialog key={dialog.title} title={dialog.title} onClose={() => { setDialog(null); setPreviewUrl(''); setPreviewBlob(null); }}>{dialog.content ?? (previewBlob && <PreviewPdf blob={previewBlob} />)}<footer className="pp-dialog-actions">{previewUrl && <a className="pp-button" href={previewUrl} download={previewFileName}><Download size={17} />{previewBlob?.type === 'application/pdf' || previewFileName.toLowerCase().endsWith('.pdf') ? 'Télécharger le PDF' : 'Télécharger la pièce'}</a>}<button className="pp-button" onClick={() => { setDialog(null); setPreviewUrl(''); setPreviewBlob(null); }}>Fermer</button></footer></Dialog>}
  </div>;
}
