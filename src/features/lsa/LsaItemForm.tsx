import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchNextLsaNumber } from './lsaQueries';
import { useEffect, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareLsaNames, numberedLsaTitle, type LsaCatalog, type LsaDraft, type LsaItem } from './lsaModel';

export function LsaItemForm({ initial, item, client, vesselId, catalog, busy, error, onClose, onSave }: {
  initial: LsaDraft; item?: LsaItem; client: SupabaseClient; vesselId: number; catalog: LsaCatalog;
  busy: boolean; error: string; onClose: () => void; onSave: (draft: LsaDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (key: keyof LsaDraft, value: string) => setDraft({ ...draft, [key]: value });
  const selected = catalog.designations.find((entry) => entry.id === draft.designation_id);
  const type = catalog.types.find((entry) => entry.id === selected?.equipment_type_id);
  const [nextNumber, setNextNumber] = useState<{ designationId: number; number: number } | null>(null);
  const [numberError, setNumberError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setNumberError('');
    if (!draft.designation_id || draft.designation_id === item?.designation_id) return;
    const designationId = draft.designation_id;
    fetchNextLsaNumber(client, vesselId, designationId).then((number) => {
      if (!cancelled) setNextNumber({ designationId, number });
    }).catch(() => { if (!cancelled) setNumberError('Le numéro sera attribué à l’enregistrement.'); });
    return () => { cancelled = true; };
  }, [client, vesselId, draft.designation_id, item?.designation_id]);
  const number = item?.designation_id === selected?.id ? item?.item_number : nextNumber?.designationId === selected?.id ? nextNumber?.number : null;
  const unchanged = item && item.designation_id === draft.designation_id;
  const title = unchanged ? item.document_title : selected && number ? numberedLsaTitle(selected.name, number) : '';
  return <AppDialog title="Fiche matériel LSA" eyebrow="Équipements de sauvetage" isBusy={busy} onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
    <div className="lifting-form-grid">
      <label className="lifting-span">Désignation<select aria-label="Désignation" required={!item || item.designation_id !== null} disabled={busy} value={draft.designation_id ?? ''} onChange={(event) => setDraft({ ...draft, designation_id: event.target.value ? Number(event.target.value) : null })}>
        <option value="">{item && !item.designation_id ? `Conserver : ${item.document_title}` : 'Choisir une désignation'}</option>
        {[...catalog.types].sort(compareLsaNames).map((group) => {
          const entries = catalog.designations.filter((entry) => entry.equipment_type_id === group.id && ((entry.active && group.active) || entry.id === item?.designation_id)).sort(compareLsaNames);
          return entries.length > 0 && <optgroup key={group.id} label={group.name}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{!entry.active || !group.active ? ' (archivé)' : ''}</option>)}</optgroup>;
        })}
      </select></label>
      {(title || type) && <div className="lifting-span lsa-designation-preview" role="status"><strong>{title}</strong><span>{type?.name || item?.category_label}</span>{!unchanged && <small>Numéro définitif confirmé à l’enregistrement pour ce navire.</small>}</div>}
      <label>Marque<input maxLength={200} value={draft.brand || ''} onChange={(event) => change('brand', event.target.value)} /></label>
      <label>Modèle<input maxLength={200} value={draft.model || ''} onChange={(event) => change('model', event.target.value)} /></label>
      <label className="lifting-span">Numéro de série<input maxLength={200} value={draft.serial_number || ''} onChange={(event) => change('serial_number', event.target.value)} /></label>
      <label className="lifting-span">Date d’échéance<input type="date" value={draft.expires_on || ''} onChange={(event) => change('expires_on', event.target.value)} /><small>Alarme à partir de J−90, puis matériel signalé échu après cette date.</small></label>
      <label className="lifting-span">Notes<textarea value={draft.notes || ''} onChange={(event) => change('notes', event.target.value)} /></label>
    </div>
    {numberError && <p role="status">{numberError}</p>}
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
