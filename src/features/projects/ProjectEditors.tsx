import { CalendarDays, CreditCard, ExternalLink, FileText, FileUp, FolderOpen, Plus, ReceiptText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_PROJECT_WRITE_INPUT,
  saveProjectContractDetails,
  saveProjectContractHirePeriods,
  saveProjectPlanningOccurrence,
  saveClient,
  saveProject,
  saveProjectTowedAsset,
  type ClientWriteInput,
  type ProjectContractHirePeriodWriteInput,
  type ProjectMutationResult,
  type ProjectPlanningOccurrenceWriteInput,
  type ProjectTowedAssetWriteInput,
  type ProjectWriteInput,
} from './projectMutations';
import { storeOperationDocuments, type OperationDocumentUploadResult } from './projectDocumentStorage';
import type {
  ClientRecord,
  ProjectContractRecord,
  ProjectOperationDocumentRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
  ProjectTowedAssetRecord,
  VesselRecord,
} from './projectQueries';
import { SUPPLYTIME_GROUPS } from './projectReadModel';
import { formatProjectPort, PROJECT_PORT_GROUPS } from './projectPorts';
import { normalizeProjectStatus, PROJECT_STATUSES } from './projectStatus';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import {
  DEFAULT_PROJECT_OWNER_IDENTITY,
  PROJECT_CURRENCIES,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';

interface ProjectEditorProps {
  client: SupabaseClient;
  clients: ClientRecord[];
  contract?: ProjectContractRecord;
  contractTypes: string[];
  initialOperation?: {
    endsOn: string;
    startsOn: string;
    vesselIds: number[];
  };
  onClose: () => void;
  onSaved: (result: ProjectMutationResult) => void;
  project?: ProjectRecord;
  statuses: string[];
  towedAssets: ProjectTowedAssetRecord[];
  vessels: VesselRecord[];
}

interface ClientEditorProps {
  client: SupabaseClient;
  clientRecord?: ClientRecord;
  onClose: () => void;
  onSaved: (clientId: number, savedClient: ClientWriteInput) => void;
}

export interface ProjectPlanningEditorProject {
  charterEndsAt?: string;
  charterStartsAt?: string;
  deliveryAt?: string;
  description?: string;
  endsOn?: string;
  id: number;
  primaryVesselId?: number | null;
  projectCode: string;
  redeliveryAt?: string;
  secondaryVesselId?: number | null;
  startsOn?: string;
  title: string;
}

interface ProjectPlanningEditorProps {
  canViewCharterHire?: boolean;
  client: SupabaseClient;
  contract?: ProjectContractRecord;
  initialEndsOn?: string;
  initialStartsOn?: string;
  initialVesselIds?: number[];
  onClose: () => void;
  onSaved: (occurrenceId: number, uploads: OperationDocumentUploadResult) => void;
  occurrence?: ProjectPlanningOccurrenceRecord;
  operationDocuments?: ProjectOperationDocumentRecord[];
  project: ProjectPlanningEditorProject;
  vessels: VesselRecord[];
}

function toLocalDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function projectToWriteInput(
  project?: ProjectRecord,
  contract?: ProjectContractRecord,
): ProjectWriteInput {
  if (!project) return { ...EMPTY_PROJECT_WRITE_INPUT, supplytimeData: {} };
  return {
    ...EMPTY_PROJECT_WRITE_INPUT,
    projectId: project.id,
    title: project.title,
    clientId: project.clientId,
    primaryVesselId: project.primaryVesselId,
    secondaryVesselId: project.secondaryVesselId,
    status: normalizeProjectStatus(project.status),
    description: project.description,
    startsOn: project.startsOn,
    endsOn: project.endsOn,
    deliveryAt: toLocalDateTime(project.deliveryAt),
    redeliveryAt: toLocalDateTime(project.redeliveryAt),
    charterStartsAt: toLocalDateTime(project.charterStartsAt),
    charterEndsAt: toLocalDateTime(project.charterEndsAt),
    deliveryPort: project.deliveryPort,
    redeliveryPort: project.redeliveryPort,
    contractType: project.contractType,
    operationArea: project.operationArea,
    isRovSupport: project.isRovSupport,
    isDivingSupport: project.isDivingSupport,
    ownerIdentity: contract?.ownerIdentity || DEFAULT_PROJECT_OWNER_IDENTITY,
    vesselAssignmentLimit: contract?.vesselAssignmentLimit || '',
    extensionCount: contract?.extensionCount ?? null,
    extensionDuration: contract?.extensionDuration ?? null,
    extensionUnit: contract?.extensionUnit || '',
    autoExtensionPeriod: contract?.autoExtensionPeriod || 'Voyage',
    maxExtensionDays: contract?.maxExtensionDays ?? null,
    mobilisationFee: contract?.mobilisationFee ?? null,
    demobilisationFee: contract?.demobilisationFee ?? null,
    feeCurrency: contract?.feeCurrency || 'EUR',
    charterHire: contract?.charterHire ?? null,
    extensionHire: contract?.extensionHire ?? null,
    hireCurrency: contract?.hireCurrency || '',
    hireUnit: contract?.hireUnit || '',
    maxAuditPeriod: contract?.maxAuditPeriod || '',
    supplytimeData: { ...(contract?.supplytimeData || {}) },
    expectedUpdatedAt: project.updatedAt,
  };
}

function projectContractHirePeriodsToWriteInput(
  project?: ProjectRecord,
  contract?: ProjectContractRecord,
): ProjectContractHirePeriodWriteInput[] {
  if (contract?.hirePeriods?.length) {
    return contract.hirePeriods.map((period) => ({
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      charterHire: period.charterHire,
      hireCurrency: period.hireCurrency,
      hireUnit: period.hireUnit,
    }));
  }
  if (contract?.charterHire !== null && contract?.charterHire !== undefined) {
    return [{
      startsOn: project?.startsOn || new Date().toISOString().slice(0, 10),
      endsOn: '',
      charterHire: contract.charterHire,
      hireCurrency: contract.hireCurrency || 'EUR',
      hireUnit: contract.hireUnit || 'jour',
    }];
  }
  return [];
}

function projectCoreSnapshot(input: ProjectWriteInput): string {
  return JSON.stringify({
    projectId: input.projectId,
    title: input.title,
    clientId: input.clientId,
    primaryVesselId: input.primaryVesselId,
    secondaryVesselId: input.secondaryVesselId,
    status: input.status,
    description: input.description,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    deliveryAt: input.deliveryAt,
    redeliveryAt: input.redeliveryAt,
    charterStartsAt: input.charterStartsAt,
    charterEndsAt: input.charterEndsAt,
    deliveryPort: input.deliveryPort,
    redeliveryPort: input.redeliveryPort,
    contractType: input.contractType,
    operationArea: input.operationArea,
    isRovSupport: input.isRovSupport,
    isDivingSupport: input.isDivingSupport,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
}

function projectContractSnapshot(input: ProjectWriteInput): string {
  return JSON.stringify({
    ownerIdentity: input.ownerIdentity,
    vesselAssignmentLimit: input.vesselAssignmentLimit,
    extensionCount: input.extensionCount,
    extensionDuration: input.extensionDuration,
    extensionUnit: input.extensionUnit,
    autoExtensionPeriod: input.autoExtensionPeriod,
    maxExtensionDays: input.maxExtensionDays,
    mobilisationFee: input.mobilisationFee,
    demobilisationFee: input.demobilisationFee,
    feeCurrency: input.feeCurrency,
    extensionHire: input.extensionHire,
    maxAuditPeriod: input.maxAuditPeriod,
    supplytimeData: input.supplytimeData,
  });
}

const EMPTY_TOWED_ASSET: ProjectTowedAssetWriteInput = {
  id: null,
  name: '',
  assetType: '',
  lengthOverallM: null,
  breadthOverallM: null,
  maxDraftM: null,
  lightDisplacementT: null,
  flag: '',
  classificationSociety: '',
  registrationNumber: '',
  ownerName: '',
  hullMachineryInsurer: '',
  liabilityInsurer: '',
};

function towedAssetToWriteInput(asset?: ProjectTowedAssetRecord): ProjectTowedAssetWriteInput | null {
  if (!asset) return null;
  return {
    id: asset.id,
    name: asset.name,
    assetType: asset.assetType,
    lengthOverallM: asset.lengthOverallM,
    breadthOverallM: asset.breadthOverallM,
    maxDraftM: asset.maxDraftM,
    lightDisplacementT: asset.lightDisplacementT,
    flag: asset.flag,
    classificationSociety: asset.classificationSociety,
    registrationNumber: asset.registrationNumber,
    ownerName: asset.ownerName,
    hullMachineryInsurer: asset.hullMachineryInsurer,
    liabilityInsurer: asset.liabilityInsurer,
  };
}

function towedAssetSnapshot(asset: ProjectTowedAssetWriteInput | null): string {
  return JSON.stringify(asset);
}

function hirePeriodsSnapshot(periods: ProjectContractHirePeriodWriteInput[]): string {
  return JSON.stringify(periods);
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'is-wide' : undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

type ProjectAssistantStep = 'identification' | 'planning' | 'offer' | 'billing' | 'documents';

const PROJECT_ASSISTANT_STEPS: {
  description: string;
  icon: typeof FolderOpen;
  id: ProjectAssistantStep;
  label: string;
}[] = [
  { description: 'Nom du projet, navire et client', icon: FolderOpen, id: 'identification', label: 'Identification' },
  { description: 'Prise en charge et arrivée', icon: CalendarDays, id: 'planning', label: 'Planning' },
  { description: 'Tarifs et conditions', icon: ReceiptText, id: 'offer', label: 'Offre commerciale' },
  { description: 'Frais et paiement', icon: CreditCard, id: 'billing', label: 'Facturation' },
  { description: 'Contrats et procédures', icon: FileText, id: 'documents', label: 'Documents' },
];

function PortSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const knownValue = PROJECT_PORT_GROUPS.some((group) => group.ports.some((port) => port.port === value));

  return (
    <Field label={label}>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Non renseigné</option>
        {value && !knownValue ? <option value={value}>{value} (valeur actuelle)</option> : null}
        {PROJECT_PORT_GROUPS.map((group) => (
          <optgroup key={group.department} label={group.department}>
            {group.ports.map((port) => (
              <option key={port.locode} value={port.port}>{formatProjectPort(port)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function ProjectEditor({
  client,
  clients,
  contract,
  contractTypes,
  initialOperation,
  onClose,
  onSaved,
  project,
  towedAssets,
  vessels,
}: ProjectEditorProps) {
  const initialForm = projectToWriteInput(project, contract);
  const initialHirePeriods = projectContractHirePeriodsToWriteInput(project, contract);
  const initialTowedAsset = towedAssetToWriteInput(
    towedAssets.find((asset) => asset.id === contract?.towedAssetId),
  );
  const [form, setForm] = useState(() => initialForm);
  const [hirePeriods, setHirePeriods] = useState<ProjectContractHirePeriodWriteInput[]>(() => initialHirePeriods);
  const [towedAsset, setTowedAsset] = useState<ProjectTowedAssetWriteInput | null>(() => initialTowedAsset);
  const [activeStep, setActiveStep] = useState<ProjectAssistantStep>('identification');
  const [availableClients, setAvailableClients] = useState<
    Pick<ClientRecord, 'active' | 'id' | 'name'>[]
  >(() => clients);
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [initialOperationFiles, setInitialOperationFiles] = useState<File[]>([]);
  const [initialOperationForm, setInitialOperationForm] = useState<ProjectPlanningOccurrenceWriteInput | null>(() => (
    initialOperation ? {
      charterHire: null,
      charterHireOverride: false,
      description: '',
      endsOn: initialOperation.endsOn,
      hireCurrency: '',
      hireUnit: '',
      occurrenceId: null,
      projectId: 0,
      startsOn: initialOperation.startsOn,
      status: 'Non validé',
      vesselIds: initialOperation.vesselIds,
    } : null
  ));
  const [nextProjectCode, setNextProjectCode] = useState(project?.projectCode || 'P…');
  const eligibleVessels = vessels.filter(
    (vessel) => vessel.active || vessel.id === project?.primaryVesselId || vessel.id === project?.secondaryVesselId,
  );

  useEffect(() => {
    if (project?.projectCode) {
      setNextProjectCode(project.projectCode);
      return;
    }
    let active = true;
    client.rpc('projects_peek_next_code', { target_prefix: 'P' }).then(({ data }) => {
      if (active && typeof data === 'string' && data) setNextProjectCode(data);
    });
    return () => {
      active = false;
    };
  }, [client, project?.projectCode]);

  useEffect(() => {
    setAvailableClients((current) => {
      const localClients = current.filter((item) => !clients.some((clientRecord) => clientRecord.id === item.id));
      return [...clients, ...localClients];
    });
  }, [clients]);

  function update<K extends keyof ProjectWriteInput>(key: K, value: ProjectWriteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTowedAsset<K extends keyof ProjectTowedAssetWriteInput>(
    key: K,
    value: ProjectTowedAssetWriteInput[K],
  ) {
    setTowedAsset((current) => ({ ...(current || EMPTY_TOWED_ASSET), [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    let savedProject: ProjectMutationResult | null = null;
    try {
      const firstHirePeriod = [...hirePeriods].sort((left, right) => left.startsOn.localeCompare(right.startsOn))[0];
      const projectCoreChanged = !project
        || projectCoreSnapshot(form) !== projectCoreSnapshot(initialForm);
      const projectContractChanged = !project
        || !contract
        || projectContractSnapshot(form) !== projectContractSnapshot(initialForm);
      const hirePeriodsChanged = !project
        || hirePeriodsSnapshot(hirePeriods) !== hirePeriodsSnapshot(initialHirePeriods);
      const formWithEffectiveHire = firstHirePeriod ? {
        ...form,
        charterHire: firstHirePeriod.charterHire,
        hireCurrency: firstHirePeriod.hireCurrency,
        hireUnit: firstHirePeriod.hireUnit,
      } : form;
      const result = projectCoreChanged
        ? await saveProject(client, firstHirePeriod ? {
          ...form,
          charterHire: firstHirePeriod.charterHire,
          hireCurrency: firstHirePeriod.hireCurrency,
          hireUnit: firstHirePeriod.hireUnit,
        } : form)
        : {
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          updatedAt: project.updatedAt,
        };
      if (projectCoreChanged) savedProject = result;

      let effectiveTowedAssetId: number | null = null;
      if (form.contractType === TOWAGE_CONTRACT_TYPE) {
        if (!towedAsset?.name.trim()) {
          throw new Error('Sélectionnez un remorqué ou ajoutez-en un nouveau.');
        }
        const towedAssetChanged = towedAssetSnapshot(towedAsset) !== towedAssetSnapshot(initialTowedAsset);
        effectiveTowedAssetId = towedAssetChanged || towedAsset.id === null
          ? await saveProjectTowedAsset(client, towedAsset)
          : towedAsset.id;
        if (effectiveTowedAssetId !== towedAsset.id) {
          setTowedAsset((current) => current ? { ...current, id: effectiveTowedAssetId } : current);
        }
      }

      const towedAssetLinkChanged = effectiveTowedAssetId !== (contract?.towedAssetId ?? null);
      if ((!projectCoreChanged && projectContractChanged) || towedAssetLinkChanged) {
        await saveProjectContractDetails(client, result.id, formWithEffectiveHire, effectiveTowedAssetId);
      }
      if (hirePeriodsChanged) await saveProjectContractHirePeriods(client, result.id, hirePeriods);
      if (initialOperationForm) {
        const occurrenceId = await saveProjectPlanningOccurrence(client, {
          ...initialOperationForm,
          projectId: result.id,
        });
        setInitialOperationForm((current) => current ? {
          ...current,
          occurrenceId,
          projectId: result.id,
        } : null);
        if (initialOperationFiles.length > 0) {
          const uploads = await storeOperationDocuments(client, {
            files: initialOperationFiles,
            planningOccurrenceId: occurrenceId,
            projectId: result.id,
          });
          if (uploads.failed.length > 0) {
            throw new Error(`${uploads.failed.length} document(s) n’ont pas pu être classés dans SharePoint.`);
          }
        }
      }
      onSaved(result);
    } catch (error) {
      if (savedProject && form.projectId === null) {
        setForm((current) => ({
          ...current,
          expectedUpdatedAt: savedProject?.updatedAt || current.expectedUpdatedAt,
          projectId: savedProject?.id || current.projectId,
        }));
        setNextProjectCode(savedProject.projectCode);
      }
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’enregistrer le projet.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleClientSaved(clientId: number, savedClient: ClientWriteInput) {
    setAvailableClients((current) => [
      ...current.filter((item) => item.id !== clientId),
      { active: savedClient.active, id: clientId, name: savedClient.name.trim() },
    ]);
    update('clientId', clientId);
    setClientEditorOpen(false);
  }

  return (
    <div className="project-editor-backdrop">
      <section aria-label={project ? 'Modifier le projet' : 'Créer un projet'} aria-modal="true" className="project-editor is-project-assistant" role="dialog">
        <header>
          <div>
            <span>{project ? 'MODIFICATION' : 'CRÉATION'}</span>
            <h2 id="project-editor-title">{project ? 'Projet' : 'Offre'}</h2>
          </div>
          <button aria-label="Fermer le formulaire projet" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="project-assistant-layout">
            <aside aria-label="Étapes de création du projet">
              <span>ASSISTANT</span>
              <strong>Projet</strong>
              {PROJECT_ASSISTANT_STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = activeStep === step.id;
                return (
                  <button
                    aria-controls={`project-step-${step.id}`}
                    aria-current={isActive ? 'step' : undefined}
                    className={isActive ? 'is-active' : undefined}
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
                    type="button"
                  >
                    <b>{index + 1}</b>
                    <Icon aria-hidden="true" size={20} />
                    <span>{step.label}<small>{step.description}</small></span>
                  </button>
                );
              })}
            </aside>
            <main>
          <fieldset hidden={activeStep !== 'identification'} id="project-step-identification">
            <legend><span>1</span> Identification <small>8 champs</small></legend>
            <p className="project-code-preview">Nom final : <strong>{nextProjectCode} - {form.title || '…'}</strong><small>Le numéro affiché est un aperçu ; Supabase l’attribue atomiquement à l’enregistrement.</small></p>
            <div className="project-editor-grid">
              <Field label="Code projet"><input disabled value={nextProjectCode} /></Field>
              <Field label="Nom du projet *" wide>
                <input autoFocus onChange={(event) => update('title', event.target.value)} required value={form.title} />
              </Field>
              <div className="project-editor-client-field">
                <div className="project-editor-field-label">
                  <span>Client / affréteur</span>
                  <button aria-label="Ajouter un client ou affréteur" onClick={() => setClientEditorOpen(true)} type="button">
                    <Plus aria-hidden="true" size={15} />
                    Ajouter
                  </button>
                </div>
                <select aria-label="Client / affréteur" onChange={(event) => update('clientId', optionalNumber(event.target.value))} value={form.clientId ?? ''}>
                  <option value="">Non renseigné</option>
                  {availableClients.filter((item) => item.active || item.id === project?.clientId).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <Field label="Statut">
                <select onChange={(event) => update('status', event.target.value)} value={form.status}>
                  {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Description" wide>
                <textarea onChange={(event) => update('description', event.target.value)} value={form.description} />
              </Field>
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'planning'} id="project-step-planning">
            <legend><span>2</span> Planning</legend>
            <div className="project-editor-grid">
              {initialOperationForm ? (
                <section className="project-initial-operation is-wide" aria-label="Première opération">
                  <div className="project-initial-operation-heading">
                    <strong>Première opération</strong>
                    <small>Cette opération sera créée et rattachée au nouveau Projet/Contrat.</small>
                  </div>
                  <div className="project-editor-grid">
                    <Field label="Début de l’opération *">
                      <input
                        onChange={(event) => setInitialOperationForm((current) => current ? { ...current, startsOn: event.target.value } : null)}
                        required
                        type="date"
                        value={initialOperationForm.startsOn}
                      />
                    </Field>
                    <Field label="Fin de l’opération *">
                      <input
                        onChange={(event) => setInitialOperationForm((current) => current ? { ...current, endsOn: event.target.value } : null)}
                        required
                        type="date"
                        value={initialOperationForm.endsOn}
                      />
                    </Field>
                    <Field label="Navires de l’opération *" wide>
                      <select
                        aria-label="Navires de la première opération"
                        multiple
                        onChange={(event) => setInitialOperationForm((current) => current ? {
                          ...current,
                          vesselIds: Array.from(event.target.selectedOptions, (option) => Number(option.value)),
                        } : null)}
                        required
                        size={Math.min(5, Math.max(2, eligibleVessels.length))}
                        value={initialOperationForm.vesselIds.map(String)}
                      >
                        {eligibleVessels.map((vessel) => (
                          <option key={vessel.id} value={vessel.id}>{vessel.name}{vessel.acronym ? ` (${vessel.acronym})` : ''}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Statut Planning">
                      <select
                        onChange={(event) => setInitialOperationForm((current) => current ? { ...current, status: event.target.value } : null)}
                        value={initialOperationForm.status}
                      >
                        {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                    <Field label="Description / mission" wide>
                      <textarea
                        onChange={(event) => setInitialOperationForm((current) => current ? { ...current, description: event.target.value } : null)}
                        value={initialOperationForm.description}
                      />
                    </Field>
                    <label className="project-operation-files is-wide">
                      <span>Documents de l’opération</span>
                      <span className="project-operation-file-picker">
                        <FileUp aria-hidden="true" size={18} />
                        <input multiple onChange={(event) => setInitialOperationFiles(Array.from(event.target.files || []))} type="file" />
                        <strong>{initialOperationFiles.length > 0 ? `${initialOperationFiles.length} fichier(s) sélectionné(s)` : 'Ajouter un ou plusieurs documents'}</strong>
                      </span>
                    </label>
                  </div>
                </section>
              ) : null}
              <Field label="Début du projet"><input onChange={(event) => update('startsOn', event.target.value)} type="date" value={form.startsOn} /></Field>
              <Field label="Fin du projet"><input onChange={(event) => update('endsOn', event.target.value)} type="date" value={form.endsOn} /></Field>
              <Field label="Livraison"><input onChange={(event) => update('deliveryAt', event.target.value)} type="datetime-local" value={form.deliveryAt} /></Field>
              <Field label="Restitution"><input onChange={(event) => update('redeliveryAt', event.target.value)} type="datetime-local" value={form.redeliveryAt} /></Field>
              <Field label="Début d’affrètement"><input onChange={(event) => update('charterStartsAt', event.target.value)} type="datetime-local" value={form.charterStartsAt} /></Field>
              <Field label="Fin d’affrètement"><input onChange={(event) => update('charterEndsAt', event.target.value)} type="datetime-local" value={form.charterEndsAt} /></Field>
              <PortSelect label="Port de livraison" onChange={(value) => update('deliveryPort', value)} value={form.deliveryPort} />
              <PortSelect label="Port de restitution" onChange={(value) => update('redeliveryPort', value)} value={form.redeliveryPort} />
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'offer'} id="project-step-offer">
            <legend><span>3</span> Offre commerciale</legend>
            <div className="project-editor-grid">
              <Field label="Type de contrat">
                <input list="project-contract-values" onChange={(event) => update('contractType', event.target.value)} value={form.contractType} />
                <datalist id="project-contract-values">{contractTypes.map((value) => <option key={value} value={value} />)}</datalist>
              </Field>
              <label className="project-owner-identity">
                <span>Identité armateur</span>
                <textarea onChange={(event) => update('ownerIdentity', event.target.value)} rows={3} value={form.ownerIdentity} />
                <span aria-label="Aperçu de l’identité armateur" className="project-owner-identity-preview">
                  {form.ownerIdentity.split('\n').map((line, index) => (
                    index === 0
                      ? <strong key={`${line}-${index}`}>{line || 'BBTM'}</strong>
                      : <span key={`${line}-${index}`}>{line}</span>
                  ))}
                </span>
              </label>
              {form.contractType === TOWAGE_CONTRACT_TYPE ? (
                <section aria-label="Remorqué" className="project-towed-asset is-wide">
                  <div className="project-towed-asset-heading">
                    <div>
                      <strong>Remorqué</strong>
                      <small>Sélectionnez un engin déjà remorqué ou créez une nouvelle fiche.</small>
                    </div>
                    <button onClick={() => setTowedAsset({ ...EMPTY_TOWED_ASSET })} type="button">
                      <Plus aria-hidden="true" size={17} /> Ajouter un remorqué
                    </button>
                  </div>
                  <label>
                    <span>Nom du remorqué</span>
                    <select
                      onChange={(event) => {
                        const selected = towedAssets.find((asset) => asset.id === Number(event.target.value));
                        setTowedAsset(towedAssetToWriteInput(selected));
                      }}
                      value={towedAsset?.id ?? ''}
                    >
                      <option value="">{towedAsset?.id === null ? 'Nouveau remorqué' : 'Sélectionner…'}</option>
                      {towedAssets.filter((asset) => asset.active || asset.id === contract?.towedAssetId).map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                      ))}
                    </select>
                  </label>
                  {towedAsset ? (
                    <div className="project-towed-asset-grid">
                      <Field label="Nom"><input onChange={(event) => updateTowedAsset('name', event.target.value)} value={towedAsset.name} /></Field>
                      <Field label="Type d’engin, de navire ou de colis"><input onChange={(event) => updateTowedAsset('assetType', event.target.value)} value={towedAsset.assetType} /></Field>
                      <Field label="Longueur hors tout (m)"><input min="0" onChange={(event) => updateTowedAsset('lengthOverallM', optionalNumber(event.target.value))} step="0.01" type="number" value={towedAsset.lengthOverallM ?? ''} /></Field>
                      <Field label="Largeur hors tout (m)"><input min="0" onChange={(event) => updateTowedAsset('breadthOverallM', optionalNumber(event.target.value))} step="0.01" type="number" value={towedAsset.breadthOverallM ?? ''} /></Field>
                      <Field label="Tirant d’eau max (m)"><input min="0" onChange={(event) => updateTowedAsset('maxDraftM', optionalNumber(event.target.value))} step="0.01" type="number" value={towedAsset.maxDraftM ?? ''} /></Field>
                      <Field label="Déplacement lège (T)"><input min="0" onChange={(event) => updateTowedAsset('lightDisplacementT', optionalNumber(event.target.value))} step="0.01" type="number" value={towedAsset.lightDisplacementT ?? ''} /></Field>
                      <Field label="Pavillon"><input maxLength={2} onChange={(event) => updateTowedAsset('flag', event.target.value.toUpperCase())} placeholder="FR" value={towedAsset.flag} /></Field>
                      <Field label="Société de classification"><input onChange={(event) => updateTowedAsset('classificationSociety', event.target.value)} value={towedAsset.classificationSociety} /></Field>
                      <Field label="N° d’enregistrement"><input onChange={(event) => updateTowedAsset('registrationNumber', event.target.value)} value={towedAsset.registrationNumber} /></Field>
                      <Field label="Propriétaire (si différent de l’affréteur)"><input onChange={(event) => updateTowedAsset('ownerName', event.target.value)} value={towedAsset.ownerName} /></Field>
                      <Field label="Assureur corps et machine"><input onChange={(event) => updateTowedAsset('hullMachineryInsurer', event.target.value)} value={towedAsset.hullMachineryInsurer} /></Field>
                      <Field label="Assureur RC"><input onChange={(event) => updateTowedAsset('liabilityInsurer', event.target.value)} value={towedAsset.liabilityInsurer} /></Field>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <Field label="Frais de mobilisation"><input min="0" onChange={(event) => update('mobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.mobilisationFee ?? ''} /></Field>
              <Field label="Frais de démobilisation"><input min="0" onChange={(event) => update('demobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.demobilisationFee ?? ''} /></Field>
              <Field label="Devise des frais">
                <select onChange={(event) => update('feeCurrency', event.target.value)} value={form.feeCurrency || 'EUR'}>
                  {form.feeCurrency && !PROJECT_CURRENCIES.some((currency) => currency.code === form.feeCurrency)
                    ? <option value={form.feeCurrency}>{form.feeCurrency}</option>
                    : null}
                  {PROJECT_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
                </select>
              </Field>
              <Field label="Loyer en prolongation"><input min="0" onChange={(event) => update('extensionHire', optionalNumber(event.target.value))} step="0.01" type="number" value={form.extensionHire ?? ''} /></Field>
              <section className="project-hire-periods is-wide" aria-label="Barème des loyers d’affrètement">
                <div className="project-hire-periods-heading">
                  <div><strong>Barème des loyers d’affrètement</strong><small>Le tarif applicable est déterminé automatiquement pour chaque date d’opération.</small></div>
                  <button
                    onClick={() => setHirePeriods((periods) => [...periods, {
                      startsOn: periods.at(-1)?.endsOn ? nextDate(periods.at(-1)?.endsOn || '') : form.startsOn || new Date().toISOString().slice(0, 10),
                      endsOn: '',
                      charterHire: periods.at(-1)?.charterHire ?? null,
                      hireCurrency: periods.at(-1)?.hireCurrency || 'EUR',
                      hireUnit: periods.at(-1)?.hireUnit || 'jour',
                    }])}
                    type="button"
                  ><Plus aria-hidden="true" size={15} /> Ajouter une période</button>
                </div>
                {hirePeriods.map((period, index) => (
                  <div className="project-hire-period-row" key={index}>
                    <label>Début *<input onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, startsOn: event.target.value } : item))} required type="date" value={period.startsOn} /></label>
                    <label>Fin<input onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, endsOn: event.target.value } : item))} type="date" value={period.endsOn} /></label>
                    <label>Loyer *<input min="0" onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, charterHire: optionalNumber(event.target.value) } : item))} required step="0.01" type="number" value={period.charterHire ?? ''} /></label>
                    <label>Devise *<input maxLength={3} onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, hireCurrency: event.target.value.toUpperCase() } : item))} required value={period.hireCurrency} /></label>
                    <label>Unité *<input onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, hireUnit: event.target.value } : item))} required value={period.hireUnit} /></label>
                    <button aria-label={`Supprimer la période tarifaire ${index + 1}`} onClick={() => setHirePeriods((periods) => periods.filter((_, itemIndex) => itemIndex !== index))} type="button"><X aria-hidden="true" size={16} /></button>
                  </div>
                ))}
                {!hirePeriods.length ? <p>Aucune période tarifaire. Ajoutez-en une pour alimenter automatiquement les opérations.</p> : null}
              </section>
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'billing'} id="project-step-billing">
            <legend><span>4</span> Mission et facturation</legend>
            <div className="project-editor-grid">
              <Field label="Navire principal">
                <select onChange={(event) => update('primaryVesselId', optionalNumber(event.target.value))} value={form.primaryVesselId ?? ''}>
                  <option value="">Non renseigné</option>
                  {eligibleVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}{vessel.acronym ? ` (${vessel.acronym})` : ''}</option>)}
                </select>
              </Field>
              <Field label="Navire secondaire">
                <select onChange={(event) => update('secondaryVesselId', optionalNumber(event.target.value))} value={form.secondaryVesselId ?? ''}>
                  <option value="">Non renseigné</option>
                  {eligibleVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}{vessel.acronym ? ` (${vessel.acronym})` : ''}</option>)}
                </select>
              </Field>
              <Field label="Zone d’opération" wide><textarea onChange={(event) => update('operationArea', event.target.value)} value={form.operationArea} /></Field>
              <label className="project-editor-check"><input checked={form.isRovSupport} onChange={(event) => update('isRovSupport', event.target.checked)} type="checkbox" /> Support ROV</label>
              <label className="project-editor-check"><input checked={form.isDivingSupport} onChange={(event) => update('isDivingSupport', event.target.checked)} type="checkbox" /> Support plongée</label>
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'documents'} id="project-step-documents">
            <legend><span>5</span> Documents · BIMCO SUPPLYTIME</legend>
            <div className="project-editor-grid">
              <Field label="Limite d’affectation navire"><input onChange={(event) => update('vesselAssignmentLimit', event.target.value)} value={form.vesselAssignmentLimit} /></Field>
              <Field label="Nombre de prolongations"><input min="1" onChange={(event) => update('extensionCount', optionalNumber(event.target.value))} step="1" type="number" value={form.extensionCount ?? ''} /></Field>
              <Field label="Durée de prolongation"><input min="0.01" onChange={(event) => update('extensionDuration', optionalNumber(event.target.value))} step="0.01" type="number" value={form.extensionDuration ?? ''} /></Field>
              <Field label="Unité de prolongation"><input onChange={(event) => update('extensionUnit', event.target.value)} value={form.extensionUnit} /></Field>
              <Field label="Période de reconduction"><input onChange={(event) => update('autoExtensionPeriod', event.target.value)} value={form.autoExtensionPeriod} /></Field>
              <Field label="Maximum de jours"><input min="0" onChange={(event) => update('maxExtensionDays', optionalNumber(event.target.value))} step="1" type="number" value={form.maxExtensionDays ?? ''} /></Field>
              <Field label="Période maximale d’audit"><input onChange={(event) => update('maxAuditPeriod', event.target.value)} value={form.maxAuditPeriod} /></Field>
            </div>
            <div className="project-supplytime-editor">
              {SUPPLYTIME_GROUPS.map((group) => (
                <section key={group.id}>
                  <h3>{group.label}</h3>
                  {group.fields.map((field) => (
                    <Field key={field.key} label={field.label} wide>
                      <textarea
                        onChange={(event) => update('supplytimeData', { ...form.supplytimeData, [field.key]: event.target.value })}
                        value={form.supplytimeData[field.key] || ''}
                      />
                    </Field>
                  ))}
                </section>
              ))}
            </div>
          </fieldset>

            </main>
          </div>

          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <footer>
            <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer le projet'}</button>
          </footer>
        </form>
      </section>
      {clientEditorOpen ? (
        <ClientEditor
          client={client}
          onClose={() => setClientEditorOpen(false)}
          onSaved={handleClientSaved}
        />
      ) : null}
    </div>
  );
}

export function ClientEditor({ client, clientRecord, onClose, onSaved }: ClientEditorProps) {
  const [form, setForm] = useState<ClientWriteInput>({
    clientId: clientRecord?.id ?? null,
    name: clientRecord?.name || '',
    code: clientRecord?.code || '',
    email: clientRecord?.email || '',
    phone: clientRecord?.phone || '',
    address: clientRecord?.address || '',
    city: clientRecord?.city || '',
    country: clientRecord?.country || '',
    active: clientRecord?.active ?? true,
    expectedUpdatedAt: clientRecord?.updatedAt || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  function update<K extends keyof ClientWriteInput>(key: K, value: ClientWriteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    try {
      onSaved(await saveClient(client, form), form);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’enregistrer le client.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="project-editor-backdrop">
      <section aria-labelledby="client-editor-title" aria-modal="true" className="project-editor is-client" role="dialog">
        <header>
          <h2 id="client-editor-title">{clientRecord ? 'Modifier le client' : 'Créer un client'}</h2>
          <button aria-label="Fermer le formulaire client" disabled={isSaving} onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="project-editor-grid">
            <Field label="Nom du client *" wide><input autoFocus onChange={(event) => update('name', event.target.value)} required value={form.name} /></Field>
            <Field label="Code"><input onChange={(event) => update('code', event.target.value)} value={form.code} /></Field>
            <Field label="Courriel"><input onChange={(event) => update('email', event.target.value)} type="email" value={form.email} /></Field>
            <Field label="Téléphone"><input onChange={(event) => update('phone', event.target.value)} type="tel" value={form.phone} /></Field>
            <Field label="Adresse" wide><textarea onChange={(event) => update('address', event.target.value)} value={form.address} /></Field>
            <Field label="Ville"><input onChange={(event) => update('city', event.target.value)} value={form.city} /></Field>
            <Field label="Pays"><input onChange={(event) => update('country', event.target.value)} value={form.country} /></Field>
            <label className="project-editor-check"><input checked={form.active} onChange={(event) => update('active', event.target.checked)} type="checkbox" /> Client actif</label>
          </div>
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <footer>
            <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer dans Supabase'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function dateOnly(value?: string): string {
  return value ? value.slice(0, 10) : '';
}

export function ProjectPlanningEditor({
  canViewCharterHire = true,
  client,
  contract,
  initialEndsOn,
  initialStartsOn,
  initialVesselIds,
  onClose,
  onSaved,
  occurrence,
  operationDocuments = [],
  project,
  vessels,
}: ProjectPlanningEditorProps) {
  const defaultVesselIds = initialVesselIds?.length
    ? initialVesselIds
    : occurrence?.vesselIds?.length
      ? occurrence.vesselIds
      : [occurrence?.primaryVesselId ?? project.primaryVesselId].filter((id): id is number => Boolean(id));
  const operationStartsOn = dateOnly(initialStartsOn || occurrence?.startsOn || project.deliveryAt || project.charterStartsAt || project.startsOn);
  const defaultContractHire = contractHireAtDate(contract, operationStartsOn);
  const [form, setForm] = useState<ProjectPlanningOccurrenceWriteInput>({
    occurrenceId: occurrence?.id ?? null,
    projectId: project.id,
    startsOn: operationStartsOn,
    endsOn: dateOnly(initialEndsOn || occurrence?.endsOn || project.redeliveryAt || project.charterEndsAt || project.endsOn),
    vesselIds: defaultVesselIds.length > 0 ? defaultVesselIds : [0],
    status: normalizeProjectStatus(occurrence?.status),
    description: occurrence?.description || project.description || '',
    charterHire: canViewCharterHire ? occurrence?.charterHire ?? defaultContractHire?.charterHire ?? null : null,
    hireCurrency: canViewCharterHire ? occurrence?.hireCurrency || defaultContractHire?.hireCurrency || 'EUR' : '',
    hireUnit: canViewCharterHire ? occurrence?.hireUnit || defaultContractHire?.hireUnit || 'jour' : '',
    charterHireOverride: canViewCharterHire ? occurrence?.charterHireOverride ?? false : undefined,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const eligibleVessels = vessels.filter((vessel) => (
    vessel.active
    || defaultVesselIds.includes(vessel.id)
    || vessel.id === project.primaryVesselId
    || vessel.id === project.secondaryVesselId
  ));

  useEffect(() => {
    if (!canViewCharterHire || contract || !form.startsOn || form.charterHireOverride || typeof client.from !== 'function') return;
    let active = true;
    void client
      .from('project_contract_hire_periods')
      .select('charter_hire,hire_currency,hire_unit')
      .eq('project_id', project.id)
      .lte('starts_on', form.startsOn)
      .or(`ends_on.is.null,ends_on.gte.${form.startsOn}`)
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setForm((current) => current.charterHireOverride ? current : {
          ...current,
          charterHire: optionalNumber(String(data.charter_hire ?? '')),
          hireCurrency: String(data.hire_currency || 'EUR'),
          hireUnit: String(data.hire_unit || 'jour'),
        });
      });
    return () => { active = false; };
  }, [canViewCharterHire, client, contract, form.charterHireOverride, form.startsOn, project.id]);

  function updateVessel(index: number, vesselId: number) {
    update('vesselIds', form.vesselIds.map((currentId, currentIndex) => currentIndex === index ? vesselId : currentId));
  }

  function removeVessel(index: number) {
    update('vesselIds', form.vesselIds.filter((_, currentIndex) => currentIndex !== index));
  }

  function addVessel() {
    const nextVessel = eligibleVessels.find((vessel) => !form.vesselIds.includes(vessel.id));
    update('vesselIds', [...form.vesselIds, nextVessel?.id ?? 0]);
  }

  function update<K extends keyof ProjectPlanningOccurrenceWriteInput>(
    key: K,
    value: ProjectPlanningOccurrenceWriteInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateStartsOn(startsOn: string) {
    setForm((current) => {
      if (current.charterHireOverride) return { ...current, startsOn };
      const rate = contractHireAtDate(contract, startsOn);
      return {
        ...current,
        startsOn,
        charterHire: rate?.charterHire ?? null,
        hireCurrency: rate?.hireCurrency || 'EUR',
        hireUnit: rate?.hireUnit || 'jour',
      };
    });
  }

  function resetContractHire() {
    const rate = contractHireAtDate(contract, form.startsOn);
    setForm((current) => ({
      ...current,
      charterHireOverride: false,
      charterHire: rate?.charterHire ?? null,
      hireCurrency: rate?.hireCurrency || 'EUR',
      hireUnit: rate?.hireUnit || 'jour',
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    try {
      const occurrenceId = await saveProjectPlanningOccurrence(client, form);
      const uploads = files.length > 0
        ? await storeOperationDocuments(client, {
            files,
            planningOccurrenceId: occurrenceId,
            projectId: project.id,
          })
        : { failed: [], stored: [] };
      onSaved(occurrenceId, uploads);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'ajouter cette op\u00e9ration au planning.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppDialog
      eyebrow={project.projectCode || 'Projet catalogue'}
      footer={(
        <div className="app-dialog__actions">
          <button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button>
          <button disabled={isSaving} type="submit">
            {isSaving ? 'Enregistrement…' : occurrence ? 'Enregistrer les modifications' : 'Ajouter au planning'}
          </button>
        </div>
      )}
      icon={<CalendarDays aria-hidden="true" size={20} />}
      isBusy={isSaving}
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title={occurrence ? 'Modifier l’opération' : 'Nouvelle opération'}
    >
      <div className="project-editor is-planning is-shared-dialog">
          <div className="project-editor-grid">
            <Field label="Projet" wide><input disabled value={`${project.projectCode || ''} - ${project.title}`.replace(/^ - /, '')} /></Field>
            <Field label="Début *"><input autoFocus onChange={(event) => updateStartsOn(event.target.value)} required type="date" value={form.startsOn} /></Field>
            <Field label="Fin *"><input onChange={(event) => update('endsOn', event.target.value)} required type="date" value={form.endsOn} /></Field>
            <div className="project-operation-vessels is-wide">
              <span>Navires *</span>
              {form.vesselIds.map((vesselId, index) => (
                <div className="project-operation-vessel-row" key={`${index}-${vesselId}`}>
                  <select
                    aria-label={`Navire ${index + 1}`}
                    onChange={(event) => updateVessel(index, Number(event.target.value))}
                    required
                    value={vesselId || ''}
                  >
                    <option value="">Choisir un navire</option>
                    {eligibleVessels.map((vessel) => (
                      <option
                        disabled={form.vesselIds.some((selectedId, selectedIndex) => selectedIndex !== index && selectedId === vessel.id)}
                        key={vessel.id}
                        value={vessel.id}
                      >
                        {vessel.name}{vessel.acronym ? ` (${vessel.acronym})` : ''}
                      </option>
                    ))}
                  </select>
                  {form.vesselIds.length > 1 ? (
                    <button aria-label={`Retirer le navire ${index + 1}`} onClick={() => removeVessel(index)} type="button">
                      <X aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                </div>
              ))}
              <button className="project-operation-add-vessel" onClick={addVessel} type="button">
                <Plus aria-hidden="true" size={15} /> Ajouter un navire
              </button>
            </div>
            <Field label="Statut"><select onChange={(event) => update('status', event.target.value)} value={form.status}>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field label="Description / mission" wide><textarea onChange={(event) => update('description', event.target.value)} value={form.description} /></Field>
            {canViewCharterHire ? (
              <>
                <Field label="Loyer d’affrètement">
                  <input min="0" onChange={(event) => setForm((current) => ({ ...current, charterHire: optionalNumber(event.target.value), charterHireOverride: true }))} step="0.01" type="number" value={form.charterHire ?? ''} />
                </Field>
                <Field label="Devise">
                  <input maxLength={3} onChange={(event) => setForm((current) => ({ ...current, hireCurrency: event.target.value.toUpperCase(), charterHireOverride: true }))} value={form.hireCurrency} />
                </Field>
                <Field label="Unité">
                  <input onChange={(event) => setForm((current) => ({ ...current, hireUnit: event.target.value, charterHireOverride: true }))} placeholder="jour" value={form.hireUnit} />
                </Field>
                <div className="project-operation-hire-source is-wide">
                  <span>{form.charterHireOverride ? 'Tarif personnalisé pour cette opération' : 'Tarif contractuel applicable à la date de début'}</span>
                  {form.charterHireOverride ? <button onClick={resetContractHire} type="button">Revenir au tarif contractuel</button> : null}
                </div>
              </>
            ) : null}
            <label className="project-operation-files is-wide">
              <span>Documents de l’opération</span>
              <span className="project-operation-file-picker">
                <FileUp aria-hidden="true" size={18} />
                <input
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files || []))}
                  type="file"
                />
                <strong>{files.length > 0 ? `${files.length} fichier(s) sélectionné(s)` : 'Ajouter un ou plusieurs documents'}</strong>
              </span>
            </label>
          </div>
          {operationDocuments.length > 0 ? (
            <ul className="project-operation-existing-documents" aria-label="Documents déjà rattachés à l’opération">
              {operationDocuments.map((document) => (
                <li key={document.id}>
                  <FileText aria-hidden="true" size={16} />
                  <a href={document.sharePointWebUrl} rel="noreferrer" target="_blank">
                    {document.fileName}<ExternalLink aria-hidden="true" size={13} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="project-editor-note">
            {canViewCharterHire ? 'Le barème contractuel suit automatiquement la date de début, sauf lorsqu’un tarif personnalisé est activé. ' : ''}
            Les documents sont classés dans SharePoint · Documents Projets.
          </p>
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      </div>
    </AppDialog>
  );
}

function contractHireAtDate(contract: ProjectContractRecord | undefined, date: string) {
  const period = [...(contract?.hirePeriods || [])]
    .filter((candidate) => candidate.startsOn <= date && (!candidate.endsOn || candidate.endsOn >= date))
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn))[0];
  return period || (contract ? {
    charterHire: contract.charterHire,
    hireCurrency: contract.hireCurrency,
    hireUnit: contract.hireUnit,
  } : undefined);
}

function nextDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
