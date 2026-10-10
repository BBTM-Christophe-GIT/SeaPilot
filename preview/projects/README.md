# Préversion interactive Projets / Facturation

Route : `/preview/projects/` (également `/preview/projects/index.html`).

Cette entrée Vite indépendante présente la maquette choisie avec le portefeuille,
les cinq rubriques et les commandes locales de facturation. Elle utilise des
projets, opérations, DPR et justificatifs fictifs. Les changements sont conservés
en mémoire pendant la session ; actualiser la page réinitialise les exemples.
Elle ne lit ni n'écrit de données Supabase et ne remplace pas le module existant.

L'en-tête regroupe Facturation mensuelle, Mois, Période, Début et Fin sur une
rangée dès que le panneau offre 870 px. Navire se place sous le titre. Le
calendrier reste visible à côté, sans fenêtre à ouvrir : il présente les mois
précédent, sélectionné et suivant. À l'ouverture ou après réinitialisation,
le mois de la date du jour et tous ses jours sont sélectionnés. Choisir un
autre mois sélectionne à nouveau ce mois entier.

Un premier clic sur un jour commence une période ; le second la termine,
bornes incluses, même entre deux mois ou dans l'ordre inverse. Le clic suivant
commence une nouvelle période. Les champs Début et Fin restent utilisables.
Le calendrier propose un seul arrêt Tab, les flèches déplacent le focus et
Entrée ou Espace sélectionnent un jour. Les trois mois sont côte à côte dès
620 px de largeur de calendrier et s'empilent en dessous.

La barre globale Ajouter / Modifier / Enregistrer est supprimée. Les sections
conservent leurs actions locales : complément des jours sans DPR pour les
loyers, Ajouter pour les frais et prestations, Ajouter une ligne et Dupliquer
la ligne côte à côte sous le tableau Saisie brute. Les en-têtes Prestation BBTM
et Saisie brute proposent chacun Catalogue des prestations, qui ouvre le catalogue fictif
existant en consultation. Les menus Actions de la ligne permettent de modifier
ou supprimer la sélection et d'ajouter un justificatif à un frais.

Le volet « Relevé du mois » reprend les sous-totaux, le total sélectionné HT,
les quatre choix de contenu du PDF, la référence client et les formats d'export.
Il se place à droite des sections quand le panneau offre 860 px, et au-dessus
sur une largeur inférieure. Ses boutons Aperçu PDF et Exporter PDF/ZIP restent
sur une même ligne. Les cases du volet sélectionnent uniquement le PDF : elles
ne masquent aucune section à l'écran.

Les menus Référentiels et Projet sont remplacés par un ruban reprenant le
dessin du Planning : icônes au-dessus des libellés, groupes séparés et nom de
groupe en bas. Le groupe Projet rassemble ses cinq actions existantes et
précède Catalogue, qui donne accès aux clients, remorqués et prestations. Toutes
les commandes sont sur une seule rangée avec `ModuleRibbon singleRow`.
Sur petit écran, seul le ruban défile horizontalement.
Les règles des boutons et menus pour les pages sont documentées dans
[la charte commune](../../docs/design/design-system.md).

## Parcours à essayer

- Rechercher un projet, filtrer son statut et changer la densité du portefeuille.
- Ouvrir Clients, Remorqués ou Prestations depuis Catalogue, puis fermer par Échap.
- Utiliser Nouveau projet, Modifier, Archiver, Actualiser et Réinitialiser depuis le ruban.
- Changer de dossier et de rubrique ; créer ou modifier un projet et ses opérations.
- Sélectionner un mois : sa fiche est créée automatiquement lors de la première action.
- Cliquer sur deux jours du calendrier visible pour définir une période, puis revenir à Mois calendaire.
- Déplier Loyers D’affrètement, Services refacturables, Prestation BBTM et Saisie brute.
- Dans le relevé, sélectionner le contenu du PDF et vérifier les sous-totaux et le total HT.
- Exclure une journée ou un frais dans son tableau ; décocher et recocher sa section conserve ce choix.
- Compléter les jours sans DPR avec « 24/24 Operation », puis retirer le complément.
- Ajouter ou modifier un frais ou une prestation et joindre un justificatif local.
- Ouvrir Catalogue des prestations depuis Prestation BBTM ou Saisie brute, puis fermer par Échap.
- Ajouter une ligne brute datée, avec son navire, sa quantité et son prix unitaire.
- Dupliquer la dernière ligne ajoutée : date, désignation, navire, quantité, tarif et choix PDF sont recopiés à l'identique, avec un nouvel identifiant.
- Saisir une référence client, enregistrée à la sortie du champ ou avec Enregistrer la référence.
- Afficher le vrai PDF, exporter le PDF standard, le PDF avec annexes ou le ZIP.

Les calculs et exports réutilisent `projectBilling.ts`. La fiche mensuelle reste
distincte du statut du projet. Modifier le loyer contractuel ne modifie pas les
loyers copiés dans les opérations existantes. Les tarifs propres aux opérations,
les règles de stand-by et les exclusions PDF restent ceux du moteur existant.
Le complément des jours sans DPR réutilise ce moteur : chaque journée reçoit
le tarif contractuel qui lui est applicable, sans tarif unique figé. Retirer le
complément conserve les exclusions des vrais DPR. Changer de période désactive
le complément pour permettre de le recalculer explicitement.
Les totaux sont séparés par devise, sans conversion implicite. Les quantités
automatiques des prestations et les arrondis des lignes brutes suivent les
fonctions actuelles du moteur. Les quatre sections sont toujours accessibles,
y compris Saisie brute lorsqu'elle est vide. Les références sont partagées entre
les mois d'un même projet pour un même contenu PDF ; la case Saisie brute
n'ajoute ce contenu à la portée de référence que si une ligne est présente dans
la période retenue. Les lignes brutes conservent leur propre affectation de
navire, comme dans le volet existant. Dupliquer la ligne reprend la dernière
ligne du mois, même lorsqu'une autre ligne est sélectionnée ; l'action est
désactivée si la saisie est vide, si le projet est archivé ou pendant un export.

Les rubriques Offre & contrat et Documents présentent des résumés et les pièces
fictives du mois. L'édition contractuelle complète, les synchronisations Planning,
les référentiels persistants, les autorisations et les RPC/RLS restent dans
l'application existante. Cette préversion prépare les éléments de facturation ;
elle ne crée ni n'envoie de facture.

## Vérifications

Avec pnpm 10.34.5 :

```powershell
corepack pnpm test src/features/projects/preview/billingDemo.test.ts src/features/projects/preview/previewStorageClient.test.ts src/features/projects/preview/ProjectPreview.test.tsx src/features/projects/preview/BillingPeriodCalendar.test.tsx src/features/projects/projectBilling.test.ts src/features/projects/projectBillingReferences.test.ts --pool=forks --maxWorkers=1
corepack pnpm test src/features/planning/PlanningPage.test.tsx src/features/planning/planningPermissions.test.ts --pool=forks --maxWorkers=1
corepack pnpm build
```

La visionneuse utilise le PDF généré et `pdfjs-dist`, déjà présent dans le projet,
pour fonctionner aussi sans visionneuse PDF native du navigateur. Aucun nouvel
accès, service, secret ou changement de base de données n'est nécessaire.

La disposition navy/blanc du shell est une exception visuelle propre à la
maquette choisie par l'utilisateur. Les commandes et panneaux reprennent les
tokens partagés SeaPilot. Les sélecteurs de navire utilisent `compareFleetNames`.

Voir [la vérification visuelle](./design-qa.md).
