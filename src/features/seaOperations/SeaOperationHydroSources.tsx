import './seaOperationNavigation.css';

/** Distinguish the common model datum from hydrographic chart and tide datums. */
export function SeaOperationHydroSources() {
  return <details className="so-hydro-sources">
    <summary>Profondeur, marée et calcul de l’UKC</summary>
    <p>Le mode automatique estime l’UKC statique à l’ETA : profondeur du modèle + niveau d’eau du modèle − tirant d’eau du navire. La profondeur et le niveau d’eau proviennent du même produit, de la même version et de la même maille Copernicus Marine, avec une référence commune au géoïde du modèle.</p>
    <ul>
      <li><a href="https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description" target="_blank" rel="noopener noreferrer">Copernicus Marine Service — NWS</a> : modèle prioritaire en Manche et au sud de l’Angleterre, maille nominale de 1,5 km, prévisions jusqu’à 7 jours, niveaux d’eau instantanés toutes les 15 minutes.</li>
      <li><a href="https://data.marine.copernicus.eu/product/IBI_ANALYSISFORECAST_PHY_005_001/description" target="_blank" rel="noopener noreferrer">Copernicus Marine Service — IBI</a> : couverture Atlantique / golfe de Gascogne, maille d’environ 2 à 3 km, prévisions jusqu’à 10 jours, niveaux d’eau instantanés toutes les 15 minutes. Le modèle est sélectionné selon sa couverture et les échéances disponibles.</li>
    </ul>
    <p className="so-help">L’estimation reste indisponible en cas de cellule terrestre, de donnée manquante ou de profondeur modélisée inférieure ou égale à 10 m. Cette limite prudente de SeaPilot s’applique aux deux modèles ; elle ne garantit pas leur précision en petits fonds. Une cellule bathymétrique voisine ne remplace pas celle du waypoint. L’incertitude totale n’est pas quantifiée faute de composantes documentées à ce point. Squat et mouvements du navire ne sont pas appliqués. La valeur est indicative et ne valide pas automatiquement l’appareillage.</p>
    <p>Le calcul et sa provenance sont conservés dans la fiche : modèle, version, position et résolution de la maille, horaires, profondeur, niveau d’eau et tirant d’eau. Une fiche signée conserve cette capture.</p>
    <details><summary>Autres sources hydrographiques</summary><ul>
      <li><a href="https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html" target="_blank" rel="noopener noreferrer">EMODnet Bathymetry 2024</a> : profondeur numérique consultable par latitude / longitude sans clé, environ 115 m, référencée au LAT. Les profondeurs minimale et maximale et la dispersion de la maille sont disponibles ; cette dispersion n’est pas une incertitude instrumentale. Ce produit n’est pas destiné à la sécurité de la navigation.</li>
      <li><a href="https://diffusion.shom.fr/donnees/bathymerie/mnt-facade-atl-homonim.html" target="_blank" rel="noopener noreferrer">MNT Shom façade Atlantique / Manche</a> : fonds ouverts à télécharger, environ 111 m ; variantes au niveau moyen ou aux plus basses mers astronomiques. Le flux image public ne fournit pas de sonde numérique au clic.</li>
      <li><a href="https://www.shom.fr/fr/copernicus" target="_blank" rel="noopener noreferrer">Prévisions côtières Shom — niveaux d’eau TOLOSA</a> : niveaux horaires publics, sans clé, au niveau moyen du modèle. Une conversion de référence verticale est nécessaire avant de les combiner avec les profondeurs LAT d’EMODnet.</li>
      <li><a href="https://services.data.shom.fr/support/en/services/spm" target="_blank" rel="noopener noreferrer">Shom SUPMarée / SAPM</a> : prédictions de marée aux ports et points du modèle ; accès sur abonnement et identifiants.</li>
      <li><a href="https://admiraltyapi.developer.azure-api.net/docs/technicalOverview" target="_blank" rel="noopener noreferrer">UKHO Tidal API</a> : prédictions aux stations britanniques ; abonnement et clé requis pour les hauteurs horaires.</li>
    </ul><p className="so-help">Ces sources ne sont pas additionnées au calcul Copernicus. Une profondeur LAT et un niveau d’eau au niveau moyen demandent une conversion verticale documentée ; le calcul automatique ne suppose aucune conversion vers le zéro des cartes.</p></details>
  </details>;
}
