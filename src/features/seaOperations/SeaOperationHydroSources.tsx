import './seaOperationNavigation.css';

/** Keep depth/tide provenance visible instead of manufacturing an operational UKC. */
export function SeaOperationHydroSources() {
  return <details className="so-hydro-sources">
    <summary>Profondeur, marée et calcul de l’UKC</summary>
    <p>UKC = profondeur de la carte + hauteur de marée − tirant d’eau réel − corrections dynamiques. La sonde et la marée doivent utiliser le même zéro vertical.</p>
    <ul>
      <li><a href="https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html" target="_blank" rel="noopener noreferrer">EMODnet Bathymetry 2024</a> : profondeur numérique consultable par latitude / longitude sans clé, environ 115 m, référencée au LAT. Les profondeurs minimale et maximale et la dispersion de la maille sont disponibles ; cette dispersion n’est pas une incertitude instrumentale. Ce produit n’est pas destiné à la sécurité de la navigation.</li>
      <li><a href="https://diffusion.shom.fr/donnees/bathymerie/mnt-facade-atl-homonim.html" target="_blank" rel="noopener noreferrer">MNT Shom façade Atlantique / Manche</a> : fonds ouverts à télécharger, environ 111 m ; variantes au niveau moyen ou aux plus basses mers astronomiques. Le flux image public ne fournit pas de sonde numérique au clic.</li>
      <li><a href="https://www.shom.fr/fr/copernicus" target="_blank" rel="noopener noreferrer">Prévisions côtières Shom — niveaux d’eau TOLOSA</a> : niveaux horaires publics, sans clé, au niveau moyen du modèle. Une conversion de référence verticale est nécessaire avant de les combiner avec les profondeurs LAT d’EMODnet.</li>
      <li><a href="https://services.data.shom.fr/support/en/services/spm" target="_blank" rel="noopener noreferrer">Shom SUPMarée / SAPM</a> : prédictions de marée aux ports et points du modèle ; accès sur abonnement et identifiants.</li>
      <li><a href="https://admiraltyapi.developer.azure-api.net/docs/technicalOverview" target="_blank" rel="noopener noreferrer">UKHO Tidal API</a> : prédictions aux stations britanniques ; abonnement et clé requis pour les hauteurs horaires.</li>
    </ul>
    <p className="so-help">L’UKC reste à renseigner et à valider. Les données publiques de profondeur et de niveau d’eau ont été vérifiées le 24 octobre 2026. Leur addition automatique demande une référence verticale commune, une hauteur d’eau à l’ETA, le tirant d’eau réel et les corrections de squat / mouvements. Une valeur manquante n’est pas remplacée par zéro ; la proximité utilisée pour la météo ne déplace pas la sonde bathymétrique.</p>
  </details>;
}
