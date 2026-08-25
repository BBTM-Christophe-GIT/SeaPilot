import type { SupabaseClient } from '@supabase/supabase-js';
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
import { useEffect, useMemo, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  fetchServiceProviders,
  groupServiceProviders,
  saveServiceProvider,
  serviceProviderDraft,
  type ServiceProvider,
} from '../serviceProviders/serviceProviders';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';
import {
  billingExpenseAttachmentName,
  billingOperationKey,
  billingServicesTotal,
  completeBillingDprs,
  countDailyOperations,
  defaultProjectClientReference,
  deleteProjectChargeableExpense,
  fetchProjectBillingData,
  fetchProjectBillingDprs,
  generateBillingExportPackage,
  missingBillingDates,
  saveProjectBillingPeriod,
  saveProjectBillingPdfSelection,
  saveProjectBillingService,
  saveProjectChargeableExpense,
  setProjectChargeableExpensePdfInclusion,
  signedProjectBillingDocumentUrl,
  uploadProjectBillingDocument,
  type BillingExpenseCategory,
  type BillingExpenseDraft,
  type BillingExportFormat,
  type BillingPeriodDraft,
  type BillingPeriodMode,
  type ProjectBillingData,
  type ProjectBillingDpr,
  type ProjectBillingDocument,
  type ProjectBillingPeriod,
  type ProjectBillingService,
  type ProjectChargeableExpense,
} from './projectBilling';

const EMPTY_DATA: ProjectBillingData = { periods: [], expenses: [], documents: [], services: [] };
const CATEGORY_LABELS: Record<BillingExpenseCategory, string> = {
  fuel: 'Gasoil',
  port: 'Frais de port',
  water: 'Eau',
  other: 'Autre',
};
const BILLING_UNIT_OPTIONS = ['Unité', 'm²', 'm³', 'L'];

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
    excludedOperationKeys: period?.excludedOperationKeys || [],
  };
}

function expenseDraft(periodMonth: string, expense?: ProjectChargeableExpense): BillingExpenseDraft {
  return {
    category: expense?.category || 'fuel',
    nature: expense?.nature || '',
    supplier: expense?.supplier || '',
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
  isManager,
  operations,
  project,
}: {
  client: SupabaseClient;
  contract?: ProjectContractRecord;
  isManager: boolean;
  operations: ProjectPlanningOccurrenceRecord[];
  project: ProjectRecord;
}) {
  const [data, setData] = useState<ProjectBillingData>(EMPTY_DATA);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [periodDraft, setPeriodDraft] = useState<BillingPeriodDraft>(() => billingDraft(project));
  const [expenseEditor, setExpenseEditor] = useState<{
    id?: number;
    draft: BillingExpenseDraft;
    supplierMode: 'catalog' | 'new';
    supplierCategory: string;
  } | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [periodMode, setPeriodMode] = useState<BillingPeriodMode>('calendar-month');
  const [customStart, setCustomStart] = useState(`${currentMonth()}-01`);
  const [customEnd, setCustomEnd] = useState(monthRange(currentMonth()).end);
  const [vesselFilter, setVesselFilter] = useState('');
  const [dprs, setDprs] = useState<ProjectBillingDpr[]>([]);
  const [completeMissingDays, setCompleteMissingDays] = useState(false);
  const [serviceDraft, setServiceDraft] = useState({ unitAmountHt: 0, quantity: 0 });
  const [serviceQuantityEdited, setServiceQuantityEdited] = useState(false);
  const [exportFormat, setExportFormat] = useState<BillingExportFormat>('pdf');
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    setBusy('load');
    setError('');
    try {
      setData(await fetchProjectBillingData(client, project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La facturation est indisponible.');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    setData(EMPTY_DATA);
    setSelectedMonth(currentMonth());
    setPeriodDraft(billingDraft(project));
    setDprs([]);
    setCompleteMissingDays(false);
    setServiceQuantityEdited(false);
    void reload();
    void reloadServiceProviders();
  }, [project.id]);

  const selectedPeriod = data.periods.find((period) => period.periodMonth.startsWith(selectedMonth));
  const periodExpenses = selectedPeriod
    ? data.expenses.filter((expense) => expense.billingPeriodId === selectedPeriod.id)
    : [];
  const periodDocuments = selectedPeriod
    ? data.documents.filter((document) => document.billingPeriodId === selectedPeriod.id)
    : [];
  const periodServices = selectedPeriod
    ? data.services.filter((service) => service.billingPeriodId === selectedPeriod.id)
    : [];
  const expenseTotal = periodExpenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  const providerGroups = useMemo(
    () => groupServiceProviders(serviceProviders.filter((provider) => provider.active)),
    [serviceProviders],
  );
  const unitOptions = useMemo(
    () => Array.from(new Set([...BILLING_UNIT_OPTIONS, ...data.expenses.map((expense) => expense.unit).filter(Boolean)])),
    [data.expenses],
  );
  const vesselOptions = useMemo(
    () => Array.from(new Set(operations.map((operation) => operation.primaryVesselName).filter(Boolean))).sort(),
    [operations],
  );
  const exportRange = periodMode === 'calendar-month'
    ? monthRange(selectedMonth)
    : { start: customStart, end: customEnd };
  const selectedOperation = operations.find((operation) => (
    (!vesselFilter || operation.primaryVesselName === vesselFilter)
    && operation.startsOn <= exportRange.end
    && operation.endsOn >= exportRange.start
  ));
  const selectedVesselName = vesselFilter
    || selectedOperation?.primaryVesselName
    || project.primaryVesselName
    || '';
  const missingDates = missingBillingDates(dprs, exportRange.start, exportRange.end);
  const exportDprs = completeMissingDays
    ? completeBillingDprs(dprs, exportRange.start, exportRange.end, {
      vesselName: selectedVesselName,
      amountHt: null,
    })
    : dprs;
  const defaultServiceQuantity = countDailyOperations(exportDprs);
  const serviceForExport: ProjectBillingService[] = [{
    id: periodServices[0]?.id || 0,
    billingPeriodId: selectedPeriod?.id || 0,
    category: 'spread_antipollution',
    unitAmountHt: serviceDraft.unitAmountHt,
    quantity: serviceDraft.quantity,
    includeInPdf: true,
  }];

  useEffect(() => {
    let cancelled = false;
    if (!exportRange.start || !exportRange.end || exportRange.end < exportRange.start) {
      setDprs([]);
      return () => { cancelled = true; };
    }
    setBusy((current) => current || 'dprs');
    void fetchProjectBillingDprs(client, project.id, exportRange.start, exportRange.end, vesselFilter)
      .then((rows) => {
        if (!cancelled) setDprs(rows);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les DPR.');
      })
      .finally(() => {
        if (!cancelled) setBusy((current) => current === 'dprs' ? '' : current);
      });
    return () => { cancelled = true; };
  }, [client, project.id, exportRange.start, exportRange.end, vesselFilter]);

  useEffect(() => {
    const saved = periodServices[0];
    if (saved) {
      setServiceDraft({ unitAmountHt: saved.unitAmountHt, quantity: saved.quantity });
      setServiceQuantityEdited(true);
    } else {
      setServiceDraft((draft) => ({ ...draft, quantity: defaultServiceQuantity }));
      setServiceQuantityEdited(false);
    }
  }, [selectedPeriod?.id, periodServices[0]?.id]);

  useEffect(() => {
    if (!serviceQuantityEdited && !periodServices[0]) {
      setServiceDraft((draft) => ({ ...draft, quantity: defaultServiceQuantity }));
    }
  }, [defaultServiceQuantity, periodServices[0]?.id, serviceQuantityEdited]);

  function selectMonth(month: string) {
    const normalized = month.slice(0, 7);
    setSelectedMonth(normalized);
    const period = data.periods.find((item) => item.periodMonth.startsWith(normalized));
    setPeriodDraft({ ...billingDraft(project, period), periodMonth: normalized });
    const range = monthRange(normalized);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setCompleteMissingDays(false);
    setServiceQuantityEdited(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  }

  async function updatePeriodPdfSelection(
    changes: Partial<Pick<BillingPeriodDraft,
      'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'excludedOperationKeys'>>,
  ) {
    if (!selectedPeriod || !isManager || busy) return;
    const selection = {
      includeOperationsInPdf: changes.includeOperationsInPdf ?? selectedPeriod.includeOperationsInPdf !== false,
      includeExpensesInPdf: changes.includeExpensesInPdf ?? selectedPeriod.includeExpensesInPdf !== false,
      includeBbtmInPdf: changes.includeBbtmInPdf ?? selectedPeriod.includeBbtmInPdf !== false,
      excludedOperationKeys: changes.excludedOperationKeys ?? selectedPeriod.excludedOperationKeys ?? [],
    };
    setBusy('selection');
    setError('');
    setData((current) => ({
      ...current,
      periods: current.periods.map((period) => period.id === selectedPeriod.id ? { ...period, ...selection } : period),
    }));
    setPeriodDraft((current) => ({ ...current, ...selection }));
    try {
      await saveProjectBillingPdfSelection(client, selectedPeriod.id, selection);
      setMessage('Sélection du PDF enregistrée.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la sélection du PDF.');
      await reload();
    } finally {
      setBusy('');
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
    setBusy('period');
    setError('');
    try {
      const savedResult = await saveProjectBillingPeriod(client, project.id, periodDraft);
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
      setSelectedMonth(savedMonth);
      setPeriodDraft({ ...billingDraft(project, saved), periodMonth: savedMonth });
      setMessage('Paramètres du mois enregistrés.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la facturation.');
    } finally {
      setBusy('');
    }
  }

  async function saveExpense() {
    if (!selectedPeriod || !expenseEditor || busy) return;
    if (!expenseEditor.draft.supplier || !expenseEditor.draft.invoiceDate || expenseEditor.draft.amountHt <= 0) {
      setError('Renseignez le fournisseur, la date et un montant HT supérieur à 0.');
      return;
    }
    if (expenseEditor.draft.category === 'other' && !expenseEditor.draft.nature.trim()) {
      setError('Précisez la nature du service « Autre ».');
      return;
    }
    setBusy('expense');
    setError('');
    try {
      let draft = expenseEditor.draft;
      if (expenseEditor.supplierMode === 'new') {
        const knownProvider = serviceProviders.find(
          (provider) => provider.name.trim().localeCompare(draft.supplier.trim(), 'fr', { sensitivity: 'base' }) === 0,
        );
        if (knownProvider) {
          draft = { ...draft, supplier: knownProvider.name };
        } else {
          const savedProvider = await saveServiceProvider(client, {
            ...serviceProviderDraft(),
            name: draft.supplier,
            category: expenseEditor.supplierCategory || 'Non classé',
          });
          setServiceProviders((current) => [...current, savedProvider]);
          draft = { ...draft, supplier: savedProvider.name };
        }
      }
      const saved = await saveProjectChargeableExpense(
        client,
        project.id,
        selectedPeriod.id,
        draft,
        expenseEditor.id,
      );
      setData((current) => ({
        ...current,
        expenses: [saved, ...current.expenses.filter((expense) => expense.id !== saved.id)],
      }));
      setExpenseEditor(null);
      setMessage('Frais imputable enregistré.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer ce frais.');
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

  async function saveService() {
    if (!selectedPeriod || !isManager || busy) return;
    if (serviceDraft.unitAmountHt < 0 || serviceDraft.quantity < 0) {
      setError('Le montant unitaire et le nombre d’unités doivent être positifs.');
      return;
    }
    setBusy('service');
    setError('');
    try {
      const saved = await saveProjectBillingService(client, project.id, selectedPeriod.id, {
        category: 'spread_antipollution',
        ...serviceDraft,
      });
      setData((current) => ({
        ...current,
        services: [saved, ...current.services.filter((service) => service.id !== saved.id)],
      }));
      setServiceQuantityEdited(true);
      setMessage('Prestation BBTM enregistrée.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la prestation BBTM.');
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

  async function createExport(mode: 'preview' | 'download') {
    if (!selectedPeriod) {
      setError('Enregistrez d’abord la fiche du mois.');
      return;
    }
    if (!exportRange.start || !exportRange.end || exportRange.end < exportRange.start) {
      setError('La période d’export est invalide.');
      return;
    }
    setBusy('export');
    setError('');
    try {
      const result = await generateBillingExportPackage(client, {
        project,
        contract,
        operations,
        period: { ...selectedPeriod, clientReference: periodDraft.clientReference },
        expenses: periodExpenses,
        services: serviceForExport,
        includeBbtmService: selectedPeriod.includeBbtmInPdf !== false,
        dprs: exportDprs,
        selectedVesselName,
        startDate: exportRange.start,
        endDate: exportRange.end,
      }, periodDocuments.filter((document) => document.chargeableExpenseId !== null), mode === 'preview' ? 'pdf' : exportFormat);
      const fileName = `${project.projectCode || `P${project.id}`}-Elements-facturation-${selectedMonth}.${result.extension}`;
      if (mode === 'download') downloadBlob(result.blob, fileName);
      else {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(result.blob));
      }
      setMessage(mode === 'download' ? 'Export PDF généré.' : 'Aperçu actualisé.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de générer l’export.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section aria-label="Facturation mensuelle" className="project-billing">
      <div className="project-section-heading">
        <div>
          <strong>Facturation mensuelle</strong>
          <span>Une fiche indépendante par contrat et par mois. Le statut global du projet reste inchangé.</span>
        </div>
        <label className="project-billing-month">
          Mois
          <input onChange={(event) => selectMonth(event.target.value)} type="month" value={selectedMonth} />
        </label>
      </div>

      {message ? <p className="project-billing-message" role="status">{message}</p> : null}
      {error ? <p className="project-billing-error" role="alert">{error}</p> : null}

      <article className="project-billing-card">
        <header className="project-billing-card-heading">
          <div><Fuel aria-hidden="true" size={20} /><span><strong>Services refacturables</strong><small>{money(expenseTotal)} HT sur la période</small><label className="project-billing-section-selection"><input checked={selectedPeriod?.includeExpensesInPdf !== false} disabled={!isManager || !selectedPeriod || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeExpensesInPdf: selectedPeriod?.includeExpensesInPdf === false })} type="checkbox" /> Inclure les services refacturables dans le PDF</label></span></div>
          <div className="project-billing-card-actions">
            {isManager ? <button disabled={!selectedPeriod || Boolean(busy)} onClick={() => setExpenseEditor({ draft: expenseDraft(selectedMonth), supplierMode: 'catalog', supplierCategory: '' })} type="button"><Plus aria-hidden="true" size={16} /> Ajouter un frais</button> : null}
          </div>
        </header>
        <div className="project-billing-table-scroll">
          <table>
            <thead><tr><th>PDF</th><th>Date</th><th>Catégorie</th><th>Fournisseur</th><th>Facture</th><th>Montant HT</th><th>État</th><th>Pièces</th><th>Actions</th></tr></thead>
            <tbody>
              {periodExpenses.map((expense) => {
                const documents = periodDocuments.filter((document) => document.chargeableExpenseId === expense.id);
                return (
                  <tr key={expense.id}>
                    <td><input aria-label={`Inclure le frais ${expense.invoiceNumber || expense.supplier} dans le PDF`} checked={expense.includeInPdf !== false} disabled={!isManager || Boolean(busy)} onChange={() => void toggleExpensePdf(expense)} type="checkbox" /></td>
                    <td>{expense.invoiceDate}</td>
                    <td>{expense.category === 'other' ? expense.nature : CATEGORY_LABELS[expense.category]}</td>
                    <td>{expense.supplier}</td>
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
                      {isManager ? <button onClick={() => setExpenseEditor({ id: expense.id, draft: expenseDraft(selectedMonth, expense), supplierMode: serviceProviders.some((provider) => provider.name.localeCompare(expense.supplier, 'fr', { sensitivity: 'base' }) === 0) ? 'catalog' : 'new', supplierCategory: '' })} type="button">Modifier</button> : null}
                      {isManager ? <button aria-label={`Supprimer ${expense.invoiceNumber || expense.supplier}`} className="is-danger" disabled={Boolean(busy)} onClick={() => void removeExpense(expense)} type="button"><Trash2 aria-hidden="true" size={14} /></button> : null}
                    </div></td>
                  </tr>
                );
              })}
              {!periodExpenses.length ? <tr><td className="project-billing-empty" colSpan={9}>Aucun service refacturable pour ce mois.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="project-billing-card">
        <header className="project-billing-card-heading">
          <div>
            <PackageCheck aria-hidden="true" size={20} />
            <span>
              <strong>Prestation BBTM</strong>
              <small>{money(billingServicesTotal(serviceForExport))} HT</small>
              <label className="project-billing-section-selection"><input checked={selectedPeriod?.includeBbtmInPdf !== false} disabled={!isManager || !selectedPeriod || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeBbtmInPdf: selectedPeriod?.includeBbtmInPdf === false })} type="checkbox" /> Inclure la prestation BBTM dans le PDF</label>
            </span>
          </div>
          <div className="project-billing-card-actions">
            {isManager ? (
              <button disabled={!selectedPeriod || Boolean(busy)} onClick={() => void saveService()} type="button">
                <Save aria-hidden="true" size={16} /> Enregistrer
              </button>
            ) : null}
          </div>
        </header>
        <div className="project-billing-service-grid">
          <label>Catégorie<input disabled value="Spread Antipollution" /></label>
          <label>
            Montant unitaire HT
            <input
              disabled={!isManager}
              min="0"
              onChange={(event) => setServiceDraft((draft) => ({ ...draft, unitAmountHt: Number(event.target.value) }))}
              step="0.01"
              type="number"
              value={serviceDraft.unitAmountHt}
            />
          </label>
          <label>
            Nombre d’unités
            <input
              disabled={!isManager}
              min="0"
              onChange={(event) => {
                setServiceQuantityEdited(true);
                setServiceDraft((draft) => ({ ...draft, quantity: Number(event.target.value) }));
              }}
              step="1"
              type="number"
              value={serviceDraft.quantity}
            />
          </label>
          <label>Montant total HT<input disabled value={money(serviceDraft.unitAmountHt * serviceDraft.quantity)} /></label>
        </div>
      </article>

      <article className="project-billing-card project-billing-export">
        <header><CalendarRange aria-hidden="true" size={20} /><div><strong>Éléments de facturation</strong><span>Le tableau Opérations reste toujours visible ; cette sélection concerne uniquement les loyers.</span><label className="project-billing-section-selection"><input checked={selectedPeriod?.includeOperationsInPdf !== false} disabled={!isManager || !selectedPeriod || Boolean(busy)} onChange={() => void updatePeriodPdfSelection({ includeOperationsInPdf: selectedPeriod?.includeOperationsInPdf === false })} type="checkbox" /> Inclure les loyers dans le PDF</label></div></header>
        <div className="project-billing-export-controls">
          <label>Période<select onChange={(event) => setPeriodMode(event.target.value as BillingPeriodMode)} value={periodMode}><option value="calendar-month">Mois calendaire</option><option value="custom">Période personnalisée</option></select></label>
          {periodMode === 'custom' ? <><label>Début<input onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label>Fin<input onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></> : null}
          <label>Navire<select onChange={(event) => setVesselFilter(event.target.value)} value={vesselFilter}><option value="">Navire de l’opération</option>{vesselOptions.map((vessel) => <option key={vessel}>{vessel}</option>)}</select></label>
          <label>Fichier<select onChange={(event) => setExportFormat(event.target.value as BillingExportFormat)} value={exportFormat}><option value="pdf">PDF standard</option><option value="merged-pdf">PDF + annexes PDF</option><option value="zip">ZIP + toutes les pièces</option></select></label>
          <label>Projet<input disabled value={`${project.projectCode} - ${project.title}`} /></label>
          <label>Référence client<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, clientReference: event.target.value }))} value={periodDraft.clientReference} /></label>
          <label>Navire exporté<input disabled value={selectedVesselName || 'Non renseigné'} /></label>
          {missingDates.length ? (
            <label className="project-billing-completion">
              <input
                checked={completeMissingDays}
                onChange={(event) => setCompleteMissingDays(event.target.checked)}
                type="checkbox"
              />
              <span>
                Compléter les {missingDates.length} jour{missingDates.length > 1 ? 's' : ''} sans DPR avec
                « 24/24 Operation » au tarif contractuel applicable à chaque journée.
              </span>
            </label>
          ) : <p className="project-billing-range-complete">Tous les jours de la période disposent d’un DPR.</p>}
          {selectedPeriod && exportDprs.length ? (
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
            {isManager ? <button disabled={Boolean(busy)} onClick={() => void savePeriod()} type="button"><Save aria-hidden="true" size={16} /> Enregistrer les paramètres</button> : null}
            <button disabled={busy === 'export'} onClick={() => void createExport('preview')} type="button">Actualiser l’aperçu</button>
            <button disabled={busy === 'export'} onClick={() => void createExport('download')} type="button"><Download aria-hidden="true" size={16} /> Exporter le PDF</button>
          </div>
        </div>
        {previewUrl ? <iframe className="project-billing-preview" src={previewUrl} title={`Aperçu des éléments de facturation ${project.projectCode}`} /> : <p className="project-section-empty">Générez l’aperçu pour contrôler le document avant export.</p>}
      </article>

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
            <label>Catégorie<select onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, category: event.target.value as BillingExpenseCategory } } : null)} value={expenseEditor.draft.category}>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {expenseEditor.draft.category === 'other' ? <label>Nature<input required onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, nature: event.target.value } } : null)} value={expenseEditor.draft.nature} /></label> : null}
            <label>Fournisseur<select required onChange={(event) => setExpenseEditor((current) => current ? event.target.value === '__new__' ? { ...current, supplierMode: 'new', draft: { ...current.draft, supplier: '' } } : { ...current, supplierMode: 'catalog', draft: { ...current.draft, supplier: event.target.value } } : null)} value={expenseEditor.supplierMode === 'new' ? '__new__' : expenseEditor.draft.supplier}><option value="">Sélectionner une société</option>{providerGroups.map((group) => <optgroup key={group.category} label={group.category}>{group.providers.map((provider) => <option key={provider.id} value={provider.name}>{provider.name}</option>)}</optgroup>)}<option value="__new__">＋ Saisir une nouvelle société</option></select></label>
            {expenseEditor.supplierMode === 'new' ? <><label>Nouvelle société<input autoFocus required placeholder="Nom de la société" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, supplier: event.target.value } } : null)} value={expenseEditor.draft.supplier} /></label><label>Catégorie fournisseur<input list="project-billing-provider-categories" onChange={(event) => setExpenseEditor((current) => current ? { ...current, supplierCategory: event.target.value } : null)} placeholder="Ex. Prestataire de service" value={expenseEditor.supplierCategory} /></label></> : null}
            <label>Date facture<input required onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceDate: event.target.value } } : null)} type="date" value={expenseEditor.draft.invoiceDate} /></label>
            <label>N° facture<input onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceNumber: event.target.value } } : null)} value={expenseEditor.draft.invoiceNumber} /></label>
            <label>Montant HT<input inputMode="decimal" min="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountHt: Number(event.target.value) } } : null)} placeholder="0,00" required step="0.01" type="number" value={!expenseEditor.id && expenseEditor.draft.amountHt === 0 ? '' : expenseEditor.draft.amountHt} /></label>
            <label>Montant TTC<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountTtc: event.target.value ? Number(event.target.value) : null } } : null)} step="0.01" type="number" value={expenseEditor.draft.amountTtc ?? ''} /></label>
            <label>Devise<input maxLength={3} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, currency: event.target.value.toUpperCase() } } : null)} value={expenseEditor.draft.currency} /></label>
            <label>Quantité<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, quantity: event.target.value ? Number(event.target.value) : null } } : null)} step="0.001" type="number" value={expenseEditor.draft.quantity ?? ''} /></label>
            <label>Unité<input list="project-billing-units" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, unit: event.target.value } } : null)} placeholder="Choisir ou saisir une unité" value={expenseEditor.draft.unit} /></label>
            <label className="is-wide">Commentaires<textarea onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, comments: event.target.value } } : null)} rows={3} value={expenseEditor.draft.comments} /></label>
            <datalist id="project-billing-units">{unitOptions.map((unit) => <option key={unit} value={unit} />)}</datalist>
            <datalist id="project-billing-provider-categories">{providerGroups.map((group) => <option key={group.category} value={group.category} />)}</datalist>
          </div>
        </AppDialog>
      ) : null}
    </section>
  );
}
