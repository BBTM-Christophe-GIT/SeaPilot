import { Radio } from 'lucide-react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { SEA_RADIO_VERIFIED_ON, seaOperationRadioContacts, type SeaRadioContact } from './seaOperationRadio';
import './seaOperationNavigation.css';

export function SeaOperationRadioPanel({ waypoints }: { waypoints: readonly SeaOperationWaypoint[] }) {
  const result = seaOperationRadioContacts(waypoints);
  const renderContact = (contact: SeaRadioContact & { distanceNm: number }) => <li className="so-radio-card" key={contact.id}>
    <strong>{contact.name}</strong><span>{contact.area}</span>
    <dl><div><dt>VHF</dt><dd>Canal {contact.vhf}</dd></div>{contact.phone && <div><dt>Tél.</dt><dd><a href={`tel:${contact.phone.replaceAll(' ', '')}`}>{contact.phone}</a></dd></div>}{contact.mmsi && <div><dt>MMSI</dt><dd>{contact.mmsi}</dd></div>}</dl>
    <small>Repère à ≈ {contact.distanceNm.toFixed(0)} M de la route · <a href={contact.source} target="_blank" rel="noopener noreferrer">{contact.sourceLabel}</a></small>
  </li>;
  return <section className="so-radio-panel" aria-label="Contacts VHF de la route">
    <h3><Radio size={17} aria-hidden="true" />Contacts VHF de la route</h3>
    <p className="so-help">Suggestions par proximité des coordonnées et des segments : centres à moins de 80 M, ports à moins de 10 M. Cette distance n’indique ni la portée radio, ni la compétence SAR ou VTS.</p>
    {!result.validPoints ? <p>Renseignez au moins une latitude et une longitude valides pour afficher les contacts.</p> : <>
      <p className="so-radio-emergency">Détresse en mer : VHF canal 16 · <a href="https://www.mer.gouv.fr/surveillance-et-sauvetage-en-mer" target="_blank" rel="noopener noreferrer">France</a> / <a href="https://www.gov.uk/guidance/hm-coastguard-rescue-coordination-centre-contact-details" target="_blank" rel="noopener noreferrer">Royaume-Uni</a></p>
      {result.invalidPoints > 0 && <p className="so-help">{result.invalidPoints} point{result.invalidPoints > 1 ? 's' : ''} sans coordonnées valides : les segments correspondants ne sont pas analysés.</p>}
      {(['rescue', 'port'] as const).map((kind) => <div key={kind}><h4>{kind === 'rescue' ? 'Centres CROSS / HM Coastguard proches' : 'Contacts portuaires proches'}</h4>{result.contacts.some((contact) => contact.kind === kind) ? <ul>{result.contacts.filter((contact) => contact.kind === kind).map(renderContact)}</ul> : <p className="so-help">Aucun contact référencé à proximité.</p>}</div>)}
    </>}
    <p className="so-help">Répertoire initial non exhaustif : Manche, Atlantique français et sud de l’Angleterre. Coordonnées des repères arrondies. Coordonnées de contact vérifiées le {new Date(`${SEA_RADIO_VERIFIED_ON}T12:00:00Z`).toLocaleDateString('fr-FR')}, à confirmer dans les publications nautiques à jour.</p>
  </section>;
}
