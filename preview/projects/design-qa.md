# Vérification visuelle de la préversion

Date : 8 octobre 2026. final result: passed

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

final result: passed
