# Radar de pilotage des processus

L’accueil affiche les processus accessibles au compte connecté, un classement des priorités et le détail de chaque note. Un clic sélectionne le processus ; les actions affichent l’échéance, le rendez-vous, le lieu et un lien vers le dossier correspondant. Les animations respectent la préférence de réduction des mouvements.

## Périmètre et accès

Les modules visibles du shell sont la source des autorisations de navigation. Sans cette liste, le composant recharge les permissions configurées et échoue sans afficher de données si elles sont indisponibles. Un module masqué ne déclenche aucune lecture métier pour le radar.

- Administration, Direction et Armement : données de compagnie que leurs RLS autorisent.
- Capitaine : collaborateurs de la bordée courante et processus des navires affectés, en plus des restrictions RH par fonction, section et type de document.
- Les entretiens d’un Capitaine sont limités aux participants des entretiens réellement accessibles par RLS. L’absence d’un entretien masqué ne crée pas une tâche ni une mauvaise note.
- Marin : dossier RH personnel et processus des navires affectés ; aucune lecture du module Entretiens par le radar.
- Sans affectation, les processus navires restent non notés. Un sous-ensemble RLS ne représente jamais la compagnie entière.
- Lors d’un changement de compte, de droits ou de client, les anciennes notes et identités sont masquées immédiatement, avant le prochain chargement.

Le registre médical n’entraîne aucune requête sur les consultations, patients ou diagnostics. Son entrée n’est visible que si le module est autorisé ; elle reste non notée en l’absence d’un objectif collectif non clinique.

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
| LSA | Validité des équipements datés 80 %, traçabilité des dates 20 %. À jour 100, échéance à 30 jours 50, périmé 0. Un inventaire entièrement non daté reste non noté. |
| Levage / remorques | Échéance officielle des matériels actifs : à jour 100, à 30 jours 50, échue ou absente 0. Un brouillon de contrôle ne renouvelle pas la validité. |
| Pharmacie | Péremption 30 %, seuils de stock 30 %, données vérifiables (quantités et dates) 20 %, justificatifs de contrôle 20 %. Les formats de quantité inconnus restent à vérifier. |
| Exercices | Nombre de déclarations et TBT de l’année dans les DPR autorisés. Non noté tant qu’aucun objectif de fréquence n’est configuré. |

Pour les RH, un rendez-vous de renouvellement doit avoir une date future, un lieu et être prévu avant l’échéance pour créditer l’anticipation. Une réservation ou une action terminée ne prolonge jamais le document : le justificatif et la nouvelle validité restent à enregistrer dans RH. Les actions terminées, planifiées et annulées sont persistées dans `hr_action_plans`.

Un entretien est réalisé lorsqu’un compte rendu est validé par le manager ou archivé, ou lorsqu’une réalisation explicite est enregistrée. Une date d’échéance, un questionnaire remis et un créneau passé ne prouvent pas la réalisation. Un entretien planifié reçoit un crédit partiel de 50 %. Les rendez-vous existants restent gérés par le module Entretiens, sans duplication automatique.

## Livraison et vérification

Les migrations RH sont décrites dans [l’historique d’emploi](./hr-employment-periods-process-performance.md). Les tests du radar couvrent le cas 2026 d’un entretien réalisé et deux planifiés, les sources indisponibles, la pagination, les vrais profils de lecture et les permissions masquées. Les tests des registres couvrent les péremptions, seuils, brouillons de contrôle et l’absence de requête clinique.

Les vérifications visuelles utilisent uniquement une préversion administrateur pour le rendu ; les profils Marin/Capitaine sont validés par les fixtures de code et les tests RLS transactionnels, conformément aux instructions du projet.
