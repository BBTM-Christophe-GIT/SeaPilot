import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BadgeCheck,
  FileSignature,
  LockKeyhole,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RoleKey } from '../permissions/roles';
import type { CurrentPersonSummary } from '../profiles/profileQueries';
import type { WorkingTimeInterval, WorkingTimePeriodKind, WorkingTimeRegisterStatus } from './workingTimeModel';
import {
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeDayComment,
  saveWorkingTimeInterval,
  transitionWorkingTimeRegister,
  voidWorkingTimeInterval,
  workingTimeErrorMessage,
  type WorkingTimeActiveSignature,
  type WorkingTimeRange,
} from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';

interface WorkingTimeWorkflowPanelProps {
  client: SupabaseClient;
  roles: RoleKey[];
  currentPerson: CurrentPersonSummary | null;
  range: WorkingTimeRange;
  previewMode?: boolean;
}

const STATUS_LABELS: Record<WorkingTimeRegisterStatus, string> = {
  draft: 'Brouillon',
  awaiting_sailor_signature: 'Signature du marin attendue',
  submitted: 'Soumis au contrôle',
  validated: 'Validé et verrouillé',
  reopened: 'Rouvert pour correction',
};

const pad = (value: number) => String(value).padStart(2, '0');

function dateTimeLocal(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Les heures de début et de fin sont obligatoires.');
  return date.toISOString();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPerson(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function SignatureCard({ signature, imageUrl, label }: {
  signature: WorkingTimeActiveSignature | undefined;
  imageUrl: string | undefined;
  label: string;
}) {
  return (
    <div className={`working-time-signature-card ${signature ? 'is-ready' : 'is-missing'}`}>
      <span>{label}</span>
      {imageUrl ? <img alt={`Signature numérisée — ${label}`} src={imageUrl} /> : null}
      {signature ? (
        <strong><FileSignature aria-hidden="true" size={16} /> Signature de profil v{signature.versionNumber}</strong>
      ) : (
        <strong><AlertTriangle aria-hidden="true" size={16} /> Signature de profil absente</strong>
      )}
    </div>
  );
}

export function WorkingTimeWorkflowPanel({
  client,
  roles,
  currentPerson,
  range,
  previewMode = false,
}: WorkingTimeWorkflowPanelProps) {
  const enabled = Boolean(currentPerson && range.start && range.end && range.start <= range.end);
  const { workspace, isLoading, errorMessage, reload } = useWorkingTimeWorkspace(client, enabled, range);
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(currentPerson?.id || null);
  const [periodKind, setPeriodKind] = useState<WorkingTimePeriodKind>('weekly');
  const [periodStart, setPeriodStart] = useState(range.start);
  const [startsAt, setStartsAt] = useState(`${range.start}T08:00`);
  const [endsAt, setEndsAt] = useState(`${range.start}T16:00`);
  const [vesselId, setVesselId] = useState('');
  const [watchGroup, setWatchGroup] = useState('');
  const [intervalComment, setIntervalComment] = useState('');
  const [editingIntervalId, setEditingIntervalId] = useState<number | null>(null);
  const [voidCandidateId, setVoidCandidateId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [dayComments, setDayComments] = useState<Record<string, string>>({});
  const [reopenReason, setReopenReason] = useState('');
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signatureUrls, setSignatureUrls] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedRegister = workspace?.registers.find((register) => register.id === selectedRegisterId) || null;
  const selectedIntervals = useMemo(
    () => workspace?.intervals.filter((interval) => interval.registerId === selectedRegisterId) || [],
    [selectedRegisterId, workspace?.intervals],
  );
  const currentPersonId = workspace?.currentPersonId || currentPerson?.id || 0;
  const isOwnRegister = selectedRegister?.personId === currentPersonId;
  const hasCaptainRole = roles.includes('capitaine');
  const hasManagementValidationRole = roles.includes('admin') || roles.includes('armement');
  const canEdit = selectedRegister?.status === 'draft' || selectedRegister?.status === 'reopened';

  const nonCompliantDates = useMemo(() => {
    if (!workspace || !selectedRegister) return [];
    return Array.from(new Set(workspace.calculations
      .filter((calculation) => calculation.personId === selectedRegister.personId
        && calculation.localWindowEndDate >= selectedRegister.periodStart
        && calculation.localWindowEndDate <= selectedRegister.periodEnd
        && calculation.isCompliant === false)
      .map((calculation) => calculation.localWindowEndDate))).sort();
  }, [selectedRegister, workspace]);

  const currentSignature = workspace?.signatures.find((signature) => signature.personId === currentPersonId);
  const subjectSignature = workspace?.signatures.find((signature) => signature.personId === selectedRegister?.personId);
  const persistedCommentDates = new Set((workspace?.dayComments || [])
    .filter((comment) => comment.registerId === selectedRegister?.id && comment.comment.trim().length >= 2)
    .map((comment) => comment.localWorkDate));
  const missingCaptainComments = nonCompliantDates.filter((date) => !persistedCommentDates.has(date));
  const canValidate = Boolean(
    selectedRegister?.status === 'submitted'
      && !isOwnRegister
      && (hasCaptainRole || hasManagementValidationRole)
      && currentSignature
      && missingCaptainComments.length === 0,
  );
  const canReopen = Boolean(
    selectedRegister
      && ['awaiting_sailor_signature', 'submitted', 'validated'].includes(selectedRegister.status)
      && (hasCaptainRole || hasManagementValidationRole),
  );

  useEffect(() => {
    if (!workspace) return;
    setPersonId((current) => current && workspace.editablePeople.some((person) => person.personId === current)
      ? current
      : workspace.editablePeople[0]?.personId || currentPerson?.id || null);
    setSelectedRegisterId((current) => {
      if (current && workspace.registers.some((register) => register.id === current)) return current;
      return workspace.registers.find((register) => register.personId === workspace.currentPersonId)?.id
        || workspace.registers[0]?.id
        || null;
    });
  }, [currentPerson?.id, workspace]);

  useEffect(() => {
    if (!workspace || !selectedRegister) {
      setDayComments({});
      return;
    }
    setDayComments(Object.fromEntries(workspace.dayComments
      .filter((comment) => comment.registerId === selectedRegister.id)
      .map((comment) => [comment.localWorkDate, comment.comment])));
    setSignatureConsent(false);
    setReopenReason('');
  }, [selectedRegister?.id, workspace]);

  useEffect(() => {
    if (previewMode || !workspace) {
      setSignatureUrls({});
      return;
    }
    const relevant = workspace.signatures.filter((signature) => (
      signature.personId === currentPersonId || signature.personId === selectedRegister?.personId
    ));
    let cancelled = false;
    void Promise.all(relevant.map(async (signature) => {
      const { data } = await client.storage.from(signature.storageBucket).createSignedUrl(signature.storagePath, 600);
      return [signature.id, data?.signedUrl || ''] as const;
    })).then((entries) => {
      if (!cancelled) setSignatureUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    });
    return () => { cancelled = true; };
  }, [client, currentPersonId, previewMode, selectedRegister?.personId, workspace]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setIsSaving(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await action();
      await reload();
      setActionMessage(successMessage);
    } catch (error) {
      setActionError(workingTimeErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function resetIntervalForm() {
    setEditingIntervalId(null);
    setStartsAt(`${selectedRegister?.periodStart || range.start}T08:00`);
    setEndsAt(`${selectedRegister?.periodStart || range.start}T16:00`);
    setVesselId('');
    setWatchGroup('');
    setIntervalComment('');
  }

  function editInterval(interval: WorkingTimeInterval) {
    setEditingIntervalId(interval.id);
    setStartsAt(dateTimeLocal(interval.startsAt));
    setEndsAt(dateTimeLocal(interval.endsAt));
    setVesselId(interval.vesselId ? String(interval.vesselId) : '');
    setWatchGroup(interval.watchGroup || '');
    setIntervalComment(interval.comment || '');
  }

  if (!currentPerson) {
    return <section className="working-time-workflow"><p className="working-time-message is-error">Votre compte doit être relié à une fiche RH pour saisir ou valider des heures.</p></section>;
  }

  return (
    <section aria-labelledby="working-time-registers-title" className="working-time-workflow">
      <header className="working-time-section-heading">
        <div><p>Registres individuels</p><h2 id="working-time-registers-title">Saisie, signature et validation</h2></div>
        <div className="working-time-heading-actions">
          <span>{workspace?.registers.length || 0} registre(s) sur la période</span>
          <button disabled={isLoading || isSaving} onClick={() => void reload()} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Actualiser
          </button>
        </div>
      </header>

      {errorMessage ? <p className="working-time-message is-error" role="alert">{errorMessage}</p> : null}
      {actionError ? <p className="working-time-message is-error" role="alert">{actionError}</p> : null}
      {actionMessage ? <p className="working-time-message is-success" role="status">{actionMessage}</p> : null}
      {isLoading && !workspace ? <div className="admin-state" role="status">Chargement des registres…</div> : null}

      {workspace ? (
        <>
          <div className="working-time-register-create">
            <label>Personne
              <select onChange={(event) => setPersonId(Number(event.target.value))} value={personId || ''}>
                {workspace.editablePeople.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {formatPerson(person.firstName, person.lastName)}{person.isSelf ? ' — moi' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Période
              <select onChange={(event) => {
                const nextKind = event.target.value as WorkingTimePeriodKind;
                setPeriodKind(nextKind);
                if (nextKind === 'monthly') setPeriodStart((current) => `${current.slice(0, 7)}-01`);
              }} value={periodKind}>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
              </select>
            </label>
            <label>Début
              <input onChange={(event) => setPeriodStart(event.target.value)} type="date" value={periodStart} />
            </label>
            <button disabled={isSaving || !personId} onClick={() => void runAction(async () => {
              const registerId = await getOrCreateWorkingTimeRegister(client, { personId: personId!, periodKind, periodStart });
              setSelectedRegisterId(registerId);
            }, 'Le registre est prêt pour la saisie.')} type="button">
              <Plus aria-hidden="true" size={17} /> Ouvrir le registre
            </button>
          </div>

          <div className="working-time-workspace-grid">
            <nav aria-label="Registres accessibles" className="working-time-register-list">
              {workspace.registers.length ? workspace.registers.map((register) => (
                <button
                  className={register.id === selectedRegisterId ? 'is-active' : ''}
                  key={register.id}
                  onClick={() => setSelectedRegisterId(register.id)}
                  type="button"
                >
                  <span>{register.personName}</span>
                  <small>{register.periodStart} → {register.periodEnd}</small>
                  <em className={`is-${register.status}`}>{STATUS_LABELS[register.status]}</em>
                </button>
              )) : <p>Aucun registre sur cette période.</p>}
            </nav>

            {selectedRegister ? (
              <article className="working-time-register-detail">
                <header>
                  <div>
                    <p>{selectedRegister.functionLabel || 'Personnel maritime'}</p>
                    <h3>{selectedRegister.personName}</h3>
                    <span>{selectedRegister.periodStart} → {selectedRegister.periodEnd}</span>
                  </div>
                  <strong className={`working-time-status is-${selectedRegister.status}`}>{STATUS_LABELS[selectedRegister.status]}</strong>
                </header>

                {selectedRegister.status === 'validated' ? (
                  <div className="working-time-lock-note"><LockKeyhole aria-hidden="true" size={18} />Les heures et commentaires sont verrouillés. Une réouverture motivée est nécessaire pour toute correction.</div>
                ) : null}

                <div className="working-time-signatures">
                  <SignatureCard imageUrl={subjectSignature ? signatureUrls[subjectSignature.id] : undefined} label="Titulaire du registre" signature={subjectSignature} />
                  {!isOwnRegister ? <SignatureCard imageUrl={currentSignature ? signatureUrls[currentSignature.id] : undefined} label="Validateur connecté" signature={currentSignature} /> : null}
                </div>

                <section className="working-time-intervals" aria-label="Créneaux de travail">
                  <div className="working-time-subheading"><h4>Créneaux horodatés</h4><span>{selectedIntervals.length} créneau(x)</span></div>
                  {selectedIntervals.length ? (
                    <div className="working-time-interval-list">
                      {selectedIntervals.map((interval) => (
                        <div key={interval.id}>
                          <span><strong>{formatDateTime(interval.startsAt)}</strong> → {formatDateTime(interval.endsAt)}</span>
                          <small>{workspace.vessels.find((vessel) => vessel.id === interval.vesselId)?.name || 'Sans navire'}{interval.watchGroup ? ` · ${interval.watchGroup}` : ''}</small>
                          {canEdit ? <span className="working-time-row-actions">
                            <button onClick={() => editInterval(interval)} type="button"><PenLine aria-hidden="true" size={15} />Corriger</button>
                            <button onClick={() => { setVoidCandidateId(interval.id); setVoidReason(''); }} type="button"><Trash2 aria-hidden="true" size={15} />Retirer</button>
                          </span> : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className="working-time-empty">Aucune heure saisie.</p>}

                  {voidCandidateId ? (
                    <div className="working-time-void-form">
                      <label>Motif du retrait<input onChange={(event) => setVoidReason(event.target.value)} value={voidReason} /></label>
                      <button disabled={isSaving || voidReason.trim().length < 2} onClick={() => void runAction(async () => {
                        await voidWorkingTimeInterval(client, voidCandidateId, voidReason);
                        setVoidCandidateId(null);
                        setVoidReason('');
                      }, 'Le créneau a été retiré sans effacer son historique.')} type="button">Confirmer</button>
                      <button onClick={() => setVoidCandidateId(null)} type="button">Annuler</button>
                    </div>
                  ) : null}

                  {canEdit ? (
                    <form className="working-time-interval-form" onSubmit={(event) => {
                      event.preventDefault();
                      void runAction(async () => {
                        await saveWorkingTimeInterval(client, {
                          registerId: selectedRegister.id,
                          startsAt: localInputToIso(startsAt),
                          endsAt: localInputToIso(endsAt),
                          timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
                          vesselId: vesselId ? Number(vesselId) : null,
                          watchGroup: watchGroup.trim() || null,
                          comment: intervalComment.trim() || null,
                          intervalId: editingIntervalId,
                        });
                        resetIntervalForm();
                      }, editingIntervalId ? 'Le créneau a été corrigé.' : 'Les heures ont été ajoutées au brouillon.');
                    }}>
                      <label>Début<input onChange={(event) => setStartsAt(event.target.value)} required type="datetime-local" value={startsAt} /></label>
                      <label>Fin<input onChange={(event) => setEndsAt(event.target.value)} required type="datetime-local" value={endsAt} /></label>
                      <label>Navire<select onChange={(event) => setVesselId(event.target.value)} value={vesselId}><option value="">Sans navire</option>{workspace.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
                      <label>Bordée<input onChange={(event) => setWatchGroup(event.target.value)} value={watchGroup} /></label>
                      <label className="is-wide">Commentaire<input onChange={(event) => setIntervalComment(event.target.value)} value={intervalComment} /></label>
                      <div className="working-time-form-actions">
                        <button disabled={isSaving} type="submit"><Save aria-hidden="true" size={16} />{editingIntervalId ? 'Enregistrer la correction' : 'Ajouter au brouillon'}</button>
                        {editingIntervalId ? <button onClick={resetIntervalForm} type="button">Annuler</button> : null}
                      </div>
                    </form>
                  ) : null}
                </section>

                {nonCompliantDates.length ? (
                  <section className="working-time-non-compliance" aria-label="Journées non conformes">
                    <div className="working-time-subheading"><h4><AlertTriangle aria-hidden="true" size={17} />Journées non conformes</h4><span>{nonCompliantDates.length}</span></div>
                    <p>Les heures restent enregistrées. Chaque journée doit recevoir un commentaire signé par un capitaine avant validation.</p>
                    {nonCompliantDates.map((date) => (
                      <div key={date}>
                        <label>{date}<textarea disabled={!hasCaptainRole || selectedRegister.status === 'validated'} onChange={(event) => setDayComments((current) => ({ ...current, [date]: event.target.value }))} value={dayComments[date] || ''} /></label>
                        {hasCaptainRole && selectedRegister.status !== 'validated' ? <button disabled={isSaving || (dayComments[date] || '').trim().length < 2} onClick={() => void runAction(
                          () => saveWorkingTimeDayComment(client, { registerId: selectedRegister.id, localWorkDate: date, comment: dayComments[date] }),
                          `Le commentaire capitaine du ${date} est enregistré.`,
                        )} type="button">Enregistrer le commentaire</button> : null}
                      </div>
                    ))}
                  </section>
                ) : null}

                <section className="working-time-workflow-actions" aria-label="Workflow du registre">
                  <h4>Signature et décision</h4>
                  {canEdit ? <button disabled={isSaving || selectedIntervals.length === 0} onClick={() => void runAction(
                    () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'request_sailor_signature' }),
                    'Le registre attend maintenant la signature du marin.',
                  )} type="button"><Send aria-hidden="true" size={17} />Enregistrer le brouillon et demander la signature</button> : null}

                  {selectedRegister.status === 'awaiting_sailor_signature' && isOwnRegister ? (
                    <div className="working-time-sign-action">
                      <label><input checked={signatureConsent} onChange={(event) => setSignatureConsent(event.target.checked)} type="checkbox" />J’appose explicitement ma signature de profil sur ce registre.</label>
                      <button disabled={isSaving || !signatureConsent || !currentSignature} onClick={() => void runAction(
                        () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'sailor_sign' }),
                        'Votre registre a été signé et soumis.',
                      )} type="button"><FileSignature aria-hidden="true" size={17} />Signer et soumettre</button>
                    </div>
                  ) : null}

                  {selectedRegister.status === 'submitted' && isOwnRegister && hasCaptainRole ? (
                    <p className="working-time-separation-note"><LockKeyhole aria-hidden="true" size={17} />Auto-validation interdite : un autre capitaine autorisé, l’Armement ou un administrateur doit valider votre registre.</p>
                  ) : null}

                  {selectedRegister.status === 'submitted' && !isOwnRegister && (hasCaptainRole || hasManagementValidationRole) ? (
                    <button disabled={isSaving || !canValidate} onClick={() => void runAction(
                      () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'captain_validate' }),
                      'Le registre est validé et verrouillé.',
                    )} type="button"><UserCheck aria-hidden="true" size={17} />Contrôler et valider le registre</button>
                  ) : null}

                  {missingCaptainComments.length > 0 && selectedRegister.status === 'submitted' ? <p className="working-time-message is-error">Commentaires capitaine manquants : {missingCaptainComments.join(', ')}.</p> : null}
                  {!currentSignature && ['awaiting_sailor_signature', 'submitted'].includes(selectedRegister.status) ? <p className="working-time-message is-error">Ajoutez d’abord votre signature numérisée dans votre profil utilisateur.</p> : null}

                  {canReopen ? (
                    <div className="working-time-reopen-form">
                      <label>Motif obligatoire<input onChange={(event) => setReopenReason(event.target.value)} placeholder="Décrivez la correction demandée" value={reopenReason} /></label>
                      <button disabled={isSaving || reopenReason.trim().length < 2} onClick={() => void runAction(async () => {
                        await transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'reopen', comment: reopenReason });
                        setReopenReason('');
                      }, 'Le registre a été rouvert et le motif ajouté à l’audit.')} type="button"><RotateCcw aria-hidden="true" size={17} />Réouvrir</button>
                    </div>
                  ) : null}

                  {selectedRegister.status === 'validated' ? <p className="working-time-validated-note"><BadgeCheck aria-hidden="true" size={18} />Validation terminée — historique et signatures figés.</p> : null}
                </section>
              </article>
            ) : <div className="working-time-register-detail working-time-empty"><p>Ouvrez un registre pour commencer la saisie.</p></div>}
          </div>
        </>
      ) : null}
    </section>
  );
}
