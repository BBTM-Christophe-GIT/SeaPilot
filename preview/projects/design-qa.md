# Vérification visuelle de la préversion

Dernière itération : 10 octobre 2026. Validation locale réussie ; les résultats
des itérations précédentes ci-dessous décrivent leurs états respectifs.

## Source et état comparés

- Vérité visuelle : maquette Facturation dérivée de l'image choisie par l'utilisateur,
  `C:/Users/chris/.codex/generated_images/01a11cbf-f4bc-7df2-aed5-cbcf08cc4b59/exec-7269541f-b138-406e-8691-66b3160dd49d.png`.
- Référence initiale choisie : `C:/Users/chris/Downloads/Image ChatGPT 8 oct. 2026, 21_26_38.png`.
- Implémentation vérifiée : `http://127.0.0.1:5174/preview/projects/index.html`.
- État : P264, Facturation, octobre 2026, 5–8 octobre, loyers ouverts,
  services et prestations repliés, inclusions actives, total 10 955,00 € HT.
- Viewport demandé : 1488 × 1058 CSS px. Capture effective du navigateur intégré :
  1473 × 1047 pixels ; référence : 1485 × 1059 pixels. Capture à densité 1,
  normalisation de chaque image à 1488 × 1058 pour la comparaison. Le léger
  écart de capture provient du cadre de rendu et n'est pas traité comme une dérive.
- Mobile : viewport demandé 390 × 844, contenu mesuré 375 px, scrollWidth 375 px.

Preuves communes, référence à gauche et interface à droite :
[comparaison complète](./evidence/billing-comparison.jpg) et
[comparaison des commandes et du tableau](./evidence/billing-controls-comparison.jpg).
Les deux ont été ouvertes et comparées dans la même image, avec inspection
rapprochée des libellés, icônes, cases et montants.

## Historique des corrections

1. P2 — régions trop étroites, texte trop petit et logo peu visible.
   Sidebar passée à 246 px, portefeuille à 310 px, textes et contrôles alignés
   sur les tokens partagés, cadrage du véritable logo corrigé. Le premier
   résultat conservé est [ici](./evidence/billing-comparison-iteration-1.jpg).
2. P2 — entrée Projets trop haute et rythme vertical repoussant le total.
   Entrée ramenée à 40 px, hauteur de l'en-tête et marges du dossier ajustées,
   label visuel du mois retiré tout en gardant son nom accessible, lignes
   journalières compactées. La comparaison finale montre les mêmes régions,
   une seule barre de commandes et le total visible à la taille de référence.
3. P1 — l'iframe PDF était vide dans le navigateur intégré.
   Remplacée par un rendu local des véritables octets PDF avec pdfjs-dist,
   pagination et téléchargement. [Preuve du PDF rendu](./evidence/billing-pdf.jpg).
4. P2 — menu Ajouter coupé à gauche sur mobile.
   Ancrage des menus adapté au petit écran. Les deux actions sont entièrement
   lisibles et cliquables dans [la capture mobile corrigée](./evidence/billing-mobile.jpg).

## Surfaces de fidélité

- Typographie : pile Inter/polices système de SeaPilot, titres hiérarchisés,
  commandes 14 px, tableaux 13 px. Les couleurs de texte et poids suivent les
  tokens de l'application ; la maquette raster ne définit pas une police exacte.
- Espacement : proportions sidebar/portefeuille/dossier conservées, cinq onglets,
  trois sections et une barre de commandes. Les champs réels de 40 px sont
  légèrement plus hauts que ceux de la maquette. Toutes les commandes et le
  total restent accessibles. Sur mobile, rubriques et tableaux défilent dans
  leur zone sans débordement de page.
- Couleurs : action principale `--sp-primary`, panneaux, bordures, rayons et
  focus partagés. Navy de la sidebar et barre supérieure blanche conservés
  conformément au choix explicite de l'utilisateur. Statuts métier distincts.
- Images : logo réel de SeaPilot réutilisé en PNG, crop lisible ; icônes lucide
  déjà utilisées par l'application. Aucun logo recréé ou interface rasterisée.
- Contenu : mêmes rubriques et commandes, dates/montants cohérents. Noms de
  démonstration explicites, navire GOURY et référence DEMO à la place des exemples
  génériques de la maquette. Le module conserve les termes de préparation des
  éléments de facturation ; aucune émission de facture n'est simulée.

Aucun P0/P1/P2 restant dans le périmètre de cette préversion. P3 possible :
affiner le cadrage du logo et les espacements à partir du retour utilisateur.

## Comportements vérifiés

- 98 tests réussis et build de production réussi : moteur existant, exclusions, tarifs d'opérations, stand-by,
  totaux, ajout/modification de frais, indépendance des projets/mois et
  création automatique d'une fiche mensuelle, références par contenu,
  devises séparées et lignes brutes.
- Navigateur : exclusion d'une journée 10 955 → 8 555 €, création d'une
  opération à 2 500 € sans modifier le statut projet, navigation clavier des
  onglets, rendu du vrai PDF et téléchargements PDF/ZIP.
- PDF fusionné vérifié : 3 pages. ZIP vérifié : synthèse et 2 justificatifs.
- Console finale : aucune erreur ni avertissement sur le parcours vérifié.
- Petits écrans : pas de débordement horizontal de page ; menu corrigé.
- Justificatif image : ajout et ouverture d'un PNG local vérifiés.
- Saisie brute : ajout de 2 × 62,50 €, total passant à 11 080,00 €,
  [preuve interactive](./evidence/billing-raw.jpg).

L'export a été recontrôlé après intégration de `origin/main` du 8 octobre
(`474670c`) : modèle PDF bleu courant et téléchargement avec les deux annexes.
Les références client sont maintenant conservées par projet et combinaison de
sections. Ajouter/Aperçu/Exporter restent disponibles sur un nouveau mois et
créent sa fiche. La saisie brute reste accessible dans le menu Ajouter ; elle
apparaît en quatrième section lorsqu'elle contient des lignes. Ces fonctions
préservent l'état initial représenté par la maquette.

Les accès des vrais profils, synchronisations et documents contractuels complets
ne sont pas exercés par ce prototype isolé. Ils ne sont pas modifiés ; le rapport
ne revendique pas une validation de ces parcours de production.

## Itération : en-tête de facturation compact

Demande du 8 octobre : compacter la zone montrée dans
`C:/Users/chris/AppData/Local/Temp/codex-clipboard-d69f2fb0-84a0-42a3-aa42-87d73b252607.png`.
Cette capture décrit la zone à modifier, sans imposer de nouveau style visuel.

- Le titre, le mois et les cinq commandes partagent une rangée lorsque le
  panneau est assez large ; ils reviennent à la ligne aux tailles intermédiaires.
- Les six paramètres restent visibles, dans leur ordre habituel. Leur grille
  dépend de la largeur du panneau, en tenant compte du portefeuille et de la sidebar.
- À 1488 × 1058, hauteur mesurée de la zone titre/commandes/paramètres :
  240 px avant, 156 px après (environ 35 % de réduction). À 2200 × 1058 : 108 px.
- Contrôles de 40 px conservés, règle 44 px sur pointeur tactile conservée.
  Aucun changement de règle de facturation, de valeur, d'action ou d'export.
- Vérification à 390 × 844 : six champs en deux colonnes, page sans débordement
  horizontal (scrollWidth 375 px), menu Ajouter entièrement accessible.
- Comportements recontrôlés : période calendaire/personnalisée, exclusion DPR
  10 955 → 8 555 € puis restauration, rendu du PDF, menus. Les 98 tests existants
  et le build de production passent. Aucun nouvel incident console sur ce parcours.

Captures ouvertes et contrôlées : [ordinateur](./evidence/billing-compact-desktop.jpg),
[grand écran](./evidence/billing-compact-wide.jpg),
[mobile et menu Ajouter](./evidence/billing-compact-mobile.jpg).

Aucun P0/P1/P2 restant dans cette itération.

## Itération : ruban Projet / Catalogue

Demande du 9 octobre : remplacer les deux menus de l'en-tête par les commandes
du même dessin que le Planning, documenter les règles communes de boutons,
puis renommer Référentiels en Catalogue, privilégier une seule rangée et placer
le groupe Projet avant Catalogue.

Références ouvertes : les captures utilisateur
`codex-clipboard-6d326385-f56e-48d6-a2f4-0630a0391a62.png` et
`codex-clipboard-bc487ce5-9f71-49c1-8ed7-6fbd1feaa740.png`.
Le Planning fourni est une référence de dessin, avec ses propres commandes ;
la demande suivante autorise explicitement une rangée au lieu de ses deux.

- L'ancienne disposition à deux menus est remplacée par huit commandes
  directement accessibles, dans les groupes Projet puis Catalogue.
- Le dessin vient de `ModuleRibbon` et du CSS Planning extrait dans
  `src/styles/module-ribbon.css`, partagé entre application et préversion.
  La variante `singleRow` est opt-in ; les rubans métier existants gardent
  leur nombre de rangées et leurs adaptations spécifiques.
- Tous les boutons mesurent 78 × 65 px et ont la même coordonnée verticale.
  Le ruban mesure 90 px de haut, contre 157 px avec deux rangées.
- Les handlers existants, l'archivage confirmé, les états désactivés et les
  calculs de facturation sont conservés. Le ruban est exclu de l'impression.

### Comparaison visuelle

Capture à 1545 × 1000 CSS px, densité 1 ; le navigateur intégré produit une
image de 1530 × 990 px. Cette image est remise à l'échelle du viewport avant
le crop, avec les coordonnées DOM conservées dans
[les mesures](./evidence/project-ribbon-capture.json).
La référence de 1265 × 235 px est cadrée sur son ruban à x7/y72, 1252 × 157 px.
Le ruban Projets a la même largeur de 1252 px et une hauteur de 90 px.

La [comparaison complète](./evidence/project-ribbon-comparison.png) et la
[comparaison rapprochée des commandes](./evidence/project-ribbon-controls-comparison.png)
ont été ouvertes dans la même image. Les cinq surfaces ont été inspectées :

- Typographie : même pile SeaPilot et règles du composant, libellés centrés
  sur plusieurs lignes, noms de groupes en capitales. Le JPEG de preuve
  est légèrement adouci par la capture ; la taille CSS est contrôlée dans le DOM.
- Espacement : colonnes de 78 px, rangée de 65 px, caption de groupe de 20 px,
  séparateurs verticaux et bordure extérieure conservés ; la rangée unique
  est la différence demandée par l'utilisateur.
- Couleurs : fond blanc et tokens communs, icônes `--sp-primary`, rayon de
  commande de 6 px et focus commun ; aucune nouvelle palette indépendante.
- Images et icônes : pictogrammes Lucide existants, sans actifs décoratifs
  ou logo recréés. Les métaphores correspondent aux actions de Projets.
- Contenu : libellés Projet / Catalogue et huit actions cohérents ; les
  commandes propres au Planning ne sont pas copiées dans Projets.

### Comportements et responsive

- 100 tests de préversion et moteur de facturation passent, ainsi que les
  105 tests Planning / permissions ; build de production réussi.
- Les tests couvrent les trois catalogues, leur fermeture et le retour du
  focus, nouveau/modification, archivage annulé et confirmé, actualisation
  et réinitialisation de la démonstration.
- Dans le navigateur intégré, Entrée ouvre un catalogue (Clients, puis
  Prestations après inversion des groupes) ; Échap ferme sa fenêtre et rend
  le focus au bouton d'origine. Aucun avertissement ou erreur console.
- À 1280 × 720, les huit boutons sont sur une seule rangée et la page ne
  déborde pas. À 390 × 844, scrollWidth de page 375 px, conteneur de ruban
  353 px et contenu 653 px ; les huit boutons restent alignés et accessibles
  par défilement. Tab depuis la dernière commande fait défiler le ruban et
  passe à la recherche du portefeuille. Viewport temporaire réinitialisé.
- Les adaptations de Fleet/Certificats, Achats, DPR et Frais restent prioritaires
  sur le socle partagé. Les fixtures Planning des vrais profils sont testées ;
  aucune vue Marin/Capitaine simulée n'est utilisée pour établir les droits.

Captures contrôlées : [ordinateur](./evidence/project-ribbon-desktop.jpg),
[mobile](./evidence/project-ribbon-mobile.jpg).
Charte : règles pour commandes de module, actions locales et confirmations,
tokens, focus clavier, menus, états désactivés et défilement sur une seule rangée.

Aucun P0/P1/P2 restant dans le périmètre. Les écarts de contenu entre Planning
et Projets et la rangée unique sont attendus et explicitement demandés.
Les parcours complets de production et leur intégration ne sont pas changés
par cette préversion ; les vérifications ci-dessus portent sur cette itération.

final result: passed

## Itération : Relevé du mois

Demande du 10 octobre : reprendre le volet de facturation actuel dans la
préversion, avec quatre choix de contenu. L'utilisateur précise que les cases
sélectionnent seulement le PDF, comme dans le volet actuel.

Référence ouverte : capture utilisateur
`C:/Users/chris/AppData/Local/Temp/codex-clipboard-f8ce86ca-2488-44a0-8915-700fe62aac7f.png`,
460 × 1347 px. Le volet rendu et la référence ont été ouverts ensemble dans
[la comparaison complète](./evidence/billing-statement-comparison.png) et
[la comparaison des contrôles](./evidence/billing-statement-controls-comparison.png).
Les deux cartes sont normalisées à 320 px de large. L'état comparable est :
seule Saisie brute cochée, montants nuls, référence vide, PDF standard.

### Comparaison visuelle

- Typographie : pile et tailles SeaPilot, titre/mois, sous-totaux et total
  hiérarchisés ; libellés lisibles à 320 px sans troncature des choix.
- Espacement : carte de 320 px à droite des tableaux dès 860 px de conteneur ;
  sur petit écran, carte avant les tableaux. La carte normalisée est plus haute
  d'environ 90 px que la référence, avec les contrôles partagés et l'explication
  explicite des choix PDF. Les deux actions finales restent sur une rangée.
- Couleurs et surfaces : tokens `--sp-*`, bordures/rayons communs et fonds discrets ;
  le bouton principal reprend la charte actuelle au lieu du bleu de l'ancien volet.
- Icônes : CalendarDays, Save, FileText et Download de Lucide ; aucune nouvelle
  image décorative ni modification du logo.
- Contenu : même ordre que le volet source, avec les intitulés demandés
  Loyers D’affrètement, Services refacturables, Prestation BBTM et Saisie brute.
  Les libellés accessibles gardent Prévisualiser le PDF et Exporter le PDF/ZIP,
  tandis que les libellés visibles sont compacts pour conserver une rangée.

Capture ordinateur à 1545 × 1000 CSS px, densité 1. La capture pleine page fait
1530 × 1767 px et supprime la place du scrollbar, ce qui décale de 15 px la colonne
à droite pendant la capture. Le cadrage de comparaison tient compte de ce décalage ;
ce n'est pas un débordement de l'interface. Les mesures sont conservées dans
[le relevé de capture](./evidence/billing-statement-capture.json).

### Fonctionnement et responsive

- Les quatre cases sont centralisées dans le volet. Les quatre sections restent
  à l'écran quand elles sont décochées ; Saisie brute est accessible même vide.
  Les exclusions individuelles sont conservées après une désélection de section.
- Les calculs et les trois exports réutilisent le moteur existant ; les devises
  restent séparées. La référence suit le projet et le contenu PDF effectif,
  avec les lignes brutes filtrées par période et conservant leur affectation
  propre de navire.
- 105 tests concernés passent dans cinq fichiers (préversion, stockage de
  démonstration, moteur de facturation et références). ESLint ciblé et build
  de production réussis. Aucun changement de droits, RPC/RLS ou base de données.
- Dans le navigateur, désélection des loyers/frais/BBTM : total 0 € et tableaux
  toujours visibles. Sélection BBTM seule avec Saisie brute vide : total 340 €,
  vrai PDF rendu sur une page puis téléchargement PDF réussi. Le détail DPR
  sans prix de loyer est conservé par les règles actuelles du moteur.
- Export ZIP vérifié : PDF de facturation et deux justificatifs de démonstration.
  Aucun avertissement ni erreur console sur ces parcours.
- À 390 × 844 CSS px, page clientWidth/scrollWidth 375/375 px, volet de 329 px.
  Les actions sont sur une rangée, et Espace sur la case des loyers modifie le
  total à 1 355 € sans masquer leur tableau. Viewport temporaire réinitialisé.

Captures ouvertes et contrôlées : [ordinateur](./evidence/billing-statement-desktop.jpg),
[sélection PDF](./evidence/billing-statement-selection.jpg),
[mobile](./evidence/billing-statement-mobile.jpg) et
[aperçu PDF](./evidence/billing-statement-pdf.jpg).

Aucun P0/P1/P2 restant dans le périmètre. Les renommages, les boutons sur une
rangée et l'adaptation aux tokens communs sont les écarts attendus par rapport
au volet source.

final result: passed

## Itération : calendrier visible et commandes locales

Demandes du 10 octobre : déplacer les champs de période sur la ligne du titre,
sélectionner le mois courant à l'ouverture, supprimer les commandes globales,
ajouter les actions propres aux quatre sections et les deux accès au catalogue.
Les précisions suivantes imposent un calendrier visible sans fenêtre et placent
Navire sous Facturation mensuelle.

Référence de la ligne de champs : capture utilisateur
`C:/Users/chris/AppData/Local/Temp/codex-clipboard-81ba7221-c4df-4e70-8e52-b1f882b52b94.png`,
2788 × 118 px avant redimensionnement. Elle décrit les champs à déplacer ; les
positions finales suivent les précisions ultérieures de l'utilisateur.

### Disposition et charte

- Dès 870 px de panneau, titre, Mois, Période, Début et Fin sont sur une rangée.
  Navire est sous le titre, et le calendrier occupe le reste de cette seconde
  rangée. À une largeur inférieure, il garde toute la largeur disponible.
- Le calendrier contient les trois mois autour du mois sélectionné. Ses mois
  sont côte à côte dès 620 px de calendrier, puis empilés sur petit écran.
  Les jours sélectionnés et les bornes utilisent les tokens SeaPilot, avec
  focus visible et nom accessible comprenant le jour et la date complète.
- Les cases du calendrier ont une hauteur minimale de 30 px en disposition
  dense à trois colonnes, 40 px en disposition étroite et 44 px sur pointeur
  tactile. Cette adaptation concerne les jours du calendrier ; les commandes
  habituelles conservent leurs dimensions partagées.
- Ajouter et Catalogue des prestations se regroupent à côté du titre de leur
  section quand la place le permet. Ajouter une ligne et Dupliquer la ligne
  sont côte à côte sous le tableau Saisie brute. Les groupes gardent une rangée et
  défilent localement si nécessaire. Les menus de ligne restent accessibles
  sans être coupés par le cadre du tableau.

### Comportements contrôlés

- L'ouverture et la réinitialisation sélectionnent le mois de la date du jour,
  du premier au dernier jour. Les fixtures métier restent datées d'octobre 2026.
  Le mois entier affiche 16 005 € HT pour P264 ; la période du 5 au 8 octobre
  retrouve 10 955 € HT. Ce changement de total vient de la période initiale.
- Le calendrier ne comporte ni déclencheur ni fenêtre. Premier clic : début
  d'une nouvelle période ; deuxième clic : fin incluse ; troisième clic :
  nouvelle sélection. Le sens inverse, le passage entre mois, les changements
  externes de mois/dates et la navigation clavier sont couverts.
- Le complément des jours sans DPR utilise les lignes synthétiques du moteur
  existant, « 24/24 Operation » et le tarif applicable à chaque date. Le contrôle
  du 12–13 octobre conserve le DPR réel du 12 exclu et complète le 13 à 2 650 €.
  Retirer le complément conserve l'exclusion du DPR réel.
- Ajouter est disponible dans Services refacturables et Prestation BBTM.
  Ajouter une ligne et Dupliquer la ligne sont sous le tableau Saisie brute. La copie
  reprend la dernière ligne ajoutée du mois, même si une autre est sélectionnée,
  sans changer sa date ou ses données métier, avec un identifiant distinct.
  Les cas vide, archivé et export en cours désactivent les actions concernées.
- Les deux boutons Catalogue des prestations ouvrent le même catalogue fictif
  existant en consultation. Échap ferme la fenêtre et restitue le focus.
  Les accès globaux du ruban conservent leur fonctionnement.
- Les quatre cases du Relevé du mois restent des choix PDF seulement. Les
  sections restent visibles, les exclusions sont conservées et les lignes
  brutes gardent leur navire propre dans la période retenue. Aucun changement
  de moteur de production, droit, RPC/RLS ou base de données.

### Navigateur et validation finale

- À 1545 × 1000 CSS px, clientWidth/scrollWidth de page : 1530/1530 px.
  Le calendrier mesure 671 px et ses trois mois environ 218 px chacun.
  Navire reste dans la colonne de 205 px sous le titre.
- À 390 × 844 CSS px, clientWidth/scrollWidth de page : 375/375 px ; calendrier
  de 329 px, mois empilés, jours d'environ 45,6 × 40 px. La sélection du
  28 septembre au 3 octobre affiche les six jours attendus. Le viewport
  temporaire est réinitialisé après vérification.
- L'ajout puis la duplication d'une ligne à 2 × 62,50 € produisent deux lignes
  identiques de 125 € et un total de 11 205 € sur la période du 5–8 octobre.
  Le menu de ligne et l'annulation de suppression ont été contrôlés.
- Après déplacement des commandes sous le tableau brut, les deux boutons
  gardent la même ordonnée. Une nouvelle duplication produit trois lignes
  identiques et un total de 11 330 €. Le PDF sélectionné se rend dans l'aperçu.
- Aucun avertissement ou erreur console sur les parcours examinés.
- Les six fichiers concernés passent : 117 tests, ESLint ciblé et build de
  production avec pnpm 10.34.5. Les 16 tests de préversion et le build ont été
  relancés après le déplacement des boutons sous le tableau : réussis.
  Le déploiement du commit poussé est contrôlé ensuite et suivi dans la PR.

Les défauts de calendrier trop étroit sur mobile et de menu coupé par le cadre
du tableau ont été corrigés dans cette itération. Les captures de contrôle
restent hors du dépôt ; aucun nouvel actif de preuve n'est ajouté.

final result: passed
