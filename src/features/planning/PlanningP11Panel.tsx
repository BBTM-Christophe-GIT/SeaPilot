import type { SupabaseClient } from '@supabase/supabase-js';
import { Anchor, CopyPlus, Edit3, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage, reportPlanningTechnicalError } from './planningErrors';
import {
  buildManningMatrixComparison,
  buildRotationPreview,
  PLANNING_FUNCTION_GROUPS,
  rotationPatternDays,
  rotationPreviewHasOverlaps,
  type PlanningManningMatrix,
  type PlanningManningRequirement,
  type PlanningP11Data,
  type PlanningRotationOccurrence,
  type PlanningRotationPattern,
  type PlanningRotationSeries,
  type PlanningStcwCertificate,
  type PlanningTemplate,
  type PlanningTemplateKind,
} from './planningP11';
import {
  applyPlanningTemplate,
  fetchPlanningP11Data,
  savePlanningManningMatrix,
  savePlanningRotation,
  savePlanningTemplate,
  updatePlanningRotationOccurrence,
  type SavePlanningManningMatrixInput,
  type SavePlanningRotationInput,
  type SavePlanningTemplateInput,
} from './planningP11Queries';
import { formatPlanningPerson, type PlanningDateRange } from './planningModel';
import type { PlanningOverview } from './planningQueries';

type P11Tab = 'rotations' | 'templates' | 'manning';
type OperationalChange = 'assignments' | 'projects' | 'handovers';

const EMPTY_DATA: PlanningP11Data = { rotations: [], templates: [], matrices: [], certificates: [] };
const TEMPLATE_LABELS: Record<PlanningTemplateKind, string> = {
  handover: 'Relève', maritime_campaign: 'Campagne maritime', safety_vessel: 'Navire de sécurité',
  transit: 'Transit', maintenance: 'Maintenance', provisioning: 'Avitaillement', bunkering: 'Soutage',
  training: 'Formation', safety_drill: 'Exercice de sécurité',
};
const PATTERN_LABELS: Record<PlanningRotationPattern, string> = {
  '7_7': '7 / 7', '10_10': '10 / 10', '14_14': '14 / 14', custom: 'Personnalisée',
};
const MANNING_CERTIFICATE_CATEGORIES = ['Pont', 'Machine', 'Formation de Sécurité'] as const;
const MANNING_CERTIFICATE_CATEGORY_SET = new Set<string>(MANNING_CERTIFICATE_CATEGORIES);

interface PlanningCertificateChoiceGroup {
  label: string;
  certificates: PlanningStcwCertificate[];
}

function groupCertificates(
  certificates: PlanningStcwCertificate[],
  allowedCategories?: readonly string[],
): PlanningCertificateChoiceGroup[] {
  const grouped = new Map<string, PlanningStcwCertificate[]>();
  const allowed = allowedCategories ? new Set(allowedCategories) : null;
  for (const certificate of certificates) {
    if (allowed && !allowed.has(certificate.category)) continue;
    const values = grouped.get(certificate.category) || [];
    values.push(certificate);
    grouped.set(certificate.category, values);
  }
  const categories = allowedCategories
    ? allowedCategories.filter((category) => grouped.has(category))
    : [...grouped.keys()].sort((left, right) => left.localeCompare(right, 'fr'));
  return categories.map((category) => ({
    label: category,
    certificates: [...(grouped.get(category) || [])].sort((left, right) => left.name.localeCompare(right.name, 'fr')),
  }));
}

function PlanningCertificateMultiSelect({
  label,
  ariaLabel,
  groups,
  selected,
  onToggle,
}: {
  label: string;
  ariaLabel: string;
  groups: PlanningCertificateChoiceGroup[];
  selected: string[];
  onToggle: (certificate: string) => void;
}) {
  return <div className="planning-stcw-multiselect" role="group" aria-label={ariaLabel}>
    <span>{label}</span>
    <div>
      {groups.map((group) => <section key={group.label}>
        <h6>{group.label}</h6>
        <div>{group.certificates.map((certificate) => <label key={certificate.id}>
          <input checked={selected.includes(certificate.name)} onChange={() => onToggle(certificate.name)} type="checkbox" />
          <span><strong>{certificate.name}</strong><small>{certificate.stcwRules.join(' · ') || certificate.category}</small></span>
        </label>)}</div>
      </section>)}
    </div>
    {!groups.length ? <small>Aucune valeur disponible dans le catalogue STCW.</small> : null}
  </div>;
}

function requirementInput(requirement?: PlanningManningRequirement, displayOrder = 0): PlanningManningRequirement {
  return requirement ? { ...requirement } : {
    functionLabel: '', minimumCount: 1, targetCount: 1, requiredCertificates: [],
    requiredQualifications: [], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder,
  };
}

function RotationTab({ client, data, overview, editable, onReload, onOperationalChange, setFeedback }: {
  client: SupabaseClient;
  data: PlanningP11Data;
  overview: PlanningOverview;
  editable: boolean;
  onReload: () => Promise<void>;
  onOperationalChange: (kind: OperationalChange) => Promise<void>;
  setFeedback: (message: string, level?: boolean | 'warning') => void;
}) {
  const activeVessels = overview.vessels.filter((vessel) => vessel.active);
  const activePeople = overview.people.filter((person) => person.active);
  const initialRotation = (): SavePlanningRotationInput => ({
    vesselId: activeVessels[0]?.id || 0,
    crewPersonId: activePeople[0]?.id || 0,
    captainPersonId: null,
    name: 'Rotation 14 / 14',
    patternKey: '14_14',
    startsOn: todayPlanningDate(),
    onboardDays: 14,
    restDays: 14,
    occurrenceCount: 6,
    assignmentRole: activePeople[0]?.functionLabel || 'Équipage',
    watchGroup: '',
    handoverMinutes: 60,
    confirmationStatus: 'provisional',
  });
  const [form, setForm] = useState<SavePlanningRotationInput>(initialRotation);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<{ series: PlanningRotationSeries; occurrence: PlanningRotationOccurrence; scope: 'occurrence' | 'following' | 'series'; startsOn: string; endsOn: string; vesselId: number; assignmentRole: string; watchGroup: string } | null>(null);
  const preview = useMemo(() => buildRotationPreview(form.startsOn, form.onboardDays, form.restDays, form.occurrenceCount), [form]);

  function changePattern(patternKey: PlanningRotationPattern) {
    const pattern = rotationPatternDays(patternKey);
    setForm((current) => ({
      ...current, patternKey, name: patternKey === 'custom' ? current.name : `Rotation ${PATTERN_LABELS[patternKey]}`,
      onboardDays: pattern?.onboardDays ?? current.onboardDays, restDays: pattern?.restDays ?? current.restDays,
    }));
  }

  async function submitRotation(event: FormEvent) {
    event.preventDefault();
    if (rotationPreviewHasOverlaps(preview)) return setFeedback('Le rythme produit des occurrences qui se chevauchent.', true);
    setIsSaving(true);
    try {
      await savePlanningRotation(client, form);
    } catch (error) {
      setFeedback(planningErrorMessage(error, 'Impossible d’enregistrer la rotation.'), true);
      setIsSaving(false);
      return;
    }

    const savedOccurrenceCount = form.occurrenceCount;
    setForm(initialRotation());
    setIsFormOpen(false);
    try {
      await Promise.all([onReload(), onOperationalChange('assignments')]);
      setFeedback(`${savedOccurrenceCount} occurrence(s) générée(s) dans les affectations.`);
    } catch (error) {
      reportPlanningTechnicalError('refresh-after-save-rotation', error, 'warning');
      setFeedback(
        `La rotation et ses ${savedOccurrenceCount} occurrence(s) sont enregistrées, mais l’affichage n’a pas pu être actualisé. Utilisez le bouton Actualiser.`,
        'warning',
      );
    } finally { setIsSaving(false); }
  }

  async function submitOccurrence(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    setIsSaving(true);
    try {
      const changed = await updatePlanningRotationOccurrence(client, {
        occurrenceId: editing.occurrence.id, scope: editing.scope, startsOn: editing.startsOn,
        endsOn: editing.endsOn, vesselId: editing.vesselId, assignmentRole: editing.assignmentRole, watchGroup: editing.watchGroup,
      });
      await Promise.all([onReload(), onOperationalChange('assignments')]);
      setEditing(null); setFeedback(`${changed} occurrence(s) mise(s) à jour.`);
    } catch (error) { setFeedback(planningErrorMessage(error, 'Impossible de modifier cette occurrence.'), true); }
    finally { setIsSaving(false); }
  }

  return <section className="planning-p11-section">
    <div className="planning-p11-section-heading"><div><h3>Rotations d’équipage</h3><p>Les périodes embarquées créent des affectations P0 natives ; le repos reste explicite dans la série.</p></div>{editable ? <button onClick={() => setIsFormOpen((value) => !value)} type="button"><Plus size={16} />Nouvelle rotation</button> : null}</div>
    {isFormOpen ? <form className="planning-p11-form" onSubmit={submitRotation}>
      <div className="planning-p11-form-grid">
        <label>Nom<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Rythme<select value={form.patternKey} onChange={(event) => changePattern(event.target.value as PlanningRotationPattern)}>{Object.entries(PATTERN_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Navire<select required value={form.vesselId} onChange={(event) => setForm({ ...form, vesselId: Number(event.target.value) })}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
        <label>Marin<select required value={form.crewPersonId} onChange={(event) => { const person = activePeople.find((item) => item.id === Number(event.target.value)); setForm({ ...form, crewPersonId: Number(event.target.value), assignmentRole: person?.functionLabel || form.assignmentRole }); }}>{activePeople.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label>
        <label>Capitaine<select value={form.captainPersonId || ''} onChange={(event) => setForm({ ...form, captainPersonId: event.target.value ? Number(event.target.value) : null })}><option value="">Non renseigné</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label>
        <label>Fonction<input required value={form.assignmentRole} onChange={(event) => setForm({ ...form, assignmentRole: event.target.value })} /></label>
        <label>Date de début<input required type="date" value={form.startsOn} onChange={(event) => setForm({ ...form, startsOn: event.target.value })} /></label>
        <label>Période embarquée<input disabled={form.patternKey !== 'custom'} min={1} max={90} type="number" value={form.onboardDays} onChange={(event) => setForm({ ...form, onboardDays: Number(event.target.value) })} /></label>
        <label>Période de repos<input disabled={form.patternKey !== 'custom'} min={1} max={90} type="number" value={form.restDays} onChange={(event) => setForm({ ...form, restDays: Number(event.target.value) })} /></label>
        <label>Occurrences<input min={1} max={104} type="number" value={form.occurrenceCount} onChange={(event) => setForm({ ...form, occurrenceCount: Number(event.target.value) })} /></label>
        <label>Bordée<input value={form.watchGroup} onChange={(event) => setForm({ ...form, watchGroup: event.target.value })} /></label>
        <label>Passation (minutes)<input min={0} max={1440} type="number" value={form.handoverMinutes} onChange={(event) => setForm({ ...form, handoverMinutes: Number(event.target.value) })} /></label>
        <label>État<select value={form.confirmationStatus} onChange={(event) => setForm({ ...form, confirmationStatus: event.target.value as 'provisional' | 'confirmed' })}><option value="provisional">Provisoire</option><option value="confirmed">Confirmée</option></select></label>
      </div>
      <div className="planning-p11-preview" aria-label="Aperçu des occurrences">{preview.slice(0, 8).map((item) => <span key={item.occurrenceNumber}><strong>#{item.occurrenceNumber}</strong>{formatPlanningDate(item.startsOn)} → {formatPlanningDate(item.endsOn)}<small>Repos jusqu’au {formatPlanningDate(item.restEndsOn)}</small></span>)}</div>
      <footer><button className="is-secondary" onClick={() => setIsFormOpen(false)} type="button">Annuler</button><button disabled={isSaving || !activePeople.length || !activeVessels.length} type="submit">{isSaving ? 'Génération…' : 'Générer la série'}</button></footer>
    </form> : null}
    <div className="planning-p11-card-list">{data.rotations.length ? data.rotations.map((series) => {
      const vessel = overview.vessels.find((item) => item.id === series.vesselId);
      const person = overview.people.find((item) => item.id === series.crewPersonId);
      return <article className="planning-p11-card" key={series.id}><header><div><small>{PATTERN_LABELS[series.patternKey]} · {series.confirmationStatus === 'confirmed' ? 'Confirmée' : 'Provisoire'}</small><h4>{series.name}</h4><p>{vessel?.name} · {person ? formatPlanningPerson(person) : 'Marin'} · {series.assignmentRole}</p></div><span className="planning-p11-count">{series.occurrences.length}</span></header><div className="planning-p11-occurrences">{series.occurrences.map((occurrence) => <button disabled={!editable} key={occurrence.id} onClick={() => setEditing({ series, occurrence, scope: 'occurrence', startsOn: occurrence.startsOn, endsOn: occurrence.endsOn, vesselId: series.vesselId, assignmentRole: series.assignmentRole, watchGroup: series.watchGroup })} type="button"><span>#{occurrence.occurrenceNumber} {occurrence.isOverride ? '· modifiée' : ''}</span><strong>{formatPlanningDate(occurrence.startsOn)} → {formatPlanningDate(occurrence.endsOn)}</strong></button>)}</div></article>;
    }) : <div className="planning-calendar-empty"><Anchor size={24} /><p>Aucune rotation structurée.</p></div>}</div>
    {editing ? <form className="planning-p11-inline-editor" onSubmit={submitOccurrence}><div><Edit3 size={18} /><span><small>{editing.series.name}</small><strong>Modifier l’occurrence #{editing.occurrence.occurrenceNumber}</strong></span></div><label>Portée<select value={editing.scope} onChange={(event) => setEditing({ ...editing, scope: event.target.value as typeof editing.scope })}><option value="occurrence">Cette occurrence</option><option value="following">Cette occurrence et les suivantes</option><option value="series">Toute la série</option></select></label><label>Début<input required type="date" value={editing.startsOn} onChange={(event) => setEditing({ ...editing, startsOn: event.target.value })} /></label><label>Fin<input required min={editing.startsOn} type="date" value={editing.endsOn} onChange={(event) => setEditing({ ...editing, endsOn: event.target.value })} /></label><label>Navire<select value={editing.vesselId} onChange={(event) => setEditing({ ...editing, vesselId: Number(event.target.value) })}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label><label>Fonction<input required value={editing.assignmentRole} onChange={(event) => setEditing({ ...editing, assignmentRole: event.target.value })} /></label><label>Bordée<input value={editing.watchGroup} onChange={(event) => setEditing({ ...editing, watchGroup: event.target.value })} /></label><footer><button className="is-secondary" onClick={() => setEditing(null)} type="button">Annuler</button><button disabled={isSaving} type="submit">Confirmer</button></footer></form> : null}
  </section>;
}

function TemplateTab({ client, data, overview, editable, onReload, onOperationalChange, setFeedback }: {
  client: SupabaseClient; data: PlanningP11Data; overview: PlanningOverview; editable: boolean;
  onReload: () => Promise<void>; onOperationalChange: (kind: OperationalChange) => Promise<void>;
  setFeedback: (message: string, error?: boolean) => void;
}) {
  const vessels = overview.vessels.filter((vessel) => vessel.active);
  const people = overview.people.filter((person) => person.active);
  const emptyForm = (): SavePlanningTemplateInput => ({ vesselId: null, name: '', templateKind: 'transit', description: '', defaultDurationDays: 1, defaultStatus: 'draft', configuration: {} });
  const [form, setForm] = useState<SavePlanningTemplateInput>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [applying, setApplying] = useState<PlanningTemplate | null>(null);
  const [applyForm, setApplyForm] = useState({ vesselId: vessels[0]?.id || 0, startsOn: todayPlanningDate(), title: '', responsiblePersonId: people[0]?.id || 0, location: '' });
  const [isSaving, setIsSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setIsSaving(true);
    try { await savePlanningTemplate(client, form); await onReload(); setForm(emptyForm()); setIsFormOpen(false); setFeedback('Modèle enregistré.'); }
    catch (error) { setFeedback(planningErrorMessage(error, 'Impossible d’enregistrer le modèle.'), true); }
    finally { setIsSaving(false); }
  }
  function openApply(template: PlanningTemplate) {
    setApplying(template); setApplyForm({ vesselId: template.vesselId || vessels[0]?.id || 0, startsOn: todayPlanningDate(), title: template.name, responsiblePersonId: people[0]?.id || 0, location: '' });
  }
  async function apply(event: FormEvent) {
    event.preventDefault(); if (!applying) return; setIsSaving(true);
    try {
      const result = await applyPlanningTemplate(client, { templateId: applying.id, ...applyForm });
      await onOperationalChange(result.entityKind === 'handover' ? 'handovers' : 'projects');
      setApplying(null); setFeedback(result.entityKind === 'handover' ? 'Relève brouillon créée depuis le modèle.' : 'Événement créé depuis le modèle.');
    } catch (error) { setFeedback(planningErrorMessage(error, 'Impossible d’appliquer le modèle.'), true); }
    finally { setIsSaving(false); }
  }
  return <section className="planning-p11-section"><div className="planning-p11-section-heading"><div><h3>Modèles réutilisables</h3><p>Chaque réutilisation crée un événement ou une relève dans les tables P0.</p></div>{editable ? <button onClick={() => { setForm(emptyForm()); setIsFormOpen((value) => !value); }} type="button"><Plus size={16} />Nouveau modèle</button> : null}</div>
    {isFormOpen ? <form className="planning-p11-form" onSubmit={submit}><div className="planning-p11-form-grid"><label>Nom<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Type<select value={form.templateKind} onChange={(event) => setForm({ ...form, templateKind: event.target.value as PlanningTemplateKind })}>{Object.entries(TEMPLATE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Navire par défaut<select value={form.vesselId || ''} onChange={(event) => setForm({ ...form, vesselId: event.target.value ? Number(event.target.value) : null })}><option value="">Tous les navires</option>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label><label>Durée (jours)<input min={1} max={366} type="number" value={form.defaultDurationDays} onChange={(event) => setForm({ ...form, defaultDurationDays: Number(event.target.value) })} /></label><label>État<select value={form.defaultStatus} onChange={(event) => setForm({ ...form, defaultStatus: event.target.value as typeof form.defaultStatus })}><option value="draft">Brouillon</option><option value="planned">Planifié</option><option value="confirmed">Confirmé</option></select></label><label className="is-wide">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></div><footer><button className="is-secondary" onClick={() => setIsFormOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Enregistrer</button></footer></form> : null}
    <div className="planning-p11-template-grid">{data.templates.length ? data.templates.map((template) => <article className="planning-p11-card" key={template.id}><small>{TEMPLATE_LABELS[template.templateKind]}</small><h4>{template.name}</h4><p>{template.description || 'Sans description'}</p><dl><div><dt>Durée</dt><dd>{template.defaultDurationDays} j</dd></div><div><dt>État</dt><dd>{template.defaultStatus}</dd></div></dl>{editable ? <button onClick={() => openApply(template)} type="button"><CopyPlus size={16} />Réutiliser</button> : null}</article>) : <div className="planning-calendar-empty"><CopyPlus size={24} /><p>Aucun modèle réutilisable.</p></div>}</div>
    {applying ? <form className="planning-p11-inline-editor" onSubmit={apply}><div><CopyPlus size={18} /><span><small>{TEMPLATE_LABELS[applying.templateKind]}</small><strong>Réutiliser « {applying.name} »</strong></span></div><label>Titre<input required minLength={2} value={applyForm.title} onChange={(event) => setApplyForm({ ...applyForm, title: event.target.value })} /></label><label>Navire<select value={applyForm.vesselId} onChange={(event) => setApplyForm({ ...applyForm, vesselId: Number(event.target.value) })}>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label><label>Date<input required type="date" value={applyForm.startsOn} onChange={(event) => setApplyForm({ ...applyForm, startsOn: event.target.value })} /></label>{applying.templateKind === 'handover' ? <><label>Responsable<select value={applyForm.responsiblePersonId} onChange={(event) => setApplyForm({ ...applyForm, responsiblePersonId: Number(event.target.value) })}>{people.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label><label>Lieu<input required value={applyForm.location} onChange={(event) => setApplyForm({ ...applyForm, location: event.target.value })} /></label></> : null}<footer><button className="is-secondary" onClick={() => setApplying(null)} type="button">Annuler</button><button disabled={isSaving} type="submit">Créer</button></footer></form> : null}
  </section>;
}

function ManningTab({ client, data, overview, range, editable, onReload, setFeedback }: {
  client: SupabaseClient; data: PlanningP11Data; overview: PlanningOverview; range: PlanningDateRange;
  editable: boolean; onReload: () => Promise<void>; setFeedback: (message: string, error?: boolean) => void;
}) {
  const vessels = overview.vessels.filter((vessel) => vessel.active);
  const situations = Array.from({ length: 6 }, (_, index) => `Situation ${index + 1}`);
  const emptyForm = (): SavePlanningManningMatrixInput => ({
    vesselId: vessels[0]?.id || 0,
    name: situations[0],
    effectiveFrom: range.start,
    effectiveTo: '',
    status: 'active',
    notes: '',
    requirements: [requirementInput()],
  });
  const [form, setForm] = useState<SavePlanningManningMatrixInput>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(data.matrices[0]?.id || null);
  const [isSaving, setIsSaving] = useState(false);
  const selected = data.matrices.find((matrix) => matrix.id === selectedId) || data.matrices[0] || null;
  const comparison = useMemo(() => selected ? buildManningMatrixComparison(overview, selected, range.start, range.end) : [], [overview, range.end, range.start, selected]);
  const certificateGroups = useMemo(
    () => groupCertificates(data.certificates, MANNING_CERTIFICATE_CATEGORIES),
    [data.certificates],
  );
  const authorizationGroups = useMemo(
    () => groupCertificates(data.certificates.filter((certificate) => !MANNING_CERTIFICATE_CATEGORY_SET.has(certificate.category))),
    [data.certificates],
  );
  const certificateNames = useMemo(
    () => new Set(certificateGroups.flatMap((group) => group.certificates.map((certificate) => certificate.name))),
    [certificateGroups],
  );
  const authorizationNames = useMemo(
    () => new Set(authorizationGroups.flatMap((group) => group.certificates.map((certificate) => certificate.name))),
    [authorizationGroups],
  );
  function updateRequirement(index: number, patch: Partial<PlanningManningRequirement>) {
    setForm((current) => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  function openMatrix(matrix?: PlanningManningMatrix) {
    setForm(matrix ? {
      id: matrix.id,
      vesselId: matrix.vesselId,
      name: situations.includes(matrix.name) ? matrix.name : situations[0],
      effectiveFrom: matrix.effectiveFrom,
      effectiveTo: matrix.effectiveTo,
      status: matrix.status,
      notes: matrix.notes,
      requirements: matrix.requirements.map((item) => ({
        ...item,
        requiredCertificates: [...new Set([
          ...item.requiredCertificates.filter((value) => !authorizationNames.has(value)),
          ...item.requiredAuthorizations.filter((value) => certificateNames.has(value)),
        ])],
        requiredAuthorizations: [...new Set([
          ...item.requiredAuthorizations.filter((value) => !certificateNames.has(value)),
          ...item.requiredCertificates.filter((value) => authorizationNames.has(value)),
        ])],
      })),
    } : emptyForm());
    setIsFormOpen(true);
  }
  function toggleRequirementValue(
    index: number,
    field: 'requiredCertificates' | 'requiredAuthorizations',
    value: string,
  ) {
    const current = form.requirements[index][field];
    updateRequirement(index, {
      [field]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setIsSaving(true);
    try {
      const normalizedForm = {
        ...form,
        requirements: form.requirements.map((item, index) => ({
          ...item,
          minimumCount: 1,
          targetCount: 1,
          requiredQualifications: [],
          requiredTrainings: [],
          restrictions: [],
          displayOrder: index,
        })),
      };
      const id = await savePlanningManningMatrix(client, normalizedForm);
      await onReload(); setSelectedId(id); setIsFormOpen(false);
      setFeedback('Décision d’effectif enregistrée et versionnée.');
    } catch (error) { setFeedback(planningErrorMessage(error, 'Impossible d’enregistrer la décision d’effectif.'), true); }
    finally { setIsSaving(false); }
  }
  return <section className="planning-p11-section">
    <div className="planning-p11-section-heading"><div><h3>Décision d’effectif</h3><p>Postes attendus et brevets nécessaires pour le navire sélectionné.</p></div>{editable ? <button onClick={() => openMatrix()} type="button"><Plus size={16} />Nouvelle décision</button> : null}</div>
    {isFormOpen ? <form className="planning-p11-form" onSubmit={submit}>
      <div className="planning-p11-form-grid">
        <label>Situation<select required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}>{situations.map((situation) => <option key={situation}>{situation}</option>)}</select></label>
        <label>Navire<select value={form.vesselId} onChange={(event) => setForm({ ...form, vesselId: Number(event.target.value) })}>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
        <label className="is-wide">Prescriptions ou conditions spéciales<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </div>
      <div className="planning-p11-requirements"><header><h4>Postes normalement prévus</h4><button onClick={() => setForm((current) => ({ ...current, requirements: [...current.requirements, requirementInput(undefined, current.requirements.length)] }))} type="button"><Plus size={15} />Ajouter un poste</button></header>
        {form.requirements.map((requirement, index) => <fieldset key={index}>
          <legend>Poste {index + 1}</legend>
          <label>Fonction<select required value={requirement.functionLabel} onChange={(event) => updateRequirement(index, { functionLabel: event.target.value })}>
            <option value="">Sélectionner une fonction</option>
            {PLANNING_FUNCTION_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.functions.map((functionLabel) => <option key={functionLabel} value={functionLabel}>{functionLabel}</option>)}</optgroup>)}
          </select></label>
          <PlanningCertificateMultiSelect
            ariaLabel={`Brevets requis pour ${requirement.functionLabel || `le poste ${index + 1}`}`}
            groups={certificateGroups}
            label="Brevets"
            onToggle={(value) => toggleRequirementValue(index, 'requiredCertificates', value)}
            selected={requirement.requiredCertificates}
          />
          <PlanningCertificateMultiSelect
            ariaLabel={`Habilitations requises pour ${requirement.functionLabel || `le poste ${index + 1}`}`}
            groups={authorizationGroups}
            label="Habilitations"
            onToggle={(value) => toggleRequirementValue(index, 'requiredAuthorizations', value)}
            selected={requirement.requiredAuthorizations}
          />
          {form.requirements.length > 1 ? <button aria-label={`Supprimer le poste ${index + 1}`} onClick={() => setForm((current) => ({ ...current, requirements: current.requirements.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, displayOrder: itemIndex })) }))} type="button"><Trash2 size={16} /></button> : null}
        </fieldset>)}
      </div>
      <footer><button className="is-secondary" onClick={() => setIsFormOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Enregistrer la décision</button></footer>
    </form> : null}
    {data.matrices.length ? <><div className="planning-p11-matrix-picker">{data.matrices.map((matrix) => <button className={matrix.id === selected?.id ? 'is-active' : ''} key={matrix.id} onClick={() => setSelectedId(matrix.id)} type="button"><span><strong>{matrix.name}</strong><small>{overview.vessels.find((vessel) => vessel.id === matrix.vesselId)?.name} · v{matrix.version}</small></span></button>)}</div>{selected ? <div className="planning-p11-comparison"><header><div><small>Contrôle automatique</small><h4>{selected.name}</h4></div>{editable ? <button onClick={() => openMatrix(selected)} type="button"><Edit3 size={15} />Configurer</button> : null}</header><div className="planning-p11-comparison-table"><table><thead><tr><th>Poste</th><th>Affecté</th><th>Vacant</th><th>Conformité des brevets</th></tr></thead><tbody>{comparison.map((row) => <tr className={row.vacantCount || row.noncompliant.length ? 'has-alert' : ''} key={row.functionLabel}><td><strong>{row.functionLabel}</strong></td><td>{row.plannedCount}</td><td>{row.vacantCount}</td><td>{row.noncompliant.length ? row.noncompliant.map((item) => <span key={item.personId}>{item.personName} : {item.missing.join(', ')}</span>) : <span className="is-ok"><ShieldCheck size={14} />Conforme</span>}</td></tr>)}</tbody></table></div></div> : null}</> : <div className="planning-calendar-empty"><ShieldCheck size={24} /><p>Aucune décision d’effectif configurée.</p></div>}
  </section>;
}

export function PlanningP11Panel({ client, overview, range, canManageRotations, canManageTemplates, canManageManning, onClose, onOperationalChange }: {
  client: SupabaseClient; overview: PlanningOverview; range: PlanningDateRange;
  canManageRotations: boolean; canManageTemplates: boolean; canManageManning: boolean;
  onClose: () => void; onOperationalChange: (kind: OperationalChange) => Promise<void>;
}) {
  const [tab, setTab] = useState<P11Tab>('rotations');
  const [data, setData] = useState<PlanningP11Data>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedbackState] = useState<{ message: string; level: 'success' | 'warning' | 'error' } | null>(null);
  const reload = useCallback(async () => { setData(await fetchPlanningP11Data(client)); }, [client]);
  const load = useCallback(async () => { try { await reload(); } catch (error) { setFeedbackState({ message: planningErrorMessage(error, 'Impossible de charger la planification structurée.'), level: 'error' }); } }, [reload]);
  useEffect(() => {
    let active = true;
    void fetchPlanningP11Data(client)
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setFeedbackState({ message: planningErrorMessage(error, 'Impossible de charger la planification structurée.'), level: 'error' }); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client]);
  const setFeedback = (message: string, level: boolean | 'warning' = false) => setFeedbackState({ message, level: level === true ? 'error' : level === 'warning' ? 'warning' : 'success' });
  const feedbackClassName = feedback?.level === 'error' ? 'form-error' : feedback?.level === 'warning' ? 'planning-warning' : 'admin-success';
  return <div className="planning-dialog-backdrop is-side-panel" role="presentation"><section aria-label="Rotations, modèles et décision d’effectif" aria-modal="true" className="planning-dialog is-side-panel planning-p11-panel" role="dialog"><header><div><Anchor aria-hidden="true" size={20} /><span><small>Planification structurée · P1.1</small><h2>Rotations et armement</h2></span></div><div><button aria-label="Actualiser la planification structurée" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw size={17} /></button><button aria-label="Fermer" onClick={onClose} type="button"><X size={18} /></button></div></header><nav aria-label="Sections P1.1" className="planning-p11-tabs"><button aria-selected={tab === 'rotations'} className={tab === 'rotations' ? 'is-active' : ''} onClick={() => setTab('rotations')} role="tab" type="button">Rotations</button><button aria-selected={tab === 'templates'} className={tab === 'templates' ? 'is-active' : ''} onClick={() => setTab('templates')} role="tab" type="button">Modèles</button><button aria-selected={tab === 'manning'} className={tab === 'manning' ? 'is-active' : ''} onClick={() => setTab('manning')} role="tab" type="button">Décision d’effectif</button></nav>{feedback ? <p className={`${feedbackClassName} planning-p11-feedback`} role={feedback.level === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}<div className="planning-p11-body">{isLoading ? <div className="admin-state" role="status">Chargement des rotations, modèles et décisions d’effectif…</div> : tab === 'rotations' ? <RotationTab client={client} data={data} editable={canManageRotations} onOperationalChange={onOperationalChange} onReload={reload} overview={overview} setFeedback={setFeedback} /> : tab === 'templates' ? <TemplateTab client={client} data={data} editable={canManageTemplates} onOperationalChange={onOperationalChange} onReload={reload} overview={overview} setFeedback={setFeedback} /> : <ManningTab client={client} data={data} editable={canManageManning} onReload={reload} overview={overview} range={range} setFeedback={setFeedback} />}</div></section></div>;
}
