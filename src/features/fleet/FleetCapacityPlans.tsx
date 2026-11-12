import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { FleetVessel } from './fleetQueries';
import {
  FLEET_CAPACITY_PLAN_ACCEPT, fetchFleetCapacityPlans, fleetCapacityPlanDownloadUrl, removeFleetCapacityPlan,
  uploadFleetCapacityPlan, type FleetCapacityPlan,
} from './fleetCapacityPlanQueries';
import './fleetCapacityPlans.css';

interface Props {
  client: SupabaseClient;
  vessel: Pick<FleetVessel, 'id' | 'companyId'>;
  canManage: boolean;
}

export function FleetCapacityPlans({ client, vessel: { id, companyId }, canManage }: Props) {
  const title = useId();
  const hint = useId();
  const [plans, setPlans] = useState<FleetCapacityPlan[]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void fetchFleetCapacityPlans(client, { id, companyId }).then(result => {
      if (active) setPlans(result);
    }).catch(() => {
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, [client, companyId, id, revision]);

  async function addPlans(files: File[]) {
    if (!canManage || busy || !files.length) return;
    setBusy(true);
    setMessages([]);
    const added: FleetCapacityPlan[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        added.push(await uploadFleetCapacityPlan(client, { id, companyId }, file));
      } catch (error) {
        errors.push(`${file.name} — ${error instanceof Error ? error.message : 'Import impossible.'}`);
      }
    }
    setPlans(current => [...(current ?? []), ...added].sort((left, right) => left.name.localeCompare(right.name, 'fr', { numeric: true })));
    setMessages(errors);
    setBusy(false);
  }

  async function downloadPlan(plan: FleetCapacityPlan) {
    setBusy(true);
    setMessages([]);
    try {
      const link = document.createElement('a');
      link.href = await fleetCapacityPlanDownloadUrl(client, { id, companyId }, plan);
      link.download = plan.name;
      link.click();
    } catch {
      setMessages([`Impossible de télécharger le plan « ${plan.name} ».`]);
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan(plan: FleetCapacityPlan) {
    if (!canManage || busy || !window.confirm(`Supprimer le plan « ${plan.name} » ?`)) return;
    setBusy(true);
    setMessages([]);
    try {
      await removeFleetCapacityPlan(client, { id, companyId }, plan);
      setPlans(current => current?.filter(item => item.key !== plan.key));
    } catch {
      setMessages([`Impossible de supprimer le plan « ${plan.name} ».`]);
    } finally {
      setBusy(false);
    }
  }

  return <section className="fleet-capacity-plans" aria-labelledby={title}>
    <div className="fleet-capacity-plans-heading">
      <h4 id={title}>Plans</h4>
      {canManage && <label className="sp-button sp-button--secondary fleet-capacity-plan-picker">
        <Upload size={16} aria-hidden="true" />
        {busy ? 'Opération en cours…' : 'Ajouter des plans'}
        <input type="file" aria-label="Ajouter des plans" aria-describedby={hint} multiple
          accept={FLEET_CAPACITY_PLAN_ACCEPT} disabled={!plans || busy} onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void addPlans(files);
          }} />
      </label>}
    </div>
    {canManage && <p id={hint} className="fleet-capacity-plans-hint">PDF, JPEG, PNG ou WebP · 25 Mo par fichier</p>}
    {loadFailed ? <div className="fleet-capacity-plans-heading">
      <p role="alert">Impossible de charger les plans.</p>
      <button type="button" className="sp-button sp-button--secondary" onClick={() => {
        setLoadFailed(false);
        setRevision(value => value + 1);
      }}>Réessayer</button>
    </div> : !plans ? <p role="status">Chargement des plans…</p>
      : plans.length === 0 ? <p>Aucun plan enregistré.</p>
        : <ul className="fleet-capacity-plan-list">
          {plans.map(plan => <li key={plan.key}>
            <FileText size={17} aria-hidden="true" />
            <span>{plan.name}</span>
            <button type="button" className="sp-button sp-button--secondary" aria-label={`Télécharger ${plan.name}`}
              title="Télécharger" disabled={busy} onClick={() => void downloadPlan(plan)}><Download size={16} aria-hidden="true" /></button>
            {canManage && <button type="button" className="sp-button sp-button--secondary" aria-label={`Supprimer ${plan.name}`}
              title="Supprimer" disabled={busy} onClick={() => void deletePlan(plan)}><Trash2 size={16} aria-hidden="true" /></button>}
          </li>)}
        </ul>}
    {messages.length > 0 && <div role="alert" className="fleet-capacity-plan-errors">
      {messages.map((message, index) => <p key={index}>{message}</p>)}
    </div>}
  </section>;
}
