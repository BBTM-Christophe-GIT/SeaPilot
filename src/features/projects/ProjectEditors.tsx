import { CalendarDays, CreditCard, ExternalLink, FileText, FileUp, FolderOpen, Plus, ReceiptText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_PROJECT_WRITE_INPUT,
  saveProjectPlanningOccurrence,
  saveClient,
  saveProject,
  type ClientWriteInput,
  type ProjectMutationResult,
  type ProjectPlanningOccurrenceWriteInput,
  type ProjectWriteInput,
} from './projectMutations';
import { storeOperationDocuments, type OperationDocumentUploadResult } from './projectDocumentStorage';
import type {
  ClientRecord,
  ProjectContractRecord,
  ProjectOperationDocumentRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
  VesselRecord,
} from './projectQueries';
import { SUPPLYTIME_GROUPS } from './projectReadModel';
import { formatProjectPort, PROJECT_PORT_GROUPS } from './projectPorts';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ProjectEditorProps {
  client: SupabaseClient;
  clients: ClientRecord[];
  contract?: ProjectContractRecord;
  contractTypes: string[];
  onClose: () => void;
  onSaved: (result: ProjectMutationResult) => void;
  project?: ProjectRecord;
  statuses: string[];
  vessels: VesselRecord[];
}

interface ClientEditorProps {
  client: SupabaseClient;
  clientRecord?: ClientRecord;
  onClose: () => void;
  onSaved: (clientId: number, savedClient: ClientWriteInput) => void;
}

interface ProjectPlanningEditorProps {
  client: SupabaseClient;
  contract?: ProjectContractRecord;
  onClose: () => void;
  onSaved: (occurrenceId: number, uploads: OperationDocumentUploadResult) => void;
  occurrence?: ProjectPlanningOccurrenceRecord;
  operationDocuments?: ProjectOperationDocumentRecord[];
  project: ProjectRecord;
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
    status: project.status,
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
    ownerIdentity: contract?.ownerIdentity || '',
    vesselAssignmentLimit: contract?.vesselAssignmentLimit || '',
    extensionCount: contract?.extensionCount ?? null,
    extensionDuration: contract?.extensionDuration ?? null,
    extensionUnit: contract?.extensionUnit || '',
    autoExtensionPeriod: contract?.autoExtensionPeriod || 'Voyage',
    maxExtensionDays: contract?.maxExtensionDays ?? null,
    mobilisationFee: contract?.mobilisationFee ?? null,
    demobilisationFee: contract?.demobilisationFee ?? null,
    feeCurrency: contract?.feeCurrency || '',
    charterHire: contract?.charterHire ?? null,
    extensionHire: contract?.extensionHire ?? null,
    hireCurrency: contract?.hireCurrency || '',
    hireUnit: contract?.hireUnit || '',
    maxAuditPeriod: contract?.maxAuditPeriod || '',
    supplytimeData: { ...(contract?.supplytimeData || {}) },
    expectedUpdatedAt: project.updatedAt,
  };
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
  onClose,
  onSaved,
  project,
  statuses,
  vessels,
}: ProjectEditorProps) {
  const [form, setForm] = useState(() => projectToWriteInput(project, contract));
  const [activeStep, setActiveStep] = useState<ProjectAssistantStep>('identification');
  const [availableClients, setAvailableClients] = useState<
    Pick<ClientRecord, 'active' | 'id' | 'name'>[]
  >(() => clients);
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    try {
      onSaved(await saveProject(client, form));
    } catch (error) {
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
                <input list="project-status-values" onChange={(event) => update('status', event.target.value)} value={form.status} />
                <datalist id="project-status-values">{statuses.map((status) => <option key={status} value={status} />)}</datalist>
              </Field>
              <Field label="Description" wide>
                <textarea onChange={(event) => update('description', event.target.value)} value={form.description} />
              </Field>
            </div>
          </fieldset>

          <fieldset hidden={activeStep !== 'planning'} id="project-step-planning">
            <legend><span>2</span> Planning</legend>
            <div className="project-editor-grid">
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
              <Field label="Identité armateur"><input onChange={(event) => update('ownerIdentity', event.target.value)} value={form.ownerIdentity} /></Field>
              <Field label="Frais de mobilisation"><input min="0" onChange={(event) => update('mobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.mobilisationFee ?? ''} /></Field>
              <Field label="Frais de démobilisation"><input min="0" onChange={(event) => update('demobilisationFee', optionalNumber(event.target.value))} step="0.01" type="number" value={form.demobilisationFee ?? ''} /></Field>
              <Field label="Devise des frais"><input maxLength={3} onChange={(event) => update('feeCurrency', event.target.value.toUpperCase())} placeholder="EUR" value={form.feeCurrency} /></Field>
              <Field label="Loyer d’affrètement"><input min="0" onChange={(event) => update('charterHire', optionalNumber(event.target.value))} step="0.01" type="number" value={form.charterHire ?? ''} /></Field>
              <Field label="Loyer en prolongation"><input min="0" onChange={(event) => update('extensionHire', optionalNumber(event.target.value))} step="0.01" type="number" value={form.extensionHire ?? ''} /></Field>
              <Field label="Devise des loyers"><input maxLength={3} onChange={(event) => update('hireCurrency', event.target.value.toUpperCase())} placeholder="EUR" value={form.hireCurrency} /></Field>
              <Field label="Unité des loyers"><input onChange={(event) => update('hireUnit', event.target.value)} placeholder="jour" value={form.hireUnit} /></Field>
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

function dateOnly(value: string): string {
  return value ? value.slice(0, 10) : '';
}

export function ProjectPlanningEditor({
  client,
  contract,
  onClose,
  onSaved,
  occurrence,
  operationDocuments = [],
  project,
  vessels,
}: ProjectPlanningEditorProps) {
  const [form, setForm] = useState<ProjectPlanningOccurrenceWriteInput>({
    occurrenceId: occurrence?.id ?? null,
    projectId: project.id,
    startsOn: dateOnly(occurrence?.startsOn || project.deliveryAt || project.charterStartsAt || project.startsOn),
    endsOn: dateOnly(occurrence?.endsOn || project.redeliveryAt || project.charterEndsAt || project.endsOn),
    primaryVesselId: occurrence?.primaryVesselId ?? project.primaryVesselId,
    status: occurrence?.status || 'A planifier',
    description: occurrence?.description || project.description,
    charterHire: occurrence?.charterHire ?? contract?.charterHire ?? null,
    hireCurrency: occurrence?.hireCurrency || contract?.hireCurrency || 'EUR',
    hireUnit: occurrence?.hireUnit || contract?.hireUnit || 'jour',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const eligibleVessels = vessels.filter((vessel) => vessel.active || vessel.id === project.primaryVesselId);

  function update<K extends keyof ProjectPlanningOccurrenceWriteInput>(
    key: K,
    value: ProjectPlanningOccurrenceWriteInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
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
    <div className="project-editor-backdrop">
      <section aria-labelledby="project-planning-editor-title" aria-modal="true" className="project-editor is-planning" role="dialog">
        <header>
          <div>
            <span>{project.projectCode || 'Projet catalogue'}</span>
            <h2 id="project-planning-editor-title">{occurrence ? 'Modifier l’opération' : 'Nouvelle opération'}</h2>
          </div>
          <button aria-label="Fermer le formulaire opération" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="project-editor-grid">
            <Field label="Projet" wide><input disabled value={`${project.projectCode || ''} - ${project.title}`.replace(/^ - /, '')} /></Field>
            <Field label="Début *"><input autoFocus onChange={(event) => update('startsOn', event.target.value)} required type="date" value={form.startsOn} /></Field>
            <Field label="Fin *"><input onChange={(event) => update('endsOn', event.target.value)} required type="date" value={form.endsOn} /></Field>
            <Field label="Navire *">
              <select onChange={(event) => update('primaryVesselId', optionalNumber(event.target.value))} required value={form.primaryVesselId ?? ''}>
                <option value="">Choisir un navire</option>
                {eligibleVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}{vessel.acronym ? ` (${vessel.acronym})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Statut"><input onChange={(event) => update('status', event.target.value)} value={form.status} /></Field>
            <Field label="Description / mission" wide><textarea onChange={(event) => update('description', event.target.value)} value={form.description} /></Field>
            <Field label="Loyer d’affrètement">
              <input min="0" onChange={(event) => update('charterHire', optionalNumber(event.target.value))} step="0.01" type="number" value={form.charterHire ?? ''} />
            </Field>
            <Field label="Devise">
              <input maxLength={3} onChange={(event) => update('hireCurrency', event.target.value.toUpperCase())} value={form.hireCurrency} />
            </Field>
            <Field label="Unité">
              <input onChange={(event) => update('hireUnit', event.target.value)} placeholder="jour" value={form.hireUnit} />
            </Field>
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
            Le loyer du contrat est recopié lors de la création puis reste propre à cette opération. Les documents sont classés dans SharePoint · Documents Projets.
          </p>
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <footer>
            <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button disabled={isSaving} type="submit">
              {isSaving ? 'Enregistrement…' : occurrence ? 'Enregistrer les modifications' : 'Ajouter au planning'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
