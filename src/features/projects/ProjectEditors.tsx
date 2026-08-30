import { CalendarDays, CreditCard, FileText, FileUp, FolderOpen, Plus, ReceiptText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import {
  storeOperationDocuments,
  storeProjectAttachments,
  type OperationDocumentUploadResult,
  type ProjectAttachmentDraft,
} from './projectDocumentStorage';
import type {
  ClientRecord,
  ProjectContractRecord,
  ProjectOperationDocumentRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
  ProjectTowedAssetRecord,
  VesselRecord,
} from './projectQueries';
import { ProjectPortCombobox } from './ProjectPortCombobox';
import { ProjectContractPreview } from './ProjectContractPreview';
import { ProjectStoredDocumentLink } from './ProjectStoredDocumentLink';
import { ClientLocationFields } from './ClientLocationFields';
import { resolveClientCountry } from './clientLocation';
import { normalizeProjectStatus, PROJECT_STATUSES } from './projectStatus';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import {
  cloneDefaultProjectDocumentCategories,
  fetchProjectDocumentCategories,
  newProjectDocumentCategoryKey,
  projectDocumentCategorySnapshot,
  saveProjectDocumentCategories,
  type ProjectDocumentCategory,
} from './projectDocumentCategories';
import {
  COMMERCIAL_OFFER_CONTRACT_TYPE,
  BIMCO_CONTRACT_TYPE,
  DEFAULT_PROJECT_FUEL_TERMS,
  DEFAULT_PROJECT_OWNER_IDENTITY,
  normalizeProjectContractType,
  PROJECT_CONTRACT_TYPES,
  PROJECT_CURRENCIES,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';
import { BIMCO_P144_GROUPS } from './projectContractModels';
import {
  COMMERCIAL_RESERVE_AVAILABILITY,
  COMMERCIAL_RESERVE_AVAILABILITY_KEY,
  COMMERCIAL_RESERVE_OTHER_KEY,
  COMMERCIAL_RESERVE_WEATHER,
  COMMERCIAL_RESERVE_WEATHER_KEY,
  fetchProjectDocumentEmitter,
  type ProjectDocumentEmitter,
} from './projectCommercialOffer';

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
  projectAttachments?: ProjectOperationDocumentRecord[];
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

function projectDateTime(value: string, time: string): string {
  return value ? `${value}T${time}` : '';
}

function projectStartDateFields(value: string) {
  return {
    startsOn: value,
    deliveryAt: projectDateTime(value, '10:00'),
    charterStartsAt: projectDateTime(value, '10:00'),
  };
}

function projectEndDateFields(value: string) {
  return {
    endsOn: value,
    redeliveryAt: projectDateTime(value, '18:00'),
    charterEndsAt: projectDateTime(value, '18:00'),
  };
}

function formatRepresentativeFirstName(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_match, separator: string, letter: string) => (
      `${separator}${letter.toLocaleUpperCase('fr-FR')}`
    ));
}

function formatRepresentativeLastName(value: string): string {
  return value.toLocaleUpperCase('fr-FR');
}

function combineRepresentativeName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

function splitRepresentativeName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };

  let lastNameStart = parts.length;
  while (lastNameStart > 0) {
    const part = parts[lastNameStart - 1];
    const letters = part.replace(/[^\p{L}]/gu, '');
    if (!letters || letters !== letters.toLocaleUpperCase('fr-FR')) break;
    lastNameStart -= 1;
  }

  if (lastNameStart === parts.length) lastNameStart = Math.max(0, parts.length - 1);
  return {
    firstName: parts.slice(0, lastNameStart).join(' '),
    lastName: parts.slice(lastNameStart).join(' '),
  };
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
  if (!project) {
    return {
      ...EMPTY_PROJECT_WRITE_INPUT,
      supplytimeData: { ...EMPTY_PROJECT_WRITE_INPUT.supplytimeData },
    };
  }
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
    contractType: normalizeProjectContractType(project.contractType),
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
    supplytimeData: {
      ...(contract?.supplytimeData || {}),
      box19_special_fuel: contract?.supplytimeData?.box19_special_fuel || DEFAULT_PROJECT_FUEL_TERMS,
    },
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
      standbyHire: period.standbyHire ?? period.charterHire,
      weatherStandbyHire: period.weatherStandbyHire ?? period.charterHire,
      hireCurrency: period.hireCurrency,
      hireUnit: period.hireUnit,
    }));
  }
  if (contract?.charterHire !== null && contract?.charterHire !== undefined) {
    return [{
      startsOn: project?.startsOn || new Date().toISOString().slice(0, 10),
      endsOn: '',
      charterHire: contract.charterHire,
      standbyHire: contract.charterHire,
      weatherStandbyHire: contract.charterHire,
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
  photoUrl: '',
  photoStoragePath: '',
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
    photoUrl: asset.photoUrl,
    photoStoragePath: asset.photoStoragePath,
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

type ProjectAssistantStep = 'identification' | 'planning' | 'offer' | 'billing' | 'bimco' | 'documents';

interface ProjectAssistantStepDefinition {
  description: string;
  icon: typeof FolderOpen;
  id: ProjectAssistantStep;
  label: string;
}

function PortSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field label={label}>
      <ProjectPortCombobox onChange={onChange} value={value} />
    </Field>
  );
}

export function ProjectEditor({
  client,
  clients,
  contract,
  initialOperation,
  onClose,
  onSaved,
  project,
  projectAttachments = [],
  towedAssets,
  vessels,
}: ProjectEditorProps) {
  const baseInitialForm = projectToWriteInput(project, contract);
  const initialForm = !project && initialOperation ? {
    ...baseInitialForm,
    ...projectStartDateFields(initialOperation.startsOn),
    ...projectEndDateFields(initialOperation.endsOn),
    primaryVesselId: initialOperation.vesselIds[0] ?? null,
    secondaryVesselId: initialOperation.vesselIds[1] ?? null,
  } : baseInitialForm;
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
  const [documentCategories, setDocumentCategories] = useState<ProjectDocumentCategory[]>(
    cloneDefaultProjectDocumentCategories,
  );
  const [initialDocumentCategories, setInitialDocumentCategories] = useState<ProjectDocumentCategory[]>(
    cloneDefaultProjectDocumentCategories,
  );
  const [documentCategoriesEditing, setDocumentCategoriesEditing] = useState(false);
  const [projectAttachmentDrafts, setProjectAttachmentDrafts] = useState<ProjectAttachmentDraft[]>([]);
  const [documentEmitter, setDocumentEmitter] = useState<ProjectDocumentEmitter>();
  const [initialOperationForm, setInitialOperationForm] = useState<ProjectPlanningOccurrenceWriteInput | null>(() => (
    !project ? {
      charterHire: null,
      charterHireOverride: false,
      description: '',
      endsOn: initialOperation?.endsOn || '',
      hireCurrency: '',
      hireUnit: '',
      occurrenceId: null,
      projectId: 0,
      startsOn: initialOperation?.startsOn || '',
      status: 'Non validé',
      vesselIds: initialOperation?.vesselIds || [],
    } : null
  ));
  const [nextProjectCode, setNextProjectCode] = useState(project?.projectCode || 'P…');
  const eligibleVessels = vessels.filter(
    (vessel) => vessel.active || vessel.id === project?.primaryVesselId || vessel.id === project?.secondaryVesselId,
  );
  const normalizedContractType = normalizeProjectContractType(form.contractType);
  const isCommercialOffer = normalizedContractType === COMMERCIAL_OFFER_CONTRACT_TYPE;
  const isTowage = normalizedContractType === TOWAGE_CONTRACT_TYPE;
  const isBimco = normalizedContractType === BIMCO_CONTRACT_TYPE;
  const contractStep: ProjectAssistantStep = isBimco ? 'bimco' : 'offer';
  const assistantSteps: ProjectAssistantStepDefinition[] = [
    { description: 'Projet, client et contrat', icon: FolderOpen, id: 'identification', label: 'Identification' },
    { description: isBimco ? 'Cases du formulaire P144' : 'Champs du document', icon: ReceiptText, id: contractStep, label: normalizedContractType },
    { description: 'Dates, ports et première mission', icon: CalendarDays, id: 'planning', label: 'Opérations' },
    { description: 'Navires et conditions tarifaires', icon: CreditCard, id: 'billing', label: 'Facturation' },
    { description: 'Pièces classées dans SeaPilot', icon: FileText, id: 'documents', label: 'Documents' },
  ];
  const { activeDocumentCategories, documentCategoryByKey, rootDocumentCategories } = useMemo(() => {
    const activeCategories = documentCategories
      .filter((category) => category.active)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, 'fr'));
    return {
      activeDocumentCategories: activeCategories,
      documentCategoryByKey: new Map(documentCategories.map((category) => [category.key, category])),
      rootDocumentCategories: activeCategories.filter((category) => category.parentKey === null),
    };
  }, [documentCategories]);

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

  useEffect(() => {
    if (typeof client.from !== 'function') return;
    let active = true;
    void fetchProjectDocumentCategories(client).then((categories) => {
      if (!active || categories.length === 0) return;
      setDocumentCategories(categories);
      setInitialDocumentCategories(categories.map((category) => ({ ...category })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    let active = true;
    void fetchProjectDocumentEmitter(client).then((emitter) => {
      if (active) setDocumentEmitter(emitter);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (activeStep === 'offer' || activeStep === 'bimco') setActiveStep(contractStep);
  }, [contractStep]);

  function update<K extends keyof ProjectWriteInput>(key: K, value: ProjectWriteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTowedAsset<K extends keyof ProjectTowedAssetWriteInput>(
    key: K,
    value: ProjectTowedAssetWriteInput[K],
  ) {
    setTowedAsset((current) => ({ ...(current || EMPTY_TOWED_ASSET), [key]: value }));
  }

  function updateDocumentCategory(key: string, label: string) {
    setDocumentCategories((categories) => categories.map((category) => (
      category.key === key ? { ...category, label } : category
    )));
  }

  function addDocumentCategory() {
    const displayOrder = Math.max(0, ...documentCategories.map((category) => category.displayOrder)) + 10;
    setDocumentCategories((categories) => [...categories, {
      active: true,
      displayOrder,
      key: newProjectDocumentCategoryKey('category'),
      label: 'Nouvelle catégorie',
      parentKey: null,
    }]);
  }

  function addDocumentSubcategory(parentKey: string) {
    const siblings = documentCategories.filter((category) => category.parentKey === parentKey);
    const parent = documentCategories.find((category) => category.key === parentKey);
    const displayOrder = Math.max(parent?.displayOrder || 0, ...siblings.map((category) => category.displayOrder)) + 1;
    setDocumentCategories((categories) => [...categories, {
      active: true,
      displayOrder,
      key: newProjectDocumentCategoryKey('subcategory'),
      label: 'Nouvelle sous-catégorie',
      parentKey,
    }]);
  }

  function removeDocumentCategory(key: string) {
    const removedKeys = new Set([
      key,
      ...documentCategories.filter((category) => category.parentKey === key).map((category) => category.key),
    ]);
    setDocumentCategories((categories) => categories.map((category) => (
      removedKeys.has(category.key) ? { ...category, active: false } : category
    )));
    setProjectAttachmentDrafts((drafts) => drafts.filter((draft) => (
      !removedKeys.has(draft.categoryKey) && !removedKeys.has(draft.subcategoryKey || '')
    )));
  }

  function addProjectAttachmentFiles(categoryKey: string, subcategoryKey: string | null, files: FileList | null) {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    setProjectAttachmentDrafts((drafts) => [...drafts, ...selectedFiles.map((file) => ({
      categoryKey,
      expiresOn: '',
      file,
      id: crypto.randomUUID(),
      subcategoryKey,
    }))]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const operationVesselIds = [form.primaryVesselId, form.secondaryVesselId]
      .filter((vesselId): vesselId is number => vesselId !== null);
    if (!project) {
      const missingOperationFields = [
        !form.primaryVesselId ? 'le navire principal' : '',
        !form.deliveryAt ? 'la livraison' : '',
        !form.redeliveryAt ? 'la restitution' : '',
      ].filter(Boolean);
      if (missingOperationFields.length > 0) {
        setActiveStep(!form.deliveryAt || !form.redeliveryAt ? 'planning' : 'billing');
        setErrorMessage(
          `Pour créer l’opération dans le planning, renseignez ${missingOperationFields.join(', ')}.`,
        );
        return;
      }
    }
    const automaticOperation = !project && initialOperationForm ? {
      ...initialOperationForm,
      description: initialOperationForm.description.trim() || form.description.trim(),
      endsOn: dateOnly(form.redeliveryAt),
      startsOn: dateOnly(form.deliveryAt),
      status: 'Non validé',
      vesselIds: operationVesselIds,
    } : null;
    setIsSaving(true);
    let savedProject: ProjectMutationResult | null = null;
    try {
      const isCommercialOffer = normalizeProjectContractType(form.contractType) === COMMERCIAL_OFFER_CONTRACT_TYPE;
      const effectiveHirePeriods = isCommercialOffer ? [] : hirePeriods;
      const firstHirePeriod = [...effectiveHirePeriods].sort((left, right) => left.startsOn.localeCompare(right.startsOn))[0];
      const projectCoreChanged = !project
        || projectCoreSnapshot(form) !== projectCoreSnapshot(initialForm);
      const projectContractChanged = !project
        || !contract
        || projectContractSnapshot(form) !== projectContractSnapshot(initialForm);
      const hirePeriodsChanged = !project
        || hirePeriodsSnapshot(effectiveHirePeriods) !== hirePeriodsSnapshot(initialHirePeriods);
      const formWithEffectiveHire = firstHirePeriod ? {
        ...form,
        charterHire: firstHirePeriod.charterHire,
        hireCurrency: firstHirePeriod.hireCurrency,
        hireUnit: firstHirePeriod.hireUnit,
      } : isCommercialOffer ? {
        ...form,
        hireCurrency: 'EUR',
        hireUnit: 'jour',
      } : form;
      const result = projectCoreChanged
        ? await saveProject(client, formWithEffectiveHire)
        : {
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          updatedAt: project.updatedAt,
        };
      if (projectCoreChanged) savedProject = result;

      let effectiveTowedAssetId: number | null = null;
      if (normalizeProjectContractType(form.contractType) === TOWAGE_CONTRACT_TYPE) {
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
      const shouldSaveContractDetails = (!projectCoreChanged && projectContractChanged) || towedAssetLinkChanged;
      if (isCommercialOffer && hirePeriodsChanged) {
        await saveProjectContractHirePeriods(client, result.id, []);
        await saveProjectContractDetails(client, result.id, formWithEffectiveHire, effectiveTowedAssetId);
      } else if (shouldSaveContractDetails) {
        await saveProjectContractDetails(client, result.id, formWithEffectiveHire, effectiveTowedAssetId);
      }
      if (!isCommercialOffer && hirePeriodsChanged) {
        await saveProjectContractHirePeriods(client, result.id, effectiveHirePeriods);
      }
      if (
        projectDocumentCategorySnapshot(documentCategories)
        !== projectDocumentCategorySnapshot(initialDocumentCategories)
      ) {
        await saveProjectDocumentCategories(client, documentCategories);
        setInitialDocumentCategories(documentCategories.map((category) => ({ ...category })));
      }
      if (automaticOperation) {
        const occurrenceId = await saveProjectPlanningOccurrence(client, {
          ...automaticOperation,
          projectId: result.id,
        });
        setInitialOperationForm((current) => current ? {
          ...current,
          ...automaticOperation,
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
            throw new Error(`${uploads.failed.length} document(s) n’ont pas pu être enregistrés dans SeaPilot.`);
          }
        }
      }
      if (projectAttachmentDrafts.length > 0) {
        const uploads = await storeProjectAttachments(client, {
          drafts: projectAttachmentDrafts,
          projectId: result.id,
        });
        const storedIds = new Set(uploads.stored.map((document) => document.draftId));
        setProjectAttachmentDrafts((drafts) => drafts.filter((draft) => !storedIds.has(draft.id)));
        if (uploads.failed.length > 0) {
          throw new Error(
            `${uploads.failed.length} pièce(s) jointe(s) n’ont pas pu être enregistrées dans Supabase. ${uploads.failed[0].message}`,
          );
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
            <h2 id="project-editor-title">{project ? 'Modifier le projet' : 'Nouveau projet'}</h2>
            <small>{nextProjectCode} · {normalizedContractType}</small>
          </div>
          <button aria-label="Fermer le formulaire projet" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="project-assistant-layout">
            <aside aria-label="Étapes de création du projet">
              <span>PARCOURS PROJET</span>
              <strong>{nextProjectCode}</strong>
              {assistantSteps.map((step, index) => {
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
          <section className="project-contract-choice" aria-label="Choix du type de contrat">
            <label>
              <span>Type de contrat</span>
              <select
                aria-label="Type de contrat"
                onChange={(event) => update('contractType', event.target.value)}
                value={normalizedContractType}
              >
                {PROJECT_CONTRACT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <p><strong>{form.title || 'Projet sans titre'}</strong><span>{availableClients.find((item) => item.id === form.clientId)?.name || 'Client à renseigner'}</span></p>
          </section>
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
            <legend><span>3</span> Opérations</legend>
            <div className="project-editor-grid">
              {initialOperation && initialOperationForm ? (
                <section className="project-initial-operation is-wide" aria-label="Première opération">
                  <div className="project-initial-operation-heading">
                    <strong>Première opération</strong>
                    <small>Les dates et navires seront repris depuis Livraison, Restitution et Mission et facturation.</small>
                  </div>
                  <div className="project-editor-grid">
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
              <Field label="Début du projet"><input onInput={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, ...projectStartDateFields(value) }));
              }} type="date" value={form.startsOn} /></Field>
              <Field label="Fin du projet"><input onInput={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, ...projectEndDateFields(value) }));
              }} type="date" value={form.endsOn} /></Field>
              <Field label="Livraison *"><input onChange={(event) => update('deliveryAt', event.target.value)} type="datetime-local" value={form.deliveryAt} /></Field>
              <Field label="Restitution *"><input onChange={(event) => update('redeliveryAt', event.target.value)} type="datetime-local" value={form.redeliveryAt} /></Field>
              <Field label="Début d’affrètement"><input onChange={(event) => update('charterStartsAt', event.target.value)} type="datetime-local" value={form.charterStartsAt} /></Field>
              <Field label="Fin d’affrètement"><input onChange={(event) => update('charterEndsAt', event.target.value)} type="datetime-local" value={form.charterEndsAt} /></Field>
              <PortSelect label="Port de livraison" onChange={(value) => update('deliveryPort', value)} value={form.deliveryPort} />
              <PortSelect label="Port de restitution" onChange={(value) => update('redeliveryPort', value)} value={form.redeliveryPort} />
              {isCommercialOffer ? (
                <section className="project-commercial-reserves is-wide" aria-label="Réserves commerciales">
                  <div>
                    <strong>RÉSERVES COMMERCIALES</strong>
                    <small>Seules les réserves sélectionnées ou saisies apparaîtront sur l’offre.</small>
                  </div>
                  <label>
                    <input
                      checked={form.supplytimeData[COMMERCIAL_RESERVE_AVAILABILITY_KEY] === 'true'}
                      onChange={(event) => update('supplytimeData', {
                        ...form.supplytimeData,
                        [COMMERCIAL_RESERVE_AVAILABILITY_KEY]: String(event.target.checked),
                      })}
                      type="checkbox"
                    />
                    <span>{COMMERCIAL_RESERVE_AVAILABILITY}</span>
                  </label>
                  <label>
                    <input
                      checked={form.supplytimeData[COMMERCIAL_RESERVE_WEATHER_KEY] === 'true'}
                      onChange={(event) => update('supplytimeData', {
                        ...form.supplytimeData,
                        [COMMERCIAL_RESERVE_WEATHER_KEY]: String(event.target.checked),
                      })}
                      type="checkbox"
                    />
                    <span>{COMMERCIAL_RESERVE_WEATHER}</span>
                  </label>
                  <label className="project-commercial-reserves-other">
                    <span>Autre réserve</span>
                    <textarea
                      onChange={(event) => update('supplytimeData', {
                        ...form.supplytimeData,
                        [COMMERCIAL_RESERVE_OTHER_KEY]: event.target.value,
                      })}
                      rows={2}
                      value={form.supplytimeData[COMMERCIAL_RESERVE_OTHER_KEY] || ''}
                    />
                  </label>
                </section>
              ) : null}
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'offer' && !(isBimco && activeStep === 'billing')} id="project-step-offer">
            <legend><span>{isBimco ? 4 : 2}</span> {isBimco ? 'Conditions tarifaires' : normalizedContractType}</legend>
            <div className="project-editor-grid">
              <label className={`project-owner-identity${isCommercialOffer ? ' is-wide' : ''}`}>
                <span>Identité armateur</span>
                <textarea onChange={(event) => update('ownerIdentity', event.target.value)} rows={3} value={form.ownerIdentity} />
              </label>
              {isTowage ? (
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
              {isTowage ? (
                <section className="project-towage-contract-fields is-wide" aria-label="Conditions du contrat de remorquage">
                  <h3>Voyage et conditions particulières</h3>
                  <div className="project-editor-grid">
                    {[
                      ['departure_window', 'Créneau de départ'],
                      ['arrival_window', 'Créneau d’arrivée'],
                      ['connection_time', 'Temps de connexion'],
                      ['disconnection_time', 'Temps de déconnexion'],
                      ['optional_costs', 'Coûts optionnels'],
                      ['box23_payment', 'Modalités de paiement'],
                      ['additional_charges', 'Frais additionnels'],
                      ['special_conditions', 'Conditions particulières'],
                      ['charterer_signatory', 'Signataire affréteur'],
                      ['owner_signatory', 'Signataire armateur'],
                    ].map(([key, label]) => (
                      <Field key={key} label={label} wide={key === 'special_conditions'}>
                        {key === 'special_conditions' ? (
                          <textarea onChange={(event) => update('supplytimeData', { ...form.supplytimeData, [key]: event.target.value })} value={form.supplytimeData[key] || ''} />
                        ) : (
                          <input onChange={(event) => update('supplytimeData', { ...form.supplytimeData, [key]: event.target.value })} value={form.supplytimeData[key] || ''} />
                        )}
                      </Field>
                    ))}
                  </div>
                </section>
              ) : null}
              {isCommercialOffer ? (
                <Field label="Loyer d’affrètement" wide>
                  <span className="project-commercial-hire-input">
                    <input
                      min="0"
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        charterHire: optionalNumber(event.target.value),
                        hireCurrency: 'EUR',
                        hireUnit: 'jour',
                      }))}
                      step="0.01"
                      type="number"
                      value={form.charterHire ?? ''}
                    />
                    <strong>€ / jour</strong>
                  </span>
                </Field>
              ) : null}
              <Field label="Frais de mobilisation" wide={isCommercialOffer}><input min="0" onChange={(event) => update('mobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.mobilisationFee ?? ''} /></Field>
              <Field label="Frais de démobilisation" wide={isCommercialOffer}><input min="0" onChange={(event) => update('demobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.demobilisationFee ?? ''} /></Field>
              <Field label="Devise des frais" wide={isCommercialOffer}>
                <select onChange={(event) => update('feeCurrency', event.target.value)} value={form.feeCurrency || 'EUR'}>
                  {form.feeCurrency && !PROJECT_CURRENCIES.some((currency) => currency.code === form.feeCurrency)
                    ? <option value={form.feeCurrency}>{form.feeCurrency}</option>
                    : null}
                  {PROJECT_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
                </select>
              </Field>
              {!isCommercialOffer ? (
                <Field label="Loyer en prolongation"><input min="0" onChange={(event) => update('extensionHire', optionalNumber(event.target.value))} step="0.01" type="number" value={form.extensionHire ?? ''} /></Field>
              ) : null}
              <Field label="Fuel" wide>
                <input
                  onChange={(event) => update('supplytimeData', { ...form.supplytimeData, box19_special_fuel: event.target.value })}
                  type="text"
                  value={form.supplytimeData.box19_special_fuel || ''}
                />
              </Field>
              {!isCommercialOffer ? (
              <section className="project-hire-periods is-wide" aria-label="Barème des loyers d’affrètement">
                <div className="project-hire-periods-heading">
                  <div><strong>Barème des loyers d’affrètement</strong><small>Le tarif applicable est déterminé automatiquement pour chaque date d’opération.</small></div>
                  <button
                    onClick={() => setHirePeriods((periods) => [...periods, {
                      startsOn: periods.at(-1)?.endsOn ? nextDate(periods.at(-1)?.endsOn || '') : form.startsOn || new Date().toISOString().slice(0, 10),
                      endsOn: '',
                      charterHire: periods.at(-1)?.charterHire ?? null,
                      standbyHire: periods.at(-1)?.standbyHire ?? periods.at(-1)?.charterHire ?? null,
                      weatherStandbyHire: periods.at(-1)?.weatherStandbyHire ?? periods.at(-1)?.charterHire ?? null,
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
                    <label>En Opération *<input min="0" onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, charterHire: optionalNumber(event.target.value) } : item))} required step="0.01" type="number" value={period.charterHire ?? ''} /></label>
                    <label>Stand-by *<input min="0" onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, standbyHire: optionalNumber(event.target.value) } : item))} required step="0.01" type="number" value={period.standbyHire ?? ''} /></label>
                    <label>Weather Stand-by *<input min="0" onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, weatherStandbyHire: optionalNumber(event.target.value) } : item))} required step="0.01" type="number" value={period.weatherStandbyHire ?? ''} /></label>
                    <label>Devise *<input maxLength={3} onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, hireCurrency: event.target.value.toUpperCase() } : item))} required value={period.hireCurrency} /></label>
                    <label>Unité *<input onChange={(event) => setHirePeriods((periods) => periods.map((item, itemIndex) => itemIndex === index ? { ...item, hireUnit: event.target.value } : item))} required value={period.hireUnit} /></label>
                    <button aria-label={`Supprimer la période tarifaire ${index + 1}`} onClick={() => setHirePeriods((periods) => periods.filter((_, itemIndex) => itemIndex !== index))} type="button"><X aria-hidden="true" size={16} /></button>
                  </div>
                ))}
                {!hirePeriods.length ? <p>Aucune période tarifaire. Ajoutez-en une pour alimenter automatiquement les opérations.</p> : null}
              </section>
              ) : null}
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'billing'} id="project-step-billing">
            <legend><span>4</span> Facturation</legend>
            <div className="project-editor-grid">
              <Field label="Navire principal *">
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

          <fieldset hidden={activeStep !== 'bimco'} id="project-step-bimco">
            <legend><span>2</span> BIMCO</legend>
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
              {BIMCO_P144_GROUPS.map((group) => (
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

          <fieldset hidden={activeStep !== 'documents'} id="project-step-documents">
            <legend><span>5</span> Documents</legend>
            <section className="project-document-library" aria-label="Pièces jointes du projet">
              <div className="project-document-library-heading">
                <div>
                  <strong>Pièces jointes classées</strong>
                  <small>Ajoutez plusieurs documents par catégorie, avec ou sans date d’échéance.</small>
                </div>
                <button onClick={() => setDocumentCategoriesEditing((editing) => !editing)} type="button">
                  {documentCategoriesEditing ? 'Terminer' : 'Modifier les catégories'}
                </button>
              </div>

              {documentCategoriesEditing ? (
                <div className="project-document-category-editor">
                  {rootDocumentCategories.map((category) => {
                    const subcategories = activeDocumentCategories.filter((item) => item.parentKey === category.key);
                    return <section key={category.key}>
                      <div>
                        <input
                          aria-label={`Nom de la catégorie ${category.label}`}
                          onChange={(event) => updateDocumentCategory(category.key, event.target.value)}
                          value={category.label}
                        />
                        <button aria-label={`Supprimer la catégorie ${category.label}`} onClick={() => removeDocumentCategory(category.key)} type="button">
                          <X aria-hidden="true" size={15} />
                        </button>
                      </div>
                      {subcategories.map((subcategory) => <div className="project-document-subcategory-editor" key={subcategory.key}>
                        <input
                          aria-label={`Nom de la sous-catégorie ${subcategory.label}`}
                          onChange={(event) => updateDocumentCategory(subcategory.key, event.target.value)}
                          value={subcategory.label}
                        />
                        <button aria-label={`Supprimer la sous-catégorie ${subcategory.label}`} onClick={() => removeDocumentCategory(subcategory.key)} type="button">
                          <X aria-hidden="true" size={15} />
                        </button>
                      </div>)}
                      <button className="project-document-add-subcategory" onClick={() => addDocumentSubcategory(category.key)} type="button">
                        <Plus aria-hidden="true" size={14} /> Ajouter une sous-catégorie
                      </button>
                    </section>;
                  })}
                  <button className="project-document-add-category" onClick={addDocumentCategory} type="button">
                    <Plus aria-hidden="true" size={15} /> Ajouter une catégorie
                  </button>
                </div>
              ) : (
                <div className="project-document-category-list">
                  {rootDocumentCategories.map((category) => {
                    const subcategories = activeDocumentCategories.filter((item) => item.parentKey === category.key);
                    const uploadTargets = subcategories.length > 0 ? subcategories : [category];
                    return <section key={category.key}>
                      <h3>{category.label}</h3>
                      <div>
                        {uploadTargets.map((target) => <label className="project-document-upload-target" key={target.key}>
                          <span>{target.parentKey ? target.label : 'Documents'}</span>
                          <span>
                            <FileUp aria-hidden="true" size={17} />
                            <strong>Ajouter des fichiers</strong>
                          </span>
                          <input
                            aria-label={`Ajouter des documents · ${category.label}${target.parentKey ? ` · ${target.label}` : ''}`}
                            multiple
                            onChange={(event) => {
                              addProjectAttachmentFiles(category.key, target.parentKey ? target.key : null, event.target.files);
                              event.currentTarget.value = '';
                            }}
                            type="file"
                          />
                        </label>)}
                      </div>
                    </section>;
                  })}
                </div>
              )}

              {projectAttachmentDrafts.length > 0 ? (
                <div className="project-document-pending">
                  <h3>Documents à enregistrer</h3>
                  {projectAttachmentDrafts.map((draft) => {
                    const category = documentCategoryByKey.get(draft.categoryKey);
                    const subcategory = draft.subcategoryKey ? documentCategoryByKey.get(draft.subcategoryKey) : undefined;
                    return <div key={draft.id}>
                      <FileText aria-hidden="true" size={16} />
                      <span><strong>{draft.file.name}</strong><small>{[category?.label, subcategory?.label].filter(Boolean).join(' · ')}</small></span>
                      <label>
                        <span>Échéance facultative</span>
                        <input
                          aria-label={`Date d’échéance de ${draft.file.name}`}
                          onChange={(event) => setProjectAttachmentDrafts((drafts) => drafts.map((item) => (
                            item.id === draft.id ? { ...item, expiresOn: event.target.value } : item
                          )))}
                          type="date"
                          value={draft.expiresOn}
                        />
                      </label>
                      <button aria-label={`Retirer ${draft.file.name}`} onClick={() => setProjectAttachmentDrafts((drafts) => drafts.filter((item) => item.id !== draft.id))} type="button">
                        <X aria-hidden="true" size={15} />
                      </button>
                    </div>;
                  })}
                </div>
              ) : null}

              {projectAttachments.length > 0 ? (
                <div className="project-document-existing">
                  <h3>Documents déjà classés</h3>
                  {projectAttachments.map((document) => {
                    const category = document.categoryKey ? documentCategoryByKey.get(document.categoryKey) : undefined;
                    const subcategory = document.subcategoryKey ? documentCategoryByKey.get(document.subcategoryKey) : undefined;
                    const expired = Boolean(document.expiresOn && document.expiresOn < new Date().toISOString().slice(0, 10));
                    return <div className="project-document-existing-row" key={document.id}>
                      <FileText aria-hidden="true" size={16} />
                      <span>
                        <strong>{document.fileName}</strong>
                        <small>{[category?.label, subcategory?.label].filter(Boolean).join(' · ') || 'Document projet'}</small>
                      </span>
                      <em className={expired ? 'is-expired' : undefined}>
                        {document.expiresOn ? `${expired ? 'Échu' : 'Valide'} · ${document.expiresOn}` : 'Sans échéance'}
                      </em>
                      <ProjectStoredDocumentLink client={client} document={document} includeIcon />
                    </div>;
                  })}
                </div>
              ) : null}
            </section>
          </fieldset>

            </main>
            <ProjectContractPreview
              client={clients.find((item) => item.id === form.clientId)}
              emitter={documentEmitter}
              form={form}
              projectCode={nextProjectCode}
              towedAsset={towedAsset}
              vessel={vessels.find((item) => item.id === form.primaryVesselId)}
            />
          </div>

          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <footer>
            <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button disabled={isSaving} onClick={() => update('status', 'En préparation')} type="submit">Enregistrer le brouillon</button>
            <button className="is-primary" disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : project ? 'Enregistrer le projet' : 'Créer le projet'}</button>
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
  const representative = splitRepresentativeName(clientRecord?.representedBy || '');
  const [form, setForm] = useState<ClientWriteInput>({
    clientId: clientRecord?.id ?? null,
    name: clientRecord?.name || '',
    representedBy: clientRecord?.representedBy || '',
    code: clientRecord?.code || '',
    email: clientRecord?.email || '',
    phone: clientRecord?.phone || '',
    address: clientRecord?.address || '',
    postalCode: clientRecord?.postalCode || '',
    city: clientRecord?.city || '',
    country: clientRecord?.country || '',
    website: clientRecord?.website || '',
    logoUrl: clientRecord?.logoUrl || '',
    logoStoragePath: clientRecord?.logoStoragePath || '',
    active: clientRecord?.active ?? true,
    expectedUpdatedAt: clientRecord?.updatedAt || '',
  });
  const [representativeFirstName, setRepresentativeFirstName] = useState(
    formatRepresentativeFirstName(representative.firstName),
  );
  const [representativeLastName, setRepresentativeLastName] = useState(
    formatRepresentativeLastName(representative.lastName),
  );
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
      const savedForm = {
        ...form,
        country: await resolveClientCountry(form),
        representedBy: combineRepresentativeName(representativeFirstName, representativeLastName),
      };
      onSaved(await saveClient(client, savedForm), savedForm);
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
            <section aria-labelledby="client-representative-title" className="project-client-representative">
              <strong id="client-representative-title">Représenté par :</strong>
              <div>
                <Field label="Prénom">
                  <input
                    onChange={(event) => setRepresentativeFirstName(formatRepresentativeFirstName(event.target.value))}
                    value={representativeFirstName}
                  />
                </Field>
                <Field label="NOM">
                  <input
                    onChange={(event) => setRepresentativeLastName(formatRepresentativeLastName(event.target.value))}
                    value={representativeLastName}
                  />
                </Field>
              </div>
            </section>
            <Field label="Code"><input onChange={(event) => update('code', event.target.value)} value={form.code} /></Field>
            <Field label="Courriel"><input onChange={(event) => update('email', event.target.value)} type="email" value={form.email} /></Field>
            <Field label="Téléphone"><input onChange={(event) => update('phone', event.target.value)} type="tel" value={form.phone} /></Field>
            <Field label="Adresse" wide><textarea onChange={(event) => update('address', event.target.value)} value={form.address} /></Field>
            <ClientLocationFields
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              value={form}
            />
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
                  <ProjectStoredDocumentLink client={client} document={document} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="project-editor-note">
            {canViewCharterHire ? 'Le barème contractuel suit automatiquement la date de début, sauf lorsqu’un tarif personnalisé est activé. ' : ''}
            Les documents sont classés dans l’espace privé SeaPilot du projet.
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
