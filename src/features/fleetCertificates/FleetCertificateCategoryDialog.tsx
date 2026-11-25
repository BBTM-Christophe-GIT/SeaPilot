import { ListTree, Plus } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  FLEET_CERTIFICATE_VESSEL_TYPE_LABELS,
  type FleetCertificateCatalogCategory,
  type FleetCertificateVesselType,
  type SaveFleetCertificateCategoryInput,
} from './fleetCertificateCategoryQueries';
import './fleetCertificateCategoryDialog.css';

interface FleetCertificateCategoryDialogProps {
  categories: FleetCertificateCatalogCategory[];
  companyId: number | undefined;
  onClose: () => void;
  onSave: (input: SaveFleetCertificateCategoryInput) => Promise<void>;
}

const categoryOrder = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

export function FleetCertificateCategoryDialog({
  categories,
  companyId,
  onClose,
  onSave,
}: FleetCertificateCategoryDialogProps) {
  const [vesselType, setVesselType] = useState<FleetCertificateVesselType>('maritime');
  const [draft, setDraft] = useState<SaveFleetCertificateCategoryInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submitPending = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonsRef = useRef(new Map<number, HTMLButtonElement>());
  const scopedCategories = categories
    .filter((category) => category.companyId === companyId && category.vesselType === vesselType)
    .sort((left, right) => categoryOrder.compare(left.label, right.label));
  const scopedKeys = new Set(scopedCategories.map((category) => category.key));
  const roots = scopedCategories.filter((category) => !category.parentKey || !scopedKeys.has(category.parentKey));
  const orderedCategories = roots.flatMap((root) => [
    root,
    ...scopedCategories.filter((category) => category.parentKey === root.key),
  ]);
  const editedCategory = scopedCategories.find((category) => category.id === draft?.id);
  const hasChildren = Boolean(editedCategory && scopedCategories.some((category) => category.parentKey === editedCategory.key));
  const parentOptions = roots.filter((category) => (
    !category.parentKey && category.id !== draft?.id && (category.isActive || category.key === draft?.parentKey)
  ));

  function beginEdit(category?: FleetCertificateCatalogCategory) {
    if (companyId === undefined) return;
    setError('');
    setNotice('');
    setDraft({
      id: category?.id,
      companyId,
      vesselType,
      label: category?.label ?? '',
      parentKey: category?.parentKey,
      isActive: category?.isActive ?? true,
    });
  }

  function returnToCategories(id?: number) {
    setDraft(null);
    setError('');
    window.requestAnimationFrame(() => {
      const button = id === undefined ? null : editButtonsRef.current.get(id);
      (button ?? addButtonRef.current)?.focus();
    });
  }

  async function save(input: SaveFleetCertificateCategoryInput, successMessage: string) {
    if (submitPending.current) return;
    submitPending.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await onSave(input);
      returnToCategories(input.id);
      setNotice(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’enregistrer la catégorie.');
    } finally {
      submitPending.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.label.trim()) return;
    void save({ ...draft, label: draft.label.trim() }, draft.id ? 'Catégorie mise à jour.' : 'Catégorie ajoutée.');
  }

  function toggleArchive(category: FleetCertificateCatalogCategory) {
    setNotice('');
    if (category.isActive && scopedCategories.some((item) => item.isActive && item.parentKey === category.key)) {
      setError('Archivez d’abord les sous-catégories actives.');
      return;
    }
    if (!category.isActive && category.parentKey && scopedCategories.some((item) => !item.isActive && item.key === category.parentKey)) {
      setError('Réactivez d’abord la catégorie parente.');
      return;
    }
    const { id, companyId, vesselType, label, parentKey, isActive } = category;
    void save({ id, companyId, vesselType, label, parentKey, isActive: !isActive }, isActive ? 'Catégorie archivée.' : 'Catégorie réactivée.');
  }

  return (
    <AppDialog
      description="Les catégories archivées restent visibles sur les documents existants."
      footer={(
        <div className="app-dialog__actions">
          {draft ? <>
            <button className="sp-button sp-button--secondary" disabled={saving} onClick={() => returnToCategories(draft.id)} type="button">Annuler</button>
            <button className="sp-button sp-button--primary is-primary" disabled={saving || !draft.label.trim()} type="submit">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </> : <>
            <button className="sp-button sp-button--secondary" disabled={saving} onClick={onClose} type="button">Fermer</button>
            <button className="sp-button sp-button--primary is-primary" disabled={saving || companyId === undefined} onClick={() => beginEdit()} ref={addButtonRef} type="button">
              <Plus aria-hidden="true" size={16} /> Ajouter une catégorie
            </button>
          </>}
        </div>
      )}
      icon={<ListTree aria-hidden="true" size={20} />}
      isBusy={saving}
      onClose={onClose}
      onSubmit={submit}
      title="Gérer les catégories"
    >
      <div className="fleet-certificate-category-dialog">
        <div className="fleet-certificate-category-fields">
          <label>Type de navire
            <select disabled={saving || draft !== null} value={vesselType} onChange={(event) => { setVesselType(event.target.value as FleetCertificateVesselType); setNotice(''); setError(''); }}>
              {Object.entries(FLEET_CERTIFICATE_VESSEL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {notice ? <p className="fleet-certificate-category-notice" role="status">{notice}</p> : null}
        {error ? <p className="fleet-certificate-category-error" role="alert">{error}</p> : null}
        {draft ? (
          <fieldset className="fleet-certificate-category-fields" disabled={saving}>
            <legend>{draft.id ? 'Modifier la catégorie' : 'Ajouter une catégorie'}</legend>
            <label className="fleet-certificate-category-label">Libellé
              <input autoFocus maxLength={160} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required value={draft.label} />
            </label>
            <label>Catégorie parente
              <select disabled={hasChildren} value={draft.parentKey ?? ''} onChange={(event) => setDraft({ ...draft, parentKey: event.target.value || undefined })}>
                <option value="">Aucune</option>
                {parentOptions.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
              </select>
            </label>
          </fieldset>
        ) : orderedCategories.length ? (
          <ul aria-label="Catégories de documents" className="fleet-certificate-category-list">
            {orderedCategories.map((category) => (
              <li key={category.id} className={category.parentKey ? 'is-child' : undefined}>
                <span>
                  {category.label}
                  {!category.isActive ? <small>Archivée</small> : null}
                </span>
                <div className="fleet-certificate-category-actions">
                  <button
                    aria-label={`Modifier ${category.label}`}
                    className="sp-button sp-button--secondary"
                    disabled={saving}
                    onClick={() => beginEdit(category)}
                    ref={(button) => {
                      if (button) editButtonsRef.current.set(category.id, button);
                      else editButtonsRef.current.delete(category.id);
                    }}
                    type="button"
                  >
                    Modifier
                  </button>
                  <button
                    aria-label={`${category.isActive ? 'Archiver' : 'Réactiver'} ${category.label}`}
                    className="sp-button sp-button--secondary"
                    disabled={saving}
                    onClick={() => toggleArchive(category)}
                    type="button"
                  >
                    {category.isActive ? 'Archiver' : 'Réactiver'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p>Aucune catégorie pour ce type de navire.</p>}
      </div>
    </AppDialog>
  );
}
