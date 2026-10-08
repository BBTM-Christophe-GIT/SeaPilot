import { useEffect, useRef, useState } from 'react';
import { PackageCheck, Plus, Save, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { billingRawLineTotal } from './projectBilling';
import type { BillingRawLineDraft, ProjectBillingRawLine, ProjectServiceCatalogEntry } from './projectBilling';
import './ProjectBillingRawLines.css';

interface ProjectBillingRawLinesProps {
  lines: ProjectBillingRawLine[];
  catalog: ProjectServiceCatalogEntry[];
  isManager: boolean;
  disabled?: boolean;
  initialDate: string;
  onSave: (draft: BillingRawLineDraft, id?: number) => Promise<ProjectBillingRawLine>;
  onDelete: (id: number) => Promise<void>;
  onCatalogOpen: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

interface RawLineValues extends Omit<BillingRawLineDraft, 'unitAmountHt' | 'quantity'> {
  unitAmountHt: string;
  quantity: string;
}

interface RawLineRow {
  key: string;
  id?: number;
  values: RawLineValues;
  saved?: BillingRawLineDraft;
  pending?: 'save' | 'delete';
  awaitingAcknowledgement?: boolean;
  error?: string;
}

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function draftFromLine(line: ProjectBillingRawLine): BillingRawLineDraft {
  return {
    serviceCatalogId: line.serviceCatalogId,
    serviceDate: line.serviceDate,
    designation: line.designation,
    unitAmountHt: line.unitAmountHt,
    quantity: line.quantity,
    includeInPdf: true,
  };
}

function valuesFromDraft(draft: BillingRawLineDraft): RawLineValues {
  return { ...draft, unitAmountHt: String(draft.unitAmountHt), quantity: String(draft.quantity) };
}

function draftFromValues(values: RawLineValues): BillingRawLineDraft {
  return { ...values, unitAmountHt: Number(values.unitAmountHt), quantity: Number(values.quantity) };
}

function sameDraft(left: BillingRawLineDraft, right: BillingRawLineDraft): boolean {
  return left.serviceCatalogId === right.serviceCatalogId
    && left.serviceDate === right.serviceDate
    && left.designation === right.designation
    && left.unitAmountHt === right.unitAmountHt
    && left.quantity === right.quantity
    && (left.includeInPdf !== false) === (right.includeInPdf !== false);
}

function isDirty(row: RawLineRow): boolean {
  return !row.saved || row.values.unitAmountHt === '' || row.values.quantity === ''
    || !sameDraft(draftFromValues(row.values), row.saved);
}

function rowFromLine(line: ProjectBillingRawLine): RawLineRow {
  const saved = draftFromLine(line);
  return { key: `saved-${line.id}`, id: line.id, values: valuesFromDraft(saved), saved };
}

function totalForValues(values: RawLineValues): number {
  const unitAmountHt = Number(values.unitAmountHt);
  const quantity = Number(values.quantity);
  if (!Number.isFinite(unitAmountHt) || !Number.isFinite(quantity) || unitAmountHt < 0 || quantity < 0 || unitAmountHt >= 1e21 || quantity >= 1e21) return 0;
  return billingRawLineTotal({ unitAmountHt, quantity });
}

export function ProjectBillingRawLines({ lines, catalog, isManager, disabled = false, initialDate, onSave, onDelete, onCatalogOpen, onDirtyChange }: ProjectBillingRawLinesProps) {
  const [rows, setRows] = useState<RawLineRow[]>(() => lines.map(rowFromLine));
  const [catalogRowKey, setCatalogRowKey] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const nextKey = useRef(0);
  const deletedIds = useRef(new Set<number>());
  const dirty = rows.some(isDirty);
  const total = rows.reduce((sum, row) => sum + totalForValues(row.values), 0);
  const catalogRow = rows.find((row) => row.key === catalogRowKey);
  const catalogLocked = !isManager || disabled || Boolean(catalogRow?.pending);
  const search = catalogQuery.trim().toLocaleLowerCase('fr-FR');
  const matchingCatalog = catalog.filter((entry) => (
    (entry.active || entry.id === catalogRow?.values.serviceCatalogId)
    && entry.category.toLocaleLowerCase('fr-FR').includes(search)
  ));

  useEffect(() => {
    const incoming = new Map(lines.map((line) => [line.id, line]));
    for (const id of deletedIds.current) {
      if (!incoming.has(id)) deletedIds.current.delete(id);
    }
    setRows((current) => {
      const merged = current
        .filter((row) => row.id === undefined || incoming.has(row.id) || row.pending || isDirty(row))
        .map((row) => {
          const line = row.id === undefined ? undefined : incoming.get(row.id);
          if (!line || row.pending || isDirty(row)) return row;
          const saved = draftFromLine(line);
          if (row.awaitingAcknowledgement && row.saved && !sameDraft(saved, row.saved)) return row;
          if (row.saved && sameDraft(saved, row.saved) && !row.awaitingAcknowledgement) return row;
          return { ...row, values: valuesFromDraft(saved), saved, awaitingAcknowledgement: false };
        });
      const representedIds = new Set(merged.map((row) => row.id));
      for (const line of lines) {
        if (!representedIds.has(line.id) && !deletedIds.current.has(line.id)) merged.push(rowFromLine(line));
      }
      return merged;
    });
  }, [lines]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  function updateRow(key: string, update: Partial<RawLineValues>) {
    setRows((current) => current.map((row) => row.key === key
      ? { ...row, values: { ...row.values, ...update }, error: undefined }
      : row));
  }

  function addRow() {
    nextKey.current += 1;
    const values: RawLineValues = {
      serviceCatalogId: null, serviceDate: initialDate, designation: '',
      unitAmountHt: '0', quantity: '1', includeInPdf: true,
    };
    setRows((current) => [...current, { key: `new-${nextKey.current}`, values }]);
  }

  function selectCatalog(entry: ProjectServiceCatalogEntry) {
    if (!catalogRow || catalogLocked) return;
    updateRow(catalogRow.key, { serviceCatalogId: entry.id, designation: entry.category, unitAmountHt: String(entry.unitAmountHt) });
    setCatalogRowKey(null);
  }

  async function saveRow(row: RawLineRow) {
    const draft = draftFromValues(row.values);
    draft.designation = draft.designation.trim();
    const error = !draft.serviceDate ? 'Renseignez la date de la prestation.'
      : !draft.designation ? 'Renseignez la désignation de la prestation.'
        : row.values.unitAmountHt === '' || !Number.isFinite(draft.unitAmountHt) || draft.unitAmountHt < 0
          ? 'Renseignez un prix unitaire HT positif ou nul.'
          : row.values.quantity === '' || !Number.isFinite(draft.quantity) || draft.quantity < 0
            ? 'Renseignez une quantité positive ou nulle.' : '';
    if (error) {
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, error } : item));
      return;
    }
    setRows((current) => current.map((item) => item.key === row.key ? { ...item, pending: 'save', error: undefined } : item));
    try {
      const line = await onSave(draft, row.id);
      const saved = draftFromLine(line);
      setRows((current) => current
        .filter((item) => item.key === row.key || item.id !== line.id)
        .map((item) => item.key === row.key
          ? { ...item, id: line.id, saved, values: valuesFromDraft(saved), pending: undefined, awaitingAcknowledgement: true }
          : item));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Impossible d’enregistrer cette ligne.';
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, pending: undefined, error: message } : item));
    }
  }

  async function deleteRow(row: RawLineRow) {
    if (row.id === undefined) {
      setRows((current) => current.filter((item) => item.key !== row.key));
      return;
    }
    if (!window.confirm(`Supprimer la ligne « ${row.values.designation} » de cette période ?`)) return;
    setRows((current) => current.map((item) => item.key === row.key ? { ...item, pending: 'delete', error: undefined } : item));
    try {
      await onDelete(row.id);
      deletedIds.current.add(row.id);
      setRows((current) => current.filter((item) => item.key !== row.key));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Impossible de supprimer cette ligne.';
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, pending: undefined, error: message } : item));
    }
  }

  return <section className="project-billing-raw-lines" aria-label="Saisie brute">
    <div className="project-billing-raw-heading">
      <div><strong>Saisie brute</strong><p>Choisissez une prestation du catalogue ou saisissez votre ligne librement.</p></div>
      {isManager ? <div className="project-billing-raw-toolbar">
        <button className="sp-button sp-button--secondary" disabled={disabled} onClick={onCatalogOpen} type="button"><PackageCheck aria-hidden="true" size={16} /> Catalogue de prestations</button>
      </div> : null}
    </div>
    <div className="project-billing-raw-scroll" role="region" aria-label="Tableau de saisie brute" tabIndex={0}>
      <table className="project-billing-raw-table">
        <thead><tr><th scope="col">Date</th><th scope="col">Désignation</th><th scope="col">Prix unitaire HT</th><th scope="col">Quantité</th><th scope="col">Prix Total HT</th><th scope="col">Actions</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const number = index + 1;
          const locked = !isManager || disabled || Boolean(row.pending);
          return <tr key={row.key}>
            <td><input aria-label={`Date, ligne ${number}`} disabled={locked} onChange={(event) => updateRow(row.key, { serviceDate: event.target.value })} required type="date" value={row.values.serviceDate} /></td>
            <td className="project-billing-raw-designation">
              <div className="project-billing-raw-designation-input">
                <button aria-label={`Choisir dans le catalogue, ligne ${number}`} aria-haspopup="dialog" aria-expanded={catalogRowKey === row.key} className="sp-button sp-button--secondary project-billing-raw-catalog-button" disabled={locked} onClick={() => { setCatalogQuery(''); setCatalogRowKey(row.key); }} title="Choisir dans le catalogue" type="button"><Plus aria-hidden="true" size={17} /></button>
                <input aria-label={`Désignation, ligne ${number}`} disabled={locked} maxLength={120} onChange={(event) => updateRow(row.key, { designation: event.target.value, serviceCatalogId: null })} placeholder="Désignation libre" required type="text" value={row.values.designation} />
              </div>
            </td>
            <td><input aria-label={`Prix unitaire HT, ligne ${number}`} disabled={locked} inputMode="decimal" min="0" onChange={(event) => updateRow(row.key, { unitAmountHt: event.target.value })} required step="0.01" type="number" value={row.values.unitAmountHt} /></td>
            <td><input aria-label={`Quantité, ligne ${number}`} disabled={locked} inputMode="decimal" min="0" onChange={(event) => updateRow(row.key, { quantity: event.target.value })} required step="0.001" type="number" value={row.values.quantity} /></td>
            <td className="project-billing-raw-total"><output aria-label={`Prix Total HT, ligne ${number}`}>{euros.format(totalForValues(row.values))}</output></td>
            <td><div className="project-billing-raw-actions">
              {isManager ? <div className="project-billing-raw-row-buttons">
                <button aria-label={`Enregistrer la ligne ${number}`} className="sp-button sp-button--secondary" disabled={locked || !isDirty(row)} onClick={() => void saveRow(row)} type="button"><Save aria-hidden="true" size={15} />{row.pending === 'save' ? 'Enregistrement…' : 'Enregistrer'}</button>
                <button aria-label={`Supprimer la ligne ${number}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => void deleteRow(row)} type="button"><Trash2 aria-hidden="true" size={15} /></button>
              </div> : null}
              {row.pending === 'delete' ? <small role="status">Suppression…</small> : null}
              {isDirty(row) && !row.pending ? <small>Non enregistrée</small> : null}
              {row.error ? <p className="project-billing-raw-error" role="alert">{row.error}</p> : null}
            </div></td>
          </tr>;
        })}{!rows.length ? <tr><td className="project-billing-raw-empty" colSpan={6}>Aucune ligne de saisie brute pour cette période.</td></tr> : null}</tbody>
      </table>
    </div>
    {isManager ? <div className="project-billing-raw-add">
      <button className="sp-button sp-button--primary" disabled={disabled} onClick={addRow} type="button"><Plus aria-hidden="true" size={16} /> Ajouter une ligne</button>
    </div> : null}
    <div className="project-billing-raw-summary"><span>Total des lignes HT{dirty ? ' · modifications à enregistrer' : ''}</span><strong>{euros.format(total)}</strong></div>
    {catalogRow ? <div onKeyDown={(event) => { if (event.key === 'Escape' || event.key === 'Tab') event.stopPropagation(); }}>
      <AppDialog description={`Ligne ${rows.indexOf(catalogRow) + 1} · Sélectionnez une catégorie pour reprendre sa désignation et son prix unitaire HT.`} icon={<PackageCheck aria-hidden="true" size={20} />} onClose={() => setCatalogRowKey(null)} size="sm" title="Choisir une prestation">
        <div className="project-billing-raw-catalog-picker">
          <label className="project-billing-raw-catalog-search">Rechercher une prestation<input disabled={catalogLocked} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Nom de la catégorie" type="search" value={catalogQuery} /></label>
          <div className="project-billing-raw-catalog-list">
            {matchingCatalog.map((entry) => <button aria-label={`Choisir ${entry.category}`} className="sp-button sp-button--secondary project-billing-raw-catalog-option" disabled={catalogLocked} key={entry.id} onClick={() => selectCatalog(entry)} type="button"><strong>{entry.category}</strong><span>{euros.format(entry.unitAmountHt)} HT</span></button>)}
            {!matchingCatalog.length ? <p className="project-billing-raw-catalog-empty">{search ? 'Aucune prestation ne correspond à votre recherche.' : 'Aucune prestation disponible dans le catalogue.'}</p> : null}
          </div>
        </div>
      </AppDialog>
    </div> : null}
  </section>;
}
