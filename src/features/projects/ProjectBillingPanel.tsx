import './ProjectWorkspace.css';
import { ProjectPdfPreview } from './ProjectPdfPreview';
import { ProjectBillingRawLines } from './ProjectBillingRawLines';
import { billingReferenceScope, billingReferenceScopeLabel, fetchBillingReferences, saveBillingReference, type BillingReference } from './projectBillingReferences';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetNames } from '../fleet/fleetDisplay';
import {
  CalendarRange,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Fuel,
  PackageCheck,
  Plus,
  ReceiptText,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { ServiceProviderEditorDialog } from '../serviceProviders/ServiceProviderEditorDialog';
import { ServiceProviderPicker } from '../serviceProviders/ServiceProviderPicker';
import {
  fetchServiceProviders,
  saveServiceProviderWithPrimarySpecialty,
  serviceProviderDraft,
  serviceProviderSpecialtyNames,
  serviceProviderTypeOptions,
  type ServiceProvider,
  type ServiceProviderDraft,
} from '../serviceProviders/serviceProviders';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';
import { ServiceCatalogDialog } from './ProjectCatalogDialogs';
import {
  automaticBillingServiceQuantity,
  billingExpenseAttachmentName,
  billingExpenseSpecialtyLabel,
  billingOperationKey,
  billingApplicableHire,
  contractHireModeForOperation,
  billingServicesTotal,
  billingRawLinesTotal,
  completeBillingDprs,
  countDailyOperations,
  defaultProjectClientReference,
  deleteProjectBillingService,
  deleteProjectBillingRawLine,
  deleteProjectChargeableExpense,
  fetchProjectBillingData,
  fetchProjectBillingDprs,
  fetchProjectServiceCatalog,
  ensureProjectBillingPeriod,
  generateBillingExportPackage,
  missingBillingDates,
  saveProjectBillingPeriod,
  saveProjectBillingPdfSelection,
  saveProjectBillingService,
  saveProjectBillingRawLine,
  saveProjectChargeableExpense,
  setProjectChargeableExpensePdfInclusion,
  signedProjectBillingDocumentUrl,
  uploadProjectBillingDocument,
  type BillingExpenseDraft,
  type BillingRawLineDraft,
  type BillingExportFormat,
  type BillingPeriodDraft,
  type BillingPeriodMode,
  type BillingServiceDraft,
  type ProjectBillingData,
  type ProjectBillingDpr,
  type ProjectBillingDocument,
  type ProjectBillingPeriod,
  type ProjectBillingService,
  type ProjectBillingRawLine,
  type ProjectChargeableExpense,
  type ProjectServiceCatalogEntry,
} from './projectBilling';

const EMPTY_DATA: ProjectBillingData = { periods: [], expenses: [], documents: [], services: [] };
const BILLING_UNIT_OPTIONS = ['Unité', 'm²', 'm³', 'L'];

interface BillingServiceLineDraft extends BillingServiceDraft {
  key: string;
  id?: number;
  quantityEdited?: boolean;
}

function serviceLineFromEntry(entry: ProjectServiceCatalogEntry, quantity = 0): BillingServiceLineDraft {
  return {
    key: `new-${entry.id}-${Date.now()}`,
    serviceCatalogId: entry.id,
    category: entry.category,
    descriptionHtml: entry.descriptionHtml,
    unitAmountHt: entry.unitAmountHt,
    quantity,
  };
}

function serviceLineFromSaved(service: ProjectBillingService): BillingServiceLineDraft {
  return { ...service, key: `saved-${service.id}`, quantityEdited: true };
}

export interface ProjectBillingSectionVisibility {
  services: boolean;
  bbtm: boolean;
  billingElements: boolean;
  raw?: boolean;
}

const ALL_BILLING_SECTIONS: ProjectBillingSectionVisibility = {
  services: true,
  bbtm: true,
  billingElements: true,
  raw: true,
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function money(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value);
}

function billingDraft(project: ProjectRecord, period?: ProjectBillingPeriod): BillingPeriodDraft {
  return {
    periodMonth: period?.periodMonth.slice(0, 7) || currentMonth(),
    clientReference: period?.clientReference || defaultProjectClientReference(project),
    invoiceNumber: period?.invoiceNumber || '',
    invoiceIssuedOn: period?.invoiceIssuedOn || '',
    invoiceSentOn: period?.invoiceSentOn || '',
    paymentDueOn: period?.paymentDueOn || '',
    paidOn: period?.paidOn || '',
    amountHt: period?.amountHt || 0,
    comments: period?.comments || '',
    includeOperationsInPdf: period?.includeOperationsInPdf !== false,
    includeExpensesInPdf: period?.includeExpensesInPdf !== false,
    includeBbtmInPdf: period?.includeBbtmInPdf !== false,
    includeRawInPdf: period?.includeRawInPdf !== false,
    excludedOperationKeys: period?.excludedOperationKeys || [],
  };
}

function expenseDraft(periodMonth: string, expense?: ProjectChargeableExpense): BillingExpenseDraft {
  return {
    category: expense?.category || 'other',
    nature: expense?.nature || '',
    supplier: expense?.supplier || '',
    supplierSpecialties: expense?.supplierSpecialties || [],
    invoiceDate: expense?.invoiceDate || `${periodMonth}-01`,
    invoiceNumber: expense?.invoiceNumber || '',
    amountHt: expense?.amountHt || 0,
    amountTtc: expense?.amountTtc ?? null,
    currency: expense?.currency || 'EUR',
    quantity: expense?.quantity ?? null,
    unit: expense?.unit || '',
    comments: expense?.comments || '',
    dprReportId: expense?.dprReportId ?? null,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ProjectBillingPanel({
  client,
  contract,
  initialMonth,
  isManager,
  operations,
  project,
  showMonthSelector = true,
  visibleSections = ALL_BILLING_SECTIONS,
  workspace = false,
}: {
  client: SupabaseClient;
  contract?: ProjectContractRecord;
  initialMonth?: string;
  isManager: boolean;
  operations: ProjectPlanningOccurrenceRecord[];
  project: ProjectRecord;
  showMonthSelector?: boolean;
  visibleSections?: ProjectBillingSectionVisibility;
  workspace?: boolean;
}) {
  const [billingView, setBillingView] = useState<'hire' | 'expenses' | 'services' | 'raw' | 'followup'>('hire');
  const [rawLinesDirty, setRawLinesDirty] = useState(false);
  const defaultMonth = initialMonth?.slice(0, 7) || currentMonth();
  const [data, setData] = useState<ProjectBillingData>(EMPTY_DATA);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [periodDraft, setPeriodDraft] = useState<BillingPeriodDraft>(() => ({
    ...billingDraft(project),
    periodMonth: defaultMonth,
  }));
  const [expenseEditor, setExpenseEditor] = useState<{
    id?: number;
    draft: BillingExpenseDraft;
  } | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [providerEditor, setProviderEditor] = useState<ServiceProviderDraft | null>(null);
  const [periodMode, setPeriodMode] = useState<BillingPeriodMode>('calendar-month');
  const [customStart, setCustomStart] = useState(`${currentMonth()}-01`);
  const [customEnd, setCustomEnd] = useState(monthRange(currentMonth()).end);
  const [vesselFilter, setVesselFilter] = useState('');
  const [dprs, setDprs] = useState<ProjectBillingDpr[]>([]);
  const [dprsLoading, setDprsLoading] = useState(false);
  const [completeMissingDays, setCompleteMissingDays] = useState(false);
  const [serviceCatalog, setServiceCatalog] = useState<ProjectServiceCatalogEntry[]>([]);
  const initializedServices = useRef('');
  const [serviceDrafts, setServiceDrafts] = useState<BillingServiceLineDraft[]>([]);
  const [serviceCatalogOpen, setServiceCatalogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<BillingExportFormat>('pdf');
  const [legacyReferenceScope, setLegacyReferenceScope] = useState<number | null>(null);
  const [references, setReferences] = useState<BillingReference[]>([]);
  const [referenceDrafts, setReferenceDrafts] = useState<Record<number, string>>({});
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const contextRevision = useRef(0);
  const referenceContext = useRef<{ client: SupabaseClient; projectId: number } | null>({ client, projectId: project.id });
  const autoCreatedPeriodId = useRef<number | null>(null);
  const editedInvoiceFields = useRef(new Set<keyof BillingPeriodDraft>());
  const pendingPeriods = useRef(new Map<string, Promise<ProjectBillingPeriod>>());
  const referenceQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingReferences = useRef(new Map<string, { value: string; promise: Promise<void> }>());
  const referenceSaveCount = useRef(0);
  const [savingReference, setSavingReference] = useState(false);

  useEffect(() => {
    referenceContext.current = { client, projectId: project.id };
    return () => { referenceContext.current = null; };
  }, [client, project.id]);

  async function reload() {
    const revision = contextRevision.current;
    setBusy('load');
    setError('');
    try {
      const [billingData, catalog, savedReferences] = await Promise.all([
        fetchProjectBillingData(client, project.id),
        fetchProjectServiceCatalog(client),
        fetchBillingReferences(client, project.id),
      ]);
      if (revision !== contextRevision.current) return;
      setData(billingData);
      setServiceCatalog(catalog);
      setReferences(savedReferences);
    } catch (caught) {
      if (revision === contextRevision.current) setError(caught instanceof Error ? caught.message : 'La facturation est indisponible.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  useEffect(() => {
    contextRevision.current += 1;
    pendingPeriods.current.clear();
    autoCreatedPeriodId.current = null;
    editedInvoiceFields.current.clear();
    const month = initialMonth?.slice(0, 7) || currentMonth();
    setData(EMPTY_DATA);
    setReferences([]);
    setReferenceDrafts({});
    setSelectedMonth(month);
    setPeriodDraft({ ...billingDraft(project), periodMonth: month });
    const range = monthRange(month);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setDprs([]);
    setCompleteMissingDays(false);
    setServiceDrafts([]);
    setRawLinesDirty(false);
    void reload();
    void reloadServiceProviders();
    return () => { contextRevision.current += 1; };
  }, [initialMonth, project.id, client]);

  const selectedPeriod = data.periods.find((period) => period.periodMonth.startsWith(selectedMonth));
  useEffect(() => {
    if (selectedPeriod) {
      if (autoCreatedPeriodId.current === selectedPeriod.id) autoCreatedPeriodId.current = null;
      else setPeriodDraft(billingDraft(project, selectedPeriod));
      setLegacyReferenceScope(billingReferenceScope({ ...selectedPeriod, includeRawInPdf: selectedPeriod.includeRawInPdf !== false && (data.rawLines || []).some((line) => line.billingPeriodId === selectedPeriod.id) }));
    }
  }, [selectedPeriod?.id]);
  const periodExpenses = selectedPeriod
    ? data.expenses.filter((expense) => expense.billingPeriodId === selectedPeriod.id)
    : [];
  const periodDocuments = selectedPeriod
    ? data.documents.filter((document) => document.billingPeriodId === selectedPeriod.id)
    : [];
  const periodServices = useMemo(
    () => selectedPeriod
      ? data.services.filter((service) => service.billingPeriodId === selectedPeriod.id)
      : [],
    [data.services, selectedPeriod?.id],
  );
  const periodRawLines = useMemo(
    () => selectedPeriod ? (data.rawLines || []).filter((line) => line.billingPeriodId === selectedPeriod.id) : [],
    [data.rawLines, selectedPeriod?.id],
  );
  const expenseTotal = periodExpenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  const providerCategories = useMemo(
    () => Array.from(new Set(serviceProviders.map((provider) => provider.category).filter((category) => category !== 'Non classé'))).sort((left, right) => left.localeCompare(right, 'fr')),
    [serviceProviders],
  );
  const providerServiceTypes = useMemo(() => serviceProviderTypeOptions(serviceProviders), [serviceProviders]);
  const unitOptions = useMemo(
    () => Array.from(new Set([...BILLING_UNIT_OPTIONS, ...data.expenses.map((expense) => expense.unit).filter(Boolean)])),
    [data.expenses],
  );
  const vesselOptions = useMemo(
    () => Array.from(new Set(operations.map((operation) => operation.primaryVesselName).filter(Boolean))).sort(compareFleetNames),
    [operations],
  );
  const exportRange = periodMode === 'calendar-month'
    ? monthRange(selectedMonth)
    : { start: customStart, end: customEnd };
  const calendarRange = monthRange(selectedMonth);
  const dprRange = project.projectCode.trim().toUpperCase() === 'P144' ? {
    start: exportRange.start < calendarRange.start ? exportRange.start : calendarRange.start,
    end: exportRange.end > calendarRange.end ? exportRange.end : calendarRange.end,
  } : exportRange;
  const selectedOperation = operations.find((operation) => (
    (!vesselFilter || operation.primaryVesselName === vesselFilter)
    && operation.startsOn <= exportRange.end
    && operation.endsOn >= exportRange.start
  ));
  const selectedVesselName = vesselFilter
    || selectedOperation?.primaryVesselName
    || project.primaryVesselName
    || '';
  const periodDprs = dprs.filter((dpr) => dpr.reportDate >= exportRange.start && dpr.reportDate <= exportRange.end);
  const missingDates = missingBillingDates(periodDprs, exportRange.start, exportRange.end);
  const exportDprs = completeMissingDays
    ? completeBillingDprs(periodDprs, exportRange.start, exportRange.end, {
      vesselName: selectedVesselName,
      amountHt: null,
    })
    : periodDprs;
  const defaultServiceQuantity = countDailyOperations(periodDprs.filter((dpr) => !(selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys).includes(billingOperationKey(dpr))));
  const calculatedServiceDrafts = serviceDrafts.map((service) => ({
    ...service,
    quantity: automaticBillingServiceQuantity(project, service.category, selectedMonth, dprs) ?? service.quantity,
  }));
  const rawLinesForExport = periodRawLines.filter((line) => line.serviceDate >= exportRange.start && line.serviceDate <= exportRange.end);
  const referenceScope = billingReferenceScope({
    ...(selectedPeriod || periodDraft),
    includeRawInPdf: (selectedPeriod?.includeRawInPdf ?? periodDraft.includeRawInPdf) !== false
      && rawLinesForExport.length > 0,
  });
  const savedReference = references.find((reference) => reference.scope === referenceScope);
  const exportReference = referenceDrafts[referenceScope] ?? savedReference?.reference ?? (legacyReferenceScope === referenceScope || legacyReferenceScope === null ? selectedPeriod?.clientReference || periodDraft.clientReference : '');
  function storeReference(automatic = false): Promise<void> {
    if (!isManager || !exportReference.trim() || (automatic && referenceDrafts[referenceScope] === undefined)) return Promise.resolve();
    const value = exportReference.trim();
    const key = `${project.id}/${referenceScope}`;
    const pending = pendingReferences.current.get(key);
    if (pending?.value === value) return pending.promise;
    if (!pending && savedReference?.reference === value) return Promise.resolve();
    const revision = contextRevision.current;
    const projectId = project.id;
    const scope = referenceScope;
    referenceSaveCount.current += 1;
    setSavingReference(true);
    setError('');
    const request = referenceQueue.current.catch(() => undefined).then(async () => {
      await saveBillingReference(client, projectId, scope, value);
      const saved = await fetchBillingReferences(client, projectId);
      if (referenceContext.current?.client !== client || referenceContext.current.projectId !== projectId) return;
      setReferences(saved);
      if (revision === contextRevision.current) setMessage('Référence enregistrée automatiquement pour ce contenu.');
    }).catch((caught: unknown) => {
      if (revision === contextRevision.current) setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la référence.');
      throw caught;
    }).finally(() => {
      if (pendingReferences.current.get(key)?.promise === request) pendingReferences.current.delete(key);
      referenceSaveCount.current -= 1;
      setSavingReference(referenceSaveCount.current > 0);
    });
    pendingReferences.current.set(key, { value, promise: request });
    referenceQueue.current = request;
    return request;
  }
  const serviceForExport: ProjectBillingService[] = calculatedServiceDrafts
    .filter((service) => service.category.trim())
    .map((service) => ({
      id: service.id || 0,
      billingPeriodId: selectedPeriod?.id || 0,
      serviceCatalogId: service.serviceCatalogId,
      category: service.category,
      descriptionHtml: service.descriptionHtml,
      unitAmountHt: service.unitAmountHt,
      quantity: service.quantity,
      includeInPdf: true,
    }));

  useEffect(() => {
    let cancelled = false;
    if (!exportRange.start || !exportRange.end || exportRange.end < exportRange.start) {
      setDprs([]);
      setDprsLoading(false);
      return () => { cancelled = true; };
    }
    setBusy((current) => current || 'dprs');
    setDprsLoading(true);
    setDprs([]);
    void fetchProjectBillingDprs(client, project.id, dprRange.start, dprRange.end, vesselFilter)
      .then((rows) => {
        if (!cancelled) setDprs(rows);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les DPR.');
      })
      .finally(() => {
        if (!cancelled) {
          setDprsLoading(false);
          setBusy((current) => current === 'dprs' ? '' : current);
        }
      });
    return () => { cancelled = true; };
  }, [client, project.id, exportRange.start, exportRange.end, dprRange.start, dprRange.end, vesselFilter]);

  useEffect(() => {
    // Creating the monthly row must not reset unsaved service lines.
    const key = `${project.id}/${selectedMonth}`;
    const reset = initializedServices.current !== key;
    initializedServices.current = key;
    setServiceDrafts((current) => {
      if (!reset && current.length) return current;
      return periodServices.length ? periodServices.map(serviceLineFromSaved) : serviceCatalog[0] ? [serviceLineFromEntry(serviceCatalog[0], defaultServiceQuantity)] : [];
    });
  }, [periodServices, serviceCatalog, selectedPeriod?.id, selectedMonth, project.id]);

  useEffect(() => {
      setServiceDrafts((current) => current.map((service) => (
        service.id || service.quantityEdited ? service : { ...service, quantity: defaultServiceQuantity }
      )));
  }, [defaultServiceQuantity, periodServices.length, serviceCatalog]);

  function selectMonth(month: string) {
    setRawLinesDirty(false);
    contextRevision.current += 1;
    autoCreatedPeriodId.current = null;
    editedInvoiceFields.current.clear();
    setBusy('');
    setError('');
    setMessage('');
    const normalized = month.slice(0, 7);
    setSelectedMonth(normalized);
    const period = data.periods.find((item) => item.periodMonth.startsWith(normalized));
    setPeriodDraft({ ...billingDraft(project, period), periodMonth: normalized });
    setLegacyReferenceScope(period ? billingReferenceScope({ ...period, includeRawInPdf: period.includeRawInPdf !== false && (data.rawLines || []).some((line) => line.billingPeriodId === period.id) }) : null);
    setReferenceDrafts({});
    const range = monthRange(normalized);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setCompleteMissingDays(false);
    setPreviewBlob(null);
  }

  function editInvoiceDraft(changes: Partial<BillingPeriodDraft>) {
    for (const field of Object.keys(changes) as (keyof BillingPeriodDraft)[]) editedInvoiceFields.current.add(field);
    setPeriodDraft((current) => ({ ...current, ...changes }));
  }

  async function getOrCreatePeriod(draft = periodDraft): Promise<ProjectBillingPeriod> {
    if (selectedPeriod) return selectedPeriod;
    if (!isManager) throw new Error('Aucune fiche de facturation n’est disponible pour ce mois.');
    const revision = contextRevision.current;
    const key = `${project.id}/${draft.periodMonth.slice(0, 7)}`;
    let request = pendingPeriods.current.get(key);
    if (!request) {
      request = ensureProjectBillingPeriod(client, project.id, draft);
      pendingPeriods.current.set(key, request);
    }
    try {
      const saved = await request;
      if (revision !== contextRevision.current) throw new Error('Le mois ou le projet a changé.');
      autoCreatedPeriodId.current = saved.id;
      setPeriodDraft((current) => ({
        ...billingDraft(project, saved),
        ...Object.fromEntries([...editedInvoiceFields.current].map((field) => [field, current[field]])),
      }));
      setData((current) => ({ ...current, periods: [saved, ...current.periods.filter((period) => period.id !== saved.id && period.periodMonth.slice(0, 7) !== saved.periodMonth.slice(0, 7))] }));
      return saved;
    } finally {
      if (pendingPeriods.current.get(key) === request) pendingPeriods.current.delete(key);
    }
  }

  async function updatePeriodPdfSelection(
    changes: Partial<Pick<BillingPeriodDraft,
      'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'includeRawInPdf' | 'excludedOperationKeys'>>,
  ) {
    if (!isManager || busy) return;
    const revision = contextRevision.current;
    const selection = {
      includeOperationsInPdf: changes.includeOperationsInPdf ?? selectedPeriod?.includeOperationsInPdf ?? periodDraft.includeOperationsInPdf,
      includeExpensesInPdf: changes.includeExpensesInPdf ?? selectedPeriod?.includeExpensesInPdf ?? periodDraft.includeExpensesInPdf,
      includeBbtmInPdf: changes.includeBbtmInPdf ?? selectedPeriod?.includeBbtmInPdf ?? periodDraft.includeBbtmInPdf,
      includeRawInPdf: changes.includeRawInPdf ?? selectedPeriod?.includeRawInPdf ?? periodDraft.includeRawInPdf ?? true,
      excludedOperationKeys: changes.excludedOperationKeys ?? selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys,
    };
    setBusy('selection');
    setError('');
    setData((current) => ({
      ...current,
      periods: current.periods.map((period) => period.id === selectedPeriod?.id ? { ...period, ...selection } : period),
    }));
    setPeriodDraft((current) => ({ ...current, ...selection }));
    try {
      const period = await getOrCreatePeriod({ ...periodDraft, ...selection });
      await saveProjectBillingPdfSelection(client, period.id, selection);
      if (revision !== contextRevision.current) return;
      setData((current) => ({ ...current, periods: current.periods.map((item) => item.id === period.id ? { ...item, ...selection } : item) }));
      setMessage('Sélection du PDF enregistrée.');
    } catch (caught) {
      if (revision !== contextRevision.current) return;
      await reload();
      if (revision === contextRevision.current) setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la sélection du PDF.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  async function reloadServiceProviders() {
    try {
      setServiceProviders(await fetchServiceProviders(client));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le référentiel fournisseurs est indisponible.');
    }
  }

  async function toggleExpensePdf(expense: ProjectChargeableExpense) {
    if (!isManager || busy) return;
    const includeInPdf = expense.includeInPdf === false;
    setBusy('selection');
    setData((current) => ({
      ...current,
      expenses: current.expenses.map((item) => item.id === expense.id ? { ...item, includeInPdf } : item),
    }));
    try {
      await setProjectChargeableExpensePdfInclusion(client, expense.id, includeInPdf);
      setMessage('Sélection du PDF enregistrée.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de modifier cette ligne du PDF.');
      await reload();
    } finally {
      setBusy('');
    }
  }

  async function savePeriod() {
    if (!isManager || busy) return;
    const revision = contextRevision.current;
    setBusy('period');
    setError('');
    try {
      const savedResult = await saveProjectBillingPeriod(client, project.id, periodDraft);
      if (revision !== contextRevision.current) return;
      const savedMonth = savedResult.periodMonth.slice(0, 7) || periodDraft.periodMonth.slice(0, 7);
      const saved = {
        ...savedResult,
        periodMonth: `${savedMonth}-01`,
        clientReference: savedResult.clientReference || periodDraft.clientReference,
      };
      setData((current) => ({
        ...current,
        periods: [saved, ...current.periods.filter((period) => period.id !== saved.id)],
      }));
      setPeriodDraft({ ...billingDraft(project, saved), periodMonth: savedMonth });
      editedInvoiceFields.current.clear();
      setMessage('Paramètres du mois enregistrés.');
    } catch (caught) {
      if (revision !== contextRevision.current) return;
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la facturation.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  async function saveExpense() {
    if (!isManager || !expenseEditor || busy) return;
    const revision = contextRevision.current;
    if (!expenseEditor.draft.supplier || !expenseEditor.draft.invoiceDate || expenseEditor.draft.amountHt <= 0) {
      setError('Renseignez le fournisseur, la date et un montant HT supérieur à 0.');
      return;
    }
    setBusy('expense');
    setError('');
    try {
      const period = await getOrCreatePeriod();
      const saved = await saveProjectChargeableExpense(
        client,
        project.id,
        period.id,
        expenseEditor.draft,
        expenseEditor.id,
      );
      if (revision !== contextRevision.current) return;
      setData((current) => ({
        ...current,
        expenses: [saved, ...current.expenses.filter((expense) => expense.id !== saved.id)],
      }));
      setExpenseEditor(null);
      setMessage('Frais imputable enregistré.');
    } catch (caught) {
      if (revision !== contextRevision.current) return;
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer ce frais.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  function openExpenseEditor(expense?: ProjectChargeableExpense) {
    const draft = expenseDraft(selectedMonth, expense);
    const provider = serviceProviders.find((item) => item.name.localeCompare(draft.supplier, 'fr', { sensitivity: 'base' }) === 0);
    const specialties = draft.supplierSpecialties.length ? draft.supplierSpecialties : provider ? serviceProviderSpecialtyNames(provider) : [];
    setExpenseEditor({
      id: expense?.id,
      draft: {
        ...draft,
        category: 'other',
        nature: specialties.join(' · '),
        supplierSpecialties: specialties,
      },
    });
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerEditor || busy) return;
    if (!providerEditor.name.trim()) {
      setError('Le nom de la société est obligatoire.');
      return;
    }
    setBusy('provider');
    setError('');
    try {
      const saved = await saveServiceProviderWithPrimarySpecialty(client, providerEditor);
      const specialties = serviceProviderSpecialtyNames(saved);
      setServiceProviders((current) => [...current.filter((provider) => provider.id !== saved.id), saved]);
      setExpenseEditor((current) => current ? {
        ...current,
        draft: {
          ...current.draft,
          category: 'other',
          nature: specialties.join(' · '),
          supplier: saved.name,
          supplierSpecialties: specialties,
        },
      } : current);
      setProviderEditor(null);
      setMessage('Société ajoutée au référentiel Supabase.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la société.');
    } finally {
      setBusy('');
    }
  }

  async function removeExpense(expense: ProjectChargeableExpense) {
    if (!isManager || busy || !window.confirm(`Supprimer le frais ${expense.invoiceNumber || expense.supplier} ?`)) return;
    setBusy(`delete-${expense.id}`);
    setError('');
    try {
      await deleteProjectChargeableExpense(client, expense.id);
      setData((current) => ({ ...current, expenses: current.expenses.filter((item) => item.id !== expense.id) }));
      setMessage('Frais supprimé.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de supprimer ce frais.');
    } finally {
      setBusy('');
    }
  }

  function updateServiceDraft(key: string, changes: Partial<BillingServiceLineDraft>) {
    setServiceDrafts((current) => current.map((service) => service.key === key ? { ...service, ...changes, quantityEdited: changes.quantity !== undefined ? true : service.quantityEdited } : service));
  }

  function selectServiceCategory(key: string, catalogId: number) {
    const entry = serviceCatalog.find((item) => item.id === catalogId);
    if (!entry) return;
    updateServiceDraft(key, {
      serviceCatalogId: entry.id,
      category: entry.category,
      descriptionHtml: entry.descriptionHtml,
      unitAmountHt: entry.unitAmountHt,
    });
  }

  function addServiceDraft() {
    const usedCatalogIds = new Set(serviceDrafts.map((service) => service.serviceCatalogId));
    const next = serviceCatalog.find((entry) => !usedCatalogIds.has(entry.id));
    if (!next) {
      setError(serviceCatalog.length
        ? 'Toutes les catégories actives sont déjà présentes sur cette période.'
        : 'Ajoutez d’abord une catégorie au catalogue des prestations.');
      return;
    }
    setServiceDrafts((current) => [...current, serviceLineFromEntry(next, defaultServiceQuantity)]);
    setError('');
  }

  async function saveService(serviceDraft: BillingServiceLineDraft) {
    if (!isManager || busy) return;
    const revision = contextRevision.current;
    if (!serviceDraft.serviceCatalogId || !serviceDraft.category.trim()) {
      setError('Sélectionnez une catégorie de prestation.');
      return;
    }
    if (serviceDraft.unitAmountHt < 0 || serviceDraft.quantity < 0) {
      setError('Le montant unitaire et le nombre d’unités doivent être positifs.');
      return;
    }
    setBusy(`service-${serviceDraft.key}`);
    setError('');
    try {
      const period = await getOrCreatePeriod();
      const saved = await saveProjectBillingService(client, project.id, period.id, {
        serviceCatalogId: serviceDraft.serviceCatalogId,
        category: serviceDraft.category,
        descriptionHtml: serviceDraft.descriptionHtml,
        unitAmountHt: serviceDraft.unitAmountHt,
        quantity: serviceDraft.quantity,
      }, serviceDraft.id);
      if (revision !== contextRevision.current) return;
      setData((current) => ({
        ...current,
        services: [saved, ...current.services.filter((service) => service.id !== saved.id)],
      }));
      setServiceDrafts((current) => current.map((draft) => draft.key === serviceDraft.key ? { ...draft, id: saved.id, quantityEdited: true } : draft));
      setMessage(`${saved.category} enregistrée dans les prestations BBTM.`);
    } catch (caught) {
      if (revision !== contextRevision.current) return;
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la prestation BBTM.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  async function removeService(serviceDraft: BillingServiceLineDraft) {
    if (!isManager || busy) return;
    if (!serviceDraft.id) {
      setServiceDrafts((current) => current.filter((service) => service.key !== serviceDraft.key));
      return;
    }
    if (!window.confirm(`Supprimer la prestation « ${serviceDraft.category} » de cette période ?`)) return;
    setBusy(`service-delete-${serviceDraft.id}`);
    setError('');
    try {
      await deleteProjectBillingService(client, serviceDraft.id);
      setData((current) => ({
        ...current,
        services: current.services.filter((service) => service.id !== serviceDraft.id),
      }));
      setServiceDrafts((current) => current.filter((draft) => draft.key !== serviceDraft.key));
      setMessage('Prestation supprimée de cette période.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de supprimer la prestation.');
    } finally {
      setBusy('');
    }
  }

  async function uploadDocument(file: File, expense: ProjectChargeableExpense) {
    if (!selectedPeriod || busy) return;
    setBusy('upload');
    setError('');
    try {
      const renamedFile = billingExpenseAttachmentName(file, expense);
      const document = await uploadProjectBillingDocument(client, {
        projectId: project.id,
        billingPeriodId: selectedPeriod.id,
        expenseId: expense.id,
        file: renamedFile,
        kind: 'chargeable_expense',
      });
      setData((current) => ({ ...current, documents: [document, ...current.documents] }));
      setMessage('Document stocké dans l’espace privé du projet.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’ajouter ce document.');
    } finally {
      setBusy('');
    }
  }

  async function openDocument(document: ProjectBillingDocument) {
    setBusy(`open-${document.id}`);
    setError('');
    try {
      window.open(await signedProjectBillingDocumentUrl(client, document), '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’ouvrir ce document.');
    } finally {
      setBusy('');
    }
  }

  async function saveRawLine(draft: BillingRawLineDraft, id?: number): Promise<ProjectBillingRawLine> {
    if (!isManager || busy) throw new Error('La saisie brute est momentanément indisponible.');
    const revision = contextRevision.current;
    setBusy('raw-line');
    try {
      const period = await getOrCreatePeriod();
      const saved = await saveProjectBillingRawLine(client, project.id, period.id, draft, id);
      if (referenceContext.current?.client !== client || referenceContext.current.projectId !== project.id) {
        throw new Error('Le projet a changé pendant l’enregistrement.');
      }
      // The cache contains every month: keep completed writes when only the selected month changed.
      setData((current) => ({ ...current, rawLines: [...(current.rawLines || []).filter((line) => line.id !== saved.id), saved] }));
      return saved;
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  async function removeRawLine(id: number): Promise<void> {
    if (!isManager || busy) throw new Error('La saisie brute est momentanément indisponible.');
    const revision = contextRevision.current;
    setBusy('raw-line');
    try {
      await deleteProjectBillingRawLine(client, id);
      if (referenceContext.current?.client !== client || referenceContext.current.projectId !== project.id) return;
      setData((current) => ({ ...current, rawLines: (current.rawLines || []).filter((line) => line.id !== id) }));
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  async function createExport(mode: 'preview' | 'download') {
    if (busy || dprsLoading || rawLinesDirty) return;
    const revision = contextRevision.current;
    if (!exportRange.start || !exportRange.end || exportRange.end < exportRange.start) {
      setError('La période d’export est invalide.');
      return;
    }
    setBusy('export');
    setError('');
    try {
      const period = await getOrCreatePeriod();
      await storeReference(true);
      if (revision !== contextRevision.current) return;
      // A concurrent creation may have saved a different PDF selection.
      const periodReferenceScope = billingReferenceScope({ ...period, includeRawInPdf: period.includeRawInPdf !== false && rawLinesForExport.length > 0 });
      const periodReference = referenceDrafts[periodReferenceScope]
        ?? references.find((reference) => reference.scope === periodReferenceScope)?.reference
        ?? (legacyReferenceScope === periodReferenceScope || legacyReferenceScope === null ? period.clientReference || defaultProjectClientReference(project) : '');
      const result = await generateBillingExportPackage(client, {
        project,
        contract,
        operations,
        period: { ...period, clientReference: periodReference || '—' },
        expenses: periodExpenses,
        services: serviceForExport,
        rawLines: rawLinesForExport,
        includeBbtmService: period.includeBbtmInPdf !== false,
        dprs: exportDprs,
        monthlyDprs: dprs,
        selectedVesselName,
        startDate: exportRange.start,
        endDate: exportRange.end,
      }, periodDocuments.filter((document) => document.chargeableExpenseId !== null), mode === 'preview' ? 'pdf' : exportFormat);
      if (revision !== contextRevision.current) return;
      const fileName = `${project.projectCode || `P${project.id}`}-Elements-facturation-${selectedMonth}.${result.extension}`;
      if (mode === 'download') {
        if (isManager) {
          const stored = await uploadProjectBillingDocument(client, { projectId: project.id, billingPeriodId: period.id, file: new File([result.blob], fileName, { type: result.blob.type }), kind: 'export' });
          if (revision !== contextRevision.current) return;
          setData((current) => ({ ...current, documents: [stored, ...current.documents] }));
        }
        downloadBlob(result.blob, fileName);
      }
      else {
        setPreviewBlob(result.blob);
      }
      setMessage(mode === 'download' ? 'Export PDF généré.' : 'Aperçu actualisé.');
    } catch (caught) {
      if (revision !== contextRevision.current) return;
      setError(caught instanceof Error ? caught.message : 'Impossible de générer l’export.');
    } finally {
      if (revision === contextRevision.current) setBusy('');
    }
  }

  const hireDays = [...exportDprs].filter((dpr) => dpr.reportDate >= exportRange.start && dpr.reportDate <= exportRange.end)
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate) || left.id - right.id);
  const dayAmount = (dpr: ProjectBillingDpr) => dpr.amountHt ?? billingApplicableHire(operations, contract, dpr.reportDate, dpr.vesselName || selectedVesselName, contractHireModeForOperation(dpr.operation)) ?? 0;
  const includedHireTotal = selectedPeriod?.includeOperationsInPdf === false ? 0 : hireDays.filter((dpr) => !(selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys).includes(billingOperationKey(dpr))).reduce((sum, dpr) => sum + dayAmount(dpr), 0);
  const includedExpenses = selectedPeriod?.includeExpensesInPdf === false ? [] : periodExpenses.filter((expense) => expense.includeInPdf !== false);
  const includedServiceTotal = selectedPeriod?.includeBbtmInPdf === false ? 0 : billingServicesTotal(serviceForExport);
  const includedRawTotal = (selectedPeriod?.includeRawInPdf ?? periodDraft.includeRawInPdf) === false ? 0 : billingRawLinesTotal(rawLinesForExport);
  const expenseByCurrency = new Map<string, number>();
  includedExpenses.forEach((expense) => expenseByCurrency.set(expense.currency, (expenseByCurrency.get(expense.currency) || 0) + expense.amountHt));
  const totalsByCurrency = new Map(expenseByCurrency);
  const hireCurrency = contract?.hireCurrency || 'EUR';
  totalsByCurrency.set(hireCurrency, (totalsByCurrency.get(hireCurrency) || 0) + includedHireTotal);
  if (includedServiceTotal) totalsByCurrency.set('EUR', (totalsByCurrency.get('EUR') || 0) + includedServiceTotal);
  if (includedRawTotal) totalsByCurrency.set('EUR', (totalsByCurrency.get('EUR') || 0) + includedRawTotal);
  const periodControls = <>
    <label>Période<select onChange={(event) => setPeriodMode(event.target.value as BillingPeriodMode)} value={periodMode}><option value="calendar-month">Mois calendaire</option><option value="custom">Période personnalisée</option></select></label>
    {periodMode === 'custom' ? <><label>Début<input onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label>Fin<input onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></> : null}
    <label>Navire<select onChange={(event) => setVesselFilter(event.target.value)} value={vesselFilter}><option value="">Navire de l’opération</option>{vesselOptions.map((vessel) => <option key={vessel}>{vessel}</option>)}</select></label>
  </>;
  const missingDayControl = missingDates.length ? <label className="project-billing-completion">
    <input checked={completeMissingDays} onChange={(event) => setCompleteMissingDays(event.target.checked)} type="checkbox" />
    <span>Compléter les {missingDates.length} jour{missingDates.length > 1 ? 's' : ''} sans DPR avec « 24/24 Operation » au tarif contractuel applicable à chaque journée.</span>
  </label> : <p className="project-billing-range-complete">Tous les jours de la période disposent d’un DPR.</p>;

  return (
    <section aria-label="Facturation mensuelle" className={`project-billing ${workspace ? 'is-workspace' : ''}`}>
      <div className="project-section-heading">
        <div>
          <strong>{workspace ? 'Préparer la facturation' : 'Facturation mensuelle'}</strong>
          <span>{workspace ? 'Un dossier mensuel, du DPR aux justificatifs, jusqu’au suivi de paiement.' : 'Une fiche indépendante par contrat et par mois. Le statut global du projet reste inchangé.'}</span>
        </div>
        {showMonthSelector && !workspace ? (
          <label className="project-billing-month">
            Mois
            <input onChange={(event) => selectMonth(event.target.value)} type="month" value={selectedMonth} />
          </label>
        ) : null}
      </div>

      {message ? <p className="project-billing-message" role="status">{message}</p> : null}
      {error ? <p className="project-billing-error" role="alert">{error}</p> : null}
      {workspace ? <div className="project-billing-period-bar">
        {showMonthSelector ? <label>Mois de facturation<input onChange={(event) => selectMonth(event.target.value)} type="month" value={selectedMonth} /></label> : null}
        {periodControls}
      </div> : null}
      <div className={workspace ? 'project-billing-workspace-layout' : 'project-billing-stack'}>
      <div className="project-billing-workspace-main">
      {workspace ? <>
        <nav className="project-billing-workspace-tabs" aria-label="Rubriques de facturation">
          {([['hire', 'Loyers & DPR', hireDays.length], ['expenses', 'Frais refacturables', periodExpenses.length], ['services', 'Prestations BBTM', serviceDrafts.length], ['raw', 'Saisie brute', periodRawLines.length], ['followup', 'Suivi & pièces', periodDocuments.filter((document) => document.documentKind !== 'chargeable_expense').length]] as const).map(([id, label, count]) => <button key={id} type="button" aria-pressed={billingView === id} aria-controls={`billing-view-${id}`} onClick={() => setBillingView(id)}>{label}<span>{count}</span></button>)}
        </nav>
        <article id="billing-view-hire" className="project-billing-card" hidden={billingView !== 'hire'}>
          <header><CalendarRange size={20} aria-hidden="true" /><div><strong>Loyers & DPR</strong><small>Journées, opérations et tarifs contractuels.</small></div></header>
          <div className="project-billing-hire-completion">{missingDayControl}</div>
          <div className="project-billing-table-scroll"><table className="project-billing-hire-table"><thead><tr><th>PDF</th><th>Date</th><th>Navire</th><th>Opération</th><th>Montant HT</th></tr></thead><tbody>
            {hireDays.map((dpr) => {
              const key = billingOperationKey(dpr);
              const included = !(selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys).includes(key);
              return <tr key={key}><td><input aria-label={`Inclure le ${dpr.reportDate} ${dpr.vesselName}`} checked={included} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ excludedOperationKeys: included ? [...(selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys), key] : (selectedPeriod?.excludedOperationKeys ?? periodDraft.excludedOperationKeys).filter((item) => item !== key) })} type="checkbox" /></td><td>{new Date(`${dpr.reportDate}T12:00:00`).toLocaleDateString('fr-FR')}</td><td>{dpr.vesselName || selectedVesselName}</td><td>{dpr.operation || '24/24 Operation'}</td><td>{money(dayAmount(dpr), hireCurrency)}</td></tr>;
            })}
            {!hireDays.length ? <tr><td colSpan={5} className="project-billing-empty">{dprsLoading ? 'Chargement des DPR…' : 'Aucun DPR pour cette période.'}</td></tr> : null}
          </tbody></table></div>
        </article>
      </> : null}
      {visibleSections.billingElements ? <article id="billing-view-followup" className="project-billing-card" hidden={workspace && billingView !== 'followup'}>
        <header><ReceiptText size={20} /><strong>Suivi de la facture du mois</strong></header>
        <div className="project-billing-export-controls">
          <label>Numéro de facture<input disabled={!isManager || Boolean(busy)} value={periodDraft.invoiceNumber} onChange={(event) => editInvoiceDraft({ invoiceNumber: event.target.value })} /></label>
          <label>Date d’émission<input type="date" disabled={!isManager || Boolean(busy)} value={periodDraft.invoiceIssuedOn} onChange={(event) => editInvoiceDraft({ invoiceIssuedOn: event.target.value })} /></label>
          <label>Envoyée le<input type="date" disabled={!isManager || Boolean(busy)} value={periodDraft.invoiceSentOn} onChange={(event) => editInvoiceDraft({ invoiceSentOn: event.target.value })} /></label>
          <label>Échéance<input type="date" disabled={!isManager || Boolean(busy)} value={periodDraft.paymentDueOn} onChange={(event) => editInvoiceDraft({ paymentDueOn: event.target.value })} /></label>
          <label>Réglée le<input type="date" disabled={!isManager || Boolean(busy)} value={periodDraft.paidOn} onChange={(event) => editInvoiceDraft({ paidOn: event.target.value })} /></label>
          <label>Montant facturé HT<input type="number" min="0" step="0.01" disabled={!isManager || Boolean(busy)} value={periodDraft.amountHt} onChange={(event) => editInvoiceDraft({ amountHt: Number(event.target.value) })} /></label>
          <label>Commentaires<textarea disabled={!isManager || Boolean(busy)} value={periodDraft.comments} onChange={(event) => editInvoiceDraft({ comments: event.target.value })} /></label>
          {isManager ? <button type="button" disabled={Boolean(busy)} onClick={() => void savePeriod()}>Enregistrer la fiche du mois</button> : null}
        </div>
        <div className="project-billing-export-controls"><strong>Factures et exports conservés</strong>
          {periodDocuments.filter((document) => document.documentKind !== 'chargeable_expense').map((document) => <button type="button" disabled={Boolean(busy)} key={document.id} onClick={() => void openDocument(document)}>{document.fileName}</button>)}
          {isManager ? <label className="project-billing-upload">Ajouter la facture client<input disabled={!selectedPeriod || Boolean(busy)} type="file" accept=".pdf" onChange={(event) => {
            const file = event.target.files?.[0]; event.currentTarget.value = '';
            if (!file || !selectedPeriod) return;
            setBusy('invoice'); setError('');
            void uploadProjectBillingDocument(client, { projectId: project.id, billingPeriodId: selectedPeriod.id, file, kind: 'client_invoice' }).then((document) => { setData((current) => ({ ...current, documents: [document, ...current.documents] })); setMessage('Facture classée dans Google Drive.'); }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Classement impossible.')).finally(() => setBusy(''));
          }} /></label> : null}
        </div>
      </article> : null}

      {visibleSections.services ? <article id="billing-view-expenses" className="project-billing-card" hidden={workspace && billingView !== 'expenses'}>
        <header className="project-billing-card-heading">
          <div><Fuel aria-hidden="true" size={20} /><span><strong>Services refacturables</strong><small>{money(expenseTotal)} HT sur la période</small></span></div>
          <div className="project-billing-card-actions">
            {isManager ? <button disabled={Boolean(busy)} onClick={() => openExpenseEditor()} type="button"><Plus aria-hidden="true" size={16} /> Ajouter un frais</button> : null}
          </div>
        </header>
        <div className="project-billing-table-scroll">
          <table className={workspace ? 'project-billing-expense-cards' : undefined}>
            <thead><tr><th>Fournisseur</th><th>Spécialités</th><th>PDF</th><th>Date</th><th>Facture</th><th>Montant HT</th><th>État</th><th>Pièces</th><th>Actions</th></tr></thead>
            <tbody>
              {periodExpenses.map((expense) => {
                const documents = periodDocuments.filter((document) => document.chargeableExpenseId === expense.id);
                return (
                  <tr key={expense.id}>
                    <td>{expense.supplier}</td>
                    <td>{billingExpenseSpecialtyLabel(expense)}</td>
                    <td><input aria-label={`Inclure le frais ${expense.invoiceNumber || expense.supplier} dans le PDF`} checked={expense.includeInPdf !== false} disabled={!isManager || Boolean(busy)} onChange={() => void toggleExpensePdf(expense)} type="checkbox" /></td>
                    <td>{expense.invoiceDate}</td>
                    <td>{expense.invoiceNumber || '—'}</td>
                    <td>{money(expense.amountHt, expense.currency)}</td>
                    <td>{expense.includeInPdf !== false ? 'Sélectionné pour le PDF' : 'Exclu du PDF'}</td>
                    <td>
                      <div className="project-billing-expense-documents">
                        {documents.map((document) => (
                          <button
                            disabled={Boolean(busy)}
                            key={document.id}
                            onClick={() => void openDocument(document)}
                            title={document.fileName}
                            type="button"
                          >
                            <FileText aria-hidden="true" size={14} />
                            <span>{document.fileName}</span>
                            <ExternalLink aria-hidden="true" size={12} />
                          </button>
                        ))}
                        {isManager ? (
                          <label className="project-billing-upload is-compact">
                            <FilePlus2 aria-hidden="true" size={14} /> Ajouter
                            <input
                              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                              disabled={Boolean(busy)}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void uploadDocument(file, expense);
                                event.currentTarget.value = '';
                              }}
                              type="file"
                            />
                          </label>
                        ) : null}
                      </div>
                    </td>
                    <td><div className="project-billing-row-actions">
                      {isManager ? <button onClick={() => openExpenseEditor(expense)} type="button">Modifier</button> : null}
                      {isManager ? <button aria-label={`Supprimer ${expense.invoiceNumber || expense.supplier}`} className="is-danger" disabled={Boolean(busy)} onClick={() => void removeExpense(expense)} type="button"><Trash2 aria-hidden="true" size={14} /></button> : null}
                    </div></td>
                  </tr>
                );
              })}
              {!periodExpenses.length ? <tr><td className="project-billing-empty" colSpan={9}>Aucun service refacturable pour ce mois.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article> : null}

      {visibleSections.bbtm ? <article id="billing-view-services" className="project-billing-card" hidden={workspace && billingView !== 'services'}>
        <header className="project-billing-card-heading">
          <div>
            <PackageCheck aria-hidden="true" size={20} />
            <span>
              <strong>Prestation BBTM</strong>
              <small>{money(billingServicesTotal(serviceForExport))} HT</small>

            </span>
          </div>
          <div className="project-billing-card-actions">
            {isManager ? (
              <button disabled={Boolean(busy)} onClick={addServiceDraft} type="button"><Plus aria-hidden="true" size={16} /> Ajouter une prestation</button>
            ) : null}
          </div>
        </header>
        {project.projectCode.trim().toUpperCase() === 'P144' && calculatedServiceDrafts.some((service) => automaticBillingServiceQuantity(project, service.category, selectedMonth, dprs) !== null)
          ? <p className="project-billing-auto-quantity">Spread Antipollution · P144 : jours du mois − jours 24/24 Weather Stand-by. La quantité est calculée automatiquement, y compris pour les journées sans DPR.</p>
          : <p className="project-billing-auto-quantity">Quantité proposée automatiquement : {defaultServiceQuantity} journée(s) de DPR 24/24 Operation et Crew Change. Chaque quantité reste modifiable avant export ; les journées sans DPR ne sont pas comptées.</p>}
        <div className="project-billing-service-list">
          {calculatedServiceDrafts.map((service, index) => (
            <div className="project-billing-service-grid" key={service.key}>
              <label className="project-billing-service-category">
                Catégorie
                <span>
                  <select aria-label={`Catégorie de la prestation ${index + 1}`} disabled={!isManager} onChange={(event) => selectServiceCategory(service.key, Number(event.target.value))} value={service.serviceCatalogId ?? ''}>
                    {!serviceCatalog.some((entry) => entry.id === service.serviceCatalogId) && service.category ? <option value={service.serviceCatalogId ?? ''}>{service.category}</option> : null}
                    {serviceCatalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.category}</option>)}
                  </select>
                  {isManager ? <button aria-label="Ajouter une catégorie de prestation" onClick={() => setServiceCatalogOpen(true)} title="Ajouter une catégorie" type="button"><Plus aria-hidden="true" size={17} /></button> : null}
                </span>
              </label>
              <label>
                Montant unitaire HT
                <input disabled={!isManager} min="0" onChange={(event) => updateServiceDraft(service.key, { unitAmountHt: Number(event.target.value) })} step="0.01" type="number" value={service.unitAmountHt} />
              </label>
              <label>
                Nombre d’unités
                <input disabled={!isManager} readOnly={automaticBillingServiceQuantity(project, service.category, selectedMonth, dprs) !== null} min="0" onChange={(event) => updateServiceDraft(service.key, { quantity: Number(event.target.value) })} step="0.001" type="number" value={service.quantity} />
              </label>
              <label>Montant total HT<input disabled value={money(service.unitAmountHt * service.quantity)} /></label>
              {isManager ? <div className="project-billing-service-actions">
                <button disabled={Boolean(busy)} onClick={() => void saveService(service)} type="button"><Save aria-hidden="true" size={15} /> Enregistrer</button>
                <button aria-label={`Supprimer la prestation ${service.category}`} className="is-danger" disabled={Boolean(busy)} onClick={() => void removeService(service)} type="button"><Trash2 aria-hidden="true" size={15} /></button>
              </div> : null}
            </div>
          ))}
          {!serviceDrafts.length ? <p className="project-billing-empty">Aucune prestation BBTM pour cette période.</p> : null}
        </div>
      </article> : null}

      <article id="billing-view-raw" className="project-billing-card" hidden={visibleSections.raw === false || (workspace && billingView !== 'raw')}>
        <ProjectBillingRawLines
          key={`${project.id}-${selectedMonth}`}
          lines={periodRawLines}
          catalog={serviceCatalog}
          isManager={isManager}
          disabled={Boolean(busy)}
          initialDate={`${selectedMonth}-01`}
          onSave={saveRawLine}
          onDelete={removeRawLine}
          onCatalogOpen={() => setServiceCatalogOpen(true)}
          onDirtyChange={setRawLinesDirty}
        />
      </article>

      </div>
      {visibleSections.billingElements ? <article className="project-billing-card project-billing-export" aria-label="Export du relevé mensuel">
        <header><CalendarRange aria-hidden="true" size={20} /><div><strong>{workspace ? 'Relevé du mois' : 'Éléments de facturation'}</strong><span>{workspace ? new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'Le tableau Opérations reste toujours visible ; cette sélection concerne uniquement les loyers.'}</span></div></header>
        {workspace ? <div className="project-billing-summary" aria-label="Totaux sélectionnés pour l’export">
          <dl><div><dt>Loyers & DPR</dt><dd>{dprsLoading ? '…' : money(includedHireTotal, hireCurrency)}</dd></div><div><dt>Frais refacturables</dt><dd>{expenseByCurrency.size ? [...expenseByCurrency].map(([currency, total]) => <span key={currency}>{money(total, currency)}</span>) : money(0)}</dd></div><div><dt>Prestations BBTM</dt><dd>{money(includedServiceTotal)}</dd></div><div><dt>Saisie brute</dt><dd>{money(includedRawTotal)}</dd></div></dl>
          <div className="project-billing-summary-total"><span>Total sélectionné HT</span>{[...totalsByCurrency].map(([currency, total]) => <strong key={currency}>{dprsLoading ? '…' : money(total, currency)}</strong>)}</div>
        </div> : null}
        <fieldset className="project-export-selection"><legend>Contenu du PDF</legend>
          <label><input type="checkbox" checked={selectedPeriod?.includeOperationsInPdf ?? periodDraft.includeOperationsInPdf} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeOperationsInPdf: !(selectedPeriod?.includeOperationsInPdf ?? periodDraft.includeOperationsInPdf) })} /> Inclure les loyers</label>
          <label><input type="checkbox" checked={selectedPeriod?.includeExpensesInPdf ?? periodDraft.includeExpensesInPdf} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeExpensesInPdf: !(selectedPeriod?.includeExpensesInPdf ?? periodDraft.includeExpensesInPdf) })} /> Inclure les frais et leurs pièces dans l’export</label>
          <label><input type="checkbox" checked={selectedPeriod?.includeBbtmInPdf ?? periodDraft.includeBbtmInPdf} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeBbtmInPdf: !(selectedPeriod?.includeBbtmInPdf ?? periodDraft.includeBbtmInPdf) })} /> Inclure les prestations BBTM</label>
          <label><input type="checkbox" checked={(selectedPeriod?.includeRawInPdf ?? periodDraft.includeRawInPdf) !== false} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeRawInPdf: (selectedPeriod?.includeRawInPdf ?? periodDraft.includeRawInPdf) === false })} /> Inclure la saisie brute</label>
        </fieldset>
        <div className="project-export-reference">
          <label>Référence client<input disabled={!isManager} onBlur={() => void storeReference(true).catch(() => undefined)} onChange={(event) => setReferenceDrafts((current) => ({ ...current, [referenceScope]: event.target.value }))} value={exportReference} maxLength={200} /></label>
          <span>{billingReferenceScopeLabel(referenceScope)} · Même emplacement dans le PDF.</span>
          {isManager ? <button type="button" disabled={Boolean(busy) || savingReference || !exportReference.trim()} onClick={() => void storeReference().catch(() => undefined)}>{savingReference ? 'Enregistrement…' : workspace ? 'Enregistrer la référence' : 'Enregistrer cette référence pour ce contenu'}</button> : null}
          {references.length > 0 ? <details><summary>{references.length} référence(s) du projet</summary>{references.map((reference) => <p key={reference.id}><strong>{billingReferenceScopeLabel(reference.scope)}</strong> : {reference.reference}</p>)}</details> : <small>La référence historique du mois est proposée tant qu’aucune référence n’est enregistrée pour ce contenu.</small>}
        </div>
        <div className="project-billing-export-controls">
          {!workspace ? periodControls : null}
          <label>Fichier<select onChange={(event) => setExportFormat(event.target.value as BillingExportFormat)} value={exportFormat}><option value="pdf">PDF standard</option><option value="merged-pdf">PDF + annexes PDF</option><option value="zip">ZIP + toutes les pièces</option></select></label>
          {!workspace ? <><label>Projet<input disabled value={`${project.projectCode} - ${project.title}`} /></label><label>Navire exporté<input disabled value={selectedVesselName || 'Non renseigné'} /></label>{missingDayControl}</> : null}
          {!workspace && selectedPeriod && exportDprs.length ? (
            <fieldset className="project-billing-operation-selection">
              <legend>Journées et opérations incluses dans le PDF</legend>
              {exportDprs.filter((dpr) => dpr.reportDate >= exportRange.start && dpr.reportDate <= exportRange.end).map((dpr) => {
                const key = billingOperationKey(dpr);
                const included = !(selectedPeriod.excludedOperationKeys || []).includes(key);
                return <label key={key}><input checked={included} disabled={!isManager || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ excludedOperationKeys: included ? [...(selectedPeriod.excludedOperationKeys || []), key] : (selectedPeriod.excludedOperationKeys || []).filter((item) => item !== key) })} type="checkbox" /><span>{new Date(`${dpr.reportDate}T12:00:00`).toLocaleDateString('fr-FR')} · {dpr.operation || '24/24 Operation'}{dpr.vesselName ? ` · ${dpr.vesselName}` : ''}</span></label>;
              })}
            </fieldset>
          ) : null}
          <div className="project-billing-export-actions">
            <button disabled={Boolean(busy) || dprsLoading || rawLinesDirty || (!isManager && !selectedPeriod)} onClick={() => void createExport('preview')} type="button">{workspace ? 'Prévisualiser le PDF' : 'Actualiser l’aperçu'}</button>
            <button disabled={Boolean(busy) || dprsLoading || rawLinesDirty || (!isManager && !selectedPeriod)} onClick={() => void createExport('download')} type="button"><Download aria-hidden="true" size={16} /> Exporter le PDF</button>
          </div>
          {rawLinesDirty ? <p className="project-billing-auto-quantity" role="status">Enregistrez les lignes modifiées dans Saisie brute avant l’export.</p> : null}
        </div>
        {!workspace ? previewBlob ? <ProjectPdfPreview key={`${project.id}-${selectedMonth}`} blob={previewBlob} /> : <p className="project-section-empty">Générez l’aperçu pour contrôler le document avant export.</p> : null}
      </article> : null}
      </div>
      {workspace && previewBlob ? <AppDialog size="xl" variant="preview" title="Aperçu du relevé PDF" onClose={() => setPreviewBlob(null)}><ProjectPdfPreview key={`${project.id}-${selectedMonth}`} blob={previewBlob} /></AppDialog> : null}

      {expenseEditor ? (
        <AppDialog
          footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy === 'expense'} onClick={() => setExpenseEditor(null)} type="button">Annuler</button><button disabled={busy === 'expense'} onClick={() => void saveExpense()} type="button">{busy === 'expense' ? 'Enregistrement…' : 'Enregistrer le frais'}</button></div>}
          icon={<ReceiptText aria-hidden="true" size={20} />}
          isBusy={busy === 'expense'}
          onClose={() => setExpenseEditor(null)}
          size="lg"
          title={expenseEditor.id ? 'Modifier le frais imputable' : 'Ajouter un frais imputable'}
        >
          <div className="project-billing-form">
            <ServiceProviderPicker label="Fournisseur" onAdd={() => setProviderEditor(serviceProviderDraft())} onChange={(provider) => {
              const specialties = serviceProviderSpecialtyNames(provider);
              setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, category: 'other', nature: specialties.join(' · '), supplier: provider.name, supplierSpecialties: specialties } } : null);
            }} providers={serviceProviders.filter((provider) => provider.active)} required value={expenseEditor.draft.supplier} />
            <label>Spécialités<input disabled value={expenseEditor.draft.supplierSpecialties.join(' · ') || 'Non renseignée'} /></label>
            <label>Date facture<input required onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceDate: event.target.value } } : null)} type="date" value={expenseEditor.draft.invoiceDate} /></label>
            <label>N° facture<input onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceNumber: event.target.value } } : null)} value={expenseEditor.draft.invoiceNumber} /></label>
            <label>Montant HT<input inputMode="decimal" min="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountHt: Number(event.target.value) } } : null)} placeholder="0,00" required step="0.01" type="number" value={!expenseEditor.id && expenseEditor.draft.amountHt === 0 ? '' : expenseEditor.draft.amountHt} /></label>
            <label>Montant TTC<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountTtc: event.target.value ? Number(event.target.value) : null } } : null)} step="0.01" type="number" value={expenseEditor.draft.amountTtc ?? ''} /></label>
            <label>Devise<input maxLength={3} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, currency: event.target.value.toUpperCase() } } : null)} value={expenseEditor.draft.currency} /></label>
            <label>Quantité<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, quantity: event.target.value ? Number(event.target.value) : null } } : null)} step="0.001" type="number" value={expenseEditor.draft.quantity ?? ''} /></label>
            <label>Unité<input list="project-billing-units" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, unit: event.target.value } } : null)} placeholder="Choisir ou saisir une unité" value={expenseEditor.draft.unit} /></label>
            <label className="is-wide">Commentaires<textarea onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, comments: event.target.value } } : null)} rows={3} value={expenseEditor.draft.comments} /></label>
            <datalist id="project-billing-units">{unitOptions.map((unit) => <option key={unit} value={unit} />)}</datalist>
          </div>
        </AppDialog>
      ) : null}
      {providerEditor ? <ServiceProviderEditorDialog categories={providerCategories} draft={providerEditor} isSaving={busy === 'provider'} onChange={setProviderEditor} onClose={() => setProviderEditor(null)} onSubmit={submitProvider} serviceTypes={providerServiceTypes} /> : null}
      {serviceCatalogOpen ? <ServiceCatalogDialog canManage={isManager} client={client} initialMode="create" onChanged={(entries) => setServiceCatalog(entries)} onClose={() => setServiceCatalogOpen(false)} /> : null}
    </section>
  );
}
