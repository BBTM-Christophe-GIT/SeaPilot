import { CheckCircle2, Clock3, ExternalLink, File, Link2, Paperclip, Ship } from 'lucide-react';
import type { ServiceNote, ServiceNoteAttachment } from './serviceNoteQueries';
import { formatServiceNoteDate } from './serviceNoteQueries';

interface ServiceNoteDocumentProps {
  note: ServiceNote;
  authorSignatureUrl?: string;
  signatureUrls?: Map<number, string>;
  onOpenAttachment?: (attachment: ServiceNoteAttachment) => void;
}
function attachmentIcon(kind: ServiceNoteAttachment['kind']) {
  if (kind === 'file') return <File aria-hidden="true" size={15} />;
  return <Link2 aria-hidden="true" size={15} />;
}

export function ServiceNoteDocument({ note, authorSignatureUrl = '', signatureUrls = new Map(), onOpenAttachment }: ServiceNoteDocumentProps) {
  const authorName = String(note.authorIdentitySnapshot.display_name || note.authorIdentitySnapshot.signer_name || 'Non renseigné');
  const signatures = new Map(note.signatures.map((signature) => [signature.recipientId, signature]));
  const headerCode = note.chronologyCode || (note.status === 'recalled' ? 'Note rappelée' : 'Nouveau brouillon');
  const metadataCode = note.chronologyCode || (note.status === 'recalled' ? 'Retiré lors du rappel' : 'Automatique');
  const audienceLabel = note.scope === 'vessels'
    ? note.targetVessels.map((vessel) => vessel.name).join(', ') || 'Navire(s) à sélectionner'
    : note.scope === 'people'
      ? `${note.targetPersonIds.length || note.recipients.length} personne${(note.targetPersonIds.length || note.recipients.length) > 1 ? 's' : ''}`
      : 'Tous les utilisateurs';

  return (
    <div className="service-note-document" aria-label={`${headerCode} - ${note.subject}`}>
      <article className="service-note-paper service-note-paper-main">
        <div className="service-note-paper-accent" />
        <header className="service-note-paper-header">
          <img alt="BBTM" src="/bbtm-logo.png" />
          <div><span>QHSE · COMMUNICATION INTERNE</span><h2>Note de Service</h2></div>
          <strong>{headerCode}</strong>
        </header>

        <section className="service-note-metadata">
          <div className="is-wide"><span>Objet</span><strong>{note.subject || 'Objet de la note'}</strong></div>
          <div><span>Numéro chrono</span><strong>{metadataCode}</strong></div>
          <div><span>Émetteur</span><strong>{authorName}</strong></div>
          <div><span>Date</span><strong>{formatServiceNoteDate(note.authoredOn)}</strong></div>
          <div><span>Périmètre</span><strong><Ship aria-hidden="true" size={13} /> {audienceLabel}</strong></div>
        </section>

        <div className="service-note-issuer-signature">
          <span>Signature de l’émetteur</span>
          {authorSignatureUrl ? <img alt={`Signature de ${authorName}`} src={authorSignatureUrl} /> : <em>Apposée lors de la diffusion</em>}
        </div>

        <aside className="service-note-reading-rule">
          <CheckCircle2 aria-hidden="true" size={18} />
          <p><strong>Lecture et signature obligatoires</strong><span>Une seule note rassemble les signatures de tous les destinataires.</span></p>
        </aside>

        <section className="service-note-inventory">
          <h3><Paperclip aria-hidden="true" size={16} /> Pièce(s) jointe(s) et référence(s)</h3>
          {note.attachments.length ? (
            <ul>{note.attachments.map((attachment) => (
              <li key={attachment.id}>
                <button onClick={() => onOpenAttachment?.(attachment)} type="button">
                  {attachmentIcon(attachment.kind)}<span>{attachment.displayName}</span><ExternalLink aria-hidden="true" size={13} />
                </button>
              </li>
            ))}</ul>
          ) : <p>Aucune pièce jointe.</p>}
        </section>

        <section className="service-note-message">
          <h3>Message</h3>
          <p>{note.body || 'Le contenu de la note apparaîtra ici.'}</p>
        </section>

        <footer>Document généré par SeaPilot · Registre de signatures partagé</footer>
      </article>

      <article className="service-note-paper service-note-signature-paper">
        <div className="service-note-paper-accent" />
        <header className="service-note-paper-header">
          <img alt="BBTM" src="/bbtm-logo.png" />
          <div><span>{headerCode}</span><h2>Registre de signatures</h2></div>
          <strong>{note.signatures.length}/{note.recipients.length || '—'}</strong>
        </header>
        {note.recipients.length ? (
          <div className="service-note-signature-table" role="table" aria-label="Signatures des destinataires">
            <div className="service-note-signature-row is-header" role="row"><span role="columnheader">Nom et Prénom</span><span role="columnheader">Date et signature</span></div>
            {note.recipients.map((recipient) => {
              const signature = signatures.get(recipient.id);
              const signatureUrl = signature ? signatureUrls.get(signature.id) : '';
              return (
                <div className={`service-note-signature-row${signature ? ' is-signed' : ''}`} key={recipient.id} role="row">
                  <span role="cell"><strong>{`${recipient.firstName} ${recipient.lastName}`.trim() || 'Compte sans profil lié'}</strong><small>{recipient.functionLabel || 'Fonction non renseignée'}</small></span>
                  <span role="cell">
                    {signature ? <><em><CheckCircle2 aria-hidden="true" size={14} /> {signature.signatureKind === 'historical_assumed' ? 'Signature historique validée' : `Signé le ${formatServiceNoteDate(signature.signedAt)}`}</em>{signatureUrl ? <img alt={`Signature de ${recipient.firstName} ${recipient.lastName}`} src={signatureUrl} /> : signature.signatureKind === 'historical_assumed' ? <small>Archive réputée signée · aucune image de profil disponible</small> : null}</> : <em className="is-pending"><Clock3 aria-hidden="true" size={14} /> En attente</em>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="service-note-empty-register"><Clock3 aria-hidden="true" size={24} /><strong>{note.sourceKind === 'sharepoint' ? 'Archive SharePoint' : 'Registre créé à la diffusion'}</strong><span>{note.sourceKind === 'sharepoint' ? 'Cette note historique précède la collecte de signatures SeaPilot.' : 'Les destinataires apparaîtront ici après publication.'}</span></div>
        )}
        <footer>{note.sourceKind === 'sharepoint' ? 'Archive historique réputée signée · dates de signature non reportées.' : 'La date et la signature sont enregistrées sur ce document commun.'}</footer>
      </article>
    </div>
  );
}
