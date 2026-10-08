import { ServiceNoteRichTextEditor } from '../serviceNotes/ServiceNoteRichTextEditor';
import { disciplinaryBodyToHtml } from './disciplinaryRichText';
import type { ReactNode } from 'react';
import { FAULTS, REASONS, SANCTIONS, type DisciplinaryForm as Form, type FaultKey, type ReasonKey, type SanctionKey } from './disciplinaryModel';

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'disciplinary-field wide' : 'disciplinary-field'}><span>{label}</span>{children}</label>;
}
export function DisciplinaryForm({ value: f, onChange, disabled = false }: { value: Form; onChange: (value: Form) => void; disabled?: boolean }) {
  const update = <K extends keyof Form>(key: K, value: Form[K]) => onChange({ ...f, [key]: value });
  return <fieldset disabled={disabled} className="disciplinary-form disciplinary-form-fields">
    <Field label="Prénom et NOM du collaborateur"><input value={f.employeeName} onChange={(e) => update('employeeName', e.target.value)} /></Field>
    <Field label="Adresse postale"><textarea rows={2} value={f.address} onChange={(e) => update('address', e.target.value)} /></Field>
    <Field label="Qualification de la faute"><select value={f.fault} onChange={(e) => update('fault', e.target.value as FaultKey)}>{Object.entries(FAULTS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><small>{FAULTS[f.fault].definition}</small></Field>
    <Field label="Sanction envisagée"><select value={f.sanction} onChange={(e) => update('sanction', e.target.value as SanctionKey)}>{Object.entries(SANCTIONS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><small>{SANCTIONS[f.sanction].definition}</small></Field>
    <Field label="Motif" wide><select value={f.reason} onChange={(e) => update('reason', e.target.value as ReasonKey)}>{Object.entries(REASONS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><small>{REASONS[f.reason].definition}</small></Field>
    <div className="disciplinary-field wide"><span>Faits observés</span><ServiceNoteRichTextEditor ariaLabel="Faits observés" toolbarLabel="Mise en forme — Faits observés" disabled={disabled} value={f.facts ? disciplinaryBodyToHtml(f.facts) : ''} onChange={(value) => update('facts', value)} placeholder="Décrire les faits, l’heure, les signes effectivement observés et les conséquences sur le travail." /></div>
    <div className="disciplinary-field wide"><span>Éléments justificatifs</span><ServiceNoteRichTextEditor ariaLabel="Éléments justificatifs" toolbarLabel="Mise en forme — Éléments justificatifs" disabled={disabled} value={f.evidence ? disciplinaryBodyToHtml(f.evidence) : ''} onChange={(value) => update('evidence', value)} placeholder="Constat, témoignage, contrôle autorisé : préciser la date et les conditions de recueil." /></div>
    <div className="disciplinary-field wide"><span>Obligations et consignes applicables</span><ServiceNoteRichTextEditor ariaLabel="Obligations et consignes applicables" toolbarLabel="Mise en forme — Obligations et consignes applicables" disabled={disabled} value={f.rules ? disciplinaryBodyToHtml(f.rules) : ''} onChange={(value) => update('rules', value)} placeholder="Règlement intérieur, consigne de sécurité, contrat, convention collective…" /></div>
    <Field label="Navire / lieu"><input value={f.vessel} onChange={(e) => update('vessel', e.target.value)} /></Field>
    <Field label="Contrat"><input value={f.contractType} onChange={(e) => update('contractType', e.target.value)} placeholder="CDI, CDD…" /></Field>
    <Field label="Date des faits"><input type="date" value={f.factsOn} onChange={(e) => update('factsOn', e.target.value)} /></Field>
    <Field label="Connaissance par l’employeur"><input type="date" value={f.knownOn} onChange={(e) => update('knownOn', e.target.value)} /></Field>
    <label className="disciplinary-check wide"><input type="checkbox" checked={f.optionalInterview} onChange={(e) => update('optionalInterview', e.target.checked)} />Entretien nécessaire ou choisi pour un avertissement / blâme</label>
    <details className="disciplinary-details wide" open={!['avertissement', 'blame'].includes(f.sanction) || f.optionalInterview}>
      <summary>Entretien et suivi des courriers</summary><div className="disciplinary-form">
        <Field label="Date d’envoi / remise de la convocation"><input type="date" value={f.summonsSentOn || ''} onChange={(e) => update('summonsSentOn', e.target.value)} /></Field>
        <Field label="Première présentation / remise de la convocation"><input type="date" value={f.summonsReceivedOn} onChange={(e) => update('summonsReceivedOn', e.target.value)} /></Field>
        <Field label="Entretien (heure de Paris)"><input type="datetime-local" value={f.interviewAt} onChange={(e) => update('interviewAt', e.target.value)} /></Field>
        <Field label="Lieu de l’entretien" wide><input value={f.interviewPlace} onChange={(e) => update('interviewPlace', e.target.value)} /></Field>
        <label className="disciplinary-check wide"><input type="checkbox" checked={f.representatives} onChange={(e) => update('representatives', e.target.checked)} />L’entreprise dispose de représentants du personnel</label>
        {!f.representatives && f.sanction === 'licenciement' ? <Field label="Adresses de consultation de la liste des conseillers" wide><textarea value={f.advisorAddresses} onChange={(e) => update('advisorAddresses', e.target.value)} placeholder="Inspection du travail et mairie compétentes" /></Field> : null}
        <Field label="Explications du collaborateur / absence à l’entretien" wide><textarea value={f.explanations} onChange={(e) => update('explanations', e.target.value)} /></Field>
        <Field label="Date effective d’envoi / remise de la sanction"><input type="date" value={f.notificationOn} onChange={(e) => update('notificationOn', e.target.value)} /><small>Suivi uniquement : aucun courrier n’est envoyé automatiquement.</small></Field>
        <Field label="Jours chômés supplémentaires"><input value={f.extraHolidays} onChange={(e) => update('extraHolidays', e.target.value)} placeholder="2026-12-24, 2026-12-31" /><small>Dates AAAA-MM-JJ séparées par une virgule.</small></Field>
      </div>
    </details>
    <div className="disciplinary-field wide"><span>Modalités de la sanction</span><ServiceNoteRichTextEditor ariaLabel="Modalités de la sanction" toolbarLabel="Mise en forme — Modalités de la sanction" disabled={disabled} value={f.sanctionDetails ? disciplinaryBodyToHtml(f.sanctionDetails) : ''} onChange={(value) => update('sanctionDetails', value)} placeholder="Durée et dates de suspension, affectation proposée, délai de réponse, préavis, indemnités…" /></div>
    {f.fault === 'lourde' ? <Field label="Éléments établissant l’intention de nuire" wide><textarea value={f.harmfulIntent} onChange={(e) => update('harmfulIntent', e.target.value)} /></Field> : null}
    <label className="disciplinary-check wide"><input type="checkbox" checked={f.protectedEmployee} onChange={(e) => update('protectedEmployee', e.target.checked)} />Collaborateur bénéficiant d’une protection particulière</label>
  </fieldset>;
}
