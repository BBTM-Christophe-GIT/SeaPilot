# Préversion interactive Projets / Facturation

Route : `/preview/projects/` (également `/preview/projects/index.html`).

Depuis la version 3.71.9, l'organisation validée est également intégrée aux
composants métier de `/modules/projects`. Cette entrée autonome reste une
démonstration sans données réelles. Voir
[`projects-workspace-preview.md`](../../docs/design/projects-workspace-preview.md)
pour le comportement du module de production.

Cette entrée Vite indépendante présente la maquette choisie avec le portefeuille,
les cinq rubriques et les commandes locales de facturation. Elle utilise des
projets, opérations, DPR et justificatifs fictifs. Les changements sont conservés
en mémoire pendant la session ; actualiser la page réinitialise les exemples.
Elle ne lit ni n'écrit de données Supabase et ne remplace pas le module existant.

L'en-tête place Navire sous Facturation mensuelle, puis Mois sous Navire.
Les champs Période, Début et Fin sont retirés : la période se sélectionne dans
le calendrier visible, sans fenêtre à ouvrir. Dès 870 px de panneau, les trois
calendriers occupent la colonne à droite du titre et des deux champs ; en
dessous, ils passent sous ces champs. Ils présentent les mois précédent,
sélectionné et suivant, avec une réduction de 40 % de leur géométrie par
rapport à l'itération précédente. Les commandes et champs habituels conservent
leurs dimensions partagées. À l'ouverture ou après réinitialisation, le mois
de la date du jour et tous ses jours sont sélectionnés. Choisir un autre mois
sélectionne à nouveau ce mois entier.

Un premier clic sur un jour commence une période ; le second la termine,
bornes incluses, même entre deux mois ou dans l'ordre inverse. Le clic suivant
commence une nouvelle période. La plage sélectionnée est indiquée sous les
calendriers. Le calendrier propose un seul arrêt Tab, les flèches déplacent
le focus et Entrée ou Espace sélectionnent un jour. Les trois mois se placent
côte à côte ou s'empilent selon la largeur disponible.

La barre globale Ajouter / Modifier / Enregistrer est supprimée. Les sections
conservent leurs actions locales : complément des jours sans DPR pour les
loyers, Ajouter immédiatement après les titres Services refacturables et
Prestation BBTM, Ajouter une ligne et Dupliquer la ligne côte à côte sous le
tableau Saisie brute. Les nombres de lignes se placent sous leur titre ; les
sous-totaux restent séparés, à droite. Les en-têtes Prestation BBTM
et Saisie brute proposent chacun Catalogue des prestations, qui ouvre le catalogue fictif
existant en consultation. Dans Services refacturables, Prestation BBTM et
Saisie brute, deux petits boutons Supprimer et Modifier se placent au début de
chaque ligne. Ils agissent directement sur cette ligne, sans menu Actions de
la ligne ni sélection préalable. Supprimer ouvre une confirmation ; Modifier
reprend l'éditeur existant pour les frais et prestations et l'édition dans le
tableau pour les lignes brutes. Ajouter une ligne ouvre directement une ligne
vierge dans le tableau Saisie brute. Son
édition se fait dans le tableau avec Enregistrer et Annuler, sans fenêtre.
Le brouillon ne modifie les données métier, les totaux et le PDF qu'après son
enregistrement ; les validations existantes sont conservées. La date de début
sélectionnée, le navire choisi, une quantité de 1 et un prix de 0 sont proposés,
avec la désignation vide à compléter. Modifier une ligne brute utilise la même
édition dans le tableau. Annuler ou Échap abandonne le brouillon ; pendant
l'édition, Ajouter une ligne, Dupliquer la ligne et les commandes des lignes brutes sont
désactivés pour conserver une seule saisie en cours. Replier puis rouvrir
Saisie brute conserve les valeurs du brouillon.

La fenêtre Ajouter un service refacturable permet de joindre un ou plusieurs
fichiers. Plusieurs sélections successives complètent la liste des pièces ;
chaque fichier peut être retiré avant Enregistrer. Annuler laisse les données
et pièces déjà enregistrées inchangées. Modifier un service retrouve ses pièces.
La colonne Pièces affiche leur nombre et ouvre la liste, depuis laquelle chaque
fichier peut être consulté. Les pièces restent locales à la session de cette
préversion. Les règles d'export existantes s'appliquent : PDF standard pour la
synthèse, PDF avec annexes pour les pièces PDF et ZIP pour tous les fichiers
des frais inclus dans le contenu sélectionné.

Le volet « Relevé du mois » reprend les sous-totaux, le total sélectionné HT,
les quatre choix de contenu du PDF, la référence client et les formats d'export.
Il se place à droite des sections quand le panneau offre 860 px, et au-dessus
sur une largeur inférieure. Ses boutons Aperçu PDF et Exporter PDF/ZIP restent
sur une même ligne. Les cases du volet sélectionnent uniquement le PDF : elles
ne masquent aucune section à l'écran.

Les menus Référentiels et Projet sont remplacés par un ruban reprenant le
dessin du Planning : icônes au-dessus des libellés, groupes séparés et nom de
groupe en bas. Le groupe Projet conserve Nouveau projet, Archiver le projet et
Réinitialiser la démonstration. Modifier et Actualiser sont retirés du ruban.
Projet précède Catalogue, qui donne accès aux clients, remorqués et prestations. Toutes
les commandes sont sur une seule rangée avec `ModuleRibbon singleRow`.
Sur petit écran, seul le ruban défile horizontalement.
Les règles des boutons et menus pour les pages sont documentées dans
[la charte commune](../../docs/design/design-system.md).

Chaque carte du portefeuille propose Modifier et une étoile de favori.
Modifier ouvre directement le projet de cette carte, même si un autre dossier
est sélectionné. Les favoris de la préversion sont conservés en mémoire pour
la session et effacés par Réinitialiser la démonstration. La pastille de statut
ouvre les cinq statuts existants : Brouillon, Non validé, Validé, Stand-by météo
et Facturé, ainsi que Clôturer. La clôture est confirmée, archive le projet
sans remplacer son dernier statut métier et conserve ses données. Les projets
clôturés sont masqués par défaut ; Afficher les projets clôturés permet de les
retrouver, puis leur pastille propose Réactiver le projet. Favoris uniquement
limite la liste aux projets marqués. Les boutons de carte restent distincts
du bouton de sélection, sans boutons imbriqués.

Dans l'application réelle, les mêmes actions ciblées et pastilles de statut
s'appliquent aux comptes autorisés. Les favoris existants restent personnels
et persistants ; les vues Tous, Actuels et Mes favoris masquent les projets
clôturés jusqu'à l'activation du filtre. La clôture repose sur l'archivage et
la réactivation retrouve le dernier statut métier. Les sélecteurs pour de
nouveaux rattachements Planning, DPR et QHSE proposent les projets actifs ;
les opérations et DPR historiques restent consultables et exportables.
Ces comportements persistants sont distincts de la démonstration en mémoire.

## Parcours à essayer

- Rechercher un projet, filtrer son statut et changer la densité du portefeuille.
- Ouvrir Clients, Remorqués ou Prestations depuis Catalogue, puis fermer par Échap.
- Utiliser Nouveau projet, Archiver et Réinitialiser depuis le ruban.
- Modifier directement une carte, marquer son étoile et utiliser Favoris uniquement.
- Ouvrir sa pastille de statut, changer le statut ou confirmer Clôturer ; afficher les projets clôturés puis réactiver le projet.
- Changer de dossier et de rubrique ; créer ou modifier un projet et ses opérations.
- Sélectionner un mois : sa fiche est créée automatiquement lors de la première action.
- Cliquer sur deux jours du calendrier visible pour définir une période, puis changer Mois pour sélectionner un mois entier.
- Déplier Loyers D’affrètement, Services refacturables, Prestation BBTM et Saisie brute.
- Dans le relevé, sélectionner le contenu du PDF et vérifier les sous-totaux et le total HT.
- Exclure une journée ou un frais dans son tableau ; décocher et recocher sa section conserve ce choix.
- Compléter les jours sans DPR avec « 24/24 Operation », puis retirer le complément.
- Ajouter ou modifier un frais ou une prestation ; dans la fenêtre du frais, sélectionner plusieurs pièces, en retirer une avant Enregistrer ou annuler l'ensemble.
- Ouvrir le nombre de fichiers d'un frais dans la colonne Pièces, puis consulter chaque justificatif.
- Utiliser Supprimer ou Modifier au début d'une ligne de frais, prestation ou saisie brute ; annuler ou confirmer une suppression.
- Ouvrir Catalogue des prestations depuis Prestation BBTM ou Saisie brute, puis fermer par Échap.
- Cliquer sur Ajouter une ligne sous Saisie brute, compléter la ligne vierge avec date, désignation, navire, quantité et prix unitaire, puis Enregistrer ou Annuler dans le tableau.
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
corepack pnpm test src/features/projects/preview/billingDemo.test.ts src/features/projects/preview/previewStorageClient.test.ts src/features/projects/preview/ProjectPreview.test.tsx src/features/projects/preview/BillingPeriodCalendar.test.tsx src/features/projects/preview/BillingRawLineDraft.test.tsx src/features/projects/projectBilling.test.ts src/features/projects/projectBillingReferences.test.ts --pool=forks --maxWorkers=1
corepack pnpm test src/features/planning/PlanningPage.test.tsx src/features/planning/planningPermissions.test.ts --pool=forks --maxWorkers=1
corepack pnpm test src/features/projects/ProjectsPage.test.tsx src/features/projects/projectMutations.test.ts src/features/projects/projectQueries.test.ts src/features/projects/projectStatus.test.ts --pool=forks --maxWorkers=1
corepack pnpm build
```

La visionneuse utilise le PDF généré et `pdfjs-dist`, déjà présent dans le projet,
pour fonctionner aussi sans visionneuse PDF native du navigateur. La préversion
reste autonome et ne requiert aucun accès à une base de données. Le module réel
utilise la migration
[`20261010071337_project_closure_reactivation.sql`](../../supabase/migrations/20261010071337_project_closure_reactivation.sql)
pour les RPC `projects_reactivate` et `projects_set_status`, avec les contrôles
admin/direction et d'entreprise existants. Cette migration conserve les statuts
métier et protège également les rattachements DPR à un projet actif ; elle ne
supprime pas les opérations ou DPR historiques.

La disposition navy/blanc du shell est une exception visuelle propre à la
maquette choisie par l'utilisateur. Les commandes et panneaux reprennent les
tokens partagés SeaPilot. Les sélecteurs de navire utilisent `compareFleetNames`.

Voir [la vérification visuelle](./design-qa.md).
