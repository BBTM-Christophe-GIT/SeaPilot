import { useState } from 'react';
import './seaOperationGmdssReference.css';

/** Original documentary reference, separate from the georeferenced voyage map. */
export function SeaOperationGmdssReference() {
  const [open, setOpen] = useState(false);
  return <details className="so-gmdss-reference" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Carte officielle des zones radio SMDSM</summary>
    {open && <div className="so-gmdss-reference-content">
      <p>Carte publiée par la Maritime and Coastguard Agency en 2024 pour le Royaume-Uni et les côtes voisines, à titre illustratif. Ce document n’est pas un calque géoréférencé des couvertures françaises et ne garantit pas la couverture radio à votre position.</p>
      <p>Les zones A1 et A2 dépendent des couvertures VHF et MF ASN déclarées. Selon les règles actuelles, A3 et A4 dépendent aussi du service satellite reconnu et du terminal embarqué. Cette carte ne classe automatiquement aucun waypoint.</p>
      <figure>
        <img src="/maps/gmdss/mca-2024.svg" alt="Carte illustrative MCA 2024 des zones radio A1, A2 et A3 autour du Royaume-Uni et des côtes européennes voisines" width={674.26} height={621} decoding="async" />
        <figcaption><a href="/maps/gmdss/mca-2024.svg" target="_blank" rel="noopener noreferrer">Ouvrir la carte originale en pleine taille</a></figcaption>
      </figure>
      <p className="so-gmdss-reference-credit">Source : Maritime and Coastguard Agency, carte GMDSS 2024. © Crown copyright 2024. Contains public sector information licensed under the Open Government Licence v3.0.</p>
      <nav aria-label="Sources de la carte SMDSM">
        <a href="https://www.gov.uk/government/publications/gmdss-sea-areas-and-procedures-for-small-boat-users/gmdss-vhf-dsc-procedures-for-small-boat-users" target="_blank" rel="noopener noreferrer">Publication MCA et limites d’utilisation</a>
        <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">Open Government Licence v3.0</a>
        <a href="https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.496(105).pdf" target="_blank" rel="noopener noreferrer">OMI : définitions actuelles A1 à A4</a>
      </nav>
    </div>}
  </details>;
}
