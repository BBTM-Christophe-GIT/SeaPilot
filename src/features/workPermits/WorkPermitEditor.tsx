import { useState, type FormEvent } from 'react';
import { planningLocalDateTimeToUtc, utcToPlanningLocalDateTime } from '../planning/planningDates';
import { workPermitChecklistById, workPermitChecklists } from './workPermitChecklists';
import { WorkPermitMap } from './WorkPermitMap';
import { workPermitPlansForAsset } from './workPermitPlans';
import type { PermitAnswers, PermitLocation, PermitValues, WorkPermit } from './workPermitQueries';

interface Props {
  locations: PermitLocation[];
  initialLocation: number;
  permit?: WorkPermit;
  busy: boolean;
  onSave: (location: number, fields: PermitValues) => Promise<void>;
  onCancel: () => void;
}

function Checklist({ type, phase, values, onChange }: {
  type: string;
  phase: 'opening' | 'closing';
  values: PermitAnswers;
  onChange?: (values: PermitAnswers) => void;
}) {
  const model = workPermitChecklistById[type];
  if (!model) return null;
  return <>
    {phase === 'opening' && model.notice && <p role="note">{model.notice}</p>}
    {phase === 'opening' && model.intro && <p>{model.intro}</p>}
    {model.sections.map((section, index) => section.phase === phase && (
      <details key={index}>
        <summary>{section.title}</summary>
        {section.items.map((question, item) => {
          const key = `${index}-${item}`;
          return <label key={key} className="work-permits-check">
            <span>{question}</span>
            <select disabled={!onChange} value={values[key] ?? ''} onChange={(event) => onChange?.({ ...values, [key]: event.target.value })}>
              <option value="">À renseigner</option><option>Oui</option><option>Non</option><option>Sans objet</option>
            </select>
          </label>;
        })}
      </details>
    ))}
    {phase === 'opening' && model.measurements && <details>
      <summary>Mesures d’atmosphère</summary>
      {model.measurementsNote && <p>{model.measurementsNote}</p>}
      {model.measurements.map((measurement, index) => {
        const key = `mesure-${index}`;
        return <label className="work-permits-check" key={key}>
          {measurement}
          <input disabled={!onChange} value={values[key] ?? ''} onChange={(event) => onChange?.({ ...values, [key]: event.target.value })} />
        </label>;
      })}
    </details>}
  </>;
}

export function WorkPermitEditor({ locations, initialLocation, permit, busy, onSave, onCancel }: Props) {
  const [locationId, setLocationId] = useState(permit?.vessel_id ?? initialLocation);
  const location = locations.find((item) => item.id === locationId);
  const plans = workPermitPlansForAsset(location?.name ?? '');
  const [planId, setPlanId] = useState(permit?.plan_key ?? plans[0]?.id ?? '');
  const [displayedPlan, setDisplayedPlan] = useState(planId);
  const [start, setStart] = useState(() => utcToPlanningLocalDateTime(permit?.starts_at ?? new Date().toISOString()));
  const [values, setValues] = useState<PermitValues>(() => permit ?? ({
    title: '', permit_type: workPermitChecklists[0].id, zone: '', plan_key: plans[0]?.id ?? null,
    point_x: null, point_y: null, starts_at: '', checklist_answers: {}, closing_answers: {}, exclusion_zones: [],
  }));
  const [error, setError] = useState('');
  const readOnly = permit?.status === 'closed';
  const lockedScope = readOnly || permit?.status === 'paused' || (permit?.paused_seconds ?? 0) > 0 || !!permit?.pause_history?.length;
  const currentPlan = plans.find((plan) => plan.id === displayedPlan) ?? plans[0];
  const pin = values.point_x !== null && values.point_y !== null && currentPlan?.id === planId
    ? [{ id: 'permit', label: values.title, point: { x: values.point_x, y: values.point_y } }]
    : [];
  const date = start.slice(0, 10);

  function update(patch: Partial<PermitValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const startsAt = permit && start === utcToPlanningLocalDateTime(permit.starts_at)
        ? permit.starts_at : planningLocalDateTimeToUtc(start);
      await onSave(locationId, {
        title: values.title.trim(), permit_type: values.permit_type, zone: values.zone.trim(),
        plan_key: planId || null, point_x: values.point_x, point_y: values.point_y,
        starts_at: startsAt, checklist_answers: values.checklist_answers, closing_answers: values.closing_answers,
        exclusion_zones: values.exclusion_zones,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer le permis.');
    }
  }

  return (
    <form className="work-permits-panel work-permits-editor" onSubmit={(event) => void submit(event)}>
      <div className="work-permits-heading">
        <h2>{readOnly ? 'Permis clôturé' : permit ? 'Fiche du permis' : 'Nouveau permis'}</h2>
        <button type="button" onClick={onCancel}>{readOnly ? 'Fermer la fiche' : 'Annuler'}</button>
      </div>
      <fieldset disabled={busy}>
        <div className="work-permits-fields">
          <label>Navire ou site
            <select disabled={!!permit} value={locationId} onChange={(event) => {
              const next = locations.find((item) => item.id === Number(event.target.value));
              if (!next) return;
              setLocationId(next.id);
              const first = workPermitPlansForAsset(next.name)[0]?.id ?? '';
              setPlanId(first);
              setDisplayedPlan(first);
              update({ zone: '', point_x: null, point_y: null, exclusion_zones: [] });
            }}>
              {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Intitulé<input required maxLength={200} disabled={lockedScope} value={values.title} onChange={(event) => update({ title: event.target.value })} /></label>
          <label>Type de travaux
            <select disabled={lockedScope} value={values.permit_type} onChange={(event) => update({ permit_type: event.target.value, checklist_answers: {}, closing_answers: {} })}>
              {workPermitChecklists.map((model) => <option key={model.id} value={model.id}>{model.title}</option>)}
            </select>
          </label>
          <label>Lieu précis des travaux<input required maxLength={250} disabled={lockedScope} value={values.zone} onChange={(event) => update({ zone: event.target.value })} /></label>
          <label>Date des travaux<input type="date" value={date} readOnly /></label>
          <label>Heure de début (Paris)
            <input required type="time" disabled={lockedScope} value={start.slice(11)} onChange={(event) => setStart(date + 'T' + event.target.value)} />
          </label>
          {permit?.ends_at && <p>Fin enregistrée le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(permit.ends_at))}</p>}
        </div>
        {currentPlan && <>
          <div className="work-permits-actions">
            <label>Plan affiché
              <select value={currentPlan.id} onChange={(event) => setDisplayedPlan(event.target.value)}>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
              </select>
            </label>
            {!readOnly && values.point_x !== null && <button type="button" onClick={() => update({ point_x: null, point_y: null })}>Supprimer le repère</button>}
          </div>
          <WorkPermitMap key={currentPlan.id} plan={currentPlan} pins={pin} zones={values.exclusion_zones}
            onPoint={!readOnly && (!lockedScope || currentPlan.id === planId) ? ({ x, y }) => {
              setPlanId(currentPlan.id);
              update({ point_x: x, point_y: y });
            } : undefined}
            onZones={!lockedScope ? (zones) => update({ exclusion_zones: zones }) : undefined} />
          {!!values.exclusion_zones.length && <p>{values.exclusion_zones.length} zone(s) d’exclusion sur l’ensemble des plans</p>}
        </>}
        {!readOnly && lockedScope && <p>Le périmètre signé est verrouillé depuis la première pause.</p>}
        {permit?.status === 'open' && !lockedScope && <p>Une modification du périmètre des travaux exige une nouvelle signature du Capitaine.</p>}
        <h3>Checklist d’ouverture</h3>
        <Checklist type={values.permit_type} phase="opening" values={values.checklist_answers}
          onChange={lockedScope ? undefined : (answers) => update({ checklist_answers: answers })} />
        {permit && permit.status !== 'draft' && <>
          <h3>Checklist de fermeture</h3>
          <Checklist type={values.permit_type} phase="closing" values={values.closing_answers}
            onChange={readOnly ? undefined : (answers) => update({ closing_answers: answers })} />
        </>}
        {error && <p role="alert">{error}</p>}
        {!readOnly && <button className="work-permits-primary" type="submit">Enregistrer le permis</button>}
      </fieldset>
    </form>
  );
}
