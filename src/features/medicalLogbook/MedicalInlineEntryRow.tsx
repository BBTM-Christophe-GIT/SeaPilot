import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { validateMedicalDraft, type MedicalDraft, type MedicalSigner } from './medicalLogbookModel';
import { MedicalSignaturePreview } from './MedicalSignaturePreview';

export function MedicalInlineEntryRow({ initial, editing, busy, locked = false, error, signer, signerLoading, signerError, signerUrl, signatureLoading, signatureUnavailable, autoFocus = false, onDirtyChange, onReloadSigner, onSave, onCancel }: {
  initial: MedicalDraft; editing: boolean; busy: boolean; error: string;
  signer: MedicalSigner | null; signerLoading: boolean; signerError: string; signerUrl?: string;
  signatureLoading: boolean; signatureUnavailable: boolean;
  autoFocus?: boolean; onDirtyChange?: (dirty: boolean) => void;
  locked?: boolean;
  onReloadSigner: () => void; onSave: (draft: MedicalDraft) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MedicalDraft>(initial);
  const [validation, setValidation] = useState('');
  const original = useRef(initial).current;
  const formId = useId();
  const feedbackId = useId();
  const patientInput = useRef<HTMLInputElement>(null);
  const feedback = validation || error;
  const describedBy = feedback ? feedbackId : undefined;
  const disabled = busy || locked;

  useEffect(() => { if (autoFocus) patientInput.current?.focus({ preventScroll: true }); }, [autoFocus]);

  function field<K extends keyof MedicalDraft>(key: K, value: MedicalDraft[K]) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDirtyChange?.(next.occurred_on !== original.occurred_on || next.occurred_time !== original.occurred_time
      || next.patient_name.trim() !== original.patient_name.trim() || next.injury_illness.trim() !== original.injury_illness.trim()
      || next.treatment_medicines.trim() !== original.treatment_medicines.trim());
    setValidation('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || signerLoading || !signer?.signature) return;
    const values = new FormData(event.currentTarget);
    const text = (name: keyof MedicalDraft) => String(values.get(name) ?? '');
    const submitted: MedicalDraft = {
      occurred_on: text('occurred_on'), occurred_time: text('occurred_time'), patient_name: text('patient_name'),
      injury_illness: text('injury_illness'), treatment_medicines: text('treatment_medicines'), first_aider_name: signer.signer_name,
    };
    const problem = validateMedicalDraft(submitted);
    if (problem) {
      setValidation(problem);
      const invalid = Array.from(event.currentTarget.elements).find((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? !element.validity.valid || !element.value.trim() : false);
      if (invalid instanceof HTMLElement) invalid.focus();
      return;
    }
    onSave(submitted);
  }

  return <>
    <tr className="medical-inline-row" aria-label={editing ? 'Modifier une entrée médicale' : 'Nouvelle entrée médicale'} aria-busy={busy || undefined}>
      <td><label className="medical-sr-only" htmlFor={`${formId}-date`}>Date</label><input id={`${formId}-date`} form={formId} name="occurred_on" type="date" required disabled={disabled} value={draft.occurred_on} aria-describedby={describedBy} onChange={(event) => field('occurred_on', event.target.value)} /></td>
      <td><label className="medical-sr-only" htmlFor={`${formId}-time`}>Heure</label><input id={`${formId}-time`} form={formId} name="occurred_time" type="time" required disabled={disabled} value={draft.occurred_time} aria-describedby={describedBy} onChange={(event) => field('occurred_time', event.target.value)} /></td>
      <td><label className="medical-sr-only" htmlFor={`${formId}-patient`}>Nom du patient</label><input ref={patientInput} id={`${formId}-patient`} form={formId} name="patient_name" required disabled={disabled} maxLength={160} autoComplete="off" value={draft.patient_name} aria-describedby={describedBy} onChange={(event) => field('patient_name', event.target.value)} /></td>
      <td><label className="medical-sr-only" htmlFor={`${formId}-injury`}>Blessure / Maladie</label><textarea id={`${formId}-injury`} form={formId} name="injury_illness" required disabled={disabled} rows={3} maxLength={4000} value={draft.injury_illness} aria-describedby={describedBy} onChange={(event) => field('injury_illness', event.target.value)} /></td>
      <td><label className="medical-sr-only" htmlFor={`${formId}-treatment`}>Traitement / Médicaments administrés</label><textarea id={`${formId}-treatment`} form={formId} name="treatment_medicines" required disabled={disabled} rows={3} maxLength={4000} value={draft.treatment_medicines} aria-describedby={describedBy} onChange={(event) => field('treatment_medicines', event.target.value)} /></td>
      <td><label className="medical-sr-only" htmlFor={`${formId}-aider`}>Secouriste</label><input id={`${formId}-aider`} readOnly disabled={disabled} value={signer?.signer_name || ''} /></td>
      <td><div className="medical-inline-signature" aria-label="Signature personnelle du compte connecté">
        {signerLoading ? <p role="status">Chargement de votre signature…</p> : signerError ? <p className="medical-error" role="alert">{signerError}</p>
          : signer?.signature ? <MedicalSignaturePreview signature={signer.signature} url={signerUrl} loading={signatureLoading} unavailable={signatureUnavailable} />
            : <p>Ajoutez d’abord votre signature dans le module Signature de votre profil utilisateur.</p>}
        {signer?.person_id && !signer.signature ? <Link to={`/modules/humanResources?person=${signer.person_id}&section=signature`} aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>Ouvrir mon module Signature</Link> : null}
        <button className="sp-button sp-button--secondary" type="button" disabled={disabled || signerLoading} onClick={onReloadSigner}>Actualiser ma signature</button>
      </div></td>
      <td>{editing ? <form id={formId} aria-label="Corriger l’entrée médicale" className="medical-inline-actions" noValidate onSubmit={submit}>
        <button className="sp-button sp-button--primary" type="submit" disabled={disabled || signerLoading || !signer?.signature}><Save size={15} aria-hidden="true" />{busy ? 'Enregistrement…' : 'Enregistrer l’entrée'}</button>
        <button className="sp-button sp-button--secondary" type="button" disabled={disabled} onClick={onCancel}><X size={15} aria-hidden="true" />Annuler</button>
      </form> : <span className="medical-ready-label">À compléter</span>}</td>
    </tr>
    <tr className="medical-inline-feedback"><td colSpan={8}>
      {editing ? <>
        <p>Votre signature de profil actuelle sera appliquée à la correction. La version précédente restera dans l’historique.</p>
        {feedback ? <p className="medical-error" role="alert" id={feedbackId}>{feedback}</p> : null}
      </> : <form id={formId} aria-label="Ajouter une entrée médicale" className="medical-ready-actions" noValidate onSubmit={submit}>
        <div><button className="sp-button sp-button--primary" type="submit" disabled={disabled || signerLoading || !signer?.signature}><Plus size={17} aria-hidden="true" />{busy ? 'Enregistrement…' : 'Ajouter une ligne'}</button>
          <button className="sp-button sp-button--secondary" type="button" aria-label="Effacer la ligne" disabled={disabled} onClick={onCancel}>Effacer</button></div>
        <p>Enregistre la ligne ci-dessus avec votre signature de profil.</p>
        {feedback ? <p className="medical-error" role="alert" id={feedbackId}>{feedback}</p> : null}
      </form>}
    </td></tr>
  </>;
}
