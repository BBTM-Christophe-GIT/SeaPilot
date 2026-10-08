import { useEffect, useRef, useState } from 'react';
import { PackageCheck, Plus, Save, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { billingRawLineTotal } from './projectBilling';
import type { BillingRawLineDraft, ProjectBillingRawLine, ProjectServiceCatalogDraft, ProjectServiceCatalogEntry } from './projectBilling';
import type { VesselRecord } from './projectQueries';
import './ProjectBillingRawLines.css';

interface ProjectBillingRawLinesProps {
  lines: ProjectBillingRawLine[];
  catalog: ProjectServiceCatalogEntry[];
  vessels?: VesselRecord[];
  isManager: boolean;
  disabled?: boolean;
  initialDate: string;
  onSave: (draft: BillingRawLineDraft, id?: number) => Promise<ProjectBillingRawLine>;
  onDelete: (id: number) => Promise<void>;
  onCatalogOpen: () => void;
  onCatalogCreate: (draft: ProjectServiceCatalogDraft) => Promise<ProjectServiceCatalogEntry>;
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
    vesselId: line.vesselId ?? null,
    vesselName: line.vesselName || '',
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
    && (left.vesselId ?? null) === (right.vesselId ?? null)
    && (left.vesselName || '') === (right.vesselName || '')
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

export function ProjectBillingRawLines({ lines, catalog, vessels = [], isManager, disabled = false, initialDate, onSave, onDelete, onCatalogOpen, onCatalogCreate, onDirtyChange }: ProjectBillingRawLinesProps) {
  const [rows, setRows] = useState<RawLineRow[]>(() => lines.map(rowFromLine));
  const [catalogRowKey, setCatalogRowKey] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogMode, setCatalogMode] = useState<'pick' | 'create'>('pick');
  const [catalogDraft, setCatalogDraft] = useState({ category: '', unitAmountHt: '', vesselId: null as number | null, vesselName: '' });
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const catalogCreatePending = useRef(false);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const catalogDesignationRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const deletedIds = useRef(new Set<number>());
  const dirty = rows.some(isDirty);
  const total = rows.reduce((sum, row) => sum + totalForValues(row.values), 0);
  const catalogRow = rows.find((row) => row.key === catalogRowKey);
  const catalogLocked = !isManager || disabled || Boolean(catalogRow?.pending) || catalogSaving;
  const search = catalogQuery.trim().toLocaleLowerCase('fr-FR');
  const matchingCatalog = catalog.filter((entry) => (
    (entry.active || entry.id === catalogRow?.values.serviceCatalogId)
    && `${entry.category} ${catalogVesselName(entry)}`.toLocaleLowerCase('fr-FR').includes(search)
  ));

  function availableVessels(selectedId?: number | null): VesselRecord[] {
    return vessels.filter((vessel) => (!vessel.assetKind || vessel.assetKind === 'vessel') && (vessel.active || vessel.id === selectedId)).sort(compareFleetAssets);
  }

  function vesselChoice(value: string, currentName = '') {
    if (!value) return { vesselId: null, vesselName: '' };
    const vesselId = Number(value);
    const vessel = vessels.find((item) => item.id === vesselId);
    return { vesselId, vesselName: vessel?.name || currentName };
  }

  function catalogVesselName(entry: ProjectServiceCatalogEntry) {
    return entry.vesselName || vessels.find((vessel) => vessel.id === entry.vesselId)?.name || '';
  }

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
  useEffect(() => {
    if (!catalogRowKey) return;
    if (catalogMode === 'create') catalogDesignationRef.current?.focus();
    else catalogSearchRef.current?.focus();
  }, [catalogRowKey, catalogMode]);

  function updateRow(key: string, update: Partial<RawLineValues>) {
    setRows((current) => current.map((row) => row.key === key
      ? { ...row, values: { ...row.values, ...update }, error: undefined }
      : row));
  }

  function addRow() {
    nextKey.current += 1;
    const values: RawLineValues = {
      serviceCatalogId: null, serviceDate: initialDate, designation: '',
      vesselId: null, vesselName: '',
      unitAmountHt: '0', quantity: '1', includeInPdf: true,
    };
    setRows((current) => [...current, { key: `new-${nextKey.current}`, values }]);
  }

  function selectCatalog(entry: ProjectServiceCatalogEntry) {
    if (!catalogRow || catalogLocked) return;
    updateRow(catalogRow.key, { serviceCatalogId: entry.id, vesselId: entry.vesselId ?? null, vesselName: catalogVesselName(entry), designation: entry.category, unitAmountHt: String(entry.unitAmountHt) });
    setCatalogRowKey(null);
  }

  function closeCatalog() {
    if (catalogSaving || catalogCreatePending.current) return;
    if (catalogMode === 'create') {
      setCatalogMode('pick');
      setCatalogError('');
    } else setCatalogRowKey(null);
  }

  function beginCatalogCreation() {
    if (catalogLocked) return;
    setCatalogDraft({ category: '', unitAmountHt: '', vesselId: null, vesselName: '' });
    setCatalogError('');
    setCatalogMode('create');
  }

  async function createCatalogEntry() {
    if (!catalogRow || catalogLocked || catalogCreatePending.current) return;
    const category = catalogDraft.category.trim();
    const unitAmountHt = Number(catalogDraft.unitAmountHt);
    const error = !category ? 'Renseignez la désignation de la prestation.'
      : category.length > 120 ? 'La désignation ne doit pas dépasser 120 caractères.'
        : !catalogDraft.unitAmountHt.trim() || !Number.isFinite(unitAmountHt) || unitAmountHt < 0
          ? 'Renseignez un prix unitaire HT positif ou nul.' : '';
    if (error) { setCatalogError(error); return; }
    const originKey = catalogRow.key;
    catalogCreatePending.current = true;
    setCatalogSaving(true);
    setCatalogError('');
    try {
      const entry = await onCatalogCreate({ category, unitAmountHt, vesselId: catalogDraft.vesselId, vesselName: catalogDraft.vesselName, descriptionHtml: '', active: true });
      updateRow(originKey, { serviceCatalogId: entry.id, vesselId: entry.vesselId ?? null, vesselName: catalogVesselName(entry), designation: entry.category, unitAmountHt: String(entry.unitAmountHt) });
      setCatalogRowKey(null);
      setCatalogMode('pick');
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'Impossible de créer cette prestation.');
    } finally {
      catalogCreatePending.current = false;
      setCatalogSaving(false);
    }
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
        <button className="sp-button sp-button--secondary" disabled={disabled || catalogSaving} onClick={onCatalogOpen} type="button"><PackageCheck aria-hidden="true" size={16} /> Catalogue de prestations</button>
      </div> : null}
    </div>
    <div className="project-billing-raw-scroll" role="region" aria-label="Tableau de saisie brute" tabIndex={0}>
      <table className="project-billing-raw-table">
        <thead><tr><th scope="col">Date</th><th scope="col">Navire</th><th scope="col">Désignation</th><th scope="col">Prix unitaire HT</th><th scope="col">Quantité</th><th scope="col">Prix Total HT</th><th scope="col">Actions</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const number = index + 1;
          const locked = !isManager || disabled || Boolean(row.pending) || catalogSaving;
          return <tr key={row.key}>
            <td><input aria-label={`Date, ligne ${number}`} disabled={locked} onChange={(event) => updateRow(row.key, { serviceDate: event.target.value })} required type="date" value={row.values.serviceDate} /></td>
            <td><select aria-label={`Navire, ligne ${number}`} disabled={locked} onChange={(event) => updateRow(row.key, vesselChoice(event.target.value, row.values.vesselName))} value={row.values.vesselId ?? ''}>
              <option value="">Sans navire</option>
              {row.values.vesselId != null && !availableVessels(row.values.vesselId).some((vessel) => vessel.id === row.values.vesselId) ? <option value={row.values.vesselId}>{row.values.vesselName || 'Navire archivé'}</option> : null}
              {availableVessels(row.values.vesselId).map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.id === row.values.vesselId && row.values.vesselName ? row.values.vesselName : vessel.name}</option>)}
            </select></td>
            <td className="project-billing-raw-designation">
              <div className="project-billing-raw-designation-input">
                <button aria-label={`Choisir dans le catalogue, ligne ${number}`} aria-haspopup="dialog" aria-expanded={catalogRowKey === row.key} className="sp-button sp-button--secondary project-billing-raw-catalog-button" disabled={locked} onClick={() => { setCatalogQuery(''); setCatalogMode('pick'); setCatalogRowKey(row.key); }} title="Choisir dans le catalogue" type="button"><Plus aria-hidden="true" size={17} /></button>
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
        })}{!rows.length ? <tr><td className="project-billing-raw-empty" colSpan={7}>Aucune ligne de saisie brute pour cette période.</td></tr> : null}</tbody>
      </table>
    </div>
    {isManager ? <div className="project-billing-raw-add">
      <button className="sp-button sp-button--primary" disabled={disabled || catalogSaving} onClick={addRow} type="button"><Plus aria-hidden="true" size={16} /> Ajouter une ligne</button>
    </div> : null}
    <div className="project-billing-raw-summary"><span>Total des lignes HT{dirty ? ' · modifications à enregistrer' : ''}</span><strong>{euros.format(total)}</strong></div>
    {catalogRow ? <div onKeyDown={(event) => { if (event.key === 'Escape' || event.key === 'Tab') event.stopPropagation(); }} onSubmit={(event) => event.stopPropagation()}>
      <AppDialog description={catalogMode === 'create' ? 'Enregistrez une prestation dans le catalogue pour remplir cette ligne.' : `Ligne ${rows.indexOf(catalogRow) + 1} · Sélectionnez une catégorie pour reprendre sa désignation et son prix unitaire HT.`} footer={catalogMode === 'create' ? <div className="project-billing-raw-catalog-form-actions">
        <button className="sp-button sp-button--secondary" disabled={catalogSaving} onClick={closeCatalog} type="button">Annuler</button>
        <button aria-label="Créer la prestation" className="sp-button sp-button--primary" disabled={catalogLocked} type="submit"><Plus aria-hidden="true" size={16} />{catalogSaving ? 'Création…' : 'Créer la prestation'}</button>
      </div> : undefined} icon={<PackageCheck aria-hidden="true" size={20} />} isBusy={catalogSaving} onClose={closeCatalog} onSubmit={catalogMode === 'create' ? (event) => { event.preventDefault(); void createCatalogEntry(); } : undefined} size="sm" title={catalogMode === 'create' ? 'Nouvelle prestation' : 'Choisir une prestation'}>
        {catalogMode === 'create' ? <div className="project-billing-raw-catalog-create">
          <label>Navire<select aria-label="Navire de la nouvelle prestation" disabled={catalogLocked} onChange={(event) => setCatalogDraft((current) => ({ ...current, ...vesselChoice(event.target.value, current.vesselName) }))} value={catalogDraft.vesselId ?? ''}>
            <option value="">Sans navire</option>
            {availableVessels(catalogDraft.vesselId).map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}
          </select></label>
          <label>Désignation *<input aria-label="Désignation de la nouvelle prestation" disabled={catalogLocked} maxLength={120} onChange={(event) => { setCatalogDraft((current) => ({ ...current, category: event.target.value })); setCatalogError(''); }} ref={catalogDesignationRef} required type="text" value={catalogDraft.category} /></label>
          <label>Prix unitaire HT *<input aria-label="Prix unitaire HT de la nouvelle prestation" disabled={catalogLocked} inputMode="decimal" min="0" onChange={(event) => { setCatalogDraft((current) => ({ ...current, unitAmountHt: event.target.value })); setCatalogError(''); }} required step="0.01" type="number" value={catalogDraft.unitAmountHt} /></label>
          {catalogError ? <p className="project-billing-raw-catalog-create-error" role="alert">{catalogError}</p> : null}
        </div> : <div className="project-billing-raw-catalog-picker">
          <label className="project-billing-raw-catalog-search">Rechercher une prestation<input disabled={catalogLocked} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Nom de la catégorie" ref={catalogSearchRef} type="search" value={catalogQuery} /></label>
          <button className="sp-button sp-button--primary project-billing-raw-catalog-new" disabled={catalogLocked} onClick={beginCatalogCreation} type="button"><Plus aria-hidden="true" size={16} />Nouvelle prestation</button>
          <div className="project-billing-raw-catalog-list">
            {matchingCatalog.map((entry) => <button aria-label={`Choisir ${entry.category}${catalogVesselName(entry) ? ` — ${catalogVesselName(entry)}` : ''}`} className="sp-button sp-button--secondary project-billing-raw-catalog-option" disabled={catalogLocked} key={entry.id} onClick={() => selectCatalog(entry)} type="button"><span className="project-billing-raw-catalog-option-identity"><strong>{entry.category}</strong><small>{catalogVesselName(entry) || 'Sans navire'}</small></span><span>{euros.format(entry.unitAmountHt)} HT</span></button>)}
            {!matchingCatalog.length ? <p className="project-billing-raw-catalog-empty">{search ? 'Aucune prestation ne correspond à votre recherche.' : 'Aucune prestation disponible dans le catalogue.'}</p> : null}
          </div>
        </div>}
      </AppDialog>
    </div> : null}
  </section>;
}
