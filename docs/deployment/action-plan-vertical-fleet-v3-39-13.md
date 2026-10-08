# Plan d’action — navigation verticale, v3.39.13

La proposition 2 remplace le bandeau de quatre indicateurs par une navigation à trois panneaux : navires et lieux, rapports classés par catégorie, puis fiche sélectionnée. Les illustrations des navires et du Yard proviennent du catalogue BBTM existant ; une illustration de bureaux complète cette série.

## Utilisation

- Cliquer sur l’illustration ou le nom d’un navire pour afficher ses rapports.
- Cliquer sur Audits, Actions, Visites ou Événements HSE sous le navire pour restreindre la catégorie.
- Combiner cette sélection avec la recherche, le statut et les filtres complémentaires.
- « Tout afficher » réinitialise tous les filtres et regroupe les rapports par navire puis catégorie.
- Le quai est affiché sous le nom **Yard - LE HAVRE**. Les bureaux conservent leur nom de lieu pour distinguer les implantations.
- Seuls les navires et lieux ayant au moins un rapport accessible apparaissent. Les compteurs portent sur ces rapports, indépendamment des filtres de recherche/statut. Un lieu vide apparaît automatiquement après son premier rapport accessible.
- Les rapports historiques sans rattachement restent disponibles dans « Sans navire / lieu ».

Sur tablette, la fiche passe sous la navigation et la liste ; sur téléphone, les panneaux sont empilés. Sélectionner un rapport fait défiler la page jusqu’à sa fiche. Les listes disposent de leur propre défilement pour les volumes importants.

## Classement commun de la flotte

`fleetDisplay.ts` place les navires par longueur décroissante, puis le Yard et les bureaux. La longueur de la fiche navire prime sur les dimensions de référence BBTM. Une longueur absente et sans référence connue place le navire après ceux dont la longueur est connue, puis par nom : aucune dimension n’est inventée.

Les références complémentaires sont celles de la [flotte BBTM](https://www.bbtm.fr/flotte-navires-professionnels-pavillon-francais.php) : LE ROZEL 19,2 m, SUROIT 18,6 m, KROKDUR 15 m, HIRONDELLE DE LA MANCHE 11,98 m, HOLENN EUSA 6,9 m. GOURY (30,62 m) et LANDEMER (19,5 m) reprennent les fiches existantes.

Le comparateur est partagé avec Navires, Levage, l’arborescence Certificats flotte, KPI (via les données du plan d’action), Planning, DPR, Procédures, Notes de service, Demandes d’achat et Suivi du temps de travail. Les listes ne disposant que d’un nom utilisent les références connues.

## Données et autorisations

Aucune migration ni modification RLS/RPC. La requête des navires utilise les colonnes existantes `asset_kind`, `length_overall` et `illustration_thumbnail_url`. Les groupes et compteurs sont construits uniquement à partir des rapports déjà autorisés par Supabase.

Création, approbation, correction, traitement, signature, contre-validation de clôture, pièces jointes et PDF conservent leurs règles. Le contexte météo/manœuvre est dépliable dans la fiche. La gestion des types est accessible en bas de la liste aux profils autorisés.

Les données de préversion couvrent quatre navires, le Yard et des bureaux, avec 24 rapports fictifs. Elles ne sont jamais insérées en production. Les captures de validation montrent explicitement la préversion.

## Validation

- 97 tests ciblés : navigation et ordre, correspondances par identifiant/nom, navires vides masqués, filtres combinés et réinitialisation, archives sans lieu, notification puis changement de fiche sans transfert de brouillon, approbation, suivi signé et clôture, profils Marin/Capitaine/Direction/Administrateur.
- Tests d’intégration de l’application adaptés à la disparition des anciens indicateurs.
- Revue React : boutons sémantiques, libellés accessibles et `aria-pressed`, focus visible, regroupements mémorisés, réinitialisation du formulaire lors du changement de rapport.
- Contrôles navigateur à 1585 × 992, 1024 × 900 et 390 × 844 ; six illustrations chargées ; aucun débordement horizontal ; navigation tactile et sélection de fiche vérifiées.
- Rapport visuel : [design-qa.md](../../design-qa.md). Résultats de la suite complète, compilation et déploiement consignés dans la pull request.

Deux appels `it.each` du test Google Drive ont également été remis en forme pour lever les erreurs ESLint préexistantes, sans changer les scénarios testés.
