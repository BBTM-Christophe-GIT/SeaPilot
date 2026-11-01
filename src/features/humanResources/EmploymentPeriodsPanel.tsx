import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getPersonEmploymentPeriods, savePersonEmploymentPeriods, validateEmploymentPeriods, type EmploymentPeriod, type PersonRecord } from './peopleQueries';

export function EmploymentPeriodsPanel({ client, person, canEdit, onSaved }: {
  client: SupabaseClient; person: PersonRecord; canEdit: boolean; onSaved: (person: PersonRecord) => void;
}) {
  const [periods, setPeriods] = useState(() => getPersonEmploymentPeriods(person));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { setPeriods(getPersonEmploymentPeriods(person)); setEditing(false); setError(''); setNotice(''); }, [person]);
  function update(index: number, field: keyof EmploymentPeriod, value: string) {
    setPeriods((items) => items.map((item, row) => row === index ? { ...item, [field]: value } : item));
  }
  async function save() {
    const issue = validateEmploymentPeriods(periods);
    if (issue) { setError(issue); return; }
    setSaving(true); setError('');
    try {
      const updated = await savePersonEmploymentPeriods(client, person.id, periods);
      onSaved(updated); setEditing(false); setNotice('Périodes enregistrées. Les indicateurs RH sont recalculés.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer les périodes.'); }
    finally { setSaving(false); }
  }
  return <section aria-label="Historique des périodes d’emploi" className="hr-employment-history sp-panel">
    <header><div><span><CalendarDays size={18} aria-hidden="true" /> Parcours dans la compagnie</span><p>Chaque réembauche conserve les périodes précédentes et les interruptions.</p></div>
      {canEdit && !editing ? <button className="sp-button sp-button--secondary" type="button" onClick={() => { setEditing(true); setNotice(''); }}>Gérer les périodes</button> : null}
    </header>
    {periods.length ? <ol>{periods.map((period, index) => <li key={index}>
      <span className="hr-employment-number">{index + 1}</span>
      <div className="hr-employment-period">
        {editing ? <div className="hr-employment-fields">
          <label>Embauche · période {index + 1}<input type="date" value={period.hiredOn} disabled={saving} onChange={(event) => update(index, 'hiredOn', event.target.value)} /></label>
          <label>Départ · période {index + 1}<input type="date" value={period.departedOn} disabled={saving} onChange={(event) => update(index, 'departedOn', event.target.value)} /></label>
          <label>Contrat · période {index + 1}<select value={period.contractType} disabled={saving} onChange={(event) => update(index, 'contractType', event.target.value)}><option value="">Non renseigné</option>{['CDI', 'CDD', 'Intérim', 'Alternance', 'Stage', 'Prestataire'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Motif de départ · période {index + 1}<input value={period.departureReason} disabled={saving} onChange={(event) => update(index, 'departureReason', event.target.value)} /></label>
          {periods.length > 1 ? <button className="sp-button sp-button--secondary" type="button" disabled={saving} aria-label={`Supprimer la période ${index + 1}`} onClick={() => setPeriods((items) => items.filter((_, row) => row !== index))}><Trash2 size={15} /> Supprimer</button> : null}
        </div> : <><strong>{formatDate(period.hiredOn)} → {period.departedOn ? formatDate(period.departedOn) : 'Période ouverte'}</strong><span>{period.contractType || 'Contrat non renseigné'}{period.departureReason ? ` · ${period.departureReason}` : ''}</span></>}
      </div>
    </li>)}</ol> : <p>Aucune date d’embauche renseignée.</p>}
    {editing ? <div className="hr-employment-actions">
      <button className="sp-button sp-button--secondary" type="button" disabled={saving} onClick={() => setPeriods((items) => [...items, { hiredOn: '', departedOn: '', contractType: person.contractType, departureReason: '' }])}><Plus size={16} /> Ajouter une réembauche</button>
      <button className="sp-button sp-button--secondary" type="button" disabled={saving} onClick={() => { setPeriods(getPersonEmploymentPeriods(person)); setEditing(false); setError(''); }}><RotateCcw size={15} /> Annuler</button>
      <button className="sp-button sp-button--primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer les périodes'}</button>
    </div> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR');
}
