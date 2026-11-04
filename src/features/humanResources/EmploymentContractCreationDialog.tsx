import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import { createEmploymentContractDraft, validateEmploymentContractDraft, type EmploymentContractDetails } from './employmentContractModel';
import { loadEmploymentContractDetails } from './employmentContractQueries';
import { loadHrSalaryGrid } from './salaryGridQueries';
import { salaryGridMonthlyAmount } from './salaryGridModel';
import { formatPersonName, getPersonEmploymentPeriods, getHrEnimClassification, type PersonRecord } from './peopleQueries';
import { EmploymentContractProfileFields } from './EmploymentContractProfileFields';

export function EmploymentContractCreationDialog({ client, people, initialPersonId, onClose, onOpenProfile, onGenerated }: {
  client: SupabaseClient; people: PersonRecord[]; initialPersonId?: number;
  onClose: () => void; onOpenProfile: (personId: number) => void; onGenerated: (personId: number) => void;
}) {
  const [personId, setPersonId] = useState(initialPersonId && people.some(person => person.id === initialPersonId) ? String(initialPersonId) : '');
  const [details, setDetails] = useState<Partial<EmploymentContractDetails> | null>(null);
  const [loadedPersonId, setLoadedPersonId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const person = people.find(candidate => candidate.id === Number(personId));

  useEffect(() => {
    let active = true;
    setDetails(null); setLoadedPersonId(null); setError(''); setIssues([]);
    if (!person) { setLoading(false); return; }
    setLoading(true);
    Promise.all([loadEmploymentContractDetails(client, person.id), loadHrSalaryGrid(client)])
      .then(([saved, grid]) => {
        if (!active) return;
        const row = grid.rows.find(row => row.id === saved?.salaryGridRowId && row.active);
        const values: Partial<EmploymentContractDetails> = {
          ...saved, ...(row ? { grossMonthlySalary: salaryGridMonthlyAmount(row), annualGrossSalary: row.totalAnnualBase.toFixed(2), salaryGridRevision: String(grid.revision) } : {}),
        };
        const period = getPersonEmploymentPeriods(person).at(-1);
        const classification = getHrEnimClassification(person.functionLabel);
        const recorded = { ...person, hiredOn: period?.hiredOn || person.hiredOn,
          enimFunctionCode: person.enimFunctionCode || classification.functionCode, enimCategory: person.enimCategory ?? classification.category };
        const type = (period?.contractType || person.contractType).toUpperCase();
        const missing = type === 'CDI' || type === 'CDD'
          ? validateEmploymentContractDraft(createEmploymentContractDraft(recorded, type, values))
          : ['Renseignez un type de contrat CDI ou CDD dans la fiche RH.'];
        if (!row) missing.unshift('Choisissez un poste actif dans la grille de salaires de la fiche RH.');
        if (type === 'CDD' && !values.endDate) missing.unshift('Enregistrez la durée du CDD dans « Contrat et dates ».');
        setDetails(values); setLoadedPersonId(person.id); setIssues(missing);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger les informations enregistrées de la fiche RH.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, person, attempt]);

  return <AppDialog title="Générer un contrat" size="md" onClose={onClose} isBusy={generating}
    description="Choisissez le collaborateur. Le PDF reprend les informations enregistrées dans sa fiche RH."
    footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" type="button" disabled={generating} onClick={onClose}>Annuler</button>
      {person ? <button className="sp-button sp-button--secondary" type="button" disabled={generating} onClick={() => onOpenProfile(person.id)}>Ouvrir la fiche RH</button> : null}</div>}>
    <label className="hr-edit-field">Collaborateur<select value={personId} disabled={generating} onChange={event => setPersonId(event.target.value)}>
      <option value="">Choisir un collaborateur</option>{people.map(person => <option value={person.id} key={person.id}>{formatPersonName(person)}</option>)}
    </select></label>
    {loading ? <p role="status">Chargement des informations de la fiche RH…</p> : null}
    {error ? <div><p className="form-error" role="alert">{error}</p><button className="sp-button sp-button--secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></div> : null}
    {!loading && issues.length ? <div role="alert" className="form-error"><strong>Complétez puis enregistrez la fiche RH avant de générer le contrat.</strong><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div> : null}
    {person && loadedPersonId === person.id && details && !loading && !error && !issues.length ? <EmploymentContractProfileFields key={person.id} client={client} person={person}
      details={details} useSavedDuration buttonLabel="Générer le PDF" onBusyChange={setGenerating} onGenerated={() => onGenerated(person.id)} /> : null}
  </AppDialog>;
}
