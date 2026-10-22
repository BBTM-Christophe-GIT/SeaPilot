import './seaOperationNavigation.css';

/** Keep depth/tide provenance visible instead of manufacturing an operational UKC. */
export function SeaOperationHydroSources() {
  return <details className="so-hydro-sources">
    <summary>Profondeur, marée et calcul de l’UKC</summary>
    <p>UKC = profondeur de la carte + hauteur de marée − tirant d’eau réel − corrections dynamiques. La sonde et la marée doivent utiliser le même zéro vertical.</p>
    <ul>
      <li><a href="https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html" target="_blank" rel="noopener noreferrer">EMODnet Bathymetry 2024</a> : modèle de fond ouvert, environ 115 m de résolution, référencé au LAT. Consultation géographique ; ce produit n’est pas destiné à la sécurité de la navigation.</li>
      <li><a href="https://diffusion.shom.fr/donnees/bathymerie/mnt-facade-atl-homonim.html" target="_blank" rel="noopener noreferrer">MNT Shom façade Atlantique / Manche</a> : fonds ouverts, environ 111 m, référence verticale selon le produit. Les restrictions de chaque jeu restent applicables.</li>
      <li><a href="https://services.data.shom.fr/support/en/services/spm" target="_blank" rel="noopener noreferrer">Shom SUPMarée / SAPM</a> : prédictions de marée aux ports et points du modèle ; accès sur abonnement et identifiants.</li>
      <li><a href="https://admiraltyapi.developer.azure-api.net/docs/technicalOverview" target="_blank" rel="noopener noreferrer">UKHO Tidal API</a> : prédictions aux stations britanniques ; abonnement et clé requis pour les hauteurs horaires.</li>
    </ul>
    <p className="so-help">L’UKC reste à renseigner et à valider. Un calcul opérationnel demande des sondes autorisées pour la navigation, une marée au même datum et à l’ETA, le tirant d’eau réel et les corrections de squat / mouvements. Les bases ouvertes ne suffisent pas à certifier ce calcul.</p>
  </details>;
}
