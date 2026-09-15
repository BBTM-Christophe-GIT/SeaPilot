import { Field } from './DisciplinaryForm';
import { frenchDate, type DisciplinaryLetter } from './disciplinaryModel';
import { imageFileDataUrl } from './disciplinaryDocx';

export function DisciplinaryLetterEditor({ letter, onChange, onError }: { letter: DisciplinaryLetter; onChange: (letter: DisciplinaryLetter) => void; onError: (error: string) => void }) {
  const update = (key: keyof DisciplinaryLetter, value: string) => onChange({ ...letter, [key]: value });
  return <div className="disciplinary-letter-editor">
    <div className="disciplinary-form">
      <Field label="Date du courrier"><input type="date" value={letter.date} onChange={(e) => update('date', e.target.value)} /></Field>
      <Field label="Objet"><input value={letter.subject} onChange={(e) => update('subject', e.target.value)} /></Field>
      <Field label="Destinataire"><input value={letter.employeeName} onChange={(e) => update('employeeName', e.target.value)} /></Field>
      <Field label="Adresse du courrier"><textarea rows={2} value={letter.address} onChange={(e) => update('address', e.target.value)} /></Field>
    </div>
    <div className="disciplinary-paper">
      <header><img src="/bbtm-logo.png" alt="BBTM" /><div><strong>BENJAMIN BON TRAVAUX MARITIMES</strong><small>Société par Actions Simplifiée au capital de 30.000 Euros<br />Siège social : 15 impasse du Pou, 50340 Le Rozel</small></div></header>
      <div className="disciplinary-recipient">{letter.employeeName}<br />{letter.address}</div>
      <p className="disciplinary-place">Cherbourg-en-Cotentin, le {frenchDate(letter.date)}</p>
      <strong>Objet : {letter.subject}</strong>
      <textarea aria-label="Corps du courrier modifiable" className="disciplinary-letter-body" value={letter.body} onChange={(e) => update('body', e.target.value)} rows={24} />
      <div className="disciplinary-signature"><Field label="Prénom et NOM de l’émetteur"><input value={letter.emitterName} onChange={(e) => update('emitterName', e.target.value)} /></Field><Field label="Fonction de l’émetteur"><input value={letter.emitterFunction} onChange={(e) => update('emitterFunction', e.target.value)} /></Field>
        {letter.signatureDataUrl ? <img src={letter.signatureDataUrl} alt="Signature de l’émetteur" /> : <small>Signature à ajouter</small>}
        <label className="disciplinary-signature-upload">{letter.signatureDataUrl ? 'Remplacer la signature' : 'Ajouter ma signature'}<input aria-label="Signature de l’émetteur" type="file" accept="image/png,image/jpeg" onChange={(e) => { const file = e.target.files?.[0]; if (file) void imageFileDataUrl(file).then((url) => update('signatureDataUrl', url)).catch((error) => onError(error.message)); }} /></label>
      </div>
      <footer>BBTM sas · Remorquages – Travaux Maritimes – Énergies Marines Renouvelables<br />Siren : 884 601 170 · 4 rue Pierre Guinard · 76600 LE HAVRE · www.bbtm.fr</footer>
    </div>
    <p className="disciplinary-muted">Le fichier Word conserve l’en-tête, le pied de page et la mise en page du modèle BBTM fourni. Vous pourrez aussi le modifier dans Word après son classement.</p>
  </div>;
}
