import { AlertTriangle, BadgeCheck, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { PlanningStaffingBoardStatus, PlanningStaffingDiscrepancy } from './planningStaffingQueries';

const FUNCTION_OPTIONS = [
  'Capitaine',
  '2nd Capitaine',
  'Chef Mécanicien',
  'Second Mécanicien',
  "Maître d'Equipage",
  'Matelot polyvalent',
  'Matelot Qualifié',
  'Électricien',
  'Stagiaire',
];

export interface PlanningStaffingDerogationSelection {
  discrepancy: PlanningStaffingDiscrepancy;
  reason: string;
}

export function PlanningStaffingReviewDialog({ status, vesselName, isSaving, onClose, onSave }: {
  status: PlanningStaffingBoardStatus;
  vesselName: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    positions: Array<{ assignmentId: number; functionLabel: string }>,
    derogations: PlanningStaffingDerogationSelection[],
  ) => void;
}) {
  const [functions, setFunctions] = useState<Record<number, string>>(() => Object.fromEntries(
    status.composition.map((member) => [member.assignmentId, member.planningFunctionLabel]),
  ));
  const [selectedDerogations, setSelectedDerogations] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const credentialGaps = useMemo(() => status.discrepancies.filter((item) => (
    item.type === 'credential_missing' && item.severity === 'blocking' && item.requirementId
  )), [status.discrepancies]);
  const gapKey = (gap: PlanningStaffingDiscrepancy) => `${gap.requirementId}:${gap.personId || 0}:${gap.credentialLabel}`;
  const positions = status.composition.map((member) => ({
    assignmentId: member.assignmentId,
    functionLabel: functions[member.assignmentId] || '',
  }));
  const exactCaptainCount = status.composition.filter((member) => (
    member.hrFunctionLabel === 'Capitaine' && functions[member.assignmentId] === 'Capitaine'
  )).length;
  const selectedGaps = credentialGaps.filter((gap) => selectedDerogations.has(gapKey(gap)));
  const invalidDerogation = selectedGaps.some((gap) => (reasons[gapKey(gap)] || '').trim().length < 10);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(positions, selectedGaps.map((gap) => ({ discrepancy: gap, reason: reasons[gapKey(gap)].trim() })));
  }

  return (
    <div className="planning-dialog-backdrop" role="presentation">
      <form aria-label="Confirmer les fonctions de la bordée" aria-modal="true" className="planning-dialog planning-staffing-review-dialog" onSubmit={submit} role="dialog">
        <header><div><ShieldAlert aria-hidden="true" size={20} /><span><small>Contrôle avant diffusion</small><h2>Confirmer les fonctions de la bordée</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={18} /></button></header>
        <div className="planning-staffing-review-summary">
          <div><strong>{vesselName}</strong><span>{status.watchGroup} · {new Intl.DateTimeFormat('fr-FR').format(new Date(`${status.workDate}T12:00:00`))}</span></div>
          <span className={status.blockingCount ? 'is-blocking' : 'is-ok'}>{status.blockingCount ? `${status.blockingCount} blocage(s)` : 'Contrôle prêt'}</span>
        </div>
        <p className="planning-staffing-review-help">La fonction RH reste inchangée. La fonction Planning est réassignée sur toute la plage continue de chaque affectation.</p>
        <div className="planning-staffing-composition-table"><table><thead><tr><th>Membre</th><th>Fonction RH</th><th>Fonction Planning</th><th>Période jointe</th></tr></thead><tbody>{status.composition.map((member) => <tr key={member.assignmentId}><td><strong>{member.personName}</strong></td><td><span className={member.hrFunctionLabel === 'Capitaine' ? 'is-captain' : ''}>{member.hrFunctionLabel || 'Non renseignée'}</span></td><td><select aria-label={`Fonction Planning de ${member.personName}`} onChange={(event) => setFunctions((current) => ({ ...current, [member.assignmentId]: event.target.value }))} value={functions[member.assignmentId] || ''}><option value="">Sélectionner…</option>{Array.from(new Set([member.planningFunctionLabel, ...FUNCTION_OPTIONS]).values()).filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></td><td>{member.startsOn} → {member.endsOn}</td></tr>)}</tbody></table></div>
        {exactCaptainCount !== 1 ? <p className="planning-staffing-captain-warning" role="alert"><AlertTriangle size={16} />Une seule personne dont la fonction RH est exactement « Capitaine » doit recevoir la fonction Planning « Capitaine ».</p> : <p className="planning-staffing-captain-ok"><BadgeCheck size={16} />Capitaine éligible unique : contrôle satisfait.</p>}
        <section className="planning-staffing-discrepancies"><h3>Écarts vis-à-vis de la Décision d’effectif</h3>{status.discrepancies.length ? status.discrepancies.map((gap, index) => {
          const key = gapKey(gap);
          const derogatable = gap.type === 'credential_missing' && gap.severity === 'blocking' && Boolean(gap.requirementId);
          const checked = selectedDerogations.has(key);
          return <article className={`is-${gap.severity}`} key={`${key}-${gap.type}-${index}`}><div><AlertTriangle size={16} /><span><strong>{gap.functionLabel || 'Composition de la bordée'}</strong><small>{gap.message}</small></span></div>{derogatable ? <div className="planning-staffing-derogation"><label><input checked={checked} onChange={(event) => setSelectedDerogations((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} type="checkbox" />Dérogation</label>{checked ? <label>Justification de la dérogation<textarea aria-label={`Justification de la dérogation ${gap.credentialLabel}`} minLength={10} onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))} required value={reasons[key] || ''} /></label> : null}</div> : null}</article>;
        }) : <p>Aucun écart détecté.</p>}</section>
        <footer><button onClick={onClose} type="button">Annuler</button><button disabled={isSaving || exactCaptainCount !== 1 || positions.some((position) => !position.functionLabel) || invalidDerogation} type="submit">{isSaving ? 'Enregistrement…' : 'Confirmer les fonctions et les dérogations'}</button></footer>
      </form>
    </div>
  );
}
