import type { SupabaseClient } from '@supabase/supabase-js';
import { Anchor, Archive, Edit3, Plus, RefreshCw, RotateCcw, Search, Ship, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { todayPlanningDate } from '../planning/planningDates';
import { planningErrorMessage } from '../planning/planningErrors';
import type { PlanningDateRange } from '../planning/planningModel';
import type { PlanningOverview } from '../planning/planningQueries';
import { ManningTab } from '../planning/PlanningP11Panel';
import { fetchPlanningP11Data } from '../planning/planningP11Queries';
import type { PlanningP11Data } from '../planning/planningP11';
import { usePlanningOverview } from '../planning/usePlanningOverview';
import {
  archiveFleetVessel,
  fetchFleetVessels,
  restoreFleetVessel,
  saveFleetVessel,
  type FleetVessel,
  type SaveFleetVesselInput,
} from './fleetQueries';

interface FleetPageProps { client?: SupabaseClient; roles?: RoleKey[] }
type FleetTab = 'fleet' | 'manning';

const EMPTY_VESSEL: SaveFleetVesselInput = {
  name: '', acronym: '', typeLabel: '', unitTypeLabel: '', registrationNumber: '', imoNumber: '',
  registrationPort: '', callSign: '', mmsi: '', grossTonnage: '', maxPeople: null, crewMembers: '',
  medicalDotation: '', lengthOverall: '',
};
const EMPTY_P11: PlanningP11Data = { rotations: [], templates: [], matrices: [], certificates: [] };

function vesselForm(vessel?: FleetVessel): SaveFleetVesselInput {
  if (!vessel) return { ...EMPTY_VESSEL };
  return {
    id: vessel.id, name: vessel.name, acronym: vessel.acronym, typeLabel: vessel.typeLabel,
    unitTypeLabel: vessel.unitTypeLabel, registrationNumber: vessel.registrationNumber,
    imoNumber: vessel.imoNumber, registrationPort: vessel.registrationPort, callSign: vessel.callSign,
    mmsi: vessel.mmsi, grossTonnage: vessel.grossTonnage, maxPeople: vessel.maxPeople,
    crewMembers: vessel.crewMembers, medicalDotation: vessel.medicalDotation, lengthOverall: vessel.lengthOverall,
  };
}

function currentYearRange(): PlanningDateRange {
  const year = todayPlanningDate().slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function FleetPage({ client, roles }: FleetPageProps) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const effectiveRoles = roles || context?.roles || [];
  const canManage = effectiveRoles.includes('admin');
  const [tab, setTab] = useState<FleetTab>('fleet');
  const [vessels, setVessels] = useState<FleetVessel[]>([]);
  const [p11, setP11] = useState<PlanningP11Data>(EMPTY_P11);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<SaveFleetVesselInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const range = useMemo(currentYearRange, []);
  const { overview, reload: reloadOverview } = usePlanningOverview(effectiveClient, true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fleetRows, p11Data] = await Promise.all([fetchFleetVessels(effectiveClient), fetchPlanningP11Data(effectiveClient)]);
      setVessels(fleetRows);
      setP11(p11Data);
      setSelectedId((current) => current && fleetRows.some((vessel) => vessel.id === current) ? current : fleetRows[0]?.id || null);
      setFeedback(null);
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de charger BBTM - Flotte.'), error: true });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveClient]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr-FR');
    return vessels.filter((vessel) => (includeArchived || vessel.active) && (!term
      || `${vessel.name} ${vessel.acronym} ${vessel.registrationNumber} ${vessel.imoNumber} ${vessel.typeLabel}`
        .toLocaleLowerCase('fr-FR').includes(term)));
  }, [includeArchived, search, vessels]);
  const selected = vessels.find((vessel) => vessel.id === selectedId) || null;

  async function submitVessel(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    try {
      const saved = await saveFleetVessel(effectiveClient, form);
      await Promise.all([load(), reloadOverview()]);
      setSelectedId(saved.id);
      setForm(null);
      setFeedback({ message: 'Le navire est enregistré dans la liste canonique BBTM - Flotte.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, "Impossible d’enregistrer ce navire."), error: true });
    } finally { setIsSaving(false); }
  }

  async function toggleArchived(vessel: FleetVessel) {
    if (!window.confirm(vessel.active
      ? `Retirer ${vessel.name} des listes de sélection sans effacer son historique ?`
      : `Réintégrer ${vessel.name} dans les listes de sélection ?`)) return;
    setIsSaving(true);
    try {
      if (vessel.active) await archiveFleetVessel(effectiveClient, vessel.id);
      else await restoreFleetVessel(effectiveClient, vessel.id);
      await Promise.all([load(), reloadOverview()]);
      setFeedback({ message: vessel.active ? 'Le navire a été retiré des listes actives.' : 'Le navire est de nouveau actif.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de modifier la présence du navire.'), error: true });
    } finally { setIsSaving(false); }
  }

  const planningOverview = useMemo<PlanningOverview>(() => overview.vessels.length ? overview : {
    ...overview,
    vessels: vessels.map((vessel) => ({
      id: vessel.id,
      name: vessel.name,
      acronym: vessel.acronym,
      registrationNumber: vessel.registrationNumber,
      active: vessel.active,
    })),
  }, [overview, vessels]);
  return (
    <section className="fleet-page">
      <header className="fleet-page-heading">
        <div><span><Anchor aria-hidden="true" size={20} /></span><div><small>Référentiel partagé Planning · DPR · RH</small><h1>BBTM - Flotte</h1><p>Liste canonique des navires issue de la liste SharePoint QHSE.</p></div></div>
        <button aria-label="Actualiser BBTM - Flotte" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={17} />Actualiser</button>
      </header>
      <nav aria-label="Sections BBTM - Flotte" className="fleet-tabs" role="tablist">
        <button aria-selected={tab === 'fleet'} className={tab === 'fleet' ? 'is-active' : ''} onClick={() => setTab('fleet')} role="tab" type="button"><Ship size={17} />Flotte</button>
        <button aria-selected={tab === 'manning'} className={tab === 'manning' ? 'is-active' : ''} onClick={() => setTab('manning')} role="tab" type="button">Décision d’effectif</button>
      </nav>
      {feedback ? <p className={feedback.error ? 'form-error' : 'admin-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
      {tab === 'fleet' ? <div className="fleet-layout">
        <aside className="fleet-roster">
          <header><div><h2>Navires</h2><strong>{filtered.length}</strong></div>{canManage ? <button onClick={() => setForm(vesselForm())} type="button"><Plus size={16} />Ajouter</button> : null}</header>
          <label className="fleet-search"><Search size={16} /><input aria-label="Rechercher un navire" onChange={(event) => setSearch(event.target.value)} placeholder="Nom, immatriculation, IMO…" type="search" value={search} /></label>
          <label className="fleet-archived-toggle"><input checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} type="checkbox" />Afficher les navires retirés</label>
          <div className="fleet-vessel-list">{isLoading ? <p>Chargement…</p> : filtered.map((vessel) => <button className={vessel.id === selectedId ? 'is-active' : ''} key={vessel.id} onClick={() => setSelectedId(vessel.id)} type="button"><span><strong>{vessel.name}</strong><small>{[vessel.acronym, vessel.registrationNumber, vessel.imoNumber ? `IMO ${vessel.imoNumber}` : ''].filter(Boolean).join(' · ') || 'Référence sans immatriculation'}</small></span><em className={vessel.active ? 'is-active' : ''}>{vessel.active ? 'Actif' : 'Retiré'}</em></button>)}</div>
        </aside>
        <article className="fleet-detail">{selected ? <>
          <header><div><small>Fiche navire</small><h2>{selected.name}</h2><p>{selected.typeLabel || selected.unitTypeLabel || 'Type non renseigné'}</p></div>{canManage ? <div><button onClick={() => setForm(vesselForm(selected))} type="button"><Edit3 size={15} />Modifier</button><button className="is-danger" disabled={isSaving} onClick={() => void toggleArchived(selected)} type="button">{selected.active ? <Archive size={15} /> : <RotateCcw size={15} />}{selected.active ? 'Retirer' : 'Réintégrer'}</button></div> : null}</header>
          <dl className="fleet-detail-grid"><div><dt>Immatriculation</dt><dd>{selected.registrationNumber || '—'}</dd></div><div><dt>Numéro IMO</dt><dd>{selected.imoNumber || '—'}</dd></div><div><dt>Port</dt><dd>{selected.registrationPort || '—'}</dd></div><div><dt>Indicatif</dt><dd>{selected.callSign || '—'}</dd></div><div><dt>MMSI</dt><dd>{selected.mmsi || '—'}</dd></div><div><dt>Jauge brute</dt><dd>{selected.grossTonnage || '—'}</dd></div><div><dt>Capacité</dt><dd>{selected.maxPeople ?? '—'} personne{selected.maxPeople === 1 ? '' : 's'}</dd></div><div><dt>Longueur</dt><dd>{selected.lengthOverall || '—'}</dd></div><div><dt>Équipage</dt><dd>{selected.crewMembers || '—'}</dd></div><div><dt>Dotation médicale</dt><dd>{selected.medicalDotation || '—'}</dd></div></dl>
          <footer><span>Source : {selected.sharePointListId ? 'BBTM - Flotte (SharePoint)' : 'SeaPilot'}</span>{selected.sourceModifiedAt ? <span>Source mise à jour le {new Intl.DateTimeFormat('fr-FR').format(new Date(selected.sourceModifiedAt))}</span> : null}</footer>
        </> : <p>Sélectionnez un navire.</p>}</article>
      </div> : <div className="fleet-manning-panel"><ManningTab client={effectiveClient} data={p11} editable={canManage} onReload={async () => setP11(await fetchPlanningP11Data(effectiveClient))} overview={planningOverview} range={range} setFeedback={(message, error = false) => setFeedback({ message, error })} /></div>}
      {form ? <div className="fleet-dialog-backdrop" role="presentation"><form aria-label={form.id ? 'Modifier le navire' : 'Ajouter un navire'} aria-modal="true" className="fleet-dialog" onSubmit={submitVessel} role="dialog"><header><div><Ship size={19} /><span><small>Liste canonique</small><h2>{form.id ? 'Modifier le navire' : 'Ajouter un navire'}</h2></span></div><button aria-label="Fermer" onClick={() => setForm(null)} type="button"><X size={18} /></button></header><div className="fleet-dialog-grid"><label>Nom<input autoFocus minLength={2} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label><label>Acronyme<input onChange={(event) => setForm({ ...form, acronym: event.target.value })} value={form.acronym} /></label><label>Type<input onChange={(event) => setForm({ ...form, typeLabel: event.target.value })} value={form.typeLabel} /></label><label>Type d’unité<input onChange={(event) => setForm({ ...form, unitTypeLabel: event.target.value })} value={form.unitTypeLabel} /></label><label>Immatriculation<input onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} value={form.registrationNumber} /></label><label>IMO<input onChange={(event) => setForm({ ...form, imoNumber: event.target.value })} value={form.imoNumber} /></label><label>Port d’immatriculation<input onChange={(event) => setForm({ ...form, registrationPort: event.target.value })} value={form.registrationPort} /></label><label>Indicatif d’appel<input onChange={(event) => setForm({ ...form, callSign: event.target.value })} value={form.callSign} /></label><label>MMSI<input onChange={(event) => setForm({ ...form, mmsi: event.target.value })} value={form.mmsi} /></label><label>Jauge brute<input onChange={(event) => setForm({ ...form, grossTonnage: event.target.value })} value={form.grossTonnage} /></label><label>Capacité maximale<input min={0} onChange={(event) => setForm({ ...form, maxPeople: event.target.value ? Number(event.target.value) : null })} type="number" value={form.maxPeople ?? ''} /></label><label>Longueur hors tout<input onChange={(event) => setForm({ ...form, lengthOverall: event.target.value })} value={form.lengthOverall} /></label><label className="is-wide">Composition d’équipage<input onChange={(event) => setForm({ ...form, crewMembers: event.target.value })} value={form.crewMembers} /></label><label className="is-wide">Dotation médicale<input onChange={(event) => setForm({ ...form, medicalDotation: event.target.value })} value={form.medicalDotation} /></label></div><footer><button onClick={() => setForm(null)} type="button">Annuler</button><button disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button></footer></form></div> : null}
    </section>
  );
}
