import { useMemo, useState } from 'react';
import { CircleX } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { CONDITION_LABELS, DECISIONS, annualExpiry, editableEntry, entryComplete, entryUnsatisfactory, todayLocal, type InspectionEntry, type ItemCondition, type ItemDraft, type LiftingKind, type LiftingVessel } from './liftingModel';
import { ACCESSORIES, TOWING_TYPES, accessoryDefinition, applicableCodes, groupByAccessory, type ControlCode } from './liftingControls';
import { LiftingFilters } from './LiftingFilters';
import { matchesLiftingItem } from './liftingSearch';

export function LiftingItemForm({ initial, kind, busy, error, onClose, onSave }: {
  initial: ItemDraft; kind: LiftingKind; busy: boolean; error: string; onClose: () => void; onSave: (draft: ItemDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (key: keyof ItemDraft, value: string | number | null) => setDraft((previous) => ({ ...previous, [key]: value }));
  return <AppDialog title="Fiche matériel" eyebrow={kind === 'towing' ? 'Remorque maritime' : 'Apparaux de levage'} onClose={onClose} isBusy={busy}
    onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy}>Enregistrer le matériel</button></>}>
    <div className="lifting-form-grid">
      <label>Identifiant du matériel<input readOnly value={draft.reference} placeholder="Attribué automatiquement à l’enregistrement" /><small className="lifting-muted">Numérotation chronologique automatique à partir de 1.</small></label>
      <label>Type d’accessoire<select required value={accessoryDefinition(draft.material_type)?.fr || draft.material_type} onChange={(e) => setDraft({ ...draft, material_type: e.target.value, towing_type: e.target.value === 'Remorque' ? draft.towing_type || 'textile_line' : null })}>
        {ACCESSORIES.map((type) => <option key={type.code} value={type.fr}>{type.fr} ({type.code})</option>)}
      </select></label>
      {draft.material_type === 'Remorque' && <label className="lifting-span">Type de remorque<select required value={draft.towing_type || ''} onChange={(e) => change('towing_type', e.target.value)}><option disabled value="">Choisir le type de remorque</option>{TOWING_TYPES.map((type) => <option key={type.key} value={type.key}>{type.fr}</option>)}</select></label>}
      {draft.material_type === 'Remorque' && kind !== 'towing' && <p className="lifting-muted lifting-span">Ce matériel sera enregistré dans la section Remorques.</p>}
      <label className="lifting-span">Description<textarea required maxLength={2000} value={draft.description} onChange={(e) => change('description', e.target.value)} /></label>
      <label>CMU (tonnes)<input type="number" min="0.001" step="any" inputMode="decimal" value={draft.swl_tonnes ?? ''} onChange={(e) => change('swl_tonnes', e.target.value ? Number(e.target.value) : null)} placeholder="Non renseignée" /></label>
      <label>Numéro de série<input value={draft.serial_number} onChange={(e) => change('serial_number', e.target.value)} /></label>
      <label className="lifting-span">Emplacement à bord<input value={draft.location} onChange={(e) => change('location', e.target.value)} /></label>
      <label className="lifting-span">Notes<textarea value={draft.notes} onChange={(e) => change('notes', e.target.value)} /></label>
    </div>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}

export function LiftingStartForm({ vessels, initialVesselId, busy, error, onClose, onSave }: { vessels: LiftingVessel[]; initialVesselId: number; busy: boolean; error: string; onClose: () => void; onSave: (vesselId: number, issued: string, expires: string) => void }) {
  const [vesselId, setVesselId] = useState(initialVesselId);
  const [issued, setIssued] = useState(todayLocal());
  const [expires, setExpires] = useState(annualExpiry(issued));
  return <AppDialog title="Nouveau contrôle annuel" onClose={onClose} isBusy={busy}
    description="Le formulaire reprend tous les matériels actifs de cette section et de ce navire."
    onSubmit={(e) => { e.preventDefault(); onSave(vesselId, issued, expires); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !vesselId}>Démarrer le contrôle</button></>}>
    <div className="lifting-form-grid">
      <label className="lifting-span">Navire / site à contrôler<select required disabled={busy} value={vesselId} onChange={(e) => setVesselId(Number(e.target.value))}><option value="">Choisir un navire ou un site</option>{vessels.map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}</select></label>
      <label>Date d’émission<input type="date" required value={issued} onChange={(e) => { setIssued(e.target.value); setExpires(annualExpiry(e.target.value)); }} /></label>
      <label>Date d’échéance<input type="date" required min={issued} value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
    </div>
    <p>Vérificateur : <strong>Antoine MONCEAUX</strong></p>
    <p className="lifting-muted">Vous pouvez démarrer un nouveau contrôle avant l’échéance du précédent, y compris la même année. Une échéance d’un an est proposée et reste ajustable. Le PDF final sera classé dans « Certificats flotte ».</p>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}

export function LiftingControlForm({ entries, busy, error, onSave, onDirtyChange }: {
  entries: InspectionEntry[]; busy: boolean; error: string; onSave: (entries: InspectionEntry[]) => Promise<boolean>; onDirtyChange: (dirty: boolean) => void;
}) {
  const [changes, setChanges] = useState<Record<number, InspectionEntry>>({});
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const visible = useMemo(() => entries.filter((entry) => matchesLiftingItem(entry.item_snapshot, query, type, (changes[entry.id] || entry).observations)), [entries, query, type, changes]);
  const groups = useMemo(() => groupByAccessory(visible, (entry) => entry.item_snapshot), [visible]);
  const pending = visible.filter((entry) => changes[entry.id] || entry.condition === 'pending');
  const hiddenChanges = entries.filter((entry) => changes[entry.id] && !visible.some((row) => row.id === entry.id)).length;
  const update = (entry: InspectionEntry) => { setChanges((previous) => ({ ...previous, [entry.id]: entry })); onDirtyChange(true); };
  async function save(rows: InspectionEntry[]) {
    if (await onSave(rows)) {
      const remaining = { ...changes }; rows.forEach((entry) => { delete remaining[entry.id]; });
      setChanges(remaining); onDirtyChange(Object.keys(remaining).length > 0);
    }
  }
  return <form className="lifting-control-form" onSubmit={(e) => { e.preventDefault(); void save(pending.map((entry) => changes[entry.id] || editableEntry(entry))); }}>
    <p className="lifting-control-instructions">Les cases sont précochées. Décochez un code si le point est non conforme, puis indiquez la décision et vos observations. Enregistrez les matériels examinés.</p>
    <LiftingFilters items={entries.map((entry) => entry.item_snapshot)} query={query} type={type} onQuery={setQuery} onType={setType} count={visible.length} context="contrôle" />
    {!visible.length && <p className="lifting-empty">Aucun matériel ne correspond aux filtres.</p>}
    {hiddenChanges > 0 && <p className="lifting-control-instructions">{hiddenChanges} matériel(s) masqué(s) ont des modifications non enregistrées. Réinitialisez les filtres pour les retrouver.</p>}
    {groups.map((group) => <section className="lifting-accessory-group" key={group.label} aria-label={group.label}>
      <header><div><h3>{group.label} <span>{group.definition?.code}</span></h3><i lang="en">{group.definition?.en}</i></div><strong>{group.rows.length} matériel{group.rows.length > 1 ? 's' : ''}</strong></header>
      <details className="lifting-control-help"><summary>Détail des points de contrôle</summary>
        {group.definition && applicableCodes(group.rows[0].item_snapshot).length ? <dl>{applicableCodes(group.rows[0].item_snapshot).map((code) => <div key={code}><dt>{code}</dt><dd>{group.definition!.checks[code]!.fr}<i lang="en">{group.definition!.checks[code]!.en}</i></dd></div>)}</dl> : <p>Le détail des contrôles de ce type d’accessoire reste à renseigner à partir de la notice du vérificateur.</p>}
      </details>
      {group.rows.map((entry) => {
        const draft = changes[entry.id] || editableEntry(entry);
        const item = entry.item_snapshot; const codes = applicableCodes(item);
        function toggle(code: ControlCode, checked: boolean) { update({ ...draft, checks: { ...draft.checks, [code]: checked ? 'ok' : 'defect' }, condition: !checked && draft.condition === 'good' ? 'repair' : draft.condition }); }
        const unsatisfactory = entryUnsatisfactory(draft);
        return <article className={`lifting-control-item${unsatisfactory ? ' is-unsatisfactory' : ''}`} key={entry.id} aria-label={`Matériel ${item.reference}`}>
          <div className="lifting-control-item-heading"><span className="lifting-id">{item.reference}</span><div><h4>{item.description}</h4><p>{item.swl_tonnes === null ? 'CMU non renseignée' : `CMU ${item.swl_tonnes} t`}{item.legacy_reference && ` · Ancien identifiant ${item.legacy_reference}`}{item.serial_number && ` · N° ${item.serial_number}`}</p></div>{unsatisfactory && <span className="lifting-unsatisfactory"><CircleX size={19} aria-hidden="true" /> Résultat insatisfaisant</span>}<span className={`lifting-status ${changes[entry.id] || entry.condition === 'pending' ? 'draft' : entry.condition}`}>{changes[entry.id] || entry.condition === 'pending' ? 'À enregistrer' : entryComplete(entry) ? 'Enregistré' : 'À compléter'}</span></div>
          <div className="lifting-control-item-fields">
            <fieldset disabled={busy}><legend>Points de contrôle</legend><div className="lifting-code-checkboxes">{codes.map((code) => <label key={code} title={group.definition?.checks[code]?.fr} className={draft.checks[code] === 'defect' ? 'is-defect' : ''}><input type="checkbox" aria-label={code} checked={draft.checks[code] === 'ok'} onChange={(e) => toggle(code, e.target.checked)} />{code}{draft.checks[code] === 'defect' && <CircleX size={16} aria-label={`${code} : insatisfaisant`} />}</label>)}</div>{!codes.length && <p className="lifting-muted">Notice de contrôle à compléter.</p>}</fieldset>
            <label>Décision pour ce matériel<select disabled={busy} value={draft.condition} onChange={(e) => update({ ...draft, condition: e.target.value as ItemCondition })}>{DECISIONS.map((decision) => <option key={decision} value={decision}>{CONDITION_LABELS[decision]}</option>)}</select></label>
            <label className="lifting-control-observation">Observation<textarea disabled={busy} rows={2} value={draft.observations} onChange={(e) => update({ ...draft, observations: e.target.value })} placeholder="Défaut constaté, réparation à réaliser…" /></label>
          </div>
          {unsatisfactory && draft.condition === 'good' && <p className="lifting-error">Le résultat est insatisfaisant. Choisissez le maintien après réparation ou la mise au rebut.</p>}
          <div className="lifting-control-item-footer"><span className="lifting-muted">{draft.condition === 'repair' ? 'Réparation à réaliser avant la remise en service.' : draft.condition === 'withdrawn' ? 'Matériel à retirer du service et à mettre au rebut.' : 'Les observations seront reprises dans le rapport.'}</span><button type="button" className="secondary-button" disabled={busy || !codes.length} onClick={() => void save([draft])}>Enregistrer le matériel {item.reference}</button></div>
        </article>;
      })}
    </section>)}
    {error && <p role="alert" className="lifting-error">{error}</p>}
    <div className="lifting-save-controls"><span>{pending.length ? `${pending.length} matériel${pending.length > 1 ? 's' : ''} affiché${pending.length > 1 ? 's' : ''} à enregistrer` : hiddenChanges ? 'Des modifications masquées restent à enregistrer.' : !visible.length ? 'Aucun matériel affiché.' : query || type ? 'Les contrôles affichés sont enregistrés.' : 'Tous les changements sont enregistrés.'}</span><button type="submit" className="primary-button" disabled={busy || !pending.length || pending.some((entry) => !applicableCodes(entry.item_snapshot).length)}>{busy ? 'Enregistrement…' : query || type ? 'Enregistrer les contrôles affichés' : 'Enregistrer tous les contrôles'}</button></div>
  </form>;
}
