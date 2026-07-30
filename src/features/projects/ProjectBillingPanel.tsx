import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CalendarRange,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Fuel,
  Plus,
  ReceiptText,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';
import {
  deleteProjectChargeableExpense,
  fetchProjectBillingData,
  generateBillingExportPackage,
  saveProjectBillingPeriod,
  saveProjectChargeableExpense,
  signedProjectBillingDocumentUrl,
  uploadProjectBillingDocument,
  type BillingExpenseCategory,
  type BillingExpenseDraft,
  type BillingExportFormat,
  type BillingPeriodDraft,
  type BillingPeriodMode,
  type ProjectBillingData,
  type ProjectBillingDocument,
  type ProjectBillingPeriod,
  type ProjectChargeableExpense,
} from './projectBilling';

const EMPTY_DATA: ProjectBillingData = { periods: [], expenses: [], documents: [] };
const CATEGORY_LABELS: Record<BillingExpenseCategory, string> = {
  fuel: 'Gasoil',
  port: 'Frais de port',
  water: 'Eau',
  other: 'Autre',
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

function billingDraft(period?: ProjectBillingPeriod): BillingPeriodDraft {
  return {
    periodMonth: period?.periodMonth.slice(0, 7) || currentMonth(),
    clientReference: period?.clientReference || '',
    invoiceNumber: period?.invoiceNumber || '',
    invoiceIssuedOn: period?.invoiceIssuedOn || '',
    invoiceSentOn: period?.invoiceSentOn || '',
    paymentDueOn: period?.paymentDueOn || '',
    paidOn: period?.paidOn || '',
    amountHt: period?.amountHt || 0,
    comments: period?.comments || '',
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
    chargeable: expense?.chargeable ?? true,
    includedInClientInvoice: expense?.includedInClientInvoice ?? false,
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
  const [periodDraft, setPeriodDraft] = useState<BillingPeriodDraft>(() => billingDraft());
  const [expenseEditor, setExpenseEditor] = useState<{ id?: number; draft: BillingExpenseDraft } | null>(null);
  const [periodMode, setPeriodMode] = useState<BillingPeriodMode>('calendar-month');
  const [customStart, setCustomStart] = useState(`${currentMonth()}-01`);
  const [customEnd, setCustomEnd] = useState(monthRange(currentMonth()).end);
  const [vesselFilter, setVesselFilter] = useState('');
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
    setPeriodDraft(billingDraft());
    void reload();
  }, [project.id]);

  const selectedPeriod = data.periods.find((period) => period.periodMonth.startsWith(selectedMonth));
  const periodExpenses = selectedPeriod
    ? data.expenses.filter((expense) => expense.billingPeriodId === selectedPeriod.id)
    : [];
  const periodDocuments = selectedPeriod
    ? data.documents.filter((document) => document.billingPeriodId === selectedPeriod.id)
    : [];
  const expenseTotal = periodExpenses.filter((expense) => expense.chargeable).reduce((sum, expense) => sum + expense.amountHt, 0);
  const vesselOptions = useMemo(
    () => Array.from(new Set(operations.map((operation) => operation.primaryVesselName).filter(Boolean))).sort(),
    [operations],
  );
  const filteredOperations = vesselFilter
    ? operations.filter((operation) => operation.primaryVesselName === vesselFilter)
    : operations;
  const exportRange = periodMode === 'calendar-month'
    ? monthRange(selectedMonth)
    : { start: customStart, end: customEnd };

  function selectMonth(month: string) {
    const normalized = month.slice(0, 7);
    setSelectedMonth(normalized);
    const period = data.periods.find((item) => item.periodMonth.startsWith(normalized));
    setPeriodDraft(billingDraft(period));
    const range = monthRange(normalized);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  }

  async function savePeriod() {
    if (!isManager || busy) return;
    setBusy('period');
    setError('');
    try {
      const saved = await saveProjectBillingPeriod(client, project.id, periodDraft);
      setData((current) => ({
        ...current,
        periods: [saved, ...current.periods.filter((period) => period.id !== saved.id)],
      }));
      setSelectedMonth(saved.periodMonth.slice(0, 7));
      setPeriodDraft(billingDraft(saved));
      setMessage('Facturation mensuelle enregistrée.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la facturation.');
    } finally {
      setBusy('');
    }
  }

  async function saveExpense() {
    if (!selectedPeriod || !expenseEditor || busy) return;
    if (!expenseEditor.draft.supplier || !expenseEditor.draft.invoiceDate || expenseEditor.draft.amountHt < 0) {
      setError('Renseignez le fournisseur, la date et un montant HT valide.');
      return;
    }
    if (expenseEditor.draft.category === 'other' && !expenseEditor.draft.nature.trim()) {
      setError('Précisez la nature du service « Autre ».');
      return;
    }
    setBusy('expense');
    setError('');
    try {
      const saved = await saveProjectChargeableExpense(
        client,
        project.id,
        selectedPeriod.id,
        expenseEditor.draft,
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

  async function uploadDocument(file: File, expenseId?: number) {
    if (!selectedPeriod || busy) return;
    setBusy('upload');
    setError('');
    try {
      const document = await uploadProjectBillingDocument(client, {
        projectId: project.id,
        billingPeriodId: selectedPeriod.id,
        expenseId,
        file,
        kind: expenseId ? 'chargeable_expense' : 'client_invoice',
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
        period: selectedPeriod,
        expenses: periodExpenses,
        operations: filteredOperations,
        startDate: exportRange.start,
        endDate: exportRange.end,
      }, periodDocuments, mode === 'preview' ? 'pdf' : exportFormat);
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

      <div className="project-billing-grid">
        <article className="project-billing-card">
          <header><ReceiptText aria-hidden="true" size={20} /><div><strong>Facture client</strong><span>{selectedPeriod ? 'Fiche enregistrée' : 'Nouvelle fiche mensuelle'}</span></div></header>
          <div className="project-billing-form">
            <label>Référence client<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, clientReference: event.target.value }))} value={periodDraft.clientReference} /></label>
            <label>N° de facture<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, invoiceNumber: event.target.value }))} value={periodDraft.invoiceNumber} /></label>
            <label>Date d’émission<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, invoiceIssuedOn: event.target.value }))} type="date" value={periodDraft.invoiceIssuedOn} /></label>
            <label>Date d’envoi<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, invoiceSentOn: event.target.value }))} type="date" value={periodDraft.invoiceSentOn} /></label>
            <label>Échéance<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, paymentDueOn: event.target.value }))} type="date" value={periodDraft.paymentDueOn} /></label>
            <label>Date de paiement<input disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, paidOn: event.target.value }))} type="date" value={periodDraft.paidOn} /></label>
            <label>Montant facture HT<input disabled={!isManager} min="0" onChange={(event) => setPeriodDraft((draft) => ({ ...draft, amountHt: Number(event.target.value) }))} step="0.01" type="number" value={periodDraft.amountHt} /></label>
            <label className="is-wide">Commentaires<textarea disabled={!isManager} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, comments: event.target.value }))} rows={2} value={periodDraft.comments} /></label>
          </div>
          {isManager ? <footer><button disabled={Boolean(busy)} onClick={() => void savePeriod()} type="button"><Save aria-hidden="true" size={16} /> Enregistrer le mois</button></footer> : null}
        </article>

        <article className="project-billing-card">
          <header><FileText aria-hidden="true" size={20} /><div><strong>Pièces du mois</strong><span>Stockage privé Supabase · liens temporaires</span></div></header>
          {selectedPeriod ? (
            <>
              {isManager ? (
                <label className="project-billing-upload">
                  <FilePlus2 aria-hidden="true" size={18} /> Ajouter la facture client
                  <input accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); event.currentTarget.value = ''; }} type="file" />
                </label>
              ) : null}
              <ul className="project-billing-documents">
                {periodDocuments.map((document) => (
                  <li key={document.id}>
                    <span><FileText aria-hidden="true" size={15} />{document.fileName}</span>
                    <button disabled={Boolean(busy)} onClick={() => void openDocument(document)} type="button"><ExternalLink aria-hidden="true" size={14} /> Ouvrir</button>
                  </li>
                ))}
              </ul>
              {!periodDocuments.length ? <p className="project-section-empty">Aucune pièce jointe pour ce mois.</p> : null}
            </>
          ) : <p className="project-section-empty">Enregistrez le mois avant d’ajouter des documents.</p>}
        </article>
      </div>

      <article className="project-billing-card">
        <header className="project-billing-card-heading">
          <div><Fuel aria-hidden="true" size={20} /><span><strong>Services refacturables</strong><small>{money(expenseTotal)} HT à refacturer</small></span></div>
          {isManager ? <button disabled={!selectedPeriod || Boolean(busy)} onClick={() => setExpenseEditor({ draft: expenseDraft(selectedMonth) })} type="button"><Plus aria-hidden="true" size={16} /> Ajouter un frais</button> : null}
        </header>
        <div className="project-billing-table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Catégorie</th><th>Fournisseur</th><th>Facture</th><th>Montant HT</th><th>État</th><th>Pièces</th><th>Actions</th></tr></thead>
            <tbody>
              {periodExpenses.map((expense) => {
                const documents = periodDocuments.filter((document) => document.chargeableExpenseId === expense.id);
                return (
                  <tr key={expense.id}>
                    <td>{expense.invoiceDate}</td>
                    <td>{expense.category === 'other' ? expense.nature : CATEGORY_LABELS[expense.category]}</td>
                    <td>{expense.supplier}</td>
                    <td>{expense.invoiceNumber || '—'}</td>
                    <td>{money(expense.amountHt, expense.currency)}</td>
                    <td>{expense.includedInClientInvoice ? 'Inclus à la facture' : expense.chargeable ? 'À refacturer' : 'Non refacturable'}</td>
                    <td>{documents.length}</td>
                    <td><div className="project-billing-row-actions">
                      {isManager ? <button onClick={() => setExpenseEditor({ id: expense.id, draft: expenseDraft(selectedMonth, expense) })} type="button">Modifier</button> : null}
                      {isManager ? <label className="is-button">Pièce<input disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, expense.id); event.currentTarget.value = ''; }} type="file" /></label> : null}
                      {isManager ? <button aria-label={`Supprimer ${expense.invoiceNumber || expense.supplier}`} className="is-danger" disabled={Boolean(busy)} onClick={() => void removeExpense(expense)} type="button"><Trash2 aria-hidden="true" size={14} /></button> : null}
                    </div></td>
                  </tr>
                );
              })}
              {!periodExpenses.length ? <tr><td className="project-billing-empty" colSpan={8}>Aucun service refacturable pour ce mois.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="project-billing-card project-billing-export">
        <header><CalendarRange aria-hidden="true" size={20} /><div><strong>Éléments de facturation</strong><span>Présentation inspirée du modèle P144 : opérations, frais et totaux HT.</span></div></header>
        <div className="project-billing-export-controls">
          <label>Période<select onChange={(event) => setPeriodMode(event.target.value as BillingPeriodMode)} value={periodMode}><option value="calendar-month">Mois calendaire</option><option value="custom">Période personnalisée</option></select></label>
          {periodMode === 'custom' ? <><label>Début<input onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label>Fin<input onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></> : null}
          <label>Navire<select onChange={(event) => setVesselFilter(event.target.value)} value={vesselFilter}><option value="">Tous les navires</option>{vesselOptions.map((vessel) => <option key={vessel}>{vessel}</option>)}</select></label>
          <label>Fichier<select onChange={(event) => setExportFormat(event.target.value as BillingExportFormat)} value={exportFormat}><option value="pdf">PDF standard</option><option value="merged-pdf">PDF + annexes PDF</option><option value="zip">ZIP + toutes les pièces</option></select></label>
          <label>Projet<input disabled value={`${project.projectCode} - ${project.title}`} /></label>
          <div className="project-billing-export-actions">
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
            <label>Fournisseur<input required onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, supplier: event.target.value } } : null)} value={expenseEditor.draft.supplier} /></label>
            <label>Date facture<input required onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceDate: event.target.value } } : null)} type="date" value={expenseEditor.draft.invoiceDate} /></label>
            <label>N° facture<input onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, invoiceNumber: event.target.value } } : null)} value={expenseEditor.draft.invoiceNumber} /></label>
            <label>Montant HT<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountHt: Number(event.target.value) } } : null)} required step="0.01" type="number" value={expenseEditor.draft.amountHt} /></label>
            <label>Montant TTC<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, amountTtc: event.target.value ? Number(event.target.value) : null } } : null)} step="0.01" type="number" value={expenseEditor.draft.amountTtc ?? ''} /></label>
            <label>Devise<input maxLength={3} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, currency: event.target.value.toUpperCase() } } : null)} value={expenseEditor.draft.currency} /></label>
            <label>Quantité<input min="0" onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, quantity: event.target.value ? Number(event.target.value) : null } } : null)} step="0.001" type="number" value={expenseEditor.draft.quantity ?? ''} /></label>
            <label>Unité<input onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, unit: event.target.value } } : null)} value={expenseEditor.draft.unit} /></label>
            <label className="is-wide">Commentaires<textarea onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, comments: event.target.value } } : null)} rows={3} value={expenseEditor.draft.comments} /></label>
            <label className="project-billing-check"><input checked={expenseEditor.draft.chargeable} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, chargeable: event.target.checked } } : null)} type="checkbox" /> Refacturable au client</label>
            <label className="project-billing-check"><input checked={expenseEditor.draft.includedInClientInvoice} onChange={(event) => setExpenseEditor((current) => current ? { ...current, draft: { ...current.draft, includedInClientInvoice: event.target.checked } } : null)} type="checkbox" /> Inclus à la facture client</label>
          </div>
        </AppDialog>
      ) : null}
    </section>
  );
}
