import { useMemo, useState, type DragEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GripVertical } from 'lucide-react';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { compareHrFunctionLabels } from '../humanResources/peopleQueries';
import { orgLocalDate, resolveMemberships, type OrgData, type OrgPerson } from './organigrammeModel';
import { moveOrgWatchMember } from './organigrammeTransfers';
import './orgWatchTransferBoard.css';

interface TransferMember {
  person: OrgPerson;
  fromWatchId: number;
  functionLabel: string;
}

interface WatchDestination {
  key: string;
  vesselId: number;
  vesselName: string;
  watchId: number | null;
  watchName: string;
  members: TransferMember[];
}

const watchKey = (vesselId: number, watchName: string) => vesselId + ':' + watchName;
const memberKey = ({ person, fromWatchId }: TransferMember) => fromWatchId + ':' + person.id;
const destinationLabel = ({ vesselName, watchName }: WatchDestination) => vesselName + ' · ' + watchName;

function transferFleet(data: OrgData) {
  const people = new Map(data.people.map((person) => [person.id, person]));
  const memberships = new Map<string, Array<Omit<TransferMember, 'fromWatchId'>>>();
  for (const row of resolveMemberships(data)) {
    const person = people.get(row.personId);
    if (!person) continue;
    const key = watchKey(row.vesselId, row.watchGroup);
    const members = memberships.get(key) ?? [];
    members.push({ person, functionLabel: row.functionLabel || person.functionLabel });
    memberships.set(key, members);
  }

  return [...data.vessels].sort(compareFleetAssets).map((vessel) => {
    const watches = (data.watches ?? []).filter((watch) => watch.vesselId === vessel.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    const destinations: WatchDestination[] = watches.map((watch) => ({
      key: 'watch:' + watch.id, vesselId: vessel.id, vesselName: vessel.name, watchId: watch.id, watchName: watch.name,
      members: (memberships.get(watchKey(vessel.id, watch.name)) ?? [])
        .map((member) => ({ ...member, fromWatchId: watch.id }))
        .sort((a, b) => compareHrFunctionLabels(a.functionLabel, b.functionLabel) || a.person.name.localeCompare(b.person.name, 'fr')),
    }));
    if (!destinations.length) {
      destinations.push({
        key: 'vessel:' + vessel.id, vesselId: vessel.id, vesselName: vessel.name, watchId: null, watchName: 'Bordée 1', members: [],
      });
    }
    return { ...vessel, destinations };
  });
}

export function OrgWatchTransferBoard({ client, data, onSaved, disabled }: {
  client: SupabaseClient; data: OrgData; onSaved: () => void; disabled: boolean;
}) {
  const fleet = useMemo(() => transferFleet(data), [data]);
  const destinations = fleet.flatMap((vessel) => vessel.destinations);
  const [dragging, setDragging] = useState<TransferMember | null>(null);
  const [highlighted, setHighlighted] = useState('');
  const [selection, setSelection] = useState('');
  const [destinationKey, setDestinationKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const current = data.asOf === orgLocalDate();
  const locked = disabled || busy || !current;

  function endDrag() {
    setDragging(null);
    setHighlighted('');
  }

  function dragOver(event: DragEvent, destination: WatchDestination) {
    if (locked || !dragging || destination.watchId === dragging.fromWatchId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (highlighted !== destination.key) setHighlighted(destination.key);
  }

  async function move(member: TransferMember, destination: WatchDestination) {
    if (locked || member.fromWatchId === destination.watchId) return;
    endDrag();
    setBusy(true);
    setStatus('');
    setError('');
    try {
      await moveOrgWatchMember(client, data.chartId, member.person.id, member.fromWatchId, destination.vesselId, destination.watchId);
      setSelection('');
      setDestinationKey('');
      setStatus(member.person.name + ' rejoint ' + destinationLabel(destination) + '.');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Déplacement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="org-transfer-board" aria-busy={busy || disabled}>
    {current && <p>Glissez une carte vers une autre bordée ou sélectionnez le nom du collaborateur pour choisir une destination.</p>}
    {!current && <p className="org-notice">Sélectionnez la date d’aujourd’hui pour déplacer un collaborateur.</p>}
    {!destinations.some((destination) => destination.members.length) && <p>Aucun collaborateur affecté à une bordée.</p>}
    {error && <p role="alert" className="org-error">{error}</p>}
    <p role="status" className="org-transfer-status">{busy ? 'Déplacement en cours…' : status}</p>
    <div className="org-transfer-fleet">
      {fleet.map((vessel) => <section key={vessel.id} className="org-transfer-vessel" aria-label={vessel.name}>
        <h3>{vessel.name}</h3>
        {vessel.destinations.map((destination) => <section
          key={destination.key}
          className="org-transfer-watch"
          aria-label={destinationLabel(destination)}
          data-drop-ready={Boolean(!locked && dragging && dragging.fromWatchId !== destination.watchId)}
          data-drop-active={highlighted === destination.key}
          onDragOver={(event) => dragOver(event, destination)}
          onDragLeave={(event) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            setHighlighted((value) => value === destination.key ? '' : value);
          }}
          onDrop={(event) => {
            if (locked || !dragging || dragging.fromWatchId === destination.watchId) return;
            event.preventDefault();
            void move(dragging, destination);
          }}
        >
          <h4>{destination.watchName}</h4>
          {!!destination.members.length && <ul>
            {destination.members.map((member) => {
              const key = memberKey(member);
              const selected = selection === key;
              return <li key={key}>
                <button type="button" className="sp-button sp-button--secondary org-transfer-member" disabled={locked || destinations.length < 2}
                  aria-label={'Déplacer ' + member.person.name} aria-expanded={selected}
                  draggable={!locked && destinations.length > 1}
                  onDragStart={(event) => {
                    if (locked || destinations.length < 2) { event.preventDefault(); return; }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-seapilot-watch-member', key);
                    setDragging(member);
                  }}
                  onDragEnd={endDrag}
                  onClick={() => { setSelection(selected ? '' : key); setDestinationKey(''); setError(''); }}
                >
                  <GripVertical size={16} aria-hidden="true" />
                  <span>{member.person.name}{member.functionLabel && <small>{member.functionLabel}</small>}</span>
                </button>
                {selected && <form className="org-transfer-form" onSubmit={(event) => {
                  event.preventDefault();
                  const target = destinations.find((item) => item.key === destinationKey);
                  if (target) void move(member, target);
                }}>
                  <label>Bordée de destination
                    <select disabled={locked} value={destinationKey} onChange={(event) => setDestinationKey(event.target.value)}>
                      <option value="">Choisir une bordée</option>
                      {destinations.filter((item) => item.watchId !== member.fromWatchId).map((item) => <option key={item.key} value={item.key}>{destinationLabel(item)}{item.watchId === null ? ' (à créer)' : ''}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="sp-button sp-button--primary" disabled={locked || !destinationKey}>Déplacer</button>
                </form>}
              </li>;
            })}
          </ul>}
          {!destination.members.length && <p>{destination.watchId === null ? 'Créée au premier déplacement' : 'Bordée vide'}</p>}
        </section>)}
      </section>)}
    </div>
  </div>;
}
