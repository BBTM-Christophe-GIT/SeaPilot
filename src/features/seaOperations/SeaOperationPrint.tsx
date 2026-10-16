import type { ReactNode } from 'react';
import {
  DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS,
  SEA_OPERATION_SOURCE, SEA_OPERATION_SUPPLY_ITEMS,
} from './seaOperationModel';
import type { SeaOperationAnswer, SeaOperationCheck, SeaOperationPortService } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import './seaOperationPrint.css';

const blank = 'À renseigner';
const text = (value: string | null | undefined) => value?.trim() ? value : blank;
const answer = (value: SeaOperationAnswer) => value === 'yes' ? 'Oui' : value === 'no' ? 'Non' : blank;
const decisionText = (value: string) => value === 'GO' ? 'GO – La mission peut être réalisée.'
  : value === 'NO_GO' ? 'NO GO – La mission ne peut être réalisée. Transmettre à l’Armement les risques identifiés.'
    : 'Décision à renseigner.';

function dateText(value: string) {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2})(.*))?$/, (_all, year, month, day, time, suffix) =>
    `${day}/${month}/${year}${time ? ` à ${time}${suffix || ''}` : ''}`) || blank;
}

function timestamp(value: string | null) {
  if (!value) return blank;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('fr-FR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris',
  }) : value;
}

function PrintField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`so-print-field${wide ? ' so-print-wide' : ''}`}><dt>{label}</dt><dd>{children}</dd></div>;
}

function checkAnswer(check: SeaOperationCheck, value: SeaOperationAnswer) {
  if (value === 'yes') return check.yesLabel || 'Oui';
  if (value === 'no') return check.noLabel || (check.blocking ? 'Non – ne pas appareiller (NO GO automatique)'
    : check.justifyNo ? 'Non – justifier et transmettre à l’Armement' : 'Non');
  return blank;
}

const portServiceLabels: Record<SeaOperationPortService, string> = {
  towing: 'Remorquage', pilotage: 'Pilotage', mooring: 'Lamanage',
  none: 'Le règlement portuaire n’exige pas ces services',
};

/** Complete printable content with the original Word chrome and the authorized RH signature image. */
export function SeaOperationPrint({ record, signatureImageUrl }: { record: SeaOperationRecord; signatureImageUrl?: string | null }) {
  const form = record.draft;
  const signed = record.status === 'signed';
  const person = form.signature;
  const vessel = form.vessel;
  const signatureImage = signed ? record.signatureUrl || null : signatureImageUrl || null;
  const method = form.dapaq.method === 'nomade' ? 'Préparée dans NOMADE'
    : form.dapaq.method === 'email' ? 'Réalisée par mail et transmise à la Capitainerie' : blank;
  const responsible = form.dapaq.preparedBy === 'armament' ? 'L’Armement'
    : form.dapaq.preparedBy === 'captain' ? 'Le Capitaine'
      : form.dapaq.preparedBy === 'agent' ? 'L’agent consignataire' : blank;

  return <article className="so-print" aria-label="Fiche imprimable Opération en Mer">
    <header className="so-print-header">
      <img className="so-word-header" src="/templates/sea-operation/word-header.png" alt="GO / NO GO - OPÉRATION EN MER – en-tête du formulaire Word original" />
      <div className="so-print-source-title">
      <p className="so-print-reference">{SEA_OPERATION_SOURCE.reference} · {SEA_OPERATION_SOURCE.title}</p>
      <h1>Opération en Mer</h1>
      </div>
      <p className="so-print-status">{signed ? `Décision ${form.decision === 'NO_GO' ? 'NO GO' : 'GO'} signée`
        : `Brouillon${form.decision ? ` – décision ${form.decision === 'NO_GO' ? 'NO GO' : 'GO'} non signée` : ' – aucune décision signée'}`}</p>
      <dl className="so-print-grid so-print-metadata">
        <PrintField label="Identifiant de la fiche">{record.id}</PrintField>
        <PrintField label="Version enregistrée">{record.version}</PrintField>
        <PrintField label="Dernière modification (heure de Paris)">{timestamp(record.updatedAt)}</PrintField>
        <PrintField label="Dernière modification par">{text(record.updatedByName)}</PrintField>
      </dl>
    </header>

    <section className="so-print-section">
      <h2>À remplir par l’Armement</h2>
      <dl className="so-print-grid">
        <PrintField label="Projet">{text(form.project)}</PrintField>
        <PrintField label="Client">{text(form.client)}</PrintField>
        <PrintField label="Coordonnées du client – informations opérationnelles" wide>{text(form.clientContact)}</PrintField>
        <PrintField label="Description de l’opération" wide>{text(form.description)}</PrintField>
      </dl>
      <h3>Personnel spécial à embarquer pour l’opération</h3>
      {form.specialPersonnel.length ? <table><thead><tr><th>Prénom NOM</th><th>N° de téléphone</th></tr></thead><tbody>
        {form.specialPersonnel.map((contact, index) => <tr key={index}><td>{text(contact.name)}</td><td>{text(contact.phone)}</td></tr>)}
      </tbody></table> : <p>Aucun personnel spécial renseigné.</p>}
      <h3>Demande d’Attribution de Poste À Quai (DAPAQ)</h3>
      <p>Caen, Le Havre, Dieppe et Rouen : préparation dans NOMADE par l’Armement ou le Capitaine. Autres ports : réalisation par mail et transmission à la Capitainerie.</p>
      <dl className="so-print-grid">
        <PrintField label="Mode de réalisation">{method}</PrintField>
        <PrintField label="Responsable">{responsible}</PrintField>
        {form.dapaq.preparedBy === 'agent' && <>
          <PrintField label="Nom de l’agent consignataire">{text(form.dapaq.agentName)}</PrintField>
          <PrintField label="Coordonnées de l’agent consignataire">{text(form.dapaq.agentContact)}</PrintField>
        </>}
        <PrintField label="Port de départ / Quai">{text(vessel.departurePort)} / {text(vessel.departureQuay)}</PrintField>
        <PrintField label="Port d’arrivée / Quai">{text(vessel.arrivalPort)} / {text(vessel.arrivalQuay)}</PrintField>
        <PrintField label="ETD – Date et heure">{dateText(vessel.etd)}</PrintField>
        <PrintField label="ETA – Date et heure">{dateText(vessel.eta)}</PrintField>
      </dl>
    </section>

    <section className="so-print-section">
      <h2>1 – Informations navire</h2>
      <p>À remplir par le Capitaine. Les horaires de voyage correspondent à l’heure locale saisie pour l’opération.</p>
      <dl className="so-print-grid">
        <PrintField label="Navire">{text(vessel.name)}</PrintField>
        <PrintField label="Capitaine">{text(vessel.captainName)}</PrintField>
        <PrintField label="N° d’immatriculation / IMO" wide>{text(vessel.registrationImo)}</PrintField>
        <PrintField label="Port de départ / Quai">{text(vessel.departurePort)} / {text(vessel.departureQuay)}</PrintField>
        <PrintField label="Port de destination / Quai">{text(vessel.arrivalPort)} / {text(vessel.arrivalQuay)}</PrintField>
        <PrintField label="ETD – Date et heure">{dateText(vessel.etd)}</PrintField>
        <PrintField label="ETA – Date et heure">{dateText(vessel.eta)}</PrintField>
      </dl>
    </section>

    <section className="so-print-section">
      <h2>2 – Inspection avant appareillage</h2>
      <p><strong>Toute réponse négative marquée « NO GO automatique » interdit l’appareillage.</strong> Le Capitaine doit trouver une solution afin de pouvoir appareiller et justifier dûment toute situation ne le permettant pas.</p>
      {SEA_OPERATION_SECTIONS.map((section) => {
        const applicable = !section.applicability || form.applicability[section.applicability] === 'yes';
        return <section className="so-print-check-section" key={section.id}>
          <h3>{section.id} – {section.title}</h3>
          {section.applicability && <p><strong>Rubrique applicable : </strong>{answer(form.applicability[section.applicability])}</p>}
          {!applicable ? <p>{section.applicability && form.applicability[section.applicability] === 'no' ? 'Non applicable.' : 'Applicabilité à renseigner.'}</p> : <>
            {SEA_OPERATION_CHECKS.filter((check) => check.section === section.id).length > 0 && <table className="so-print-controls">
              <thead><tr><th>Contrôle</th><th>Réponse</th></tr></thead><tbody>
                {SEA_OPERATION_CHECKS.filter((check) => check.section === section.id).map((check) => <tr key={check.id}>
                  <td>{check.label}{check.help && <p className="so-print-help">{check.help}</p>}</td>
                  <td><strong>{checkAnswer(check, form.checks[check.id])}</strong>
                    {form.justifications[check.id]?.trim() ? <p><span className="so-print-label">Justification : </span>{form.justifications[check.id]}</p>
                      : form.checks[check.id] === 'no' && check.justifyNo ? <p>Justification à transmettre à l’Armement : à renseigner.</p> : null}
                  </td>
                </tr>)}
              </tbody></table>}
            {section.id === '2.5' && form.applicability.towing === 'yes' && <dl className="so-print-grid">
              <PrintField label="Besoin d’aller sur le remorqué" wide>{answer(form.towedVesselBoarding.required)}</PrintField>
              {form.towedVesselBoarding.required === 'yes' && <>
                <PrintField label="Ronde de sécurité, zones dangereuses matérialisées et mesures prises" wide>
                  {form.towedVesselBoarding.measures === 'sms' ? 'L’opération ne nécessite pas de mesures autres que celles définies dans le SMS.'
                    : form.towedVesselBoarding.measures === 'specific' ? 'Les mesures spécifiques détaillées ci-dessous ont été prises.' : blank}
                </PrintField>
                {form.towedVesselBoarding.measures === 'specific' && <PrintField label="Détail des mesures spécifiques" wide>{text(form.towedVesselBoarding.details)}</PrintField>}
              </>}
            </dl>}
            {section.id === '2.7' && <dl className="so-print-grid">
              <PrintField label="Services portuaires à l’arrivée" wide>{form.portServices.length ? form.portServices.map((service) => portServiceLabels[service]).join(' ; ') : blank}</PrintField>
              {form.portServices.some((service) => service !== 'none') && <PrintField label="Services obligatoires identifiés et prévenus au besoin" wide>{form.mandatoryServicesNotified ? 'Confirmé par le Capitaine' : 'Non confirmé'}</PrintField>}
            </dl>}
            {section.id === '2.8' && <>
              <dl className="so-print-grid">
                <PrintField label="Délégation à un shipchandler" wide>{form.supplies.delegated === 'yes' ? 'Oui'
                  : form.supplies.delegated === 'no' ? 'Non – Le Capitaine gère l’escale avec l’appui de l’Armement au besoin.' : blank}</PrintField>
                {form.supplies.delegated === 'yes' && <>
                  <PrintField label="Nom du shipchandler">{text(form.supplies.shipchandlerName)}</PrintField>
                  <PrintField label="Coordonnées du shipchandler">{text(form.supplies.shipchandlerContact)}</PrintField>
                </>}
                {(['Approvisionnement', 'Avitaillement'] as const).map((category) => <PrintField key={category} label={category} wide>
                  {SEA_OPERATION_SUPPLY_ITEMS.filter((item) => item.category === category && form.supplies.items.includes(item.id)).map((item) => item.label).join(' ; ') || 'Aucun besoin renseigné dans cette catégorie.'}
                </PrintField>)}
                <PrintField label="Fournisseurs et besoins identifiés" wide>{text(form.supplies.suppliers)}</PrintField>
                <PrintField label="Comptes clients préparés au besoin avec la Direction financière" wide>{form.supplies.customerAccountsPrepared ? 'Confirmé' : 'Non confirmé / sans besoin déclaré'}</PrintField>
              </dl>
            </>}
          </>}
        </section>;
      })}
    </section>

    <section className="so-print-section">
      <h2>3 – Plan de passage</h2>
      <dl><PrintField label="Numéro de la ou des cartes marines">{text(form.charts)}</PrintField></dl>
      <p>ETA : date et heure, ou heure seule si le point est atteint le même jour.</p>
      {form.waypoints.length ? <table className="so-print-passage"><thead><tr><th>N° du point</th><th>Description / Contact VHF</th><th>Latitude</th><th>Longitude</th><th>UKC</th><th>ETA – Date et heure ou heure seule</th><th>Zone maritime à trafic dense</th></tr></thead><tbody>
        {form.waypoints.map((point) => <tr key={point.id}><td>{text(point.number)}</td><td>{text(point.descriptionVhf)}</td><td>{text(point.latitude)}</td><td>{text(point.longitude)}</td><td>{text(point.ukc)}</td><td>{dateText(point.eta)}</td><td>{point.denseTraffic ? 'Oui' : 'Non'}</td></tr>)}
      </tbody></table> : <p>Aucun point de passage renseigné.</p>}
    </section>

    <section className="so-print-section so-print-decision">
      <h2>4 – Décision du Capitaine</h2>
      <p className="so-print-decision-text"><strong>{decisionText(form.decision)}</strong></p>
      {!signed && <p><strong>Brouillon – cette décision n’a pas été signée.</strong></p>}
      <dl className="so-print-grid">
        <PrintField label="Risques identifiés et informations à transmettre à l’Armement" wide>{text(form.risks)}</PrintField>
        <PrintField label="Prénom NOM du Capitaine">{text(person.captainName)}</PrintField>
        <PrintField label="Date / Lieu">{dateText(person.date)} / {text(person.place)}</PrintField>
        <PrintField label="Attestation de signature" wide>{person.acknowledged
          ? signed ? 'En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.' : 'Attestation cochée dans le brouillon – signature non enregistrée.'
          : 'Attestation non confirmée.'}</PrintField>
      </dl>
      {signatureImage ? <figure className="so-print-rh-signature"><figcaption>{signed ? 'Signature RH du Capitaine' : 'Signature RH préparée – décision non signée'}</figcaption><img src={signatureImage} alt={signed ? 'Signature RH du Capitaine enregistrée avec cette décision' : 'Aperçu de la signature RH du Capitaine sélectionné, non apposée'} /></figure>
        : <p className="so-print-signature-missing">{signed ? 'Image de signature RH non disponible pour cette fiche historique.' : 'Aucune signature RH apposée – décision non signée.'}</p>}
      {signed && <dl className="so-print-grid so-print-signature">
        <PrintField label="Identité du compte signataire">{text(record.signedByName)}</PrintField>
        <PrintField label="Capitaine signataire enregistré">{text(record.captainName)}</PrintField>
        <PrintField label="Horodatage de signature (heure de Paris)">{timestamp(record.signedAt)}</PrintField>
        <PrintField label="État de la fiche">Signée et figée</PrintField>
        <PrintField label="Identifiant de la fiche signée" wide>{record.id} · Version {record.version}</PrintField>
      </dl>}
    </section>

    {form.applicability.divingSupport === 'yes' && <section className="so-print-section so-print-kit">
      <h2>Annexe – Kit médical plongée prévu par le formulaire</h2>
      <p>En plus de la dotation médicale réglementaire, tout navire ayant des plongeurs professionnels à bord est équipé en permanence d’une trousse de secours plongée, comme défini dans la division 217 citée par le formulaire.</p>
      <table><thead><tr><th>Article</th><th>Quantité</th><th>Présentation et remarques du formulaire</th></tr></thead><tbody>
        {DIVING_MEDICAL_KIT.map((item) => <tr key={item.article}><td>{item.article}</td><td>{item.quantity}</td><td>{item.detail || 'Unité'}</td></tr>)}
      </tbody></table>
    </section>}
    <footer className="so-print-footer"><img className="so-word-footer" src="/templates/sea-operation/word-footer.png" alt="OPE-FOR-10-C – Vérifiez la liste de diffusion pour vous assurer d’avoir toujours la dernière version de ce formulaire." /></footer>
  </article>;
}
