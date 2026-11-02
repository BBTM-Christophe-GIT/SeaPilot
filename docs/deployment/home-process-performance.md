# Radar de pilotage des processus

L’accueil affiche par défaut le radar des processus accessibles au compte connecté. Ses titres, valeurs et points utilisent les mêmes seuils que les chips : rouge sous 40 %, ambre sous 75 %, vert à partir de 75 %, gris pour une valeur non notée. Le classement des priorités tient sur une seule colonne dont la hauteur suit le contenu, sans défilement interne. Un clic sur un processus affiche les composantes de son score sous forme de barres horizontales ; un second clic, ou « Vue globale », rétablit le radar. Les actions conservent l’échéance, le rendez-vous, le lieu et le lien vers le dossier correspondant. Les animations respectent la préférence de réduction des mouvements.

Le menu de périmètre sous le titre conserve « Périmètre compagnie » pour les comptes de bureau et propose les navires, bureaux et quais accessibles, avec leurs illustrations réduites de moitié. Les navires suivent l’ordre décroissant de longueur du référentiel partagé ; les quais et bureaux suivent. Le périmètre global inclut les éléments sans affectation ; les sous-périmètres RH utilisent les affectations courantes et ne dupliquent pas ces éléments dans toutes les unités.

L’option « Comparer les unités » affiche un axe par navire, bureau ou quai autorisé. Sa note globale est la moyenne à poids égaux de ses processus notés ; les processus non applicables sont exclus, tandis qu’une source indisponible suspend le total. La couverture est visible sur chaque chip. Un clic sur une unité ouvre son radar des processus, puis un clic sur un processus ouvre ses composantes en barres et ses actions. « Toutes les unités » remonte d’un niveau. Une valeur non applicable ou indisponible laisse une lacune : elle ne devient jamais une conformité nulle. La vue globale des comptes terrain reste limitée à leur périmètre autorisé.

## Chargement de l’accueil

Le chargement initial lit uniquement la synthèse globale et le catalogue des unités accessibles. Les affectations RH de compagnie et les calculs des unités sont différés jusqu’à leur sélection ou à la comparaison. Les projections RH ne chargent ni portraits, ni fichiers, ni données personnelles inutiles au score. Les lectures indépendantes démarrent en parallèle et les exercices utilisent un seul agrégat mensuel, plutôt qu’un rapport par personne et par navire.

Les sources sont réutilisées en mémoire pendant 30 secondes, avec huit contextes maximum par client. La clé distingue les rôles, la personne, les modules et la date ; un changement d’authentification invalide les données et rejette les lectures antérieures encore en cours. Actualiser et les changements d’actions RH invalident le cache. Aucun résultat métier n’est conservé en stockage persistant. Les changements de profil ou de droits masquent immédiatement l’ancien écran. La file des échéances déduplique aussi ses lectures d’entrée.

## Périmètre et accès

Les modules visibles du shell sont la source des autorisations de navigation. Sans cette liste, le composant recharge les permissions configurées et échoue sans afficher de données si elles sont indisponibles. Un module masqué ne déclenche aucune lecture métier pour le radar.

- Administration, Direction et Armement : données de compagnie que leurs RLS autorisent.
- Capitaine : collaborateurs de la bordée courante et processus des navires affectés, en plus des restrictions RH par fonction, section et type de document.
- Les entretiens d’un Capitaine sont limités aux participants des entretiens réellement accessibles par RLS. L’absence d’un entretien masqué ne crée pas une tâche ni une mauvaise note.
- Marin : dossier RH personnel et processus des navires affectés ; aucune lecture du module Entretiens par le radar.
- Sans affectation, les processus navires restent non notés. Un sous-ensemble RLS ne représente jamais la compagnie entière.
- Lors d’un changement de compte, de droits ou de client, les anciennes notes et identités sont masquées immédiatement, avant le prochain chargement.

Le registre médical est retiré des processus du radar et du calcul global. Le module et ses permissions restent disponibles dans leur navigation habituelle. Aucune consultation, identité de patient ou donnée clinique n’est lue pour le radar.

## Méthode de calcul

Les notes sont des indices de suivi de 0 à 100, pas des certifications réglementaires. Les poids et les nombres sont visibles dans le détail. Les critères sans obligation sont exclus et les poids restants sont normalisés. Une source indisponible suspend la note du processus ; une liste vide n’est pas assimilée à 100 %. Les axes non notés restent visibles dans la liste, sans être tracés à zéro.

| Processus | Calcul initial |
| --- | --- |
| RH | Conformité médicale 30 %, brevets/certificats 25 %, prise en charge des renouvellements et formations 20 %, entretiens de l’année 25 %. |
| Demandes d’achats | Demandes ouvertes et demandes clôturées créées dans l’année : clôturée/refusée 100, réception attendue 75, commandée 60, sans traitement ou livraison en retard 0. |
| Audits ISM internes | Campagnes annuelles par site 75 %, traitement des écarts 25 %. Une campagne absente vaut 0 ; un audit réservé vaut 50 ; réalisé vaut 100. Les profils équipage n’infèrent aucune campagne annuelle à partir de leurs seuls écarts accessibles. |
| Documents flotte | Validité, échéances à 90 jours et planification des contrôles, détaillées dans l’interface. |
| Procédures QHSE | Revues annuelles selon la date de diffusion et leur échéance. Armement et équipage utilisent la bibliothèque publiée. |
| Produits chimiques | Présence d’une FDS référencée 70 %, emplacement de stockage renseigné 30 %. La présence d’une pièce ne certifie pas son contenu. |
| LSA | Validité et présence des registres 80 %, traçabilité des dates 20 %, moyennes par navire. À jour 100, échéance à 30 jours 50, périmé ou registre absent 0. Un bureau ou quai sans obligation est non applicable. |
| Apparaux de levage | Échéance officielle des matériels actifs : à jour 100, à 30 jours 50, échue ou non datée 0. Sans apparau identifié : non applicable. Un brouillon ne renouvelle pas la validité. |
| Registre des remorques | Indicateur distinct sous la permission Levage. Même calcul des échéances ; un registre absent sur un navire autorisé vaut 0 et génère une action de saisie. Il n’est pas compensé par les apparaux de levage à jour. |
| Pharmacie | Péremption 30 %, seuils de stock 30 %, données vérifiables (quantités et dates) 20 %, justificatifs de contrôle 20 %. Les formats de quantité inconnus restent à vérifier. |
| Exercices | Un incendie et un abandon par personne et par mois de présence en emploi. Deux critères de poids égaux, calculés sur les mois clos. Le mois courant génère des actions avant sa fin ; les mois futurs, hors emploi ou sans présence sont exclus. Les répétitions d’un exercice ne compensent pas un autre mois ou une autre personne. Les TBT n’acquittent pas ces deux objectifs. |

Pour les RH, un rendez-vous de renouvellement doit avoir une date future, un lieu et être prévu avant l’échéance pour créditer l’anticipation. Une réservation ou une action terminée ne prolonge jamais le document : le justificatif et la nouvelle validité restent à enregistrer dans RH. Les actions terminées, planifiées et annulées sont persistées dans `hr_action_plans`.

Un entretien est réalisé lorsqu’un compte rendu est validé par le manager ou archivé, ou lorsqu’une réalisation explicite est enregistrée. Une date d’échéance, un questionnaire remis et un créneau passé ne prouvent pas la réalisation. Un entretien planifié reçoit un crédit partiel de 50 %. Les rendez-vous existants restent gérés par le module Entretiens, sans duplication automatique.

## Livraison et vérification

Les migrations RH sont décrites dans [l’historique d’emploi](./hr-employment-periods-process-performance.md). Les tests du radar couvrent le cas 2026 d’un entretien réalisé et deux planifiés, les sources indisponibles, la pagination, les vrais profils de lecture et les permissions masquées. Les tests des registres couvrent les péremptions, seuils, brouillons de contrôle et l’absence de requête clinique.

Les vérifications visuelles utilisent uniquement une préversion administrateur pour le rendu ; les profils Marin/Capitaine sont validés par les fixtures de code et les tests RLS transactionnels, conformément aux instructions du projet.
