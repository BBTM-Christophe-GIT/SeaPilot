import { useState } from 'react';
import { CircleX } from 'lucide-react';
import { LiftingFilters } from './LiftingFilters';
import { matchesLiftingItem } from './liftingSearch';
import { groupByAccessory } from './liftingControls';
import { CONDITION_LABELS, entryUnsatisfactory, type InspectionEntry } from './liftingModel';

export function LiftingPublishedControls({ entries }: { entries: InspectionEntry[] }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const visible = entries.filter((entry) => matchesLiftingItem(entry.item_snapshot, query, type, entry.observations));
  return <>
    <LiftingFilters items={entries.map((entry) => entry.item_snapshot)} query={query} type={type} onQuery={setQuery} onType={setType} count={visible.length} context="contrôle" />
    {!visible.length && <p className="lifting-empty">Aucun matériel ne correspond aux filtres.</p>}
    {groupByAccessory(visible, (entry) => entry.item_snapshot).map((group) => <section className="lifting-accessory-group" key={group.label} aria-label={group.label}>
      <header><div><h3>{group.label}</h3><i lang="en">{group.definition?.en}</i></div><strong>{group.rows.length} matériel{group.rows.length > 1 ? 's' : ''}</strong></header>
      <div className="lifting-item-list">{group.rows.map((entry) => <article key={entry.id} className="lifting-item">
        <div className="lifting-id">{entry.item_snapshot.reference}</div><div className="lifting-item-main"><h3>{entry.item_snapshot.description}</h3>{entry.observations && <p>{entry.observations}</p>}</div>
        <span className={`lifting-status ${entry.condition}`}>{CONDITION_LABELS[entry.condition]}</span>{entryUnsatisfactory(entry) && <span className="lifting-unsatisfactory"><CircleX size={18} aria-hidden="true" /> Résultat insatisfaisant</span>}
      </article>)}</div>
    </section>)}
  </>;
}
