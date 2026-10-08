import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import { PlanningCrewTimelineRow } from './PlanningTimeline';
import { addPlanningDays, daysBetween, type PlanningCrewEvent, type PlanningTimelineDay } from './planningModel';
import { genericCrewEvents, resolveGenericCrewRow, saveGenericCrewRow, type GenericCrewPeriod, type GenericCrewRow } from './planningGenericCrew';
import { planningErrorMessage } from './planningErrors';
import { planningStatusDisplayLabel } from './planningModel';
import './planningGenericCrew.css';

const NO_CONFLICTS = new Map<string, Set<string>>();
export const GENERIC_CREW_STATUSES = ['En Mer', 'A Terre', 'Extra', 'Repos', 'Vacance', 'Arrêt Maladie', 'Arrêt de travail', 'Formation'];

export function PlanningGenericCrewTimelineRow({ client, row, vessel, days, dayWidth, onChange, onReplace }: {
  client: SupabaseClient; row: GenericCrewRow; vessel: string; days: PlanningTimelineDay[]; dayWidth: number;
  onChange: (row: GenericCrewRow | null) => void; onReplace: () => void;
}) {
  const [form, setForm] = useState<GenericCrewPeriod | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const events = genericCrewEvents(row, vessel);
  const lane = { key: `generic-${row.id}`, personId: null, label: row.functionLabel, detail: 'Poste à pourvoir',
    vesselId: row.vesselId, vessel, watchGroup: row.watchGroup, functionLabel: row.functionLabel, events };
  function eventPeriod(event: PlanningCrewEvent) { return row.periods.find((period) => event.id === `generic-${row.id}-${period.id}`)!; }

  async function save(periods: GenericCrewPeriod[]) {
    setSaving(true); setError('');
    try {
      onChange(await saveGenericCrewRow(client, { ...row, periods }));
      setForm(null);
    } catch (cause) { setError(planningErrorMessage(cause, 'Impossible d’enregistrer cette période.')); }
    finally { setSaving(false); }
  }
  function update(period: GenericCrewPeriod) {
    return save([...row.periods.filter((item) => item.id !== period.id), period]);
  }
  async function remove() {
    setSaving(true); setError('');
    try { await resolveGenericCrewRow(client, row); onChange(null); }
    catch (cause) { setError(planningErrorMessage(cause, 'Impossible de supprimer ce poste.')); }
    finally { setSaving(false); }
  }

  return <>
    <PlanningCrewTimelineRow lane={lane} days={days} dayWidth={dayWidth} editable={!saving} hierarchy
      conflictDatesByEvent={NO_CONFLICTS} onSelect={setSelectedId} selectedId={selectedId} pendingId={saving ? selectedId : null}
      onReplacePerson={!saving ? onReplace : undefined}
      onDeleteEmptyRow={!row.periods.length ? () => void remove() : undefined} isDeletingEmptyRow={saving}
      onCreate={(_lane, date) => { setError(''); setForm({ id: crypto.randomUUID(), startsOn: date, endsOn: date, status: 'En Mer', comments: '' }); }}
      onOpen={(event) => { setError(''); setForm(eventPeriod(event)); }}
      onMove={(event, date) => void update({ ...eventPeriod(event), startsOn: date, endsOn: addPlanningDays(date, daysBetween(event.startsOn, event.endsOn)) })}
      onResize={(event, edge, delta) => void update({ ...eventPeriod(event), [edge === 'start' ? 'startsOn' : 'endsOn']: addPlanningDays(edge === 'start' ? event.startsOn : event.endsOn, delta) })}
    />
    {form ? <AppDialog title={`Préparer le planning · ${row.functionLabel}`} description={`${vessel} · ${row.watchGroup}. Les périodes seront transférées au marin choisi.`}
      isBusy={saving} onClose={() => setForm(null)}>
      <form className="planning-dialog-form" onSubmit={(event) => { event.preventDefault(); void update(form); }}>
        <div className="planning-form-grid">
          <label>Début<input type="date" required value={form.startsOn} onChange={(event) => setForm({ ...form, startsOn: event.target.value })} /></label>
          <label>Fin<input type="date" required min={form.startsOn} value={form.endsOn} onChange={(event) => setForm({ ...form, endsOn: event.target.value })} /></label>
          <label>Statut<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{GENERIC_CREW_STATUSES.map((status) => <option key={status} value={status}>{planningStatusDisplayLabel(status)}</option>)}</select></label>
          <label className="is-wide">Annotation<textarea maxLength={5000} value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></label>
        </div>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <div className="app-dialog__actions">
          {row.periods.some((period) => period.id === form.id) ? <button type="button" disabled={saving} onClick={() => void save(row.periods.filter((period) => period.id !== form.id))}>Supprimer la période</button> : null}
          <button type="button" disabled={saving} onClick={() => setForm(null)}>Annuler</button>
          <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </AppDialog> : error ? <AppDialog title="Poste fictif" onClose={() => setError('')}><p role="alert">{error}</p></AppDialog> : null}
  </>;
}
