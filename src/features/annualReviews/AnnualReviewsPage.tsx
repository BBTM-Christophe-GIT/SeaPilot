import {
  ArrowLeft, BellRing, BookOpenCheck, CalendarCheck2, CalendarClock, CheckCircle2,
  Clock3, Download, ExternalLink, FileCheck2, FileSignature, MapPin, Plus, Printer,
  Save, Send, ShieldCheck, UserRoundCheck, Video,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { AnnualReviewQuestionnaire } from './AnnualReviewForm';
import {
  ANNUAL_REVIEW_TITLE,
  annualReviewValidationErrors,
  emptyAnnualReviewAnswers,
  type AnnualReviewAnswers,
  type AnnualReviewTabKey,
} from './annualReviewQuestionnaire';
import {
  acceptAnnualReviewInvitation,
  counterProposeAnnualReview,
  createAnnualReviewInvitation,
  createAnnualReviewReportUrl,
  fetchAnnualReview,
  fetchAnnualReviewPeople,
  fetchAnnualReviewResponses,
  fetchAnnualReviews,
  formatAnnualReviewDateTime,
  managerScheduleAnnualReview,
  notifyAnnualReviewChanged,
  saveAnnualReviewResponse,
  signAndArchiveAnnualReview,
  uploadAnnualReviewReport,
  validateAnnualReviewManagerReport,
  type AnnualReviewPerson,
  type AnnualReviewRecord,
  type AnnualReviewResponseRecord,
  type AnnualReviewStatus,
} from './annualReviewQueries';
import {
  buildAnnualReviewPdf,
  downloadAnnualReviewPdf,
  prepareAnnualReviewPdf,
  printAnnualReviewPdf,
} from './annualReviewPdf';
import './annualReviews.css';

interface AnnualReviewsPageProps {
  recipientRoute?: boolean;
}

interface InvitationForm {
  employeePersonId: string;
  reviewYear: string;
  startsAt: string;
  endsAt: string;
  meetingMode: 'in_person' | 'video';
  meetingLocation: string;
  videoUrl: string;
  proposalNote: string;
}

const STATUS_LABELS: Record<AnnualReviewStatus, string> = {
  invitation_pending: 'Invitation envoyée',
  counter_proposed: 'Nouveau créneau proposé',
  scheduled: 'Planifié · questionnaire ouvert',
  collaborator_submitted: 'Réponses collaborateur remises',
  awaiting_signature: 'Rapport à signer',
  archived: 'Signé et archivé',
};

function localInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialInvitationForm(): InvitationForm {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    employeePersonId: '', reviewYear: String(start.getFullYear()), startsAt: localInputValue(start),
    endsAt: localInputValue(end), meetingMode: 'in_person', meetingLocation: '', videoUrl: '', proposalNote: '',
  };
}

function previewReview(): AnnualReviewRecord {
  const start = new Date(); start.setDate(start.getDate() + 3); start.setHours(10, 0, 0, 0);
  return {
    id: 9901, companyId: 1, reviewYear: start.getFullYear(), employeePersonId: 9303, managerPersonId: 9301,
    employeeName: 'Luc MARTIN', managerName: 'Arthur DEMO', employeeFunction: 'Matelot polyvalent',
    status: 'scheduled', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
    meetingMode: 'in_person', meetingLocation: 'Bureau Armement · Cherbourg', videoUrl: '', proposalNote: 'Prévoir le bilan des objectifs de l’année.',
    proposedByPersonId: 9301, collaboratorSubmittedAt: '', managerValidatedAt: '', collaboratorSignedAt: '',
    managerIdentitySnapshot: {}, managerSignatureSnapshot: {}, collaboratorIdentitySnapshot: {}, collaboratorSignatureSnapshot: {},
    managerReportBucket: '', managerReportPath: '', managerReportFileName: '', finalReportBucket: '', finalReportPath: '', finalReportFileName: '', hrDocumentId: null,
  };
}

function toUtc(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Renseignez une date et une heure valides.');
  return date.toISOString();
}

function reportFileName(review: AnnualReviewRecord): string {
  return `${ANNUAL_REVIEW_TITLE} - ${review.employeeName} - ${review.reviewYear}.pdf`;
}

function statusTone(status: AnnualReviewStatus): string {
  if (status === 'archived') return 'success';
  if (status === 'awaiting_signature' || status === 'counter_proposed') return 'attention';
  return status === 'scheduled' || status === 'collaborator_submitted' ? 'progress' : 'neutral';
}

export function AnnualReviewsPage({ recipientRoute = false }: AnnualReviewsPageProps) {
  const context = useOutletContext<AppShellOutletContext>();
  const params = useParams();
  const navigate = useNavigate();
  const requestedReviewId = Number(params.reviewId);
  const currentPersonId = context.previewMode && recipientRoute
    ? previewReview().employeePersonId
    : context.currentPerson?.id || null;
  const isManagerProfile = context.roles.some((role) => ['admin', 'direction', 'armement', 'capitaine'].includes(role));
  const [reviews, setReviews] = useState<AnnualReviewRecord[]>([]);
  const [people, setPeople] = useState<AnnualReviewPerson[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(Number.isInteger(requestedReviewId) && requestedReviewId > 0 ? requestedReviewId : null);
  const [responses, setResponses] = useState<AnnualReviewResponseRecord[]>([]);
  const [answers, setAnswers] = useState<AnnualReviewAnswers>(emptyAnnualReviewAnswers());
  const [activeTab, setActiveTab] = useState<AnnualReviewTabKey>('guide');
  const [responseView, setResponseView] = useState<'mine' | 'collaborator' | 'manager'>('mine');
  const [invitation, setInvitation] = useState<InvitationForm>(initialInvitationForm);
  const [counterForm, setCounterForm] = useState({ startsAt: '', endsAt: '', note: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [shareChoice, setShareChoice] = useState<'share' | 'private' | ''>('');
  const [hasReadReport, setHasReadReport] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const selectedReview = reviews.find((review) => review.id === selectedReviewId) || null;
  const isReviewManager = Boolean(selectedReview && selectedReview.managerPersonId === currentPersonId);
  const isCollaborator = Boolean(selectedReview && selectedReview.employeePersonId === currentPersonId);
  const ownRole = isReviewManager ? 'manager' : isCollaborator ? 'collaborator' : null;
  const ownResponse = responses.find((response) => response.respondentRole === ownRole);
  const collaboratorResponse = responses.find((response) => response.respondentRole === 'collaborator');
  const managerResponse = responses.find((response) => response.respondentRole === 'manager');

  const load = useCallback(async () => {
    setIsLoading(true); setErrorMessage('');
    try {
      if (context.previewMode) {
        const demo = previewReview();
        setReviews([demo]); setPeople([
          { id: 9303, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot polyvalent', active: true, userId: 'preview-marin' },
          { id: 9304, firstName: 'Élise', lastName: 'ROBERT', functionLabel: 'Cheffe mécanicienne', active: true, userId: 'preview-mechanic' },
        ]);
        setSelectedReviewId((current) => current || demo.id);
        return;
      }
      if (recipientRoute && Number.isInteger(requestedReviewId) && requestedReviewId > 0) {
        const review = await fetchAnnualReview(context.client, requestedReviewId);
        setReviews([review]); setSelectedReviewId(review.id);
      } else {
        const [loadedReviews, loadedPeople] = await Promise.all([
          fetchAnnualReviews(context.client),
          isManagerProfile ? fetchAnnualReviewPeople(context.client) : Promise.resolve([]),
        ]);
        setReviews(loadedReviews); setPeople(loadedPeople.filter((person) => person.id !== currentPersonId));
        setSelectedReviewId((current) => current && loadedReviews.some((review) => review.id === current) ? current : loadedReviews[0]?.id || null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les entretiens.');
    } finally { setIsLoading(false); }
  }, [context.client, context.previewMode, currentPersonId, isManagerProfile, recipientRoute, requestedReviewId]);

  const loadResponses = useCallback(async (review: AnnualReviewRecord | null) => {
    if (!review || context.previewMode) { setResponses([]); setAnswers(emptyAnnualReviewAnswers()); return; }
    try {
      const loaded = await fetchAnnualReviewResponses(context.client, review.id);
      setResponses(loaded);
      const role = review.managerPersonId === currentPersonId ? 'manager' : 'collaborator';
      const own = loaded.find((response) => response.respondentRole === role);
      setAnswers(own?.answers || emptyAnnualReviewAnswers());
      setShareChoice(own?.respondentRole === 'collaborator' && own.shareWithManager !== null ? (own.shareWithManager ? 'share' : 'private') : '');
      setResponseView('mine');
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les réponses.'); }
  }, [context.client, context.previewMode, currentPersonId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadResponses(selectedReview); }, [loadResponses, selectedReview]);

  const displayedAnswers = useMemo(() => {
    if (responseView === 'collaborator') return collaboratorResponse?.answers || emptyAnnualReviewAnswers();
    if (responseView === 'manager') return managerResponse?.answers || emptyAnnualReviewAnswers();
    return answers;
  }, [answers, collaboratorResponse?.answers, managerResponse?.answers, responseView]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (context.previewMode) { setMessage('Préversion : le parcours est interactif, sans écriture dans les données.'); return; }
    setIsSaving(true); setErrorMessage(''); setMessage('');
    try { await action(); setMessage(success); notifyAnnualReviewChanged(); await load(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Action impossible.'); }
    finally { setIsSaving(false); }
  }

  async function sendInvitation() {
    const employeePersonId = Number(invitation.employeePersonId);
    if (!employeePersonId) { setErrorMessage('Sélectionnez un collaborateur actif.'); return; }
    await mutate(async () => {
      const id = await createAnnualReviewInvitation(context.client, {
        employeePersonId, reviewYear: Number(invitation.reviewYear), startsAt: toUtc(invitation.startsAt), endsAt: toUtc(invitation.endsAt),
        meetingMode: invitation.meetingMode, meetingLocation: invitation.meetingLocation, videoUrl: invitation.videoUrl, proposalNote: invitation.proposalNote,
      });
      setSelectedReviewId(id); setIsCreating(false); setInvitation(initialInvitationForm());
    }, 'L’invitation a été envoyée dans la cloche du collaborateur.');
  }

  async function saveResponse(submit = false) {
    if (!selectedReview || !ownRole) return;
    const errors = submit ? annualReviewValidationErrors(answers) : [];
    if (errors.length) { setErrorMessage(errors.join(' ')); return; }
    if (submit && ownRole === 'collaborator' && !shareChoice) { setErrorMessage('Choisissez si vos réponses peuvent être partagées avec le manager.'); return; }
    await mutate(() => saveAnnualReviewResponse(context.client, selectedReview.id, answers, submit, shareChoice === '' ? null : shareChoice === 'share'), submit ? 'Vos réponses ont été remises. Votre choix de confidentialité a été enregistré.' : 'Brouillon enregistré.');
  }

  async function personalPdf(print = false) {
    if (!selectedReview) return;
    setIsSaving(true); setErrorMessage('');
    try {
      const generated = await buildAnnualReviewPdf(await prepareAnnualReviewPdf(context.client, selectedReview, answers, 'personal'));
      if (print) printAnnualReviewPdf(generated); else downloadAnnualReviewPdf(generated);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible de générer le PDF.'); }
    finally { setIsSaving(false); }
  }

  async function validateManager() {
    if (!selectedReview || !isReviewManager) return;
    const errors = annualReviewValidationErrors(answers);
    if (errors.length) { setErrorMessage(errors.join(' ')); return; }
    setIsSaving(true); setErrorMessage(''); setMessage('');
    try {
      await saveAnnualReviewResponse(context.client, selectedReview.id, answers, false, false);
      const generated = await buildAnnualReviewPdf(await prepareAnnualReviewPdf(context.client, selectedReview, answers, 'manager'));
      const fileName = reportFileName(selectedReview);
      const uploaded = await uploadAnnualReviewReport(context.client, selectedReview, 'manager', fileName, generated.blob);
      await validateAnnualReviewManagerReport(context.client, selectedReview.id, uploaded.path, fileName, generated.blob, uploaded.sha256);
      setMessage('Rapport validé et transmis au collaborateur pour lecture et signature.'); notifyAnnualReviewChanged(); await load();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible de valider le rapport.'); }
    finally { setIsSaving(false); }
  }

  async function openStoredReport(final = false) {
    if (!selectedReview) return;
    try { window.open(await createAnnualReviewReportUrl(context.client, selectedReview, final), '_blank', 'noopener,noreferrer'); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible d’ouvrir le rapport.'); }
  }

  async function signFinalReport() {
    if (!selectedReview || !managerResponse) { setErrorMessage('Le rapport du manager n’est pas disponible.'); return; }
    if (!hasReadReport) { setErrorMessage('Confirmez avoir lu le rapport avant de le signer.'); return; }
    setIsSaving(true); setErrorMessage(''); setMessage('');
    try {
      const generated = await buildAnnualReviewPdf(await prepareAnnualReviewPdf(context.client, selectedReview, managerResponse.answers, 'final'));
      const fileName = reportFileName(selectedReview);
      const uploaded = await uploadAnnualReviewReport(context.client, selectedReview, 'final', fileName, generated.blob);
      await signAndArchiveAnnualReview(context.client, selectedReview.id, uploaded.path, fileName, generated.blob, uploaded.sha256);
      setMessage('Rapport signé et archivé dans votre Dossier collaborateur.'); notifyAnnualReviewChanged(); window.dispatchEvent(new Event('hr-documents:changed')); await load();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible de signer le rapport.'); }
    finally { setIsSaving(false); }
  }

  if (isLoading) return <div className="annual-review-state" role="status">Chargement des entretiens…</div>;

  return (
    <section className="annual-review-page">
      <header className="annual-review-command-header">
        <div><p className="module-family">Ressources Humaines</p><h1>{ANNUAL_REVIEW_TITLE}</h1><span>Planifier, préparer, conduire et archiver l’entretien dans un parcours confidentiel.</span></div>
        <div>
          {recipientRoute ? <button className="is-secondary" onClick={() => navigate('/')} type="button"><ArrowLeft size={17} />Accueil</button> : null}
          <button className="is-secondary" onClick={() => setActiveTab('guide')} type="button"><BookOpenCheck size={17} />Guide du collaborateur</button>
          {!recipientRoute && isManagerProfile ? <button onClick={() => { setIsCreating(true); setSelectedReviewId(null); }} type="button"><Plus size={17} />Nouvel entretien</button> : null}
        </div>
      </header>

      {errorMessage ? <div className="annual-review-alert is-error" role="alert">{errorMessage}</div> : null}
      {message ? <div className="annual-review-alert is-success" role="status"><CheckCircle2 size={17} />{message}</div> : null}

      <div className={`annual-review-layout${recipientRoute ? ' is-recipient' : ''}`}>
        {!recipientRoute ? <aside className="annual-review-list-panel"><header><div><strong>Campagnes</strong><span>{reviews.length} entretien{reviews.length > 1 ? 's' : ''}</span></div></header>{reviews.length ? <div>{reviews.map((review) => <button className={selectedReviewId === review.id ? 'is-active' : ''} key={review.id} onClick={() => { setSelectedReviewId(review.id); setIsCreating(false); }} type="button"><span className={`annual-review-status-dot is-${statusTone(review.status)}`} /><span><strong>{review.employeeName}</strong><small>{review.reviewYear} · {formatAnnualReviewDateTime(review.startsAt)}</small><em>{STATUS_LABELS[review.status]}</em></span></button>)}</div> : <p>Aucun entretien créé.</p>}</aside> : null}

        <main className="annual-review-workspace">
          {isCreating ? <InvitationEditor form={invitation} isSaving={isSaving} onChange={setInvitation} onSend={() => void sendInvitation()} people={people} /> : selectedReview ? (
            <>
              <ReviewSummary review={selectedReview} />
              <WorkflowActions
                answers={answers} collaboratorResponse={collaboratorResponse} counterForm={counterForm} hasReadReport={hasReadReport}
                isCollaborator={isCollaborator} isManager={isReviewManager} isSaving={isSaving} managerResponse={managerResponse}
                onAccept={() => void mutate(() => acceptAnnualReviewInvitation(context.client, selectedReview.id), 'Invitation acceptée. Le rendez-vous apparaît maintenant dans le Planning.')}
                onAcceptCounter={() => void mutate(() => managerScheduleAnnualReview(context.client, selectedReview.id, true), 'Le nouveau créneau est accepté et ajouté au Planning.')}
                onCounterChange={setCounterForm}
                onCounter={() => void mutate(() => counterProposeAnnualReview(context.client, selectedReview.id, toUtc(counterForm.startsAt), toUtc(counterForm.endsAt), counterForm.note), 'Votre nouveau créneau a été envoyé au manager.')}
                onDownload={() => void personalPdf(false)} onPrint={() => void personalPdf(true)} onOpenReport={() => void openStoredReport(false)}
                onReadChange={setHasReadReport} onSave={() => void saveResponse(false)} onSign={() => void signFinalReport()}
                onSubmit={() => void saveResponse(true)} onValidate={() => void validateManager()} review={selectedReview}
                shareChoice={shareChoice} onShareChoice={setShareChoice}
              />
              {(selectedReview.status === 'scheduled' || selectedReview.status === 'collaborator_submitted') && ownRole ? (
                <section className="annual-review-response-area">
                  <header className="annual-review-response-switcher"><div><strong>Questionnaire</strong><span>{ownRole === 'manager' ? 'Réponses du management' : 'Vos réponses personnelles'}</span></div><div><button className={responseView === 'mine' ? 'is-active' : ''} onClick={() => setResponseView('mine')} type="button">Mes réponses</button>{isReviewManager && collaboratorResponse ? <button className={responseView === 'collaborator' ? 'is-active' : ''} onClick={() => setResponseView('collaborator')} type="button">Réponses partagées du collaborateur</button> : null}</div></header>
                  {isReviewManager && selectedReview.status === 'collaborator_submitted' && !collaboratorResponse ? <div className="annual-review-privacy"><ShieldCheck size={18} /><span><strong>Réponses privées</strong>Le collaborateur a remis son questionnaire sans autoriser son partage.</span></div> : null}
                  <AnnualReviewQuestionnaire activeTab={activeTab} answers={displayedAnswers} onChange={setAnswers} onTabChange={setActiveTab} readOnly={responseView !== 'mine' || Boolean(ownResponse?.submittedAt)} />
                </section>
              ) : null}
              {(selectedReview.status === 'awaiting_signature' || selectedReview.status === 'archived') && managerResponse ? <section className="annual-review-response-area"><header className="annual-review-response-switcher"><div><strong>Rapport final</strong><span>Seules les réponses du management sont reprises dans le document.</span></div></header><AnnualReviewQuestionnaire activeTab={activeTab} answers={managerResponse.answers} onChange={() => undefined} onTabChange={setActiveTab} readOnly /></section> : null}
              {selectedReview.status === 'archived' ? <button className="annual-review-archive-link" onClick={() => void openStoredReport(true)} type="button"><FileCheck2 size={18} /><span><strong>Rapport signé archivé</strong>{selectedReview.finalReportFileName}</span><ExternalLink size={16} /></button> : null}
            </>
          ) : <section className="annual-review-empty"><CalendarCheck2 size={34} /><h2>Préparez la campagne d’entretiens</h2><p>Sélectionnez un entretien ou envoyez une invitation à un collaborateur actif.</p>{isManagerProfile ? <button onClick={() => setIsCreating(true)} type="button"><Plus size={17} />Nouvel entretien</button> : null}</section>}
        </main>
      </div>
    </section>
  );
}

function InvitationEditor({ form, people, isSaving, onChange, onSend }: { form: InvitationForm; people: AnnualReviewPerson[]; isSaving: boolean; onChange: (form: InvitationForm) => void; onSend: () => void }) {
  return <section className="annual-review-editor"><header><span><BellRing size={22} /></span><div><p>Nouvelle invitation</p><h2>Proposer un rendez-vous</h2></div></header><div className="annual-review-editor-grid"><label>Collaborateur actif<select required value={form.employeePersonId} onChange={(event) => onChange({ ...form, employeePersonId: event.target.value })}><option value="">Sélectionner une personne</option>{people.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName.toUpperCase()} · {person.functionLabel}</option>)}</select></label><label>Année de l’entretien<input min="2020" max="2200" onChange={(event) => onChange({ ...form, reviewYear: event.target.value })} type="number" value={form.reviewYear} /></label><label>Date et heure de début<input min={localInputValue(new Date())} onChange={(event) => onChange({ ...form, startsAt: event.target.value })} type="datetime-local" value={form.startsAt} /></label><label>Date et heure de fin<input min={form.startsAt} onChange={(event) => onChange({ ...form, endsAt: event.target.value })} type="datetime-local" value={form.endsAt} /></label></div><fieldset className="annual-review-meeting-mode"><legend>Modalité</legend><label className={form.meetingMode === 'in_person' ? 'is-selected' : ''}><input checked={form.meetingMode === 'in_person'} onChange={() => onChange({ ...form, meetingMode: 'in_person', videoUrl: '' })} type="radio" /><MapPin size={17} />Lieu physique</label><label className={form.meetingMode === 'video' ? 'is-selected' : ''}><input checked={form.meetingMode === 'video'} onChange={() => onChange({ ...form, meetingMode: 'video', meetingLocation: '' })} type="radio" /><Video size={17} />Visioconférence</label></fieldset>{form.meetingMode === 'in_person' ? <label className="annual-review-full-field">Lieu<input placeholder="Ex. Bureau Armement · Cherbourg" onChange={(event) => onChange({ ...form, meetingLocation: event.target.value })} value={form.meetingLocation} /></label> : <label className="annual-review-full-field">Lien visio<input placeholder="https://…" onChange={(event) => onChange({ ...form, videoUrl: event.target.value })} type="url" value={form.videoUrl} /></label>}<label className="annual-review-full-field">Message facultatif<textarea maxLength={1_000} onChange={(event) => onChange({ ...form, proposalNote: event.target.value })} rows={3} value={form.proposalNote} /></label><footer><button disabled={isSaving} onClick={onSend} type="button"><Send size={17} />Envoyer l’invitation</button></footer></section>;
}

function ReviewSummary({ review }: { review: AnnualReviewRecord }) {
  return <header className="annual-review-summary"><div className="annual-review-avatar">{review.employeeName.split(/\s+/u).slice(0, 2).map((part) => part[0]).join('')}</div><div><span className={`annual-review-status is-${statusTone(review.status)}`}>{STATUS_LABELS[review.status]}</span><h2>{review.employeeName}</h2><p>{review.employeeFunction || 'Fonction non renseignée'} · Entretien {review.reviewYear}</p></div><dl><div><dt><CalendarClock size={15} />Date</dt><dd>{formatAnnualReviewDateTime(review.startsAt)}</dd></div><div><dt>{review.meetingMode === 'video' ? <Video size={15} /> : <MapPin size={15} />}{review.meetingMode === 'video' ? 'Visio' : 'Lieu'}</dt><dd>{review.meetingMode === 'video' ? <a href={review.videoUrl} rel="noreferrer" target="_blank">Ouvrir le lien <ExternalLink size={13} /></a> : review.meetingLocation}</dd></div><div><dt><UserRoundCheck size={15} />Manager</dt><dd>{review.managerName}</dd></div></dl>{review.proposalNote ? <blockquote>{review.proposalNote}</blockquote> : null}</header>;
}

function WorkflowActions(props: {
  review: AnnualReviewRecord; isCollaborator: boolean; isManager: boolean; isSaving: boolean;
  counterForm: { startsAt: string; endsAt: string; note: string }; onCounterChange: (value: { startsAt: string; endsAt: string; note: string }) => void;
  collaboratorResponse?: AnnualReviewResponseRecord; managerResponse?: AnnualReviewResponseRecord; answers: AnnualReviewAnswers;
  shareChoice: 'share' | 'private' | ''; onShareChoice: (value: 'share' | 'private') => void; hasReadReport: boolean; onReadChange: (value: boolean) => void;
  onAccept: () => void; onCounter: () => void; onAcceptCounter: () => void; onSave: () => void; onSubmit: () => void; onValidate: () => void;
  onDownload: () => void; onPrint: () => void; onOpenReport: () => void; onSign: () => void;
}) {
  const { review } = props;
  if (props.isCollaborator && review.status === 'invitation_pending') return <section className="annual-review-action-card is-invitation"><div><BellRing size={23} /><span><strong>Répondez à l’invitation</strong>Ce rendez-vous n’apparaîtra dans le Planning qu’après accord.</span></div><div className="annual-review-primary-actions"><button disabled={props.isSaving} onClick={props.onAccept} type="button"><CalendarCheck2 size={17} />Accepter le créneau</button></div><details><summary>Proposer un nouvel horaire</summary><div className="annual-review-counter-grid"><label>Nouveau début<input onChange={(event) => props.onCounterChange({ ...props.counterForm, startsAt: event.target.value })} type="datetime-local" value={props.counterForm.startsAt} /></label><label>Nouvelle fin<input onChange={(event) => props.onCounterChange({ ...props.counterForm, endsAt: event.target.value })} type="datetime-local" value={props.counterForm.endsAt} /></label><label>Message<textarea onChange={(event) => props.onCounterChange({ ...props.counterForm, note: event.target.value })} rows={2} value={props.counterForm.note} /></label><button disabled={props.isSaving} onClick={props.onCounter} type="button"><Clock3 size={17} />Envoyer la proposition</button></div></details></section>;
  if (props.isManager && review.status === 'counter_proposed') return <section className="annual-review-action-card is-invitation"><div><Clock3 size={23} /><span><strong>Nouveau créneau proposé</strong>Le Planning sera mis à jour dès votre acceptation.</span></div><button disabled={props.isSaving} onClick={props.onAcceptCounter} type="button"><CalendarCheck2 size={17} />Accepter le nouveau créneau</button></section>;
  if ((review.status === 'scheduled' || review.status === 'collaborator_submitted') && (props.isCollaborator || props.isManager)) {
    const submitted = props.isCollaborator && Boolean(props.collaboratorResponse?.submittedAt);
    return <section className="annual-review-action-card"><div><FileSignature size={23} /><span><strong>{props.isManager ? 'Questionnaire du management' : 'Votre questionnaire'}</strong>{submitted ? 'Vos réponses ont été remises et sont maintenant figées.' : 'Enregistrez un brouillon ou finalisez vos réponses.'}</span></div>{props.isCollaborator ? <div className="annual-review-export-actions"><button className="is-secondary" disabled={props.isSaving} onClick={props.onDownload} type="button"><Download size={16} />Télécharger mes réponses</button><button className="is-secondary" disabled={props.isSaving} onClick={props.onPrint} type="button"><Printer size={16} />Imprimer</button></div> : null}{props.isCollaborator && !submitted ? <fieldset className="annual-review-share-choice"><legend>Confidentialité de vos réponses</legend><label className={props.shareChoice === 'share' ? 'is-selected' : ''}><input checked={props.shareChoice === 'share'} onChange={() => props.onShareChoice('share')} type="radio" /><strong>Partager avec le manager</strong><small>Le manager pourra consulter vos réponses dans SeaPilot.</small></label><label className={props.shareChoice === 'private' ? 'is-selected' : ''}><input checked={props.shareChoice === 'private'} onChange={() => props.onShareChoice('private')} type="radio" /><strong>Garder mes réponses privées</strong><small>Le manager sera seulement informé que le questionnaire est terminé.</small></label></fieldset> : null}<div className="annual-review-primary-actions">{!submitted ? <button className="is-secondary" disabled={props.isSaving} onClick={props.onSave} type="button"><Save size={17} />Enregistrer le brouillon</button> : null}{props.isCollaborator && !submitted ? <button disabled={props.isSaving} onClick={props.onSubmit} type="button"><Send size={17} />Remettre mes réponses</button> : null}{props.isManager ? <button disabled={props.isSaving || review.status !== 'collaborator_submitted'} onClick={props.onValidate} type="button"><FileCheck2 size={17} />Valider et transmettre le rapport</button> : null}</div>{props.isManager && review.status !== 'collaborator_submitted' ? <small className="annual-review-wait-note">Validation disponible après remise des réponses du collaborateur.</small> : null}</section>;
  }
  if (props.isCollaborator && review.status === 'awaiting_signature') return <section className="annual-review-action-card is-signature"><div><FileSignature size={23} /><span><strong>Lire et signer le rapport</strong>Le rapport contient uniquement les réponses validées par le management.</span></div><button className="is-secondary" onClick={props.onOpenReport} type="button"><ExternalLink size={16} />Lire le rapport PDF</button><label className="annual-review-read-confirm"><input checked={props.hasReadReport} onChange={(event) => props.onReadChange(event.target.checked)} type="checkbox" />J’ai lu le rapport et je confirme vouloir le signer avec ma signature enregistrée.</label><button disabled={!props.hasReadReport || props.isSaving} onClick={props.onSign} type="button"><FileSignature size={17} />Signer et archiver</button></section>;
  if (review.status === 'archived') return <section className="annual-review-action-card is-complete"><div><CheckCircle2 size={23} /><span><strong>Entretien terminé</strong>Le rapport signé est archivé dans le Dossier collaborateur.</span></div></section>;
  return null;
}
