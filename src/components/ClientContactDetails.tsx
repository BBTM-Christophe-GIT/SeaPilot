import './clientContactDetails.css';

export interface ClientContactInfo {
  representedBy?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** A postal block from existing client fields; this view never writes to the client record. */
export function ClientContactDetails({ contact, heading = 'Coordonnées du client' }: { contact: ClientContactInfo; heading?: string }) {
  const text = (value?: string | null) => value?.trim() || '';
  const address = [text(contact.address), [text(contact.postalCode), text(contact.city)].filter(Boolean).join(' '), text(contact.country)].filter(Boolean).join('\n');
  const name = text(contact.representedBy), phone = text(contact.phone), email = text(contact.email);
  return <section className="sp-client-contact-details" aria-label={heading}>
    <h4>{heading}</h4>
    {name || address || phone || email ? <dl>
      {name && <div className="is-wide"><dt>Contact</dt><dd>{name}</dd></div>}
      {address && <div className="is-wide"><dt>Adresse</dt><dd><address>{address}</address></dd></div>}
      {phone && <div><dt>Téléphone</dt><dd>{phone}</dd></div>}
      {email && <div><dt>E-mail</dt><dd>{email}</dd></div>}
    </dl> : <p>Coordonnées non renseignées.</p>}
  </section>;
}
