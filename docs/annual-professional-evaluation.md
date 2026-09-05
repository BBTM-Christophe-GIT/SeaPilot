# Entretien Professionnel et d’Evaluation

## Périmètre fonctionnel

Le module est rangé sous **Ressources Humaines**. Son entrée de menu est visible pour les rôles `admin`, `direction`, `armement` et `capitaine`. Le rôle `marin` n’accède pas au module de gestion, mais un collaborateur connecté peut ouvrir son propre entretien depuis la cloche de notifications.

Le questionnaire reprend le classeur source `Entretien Evaluation - Professionnel.xlsx`. Chaque onglet du classeur correspond à une section de l’écran :

| Onglet source | Section SeaPilot |
| --- | --- |
| Guide | Guide du collaborateur, accessible à tout moment |
| 1.Evaluation | 1. Évaluation |
| 2.ESG | 2. ESG |
| 3.Vie entreprise | 3. Vie entreprise |
| 4.Evolution | 4. Évolution |
| 5.Objectifs | 5. Objectifs |

Les 23 critères d’évaluation utilisent une réponse unique parmi `Non Applicable`, `Très faible`, `Faible`, `Moyen`, `Bon` et `Excellent`. Le champ « Objectif(s) personnel(s) pour l’année N+1 » utilise l’éditeur de texte enrichi partagé par l’application.

## Workflow

1. Un manager sélectionne un collaborateur actif et propose une date, une heure de début et de fin, ainsi qu’un lieu physique ou un lien de visioconférence.
2. Le collaborateur reçoit l’invitation dans la cloche. Il accepte le créneau ou en propose un autre.
3. En cas de contre-proposition, le manager l’accepte. Le rendez-vous n’apparaît dans le Planning qu’une fois le créneau accepté.
4. Le collaborateur et le manager remplissent leurs questionnaires séparément. Le collaborateur peut télécharger ou imprimer sa propre version.
5. Avant la remise, le collaborateur choisit explicitement de partager ses réponses avec le manager ou de les garder privées. Ce choix reste modifiable jusqu’à la remise.
6. Après la remise du collaborateur, le manager valide ses propres réponses. Son identité, la date et sa signature active sont figées avec le rapport PDF.
7. Le collaborateur reçoit une notification, lit le rapport du manager, puis le signe avec sa signature active.
8. Le PDF final signé est archivé dans **Dossier collaborateur > Entretien Annuel**. Son nom contient l’année de l’entretien.

Le rapport transmis et archivé contient exclusivement les réponses du manager. Les réponses personnelles du collaborateur n’y sont jamais intégrées, même lorsque leur consultation dans SeaPilot a été autorisée.

## Confidentialité et intégrité

- Les entretiens, réponses et événements utilisent des politiques RLS dédiées et des RPC transactionnelles ; les mutations directes par un client authentifié sont interdites.
- Une réponse privée reste lisible uniquement par son auteur. Le manager ne reçoit que l’état de complétude.
- Une réponse partagée devient lisible par le manager de l’entretien, sans être ajoutée au rapport final.
- Le choix de partage est tri-état en base (`non choisi`, `partagé`, `privé`) et la remise est refusée tant qu’il n’est pas renseigné.
- La complétude et les valeurs autorisées sont contrôlées côté serveur au moment de la remise et de la validation du manager.
- Les PDF et signatures sont conservés dans des buckets privés. Les signatures actives utilisées sont enregistrées sous forme d’instantanés d’identité et de métadonnées.
- Chaque transition importante est ajoutée à `annual_review_events` pour assurer l’audit du parcours.

## Données et déploiement

La migration `20260905204756_annual_professional_evaluation_workflow.sql` crée les tables, fonctions, politiques RLS, bucket privé et permissions de module. Le test pgTAP `annual_review_workflow_test.sql` couvre les rôles, l’invitation, la négociation du créneau, les deux choix de confidentialité, les signatures et l’archivage RH.
