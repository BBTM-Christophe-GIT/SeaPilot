import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Anchor, Archive, Building2, Edit3, FileDown, ImagePlus, MapPin, Plus,
  RefreshCw, RotateCcw, Search, Ship, Warehouse, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { todayPlanningDate } from '../planning/planningDates';
import { planningErrorMessage } from '../planning/planningErrors';
import type { PlanningDateRange } from '../planning/planningModel';
import { ManningTab } from '../planning/PlanningP11Panel';
import { fetchPlanningP11Data } from '../planning/planningP11Queries';
import type { PlanningP11Data } from '../planning/planningP11';
import { EMPTY_PLANNING_OVERVIEW } from '../planning/usePlanningOverview';
import { downloadFleetBrochure } from './fleetBrochure';
import { FleetCapacityPlans } from './FleetCapacityPlans';
import { FleetCapacitySectionFields } from './FleetCapacitySections';
import { createFleetCapacitySectionDrafts, parseFleetCapacitySections, type FleetCapacitySectionDraft } from './fleetCapacityModel';
import { FleetFuelFields, type FleetFuelDraft } from './FleetFuelFields';
import { FleetListExportDialog } from './FleetListExportDialog';
import { fleetFuelTankLabel, fleetMainFuelCapacityLiters, isFleetFuelTankCapacity, isFleetFuelTankName, isFleetFuelTankNames, type FleetFuelCapacity } from './fleetFuel';
import { VesselWeatherMatrixEditor } from './VesselWeatherMatrixEditor';
import { FleetVesselOverview } from './FleetVesselOverview';
import {
  archiveFleetVessel, fetchFleetVessels, resolveFleetVesselPhotoUrl, restoreFleetVessel,
  saveFleetVessel, uploadFleetVesselPhoto, MAX_FLEET_DRAFT_METERS, type FleetAssetKind, type FleetVessel,
  type SaveFleetVesselInput,
} from './fleetQueries';

interface FleetPageProps { client?: SupabaseClient; roles?: RoleKey[] }
type FleetDetailTab = 'overview' | 'manning' | 'weather';
type FleetVesselForm = Omit<SaveFleetVesselInput, keyof FleetFuelCapacity | 'capacitySections'> & {
  fuel: FleetFuelDraft;
  capacitySections: FleetCapacitySectionDraft[];
  capacitySectionsChanged: boolean;
};

const EMPTY_P11: PlanningP11Data = { rotations: [], templates: [], matrices: [], certificates: [] };
const ASSET_KINDS: Array<{ key: FleetAssetKind; label: string; singular: string }> = [
  { key: 'vessel', label: 'Navires', singular: 'Navire' },
  { key: 'office', label: 'Bureaux', singular: 'Bureau' },
  { key: 'quay', label: 'Quais', singular: 'Quai' },
];

const EMPTY_VESSEL: FleetVesselForm = {
  name: '', acronym: '', assetKind: 'vessel', typeLabel: '', unitTypeLabel: '', registrationNumber: '',
  imoNumber: '', registrationPort: '', callSign: '', mmsi: '', grossTonnage: '', maxPeople: null,
  crewMembers: '', medicalDotation: '', lengthOverall: '', flagState: '', brochureSubtitle: '',
  brochureSummary: '', brochureOperations: '', builtYear: null, classificationLabel: '', navigationCategory: '',
  beamOverallM: null, draftMeters: null, lightshipTonnes: null, deadweightTonnes: null, safeManning: null, mainEngine: '',
  mainEnginePowerKw: null, bowThrusterPowerKw: null, gensets: '', maxSpeedKnots: null,
  bollardPullTonnes: null, rangeDescription: '', deckEquipment: '',
  fuel: { tankCapacities: [], tankNames: [], dailyTankEnabled: false, dailyTankCapacity: null, dailyTankName: '', legacyCapacity: null, hiddenTankKeys: [] },
  capacitySections: [], capacitySectionsChanged: false,
  electronicsCommunications: '', accommodation: '', liabilityInsurer: '', weatherMatrix: null,
};

function vesselForm(vessel?: FleetVessel): FleetVesselForm {
  if (!vessel) return { ...EMPTY_VESSEL };
  const tankCapacities = vessel.fuelTankCapacitiesLiters ?? [];
  return {
    id: vessel.id, name: vessel.name, acronym: vessel.acronym, assetKind: vessel.assetKind,
    typeLabel: vessel.typeLabel, unitTypeLabel: vessel.unitTypeLabel, registrationNumber: vessel.registrationNumber,
    imoNumber: vessel.imoNumber, registrationPort: vessel.registrationPort, callSign: vessel.callSign,
    mmsi: vessel.mmsi, grossTonnage: vessel.grossTonnage, maxPeople: vessel.maxPeople,
    crewMembers: vessel.crewMembers, medicalDotation: vessel.medicalDotation, lengthOverall: vessel.lengthOverall,
    flagState: vessel.flagState, brochureSubtitle: vessel.brochureSubtitle, brochureSummary: vessel.brochureSummary,
    brochureOperations: vessel.brochureOperations.join('\n'), builtYear: vessel.builtYear,
    classificationLabel: vessel.classificationLabel, navigationCategory: vessel.navigationCategory,
    beamOverallM: vessel.beamOverallM, draftMeters: vessel.draftMeters ?? null, lightshipTonnes: vessel.lightshipTonnes,
    deadweightTonnes: vessel.deadweightTonnes, safeManning: vessel.safeManning, mainEngine: vessel.mainEngine,
    mainEnginePowerKw: vessel.mainEnginePowerKw, bowThrusterPowerKw: vessel.bowThrusterPowerKw,
    gensets: vessel.gensets, maxSpeedKnots: vessel.maxSpeedKnots, bollardPullTonnes: vessel.bollardPullTonnes,
    fuel: {
      tankCapacities, dailyTankEnabled: vessel.dailyFuelTankCapacityLiters != null,
      tankNames: tankCapacities.map((_, index) => fleetFuelTankLabel(tankCapacities.length, index, vessel.fuelTankNames)),
      dailyTankCapacity: vessel.dailyFuelTankCapacityLiters ?? null,
      dailyTankName: vessel.dailyFuelTankName ?? '',
      legacyCapacity: fleetMainFuelCapacityLiters({ fuelCapacityM3: vessel.fuelCapacityM3 }),
      hiddenTankKeys: vessel.hiddenFuelTankKeys ?? [],
    },
    capacitySections: createFleetCapacitySectionDrafts(vessel.capacitySections ?? []),
    capacitySectionsChanged: false,
    rangeDescription: vessel.rangeDescription,
    deckEquipment: vessel.deckEquipment, electronicsCommunications: vessel.electronicsCommunications,
    accommodation: vessel.accommodation, liabilityInsurer: vessel.liabilityInsurer,
    weatherMatrix: vessel.weatherMatrix ?? null,
  };
}

function currentYearRange(): PlanningDateRange {
  const year = todayPlanningDate().slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function displayDate(value: string): string {
  return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(value)) : '—';
}

function numberInput(value: number | null, onChange: (value: number | null) => void, label: string) {
  return <input aria-label={label} min={0} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} step="any" type="number" value={value ?? ''} />;
}

function AssetIcon({ kind, size = 18 }: { kind: FleetAssetKind; size?: number }) {
  return kind === 'office' ? <Building2 aria-hidden="true" size={size} />
    : kind === 'quay' ? <Warehouse aria-hidden="true" size={size} />
      : <Ship aria-hidden="true" size={size} />;
}

export function FleetPage({ client, roles }: FleetPageProps) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const effectiveRoles = roles || context?.roles || [];
  const canManage = effectiveRoles.includes('admin');
  const [vessels, setVessels] = useState<FleetVessel[]>([]);
  const [p11, setP11] = useState<PlanningP11Data>(EMPTY_P11);
  const [assetKind, setAssetKind] = useState<FleetAssetKind>('vessel');
  const [detailTab, setDetailTab] = useState<FleetDetailTab>('overview');
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [form, setForm] = useState<FleetVesselForm | null>(null);
  const [showFleetExport, setShowFleetExport] = useState(false);
  const [matrixReady, setMatrixReady] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const range = useMemo(currentYearRange, []);
  const fuelTankCount = form?.assetKind === 'vessel' ? form.fuel.tankCapacities.length : 0;
  const fuelTankNames = form && fuelTankCount > 0 ? form.fuel.tankNames.map(name => name.trim()) : null;
  const fuelNamesReady = fuelTankNames === null || isFleetFuelTankNames(fuelTankNames, fuelTankCount);
  const dailyTankName = form?.fuel.dailyTankName.trim() || null;
  const dailyFuelNameReady = !form?.fuel.dailyTankEnabled || dailyTankName === null || isFleetFuelTankName(dailyTankName);
  const capacitySections = parseFleetCapacitySections(form?.capacitySections ?? []);
  const vesselFormReady = matrixReady && fuelNamesReady && dailyFuelNameReady && capacitySections.error === null;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fleetRows, p11Data] = await Promise.all([fetchFleetVessels(effectiveClient), fetchPlanningP11Data(effectiveClient)]);
      setVessels(fleetRows);
      setP11(p11Data);
      setSelectedId((current) => current && fleetRows.some((vessel) => vessel.id === current)
        ? current : fleetRows.find((vessel) => vessel.assetKind === 'vessel')?.id || fleetRows[0]?.id || null);
      setFeedback(null);
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de charger le référentiel des actifs.'), error: true });
    } finally { setIsLoading(false); }
  }, [effectiveClient]);

  useEffect(() => { void load(); }, [load]);

  const baseVisible = useMemo(() => vessels.filter((vessel) => includeArchived || vessel.active), [includeArchived, vessels]);
  const exportVessels = useMemo(() => vessels.filter((vessel) => vessel.active && vessel.assetKind === 'vessel'), [vessels]);
  const counts = useMemo(() => Object.fromEntries(ASSET_KINDS.map(({ key }) => [key, baseVisible.filter((vessel) => vessel.assetKind === key).length])) as Record<FleetAssetKind, number>, [baseVisible]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr-FR');
    return baseVisible.filter((vessel) => vessel.assetKind === assetKind && (!term
      || `${vessel.name} ${vessel.acronym} ${vessel.registrationNumber} ${vessel.imoNumber} ${vessel.typeLabel} ${vessel.registrationPort}`
        .toLocaleLowerCase('fr-FR').includes(term)));
  }, [assetKind, baseVisible, search]);
  const selected = vessels.find((vessel) => vessel.id === selectedId) || null;

  useEffect(() => {
    if (!selected || selected.assetKind === assetKind) return;
    setAssetKind(selected.assetKind);
  }, [assetKind, selected]);

  useEffect(() => {
    if (filtered.some((vessel) => vessel.id === selectedId)) return;
    setSelectedId(filtered[0]?.id || null);
  }, [filtered, selectedId]);

  useEffect(() => {
    let active = true;
    setPhotoUrl('');
    if (!selected || selected.assetKind !== 'vessel') return () => { active = false; };
    void resolveFleetVesselPhotoUrl(effectiveClient, selected)
      .then((url) => { if (active) setPhotoUrl(url); })
      .catch(() => { if (active) setPhotoUrl(''); });
    return () => { active = false; };
  }, [effectiveClient, selected]);

  const manningOverview = useMemo(() => ({
    ...EMPTY_PLANNING_OVERVIEW,
    vessels: vessels.filter((vessel) => vessel.assetKind === 'vessel').map((vessel) => ({
      id: vessel.id, name: vessel.name, acronym: vessel.acronym,
      registrationNumber: vessel.registrationNumber, active: vessel.active,
    })),
  }), [vessels]);

  async function submitVessel(event: FormEvent) {
    event.preventDefault();
    if (!form || !canManage || (form.assetKind === 'vessel' && !vesselFormReady)) return;
    setIsSaving(true);
    try {
      const { fuel, capacitySections: capacityDraft, capacitySectionsChanged, ...input } = form;
      const useVesselCapacities = form.assetKind === 'vessel';
      const mainTanks = form.assetKind === 'vessel' ? fuel.tankCapacities : [];
      const useDailyTank = form.assetKind === 'vessel' && fuel.dailyTankEnabled;
      if (!mainTanks.every(isFleetFuelTankCapacity)) throw new Error('Renseignez une capacité en litres valide pour chacune des cuves principales.');
      if (useDailyTank && !isFleetFuelTankCapacity(fuel.dailyTankCapacity)) throw new Error('Renseignez une capacité en litres valide pour la caisse journalière.');
      let saved = await saveFleetVessel(effectiveClient, {
        ...input, fuelTankCapacitiesLiters: mainTanks.length ? mainTanks : null,
        fuelTankNames: fuelTankCount > 2 || fuelTankNames?.some((name, index) => name !== fleetFuelTankLabel(fuelTankCount, index))
          ? fuelTankNames : null,
        dailyFuelTankCapacityLiters: useDailyTank ? fuel.dailyTankCapacity : null,
        dailyFuelTankName: useDailyTank ? dailyTankName : null,
        hiddenFuelTankKeys: useVesselCapacities ? fuel.hiddenTankKeys : [],
        capacitySections: !useVesselCapacities ? [] : capacitySectionsChanged
          ? parseFleetCapacitySections(capacityDraft).sections ?? undefined : undefined,
      });
      if (photoFile && saved.assetKind === 'vessel') saved = await uploadFleetVesselPhoto(effectiveClient, saved, photoFile);
      await load();
      setSelectedId(saved.id);
      setAssetKind(saved.assetKind);
      setForm(null);
      setPhotoFile(null);
      setFeedback({ message: `${ASSET_KINDS.find((item) => item.key === saved.assetKind)?.singular || 'Actif'} enregistré.`, error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, "Impossible d’enregistrer cet actif."), error: true });
    } finally { setIsSaving(false); }
  }

  async function toggleArchived(vessel: FleetVessel) {
    if (!window.confirm(vessel.active ? `Retirer ${vessel.name} des listes actives ?` : `Réintégrer ${vessel.name} ?`)) return;
    setIsSaving(true);
    try {
      if (vessel.active) await archiveFleetVessel(effectiveClient, vessel.id);
      else await restoreFleetVessel(effectiveClient, vessel.id);
      await load();
      setFeedback({ message: vessel.active ? 'L’actif a été retiré des listes actives.' : 'L’actif est de nouveau actif.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de modifier la présence de cet actif.'), error: true });
    } finally { setIsSaving(false); }
  }

  async function editBrochure() {
    if (!selected || selected.assetKind !== 'vessel') return;
    setIsGenerating(true);
    try {
      await downloadFleetBrochure(selected, photoUrl);
      setFeedback({ message: `La brochure de ${selected.name} a été éditée.`, error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible d’éditer la brochure.'), error: true });
    } finally { setIsGenerating(false); }
  }

  function chooseKind(kind: FleetAssetKind) {
    setAssetKind(kind);
    setDetailTab('overview');
    const next = baseVisible.find((vessel) => vessel.assetKind === kind);
    setSelectedId(next?.id || null);
  }

  return <section className="fleet-page">
    <header className="fleet-page-heading">
      <div><span><Anchor aria-hidden="true" size={20} /></span><div><small>Référentiel opérationnel BBTM</small><h1>Navires</h1><p>Navires, bureaux et quais issus de la liste BBTM - Flotte.</p></div></div>
    </header>

    <ModuleRibbon ariaLabel="Menu des navires" singleRow>
      <ModuleRibbonGroup label="Référentiel">
        {canManage ? <ModuleRibbonCommand icon={<Plus aria-hidden="true" size={22} />} label="Ajouter" onClick={() => { setForm(vesselForm()); setMatrixReady(true); setPhotoFile(null); }} /> : null}
        <ModuleRibbonCommand aria-label="Actualiser les actifs" disabled={isLoading} icon={<RefreshCw aria-hidden="true" size={22} />} label="Actualiser" onClick={() => void load()} />
      </ModuleRibbonGroup>
      <ModuleRibbonGroup label="Exports">
        <ModuleRibbonCommand aria-haspopup="dialog" disabled={isLoading || !exportVessels.length} icon={<FileDown aria-hidden="true" size={22} />} label="Flotte" onClick={() => setShowFleetExport(true)} />
      </ModuleRibbonGroup>
    </ModuleRibbon>

    <nav aria-label="Types d’actifs" className="fleet-kind-tabs">
      {ASSET_KINDS.map((kind) => <button aria-pressed={assetKind === kind.key} className={assetKind === kind.key ? 'is-active' : ''} key={kind.key} onClick={() => chooseKind(kind.key)} type="button"><AssetIcon kind={kind.key} /><span>{kind.label}</span><strong>{counts[kind.key]}</strong></button>)}
    </nav>

    {feedback ? <p className={feedback.error ? 'form-error' : 'admin-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}

    <div className="fleet-layout">
      <aside className="fleet-roster">
        <header><div><h2>{ASSET_KINDS.find((kind) => kind.key === assetKind)?.label}</h2><strong>{filtered.length}</strong></div></header>
        <label className="fleet-search"><Search size={16} /><input aria-label="Rechercher un actif" onChange={(event) => setSearch(event.target.value)} placeholder="Nom, port, immatriculation…" type="search" value={search} /></label>
        <label className="fleet-archived-toggle"><input checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} type="checkbox" />Afficher les éléments retirés</label>
        <div className="fleet-vessel-list">{isLoading ? <p>Chargement…</p> : filtered.length ? filtered.map((vessel) => <button className={vessel.id === selectedId ? 'is-active' : ''} key={vessel.id} onClick={() => { setSelectedId(vessel.id); setDetailTab('overview'); }} type="button"><span className="fleet-list-icon"><AssetIcon kind={vessel.assetKind} size={17} /></span><span><strong>{vessel.name}</strong><small>{[vessel.acronym, vessel.registrationNumber, vessel.imoNumber ? `IMO ${vessel.imoNumber}` : '', vessel.registrationPort].filter(Boolean).join(' · ') || vessel.unitTypeLabel || 'Référence BBTM'}</small></span><em className={vessel.active ? 'is-active' : ''}>{vessel.active ? 'Actif' : 'Retiré'}</em></button>) : <p>Aucun élément dans cette catégorie.</p>}</div>
      </aside>

      <article className="fleet-detail">{selected ? <>
        {selected.assetKind === 'vessel' ? <div className={`fleet-vessel-photo${photoUrl ? '' : ' is-empty'}`}>{photoUrl ? <img alt={`Photo du navire ${selected.name}`} src={photoUrl} /> : <><Ship aria-hidden="true" size={42} /><span>Photo du navire à ajouter</span></>}<span className="fleet-photo-gradient" /></div> : <div className={`fleet-place-hero is-${selected.assetKind}`}><AssetIcon kind={selected.assetKind} size={42} /><span>{ASSET_KINDS.find((kind) => kind.key === selected.assetKind)?.singular}</span></div>}
        <header className="fleet-detail-heading"><div><small>Fiche {ASSET_KINDS.find((kind) => kind.key === selected.assetKind)?.singular.toLocaleLowerCase('fr-FR')}</small><h2>{selected.name}</h2><p>{selected.typeLabel || selected.unitTypeLabel || 'Type non renseigné'}</p><span className={`fleet-status${selected.active ? ' is-active' : ''}`}>{selected.active ? 'Actif' : `Retiré${selected.fleetExitOn ? ` le ${displayDate(selected.fleetExitOn)}` : ''}`}</span></div><div>{selected.assetKind === 'vessel' ? <button disabled={isGenerating} onClick={() => void editBrochure()} type="button"><FileDown size={15} />{isGenerating ? 'Édition…' : 'Éditer brochure'}</button> : null}{canManage ? <><button onClick={() => { setForm(vesselForm(selected)); setMatrixReady(true); setPhotoFile(null); }} type="button"><Edit3 size={15} />Modifier</button><button className="is-danger" disabled={isSaving} onClick={() => void toggleArchived(selected)} type="button">{selected.active ? <Archive size={15} /> : <RotateCcw size={15} />}{selected.active ? 'Retirer' : 'Réintégrer'}</button></> : null}</div></header>

        {selected.assetKind === 'vessel' ? <nav aria-label="Sections du navire" className="fleet-detail-tabs"><button aria-selected={detailTab === 'overview'} className={detailTab === 'overview' ? 'is-active' : ''} onClick={() => setDetailTab('overview')} role="tab" type="button">Vue d’ensemble</button><button aria-selected={detailTab === 'manning'} className={detailTab === 'manning' ? 'is-active' : ''} onClick={() => setDetailTab('manning')} role="tab" type="button">Décision d’effectif</button><button aria-selected={detailTab === 'weather'} className={detailTab === 'weather' ? 'is-active' : ''} onClick={() => setDetailTab('weather')} role="tab" type="button">Conditions météo limites</button></nav> : null}

        {detailTab === 'weather' && selected.assetKind === 'vessel' ? <div className="fleet-weather-matrix-panel"><VesselWeatherMatrixEditor key={selected.id} value={selected.weatherMatrix} vesselName={selected.name} /></div> : detailTab === 'manning' && selected.assetKind === 'vessel' ? <div className="fleet-manning-panel"><p className="fleet-disconnected-note">Référentiel propre à ce navire. Son contrôle dans le Planning est temporairement désactivé.</p><ManningTab client={effectiveClient} data={p11} editable={canManage} fixedVesselId={selected.id} linkToPlanning={false} onReload={async () => setP11(await fetchPlanningP11Data(effectiveClient))} overview={manningOverview} range={range} setFeedback={(message, error = false) => setFeedback({ message, error })} /></div> : <>
          <FleetVesselOverview
            vessel={selected}
            plans={selected.assetKind === 'vessel' ? <FleetCapacityPlans key={selected.id} client={effectiveClient} vessel={selected} canManage={canManage} /> : null}
          />
          <section className="fleet-detail-section is-source"><h3>Source BBTM - Flotte</h3><dl className="fleet-detail-grid"><div><dt>Élément SharePoint</dt><dd>{selected.sharePointItemId || '—'}</dd></div><div><dt>Version source</dt><dd>{selected.sourceEtag || '—'}</dd></div><div><dt>Libellé actif source</dt><dd>{selected.sourceActiveLabel || '—'}</dd></div><div><dt>Sortie de flotte source</dt><dd>{displayDate(selected.sourceFleetExitAt)}</dd></div><div className="is-wide"><dt>Identifiant source</dt><dd>{selected.sourceGuid || '—'}</dd></div><div className="is-wide"><dt>Dernière modification source</dt><dd>{displayDate(selected.sourceModifiedAt)}</dd></div></dl></section>
        </>}
      </> : <div className="fleet-empty-detail"><MapPin size={28} /><p>Sélectionnez un élément.</p></div>}</article>
    </div>

    {showFleetExport ? <FleetListExportDialog onClose={() => setShowFleetExport(false)} vessels={exportVessels} /> : null}

    {form ? <div className="fleet-dialog-backdrop" role="presentation"><form aria-label={form.id ? 'Modifier l’actif' : 'Ajouter un actif'} aria-modal="true" className={`fleet-dialog is-wide${form.assetKind === 'vessel' ? ' has-weather-matrix' : ''}`} onSubmit={submitVessel} role="dialog"><header><div><AssetIcon kind={form.assetKind} size={19} /><span><small>Référentiel BBTM</small><h2>{form.id ? 'Modifier l’actif' : 'Ajouter un actif'}</h2></span></div><button aria-label="Fermer" onClick={() => setForm(null)} type="button"><X size={18} /></button></header><div className="fleet-dialog-grid">
      <label>Type d’actif<select onChange={(event) => { setForm({ ...form, assetKind: event.target.value as FleetAssetKind }); setMatrixReady(true); }} value={form.assetKind}>{ASSET_KINDS.map((kind) => <option key={kind.key} value={kind.key}>{kind.singular}</option>)}</select></label><label>Nom<input autoFocus minLength={2} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label><label>Acronyme<input onChange={(event) => setForm({ ...form, acronym: event.target.value })} value={form.acronym} /></label><label>Type / désignation<input onChange={(event) => setForm({ ...form, typeLabel: event.target.value })} value={form.typeLabel} /></label>
      {form.assetKind === 'vessel' ? <><label className="is-wide fleet-photo-field"><ImagePlus size={18} /><span>Photo du navire<small>JPEG, PNG ou WebP · 10 Mo maximum</small></span><input accept="image/jpeg,image/png,image/webp" aria-label="Photo du navire" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} type="file" /></label><h3 className="is-wide">Identification maritime</h3><label>Immatriculation<input onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} value={form.registrationNumber} /></label><label>IMO<input onChange={(event) => setForm({ ...form, imoNumber: event.target.value })} value={form.imoNumber} /></label><label>Port d’immatriculation<input onChange={(event) => setForm({ ...form, registrationPort: event.target.value })} value={form.registrationPort} /></label><label>Indicatif d’appel<input onChange={(event) => setForm({ ...form, callSign: event.target.value })} value={form.callSign} /></label><label>MMSI<input onChange={(event) => setForm({ ...form, mmsi: event.target.value })} value={form.mmsi} /></label><label>Pavillon<input onChange={(event) => setForm({ ...form, flagState: event.target.value })} value={form.flagState} /></label><h3 className="is-wide">Caractéristiques</h3><label>Jauge brute<input onChange={(event) => setForm({ ...form, grossTonnage: event.target.value })} value={form.grossTonnage} /></label><label>Longueur hors tout<input onChange={(event) => setForm({ ...form, lengthOverall: event.target.value })} value={form.lengthOverall} /></label><label>Largeur hors tout (m){numberInput(form.beamOverallM, (value) => setForm({ ...form, beamOverallM: value }), 'Largeur hors tout')}</label><label>Tirant d’eau (m)<input aria-label="Tirant d’eau (m)" type="number" min={0} max={MAX_FLEET_DRAFT_METERS} step="any" value={form.draftMeters ?? ''} onChange={(event) => setForm({ ...form, draftMeters: event.target.value ? Number(event.target.value) : null })} /></label><label>Année de construction{numberInput(form.builtYear, (value) => setForm({ ...form, builtYear: value }), 'Année de construction')}</label><label>Jauge lège (t){numberInput(form.lightshipTonnes, (value) => setForm({ ...form, lightshipTonnes: value }), 'Jauge lège')}</label><label>Port en lourd (t){numberInput(form.deadweightTonnes, (value) => setForm({ ...form, deadweightTonnes: value }), 'Port en lourd')}</label><label>Capacité maximale{numberInput(form.maxPeople, (value) => setForm({ ...form, maxPeople: value }), 'Capacité maximale')}</label><label>Effectif minimal{numberInput(form.safeManning, (value) => setForm({ ...form, safeManning: value }), 'Effectif minimal')}</label><label>Classification<input onChange={(event) => setForm({ ...form, classificationLabel: event.target.value })} value={form.classificationLabel} /></label><label>Catégorie de navigation<input onChange={(event) => setForm({ ...form, navigationCategory: event.target.value })} value={form.navigationCategory} /></label><label className="is-wide">Dotation médicale<input onChange={(event) => setForm({ ...form, medicalDotation: event.target.value })} value={form.medicalDotation} /></label><h3 className="is-wide">Propulsion & exploitation</h3><label>Moteur principal<input onChange={(event) => setForm({ ...form, mainEngine: event.target.value })} value={form.mainEngine} /></label><label>Puissance moteur (kW){numberInput(form.mainEnginePowerKw, (value) => setForm({ ...form, mainEnginePowerKw: value }), 'Puissance moteur')}</label><label>Propulseur d’étrave (kW){numberInput(form.bowThrusterPowerKw, (value) => setForm({ ...form, bowThrusterPowerKw: value }), 'Puissance propulseur')}</label><label>Vitesse maximale (nœuds){numberInput(form.maxSpeedKnots, (value) => setForm({ ...form, maxSpeedKnots: value }), 'Vitesse maximale')}</label><label>Traction au point fixe (t){numberInput(form.bollardPullTonnes, (value) => setForm({ ...form, bollardPullTonnes: value }), 'Traction')}</label><label className="is-wide">Assureur RC (P&amp;I)<input onChange={(event) => setForm({ ...form, liabilityInsurer: event.target.value })} value={form.liabilityInsurer} /></label><label className="is-wide">Groupes électrogènes<input onChange={(event) => setForm({ ...form, gensets: event.target.value })} value={form.gensets} /></label><label className="is-wide">Autonomie<textarea onChange={(event) => setForm({ ...form, rangeDescription: event.target.value })} value={form.rangeDescription} /></label><label className="is-wide">Équipements de pont<textarea onChange={(event) => setForm({ ...form, deckEquipment: event.target.value })} value={form.deckEquipment} /></label><label className="is-wide">Navigation & communications<textarea onChange={(event) => setForm({ ...form, electronicsCommunications: event.target.value })} value={form.electronicsCommunications} /></label><label className="is-wide">Aménagements<textarea onChange={(event) => setForm({ ...form, accommodation: event.target.value })} value={form.accommodation} /></label><section className="fleet-capacity-form" aria-label="Capacités">
        <h3>Capacités</h3>
        <FleetFuelFields value={form.fuel} disabled={isSaving} namesReady={fuelNamesReady} dailyNameReady={dailyFuelNameReady}
          onChange={fuel => setForm(current => current ? { ...current, fuel } : null)} />
        <FleetCapacitySectionFields sections={form.capacitySections} disabled={isSaving} error={capacitySections.error}
          onChange={sections => setForm(current => current ? { ...current, capacitySections: sections, capacitySectionsChanged: true } : null)} />
      </section>
      <h3 className="is-wide">Brochure</h3><label className="is-wide">Sous-titre<input onChange={(event) => setForm({ ...form, brochureSubtitle: event.target.value })} value={form.brochureSubtitle} /></label><label className="is-wide">Présentation<textarea onChange={(event) => setForm({ ...form, brochureSummary: event.target.value })} value={form.brochureSummary} /></label><label className="is-wide">Usages opérationnels (un par ligne)<textarea rows={4} onChange={(event) => setForm({ ...form, brochureOperations: event.target.value })} value={form.brochureOperations} /></label></> : null}
      {form.assetKind === 'vessel' ? <VesselWeatherMatrixEditor disabled={isSaving} key={form.id || 'new'} onChange={(weatherMatrix) => setForm((current) => current ? { ...current, weatherMatrix } : null)} onValidationChange={setMatrixReady} value={form.weatherMatrix} vesselName={form.name} /> : null}
    </div><footer><button onClick={() => setForm(null)} type="button">Annuler</button><button disabled={isSaving || (form.assetKind === 'vessel' && !vesselFormReady)} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button></footer></form></div> : null}
  </section>;
}
