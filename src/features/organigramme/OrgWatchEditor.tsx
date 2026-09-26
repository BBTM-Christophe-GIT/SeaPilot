import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';
import { orgLocalDate, resolveMemberships, type OrgData, type OrgWatch } from './organigrammeModel';
import { deleteOrgWatch, saveOrgWatch } from './organigrammeQueries';

function watchDraft(data: OrgData, vesselId: number, watch?: OrgWatch) {
  return { id: watch?.id ?? null, vesselId, name: watch?.name || 'Bordée 1',
    members: Object.fromEntries(data.memberships.filter((row) => row.source === 'manual' && row.vesselId === vesselId && row.watchGroup === watch?.name).map((row) => [row.personId, row.functionLabel])) as Record<number, string> };
}

export function OrgWatchEditor({ client, data, onSaved, previewMode, disabled }: { client: SupabaseClient; data: OrgData; onSaved: () => void; previewMode: boolean; disabled: boolean }) {
  const vessels = useMemo(() => [...data.vessels].sort(compareFleetAssets), [data.vessels]);
  const [draft, setDraft] = useState(() => watchDraft(data, vessels[0]?.id || 0, data.watches?.find((watch) => watch.vesselId === vessels[0]?.id)));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const watches = (data.watches || []).filter((watch) => watch.vesselId === draft.vesselId).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  const current = data.asOf === orgLocalDate();
  const locked = disabled || busy || !current;
  const savedWatch = data.watches?.find((watch) => watch.id === draft.id);
  const assignedElsewhere = new Set(resolveMemberships(data).filter((row) => !savedWatch || row.vesselId !== savedWatch.vesselId || row.watchGroup !== savedWatch.name).map((row) => row.personId));
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const available = data.people.filter((person) => Object.hasOwn(draft.members, person.id) || !assignedElsewhere.has(person.id));
  const people = [...available].sort((a, b) => compareHrFunctionLabels(a.functionLabel, b.functionLabel) || a.name.localeCompare(b.name, 'fr')).filter((person) => normalize(`${person.name} ${person.functionLabel}`).includes(normalize(search.trim())));
  const choices = [...new Set(data.people.map((person) => normalizeHrFunctionLabel(person.functionLabel)).filter(Boolean))].sort(compareHrFunctionLabels);
  const selectWatch = (vesselId: number, watch?: OrgWatch) => { setDraft(watchDraft(data, vesselId, watch)); setError(''); setStatus(''); setConfirmDelete(false); };
  async function save() {
    if (locked) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const id = await saveOrgWatch(client, { ...draft, members: Object.entries(draft.members).map(([personId, functionLabel]) => ({ personId: Number(personId), functionLabel })) });
      setDraft((previous) => ({ ...previous, id }));
      setStatus('Bordée par défaut enregistrée. Sa composition est indépendante du planning.'); onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (locked || !draft.id) return;
    setBusy(true); setError(''); setStatus('');
    try { await deleteOrgWatch(client, draft.id); setDraft(watchDraft(data, draft.vesselId)); setConfirmDelete(false); setStatus('Bordée supprimée.'); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="org-editor org-watch-editor" aria-label="Composition des bordées"><h2>Composer les bordées par défaut</h2>
    <p>Choisissez le navire et la bordée, puis cochez les personnes. Leur fonction à bord peut être précisée ici. Ces compositions restent enregistrées, sans lecture ni modification du planning.</p>
    <p className="org-watch-availability">Les collaborateurs déjà affectés à une autre bordée sont masqués. Les membres de cette bordée restent modifiables.</p>
    {!current && <p className="org-notice">Pour modifier les compositions courantes, sélectionnez la date d’aujourd’hui.</p>}
    <fieldset disabled={locked}><legend>Choisir la bordée</legend>
      <label>Navire de la bordée<select value={draft.vesselId} onChange={(event) => { const id = Number(event.target.value); selectWatch(id, data.watches?.find((watch) => watch.vesselId === id)); }}>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
      <label>Bordée à composer<select value={draft.id ?? ''} onChange={(event) => selectWatch(draft.vesselId, watches.find((watch) => watch.id === Number(event.target.value)))}><option value="">Nouvelle bordée</option>{watches.map((watch) => <option key={watch.id} value={watch.id}>{watch.name}</option>)}</select></label>
    </fieldset>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><fieldset disabled={locked || !draft.vesselId}><legend>Composition par défaut</legend>
      <label>Nom de la bordée<input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Rechercher dans les effectifs<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="button" onClick={() => setDraft({ ...draft, members: {} })}>Vider la sélection</button>
      <p className="org-watch-full-row">{Object.keys(draft.members).length} personne(s) sélectionnée(s). La recherche ne change pas la composition enregistrée. Capitaine reste en premier dans le diagramme.</p>
      <div className="org-watch-people">{people.map((person) => {
        const included = Object.hasOwn(draft.members, person.id);
        return <div key={person.id}><label className="org-watch-person"><input type="checkbox" checked={included} aria-label={`Affecter ${person.name}`} onChange={(event) => setDraft((previous) => { const members = { ...previous.members }; if (event.target.checked) members[person.id] = ''; else delete members[person.id]; return { ...previous, members }; })} />{person.name}<small>{person.functionLabel}</small></label>
          {included && <label>Fonction à bord de {person.name}<input maxLength={300} list="org-watch-functions" placeholder={person.functionLabel || 'Fonction de la fiche RH'} value={draft.members[person.id]} onChange={(event) => setDraft({ ...draft, members: { ...draft.members, [person.id]: event.target.value } })} /></label>}
        </div>;
      })}{!people.length && <p>{search.trim() ? 'Aucun collaborateur disponible ne correspond à cette recherche.' : 'Aucun collaborateur disponible. Retirez une personne de sa bordée actuelle pour pouvoir l’affecter ici.'}</p>}</div>
      <datalist id="org-watch-functions">{choices.map((label) => <option key={label} value={label} />)}</datalist>
      <div className="org-actions org-watch-full-row"><button type="submit" className="org-primary" disabled={!draft.name.trim()}>{busy ? 'Enregistrement…' : 'Enregistrer la bordée'}</button>{draft.id && <button type="button" disabled={previewMode} onClick={() => setConfirmDelete(true)}>Supprimer la bordée</button>}</div>
      {confirmDelete && <div className="org-notice org-watch-full-row">Supprimer « {draft.name} » et sa composition par défaut ? Les fiches RH sont conservées. <button type="button" onClick={() => void remove()}>Confirmer la suppression</button><button type="button" onClick={() => setConfirmDelete(false)}>Conserver la bordée</button></div>}
    </fieldset></form>
    {previewMode && <p>Les modifications de démonstration restent locales à cette préversion.</p>}{error && <p role="alert" className="org-error">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
