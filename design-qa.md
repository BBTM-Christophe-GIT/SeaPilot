# Design QA — Création client assistée v3.23.2 (2026-08-30)

## Cibles et état comparés

- Source visuelle : `C:/CODEX/SeaPilot/docs/design/client-postal-location-reference.png` (1 072 × 1 042 px, capture à densité estimée 1,5).
- Source normalisée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-reference-normalized.png` (710 × 690 px).
- Implémentation navigateur : `C:/CODEX/SeaPilot/docs/design/client-postal-location-implementation-final.jpg` (viewport 1 265 × 712 CSS px, densité 1).
- Région d’implémentation normalisée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-implementation-crop.png` (710 × 676 px).
- Comparaison côte à côte ouverte et inspectée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-comparison.png`.
- État : préversion Admin, `Nouveau projet` ouvert, puis `Créer un client`, nom et adresse renseignés, code postal `50340`, liste de 14 communes chargée et `Les Pieux` présélectionnée.

## Findings

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Typographie : la famille, les graisses, tailles, interlignages et hiérarchie du dialogue de référence sont conservés.
- Espacement et rythme : la grille à deux colonnes, le champ Adresse pleine largeur, les hauteurs de contrôles, le bloc représentant et le pied de dialogue restent alignés sur la référence.
- Couleurs et tokens : fonds, bordures, texte, focus et case active utilisent exclusivement les tokens SeaPilot existants.
- Images et actifs : aucun nouvel actif raster, pictogramme approximatif ou dessin CSS n’est introduit ; la croix existante est conservée.
- Copie et contenu : `Pays` disparaît du formulaire ; `Code postal` occupe sa place et `Ville` devient une liste déroulante. Le pays détecté reste invisible.
- Responsive : aucun débordement horizontal au viewport contrôlé. Le léger ascenseur interne visible à 712 px de hauteur provient du conteneur de dialogue global ; tous les champs et actions restent visibles et accessibles (P3 accepté).

## Comparaison et historique

La comparaison complète normalisée est suffisamment lisible pour vérifier les libellés, contrôles, espacements et actions ; aucun recadrage ciblé supplémentaire n’était nécessaire.

1. Première passe : le message d’aide postal ajoutait une ligne visible et repoussait `Client actif` sous le pli (P2).
2. Correctif : le message dynamique est conservé pour les lecteurs d’écran mais retiré du flux visuel.
3. Preuve après correctif : `client-postal-location-implementation-final.jpg` montre `Client actif`, le code postal, la liste de villes et les deux actions dans la même vue.

## Interactions et exécution

- Ouverture depuis `Nouveau projet > Ajouter un client ou affréteur`.
- Saisie de `50340`, chargement réel de 14 communes depuis le référentiel officiel et présélection de `Les Pieux`.
- Sélection de `Le Rozel`, enregistrement dans le jeu de préversion puis présélection automatique du nouveau client dans le projet.
- Option `Autre ville…` présente pour la saisie libre et les adresses étrangères.
- Aucun `vite-error-overlay`, aucun débordement horizontal et aucune interaction rejetée pendant la recette.

final result: passed

---

# Design QA — Rapports QHSE ciblés et page 25 (2026-09-04)

## Références et méthode

- Référence métier : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-c716be6b-c6fd-474e-8051-58d7e1ac4d34.png`.
- Base Superdesign : [RSE — consommations par projet](https://superdesign.dev/teams/72b387e8-4c5d-44bd-8ae5-97dbc2f1181c/projects/f9960330-f385-426d-9e3c-dedc8ae59b48?node=draft-variant-86d7e1f3-ba66-4007-8747-635e6989abea).
- Rendu final : `docs/design/qhse-page25-consumption-report-implementation.png`.
- Superdesign a produit la reproduction de référence. L’itération demandée a ensuite été refusée par le quota de crédits du compte, y compris avec le modèle gratuit ; l’évolution a donc été appliquée directement à partir de la référence Power BI et du système visuel existant.
- Vérification navigateur : Codex In-app Browser sur `http://127.0.0.1:4173/modules/kpi?preview=1`.
- Vérification PDF : téléchargement réel depuis l’interface, `pdfinfo`, rendu PNG par `pdftoppm` à 150 DPI, puis inspection avec `view_image`.
- Format natif contrôlé : A4 portrait, `595.28 × 841.89 pt`, une page ; rendu `1 241 × 1 754 px`.

## Comparaison visuelle

1. Hiérarchie : le titre bleu centré, les trois sections numérotées et le bilan annuel reprennent la lecture verticale de la référence.
2. Disposition : eau et fuel occupent chacun une courbe pleine largeur ; GES et CO2 sont rapprochés en deux colonnes pour tenir sur un A4 sans seconde page.
3. Couleurs : le bleu pétrole structure les titres et la série CO2 ; l’orange distingue les GES ; la série xBee est exclusivement verte.
4. Typographie et densité : les libellés restent lisibles à 150 DPI, le tableau annuel tient sur une ligne par année et aucun contenu ne chevauche le pied de page.
5. Logo : le fichier BBTM carré est centré dans une boîte carrée en conservant son ratio ; aucune déformation horizontale n’est visible.
6. Données et interaction : la sélection 2024–2026 génère 36 points mensuels et trois lignes annuelles ; l’archive obtenue contient exactement les dix pages conservées.

## Différence de texte

- Ajout de la mention explicite « remise à zéro mensuelle » sur les courbes d’avitaillement.
- Ajout des libellés `CO2 émis`, `CO2 avec xBee (-15 %)` et `CO2 réduit par xBee`.
- Suppression du nom du produit dans les textes, sources, métadonnées et pieds de page PDF ; `Supabase` identifie désormais la source.

## Écarts assumés et résultat

- La carte de stress hydrique reste sur la page 7 Environnement ; elle n’est pas répétée sur la page 25 dédiée aux consommations par projet.
- Les données de démonstration ne comportent aucun avitaillement en 2024–2026 : les deux courbes restent donc à zéro dans la capture, tandis que les calculs non nuls sont couverts par les tests unitaires.
- Un message console générique provenant du module Planning de la préversion a été observé ; aucune exception KPI ou PDF n’a été produite.
- La validation finale passe avec 133 fichiers / 969 tests sur un worker, ainsi que le lint complet et le build de production.

Aucun écart P0 ou P1 n’est visible sur le rendu A4 final.

final result: passed

---

# Design QA — Rapports PDF QHSE et qualification d'escale v3.29.0 (2026-09-03)

## Cibles et états comparés

- Référence principale : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-c716be6b-c6fd-474e-8051-58d7e1ac4d34.png` (3 840 × 2 088 px), page Power BI « Indicateur RSE - Environnement ».
- Implémentation PDF : `C:/CODEX/SeaPilot/tmp/qhse-final-qa/environment-2023-2025-final.png` (1 158 × 1 638 px, rasterisation à 140 dpi d'une page A4 portrait).
- Comparaison normalisée côte à côte : `C:/CODEX/SeaPilot/tmp/qhse-final-qa/environment-comparison.png` (2 347 × 1 708 px), ouverte et inspectée comme une seule image après le dernier correctif.
- État de données : la référence affiche GOURY/2026 ; l'implémentation vérifiée affiche la flotte/2023–2025. Cette différence de valeurs est intentionnelle et permet de contrôler le rendu multi-années sans substituer des données Power BI aux données Supabase.
- Interfaces contrôlées dans le navigateur intégré : DPR P144/GOURY avec qualification Crew Change, et page KPI avec filtres multi-années et multi-navires. Les surfaces capturées étaient respectivement d'environ 1 266 × 708 px et 997 × 978 px.

## Résultat visuel

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Le PDF reprend la hiérarchie de la référence : logo, titre bleu, sections numérotées, carte fixe de stress hydrique, séries mensuelles eau/fuel, totaux annuels et comparaison CO2 avec/sans xBee.
- Le rendu est limité à une page A4 portrait, sans contenu rogné ni seconde page. La typographie est volontairement plus compacte que la capture Power BI afin de conserver la lisibilité à l'impression ; cet écart P3 est accepté.
- L'eau est nommée « eau avitaillée » et la comparaison carbone applique le paramètre Supabase de réduction xBee à 15 %.
- Les rapports prioritaires utilisent la même grammaire blanche, bleu pétrole, tableaux gris et graphiques sobres que les pages Power BI fournies.
- L'image de stress hydrique est l'actif original extrait du rapport fourni ; aucun pictogramme approximatif, SVG artisanal ou dessin CSS n'a été introduit.
- Après une première passe, les totaux Eau et Fuel ont été replacés à droite de leurs courbes afin de mieux correspondre à la composition Power BI.

## Interactions et exécution

- Le filtre Années accepte une ou plusieurs valeurs et interdit un état sans année ; le filtre Navires accepte une ou plusieurs valeurs, l'absence de sélection représentant toute la flotte.
- Pour P144/GOURY, cocher Crew Change révèle « 14h Port Call » et « 24h Port Call ». Les deux choix sont mutuellement exclusifs : le contrôle a confirmé que sélectionner 24h désélectionne 14h.
- Décocher Crew Change, changer de projet ou changer de navire retire la qualification devenue invalide.
- Aucun message d'erreur navigateur n'a été observé sur les parcours KPI et DPR.

## Historique de comparaison

1. Première passe KPI : cases à cocher surdimensionnées et en-tête trop serré au viewport intermédiaire (P2).
2. Correctif : taille explicite de 15 px et breakpoint de recomposition porté à 1 180 px ; la capture de contrôle ne montre plus de collision.
3. Première passe PDF : le rapport Environnement débordait sur une seconde page (P1).
4. Correctif : densité des métriques et tableaux adaptée, puis réorganisation des totaux ; `pdfinfo` confirme une seule page A4 portrait.
5. Comparaison finale : source et rendu assemblés dans `environment-comparison.png`, sans défaut de typographie, espacement, couleur, actif, contenu ou responsive de niveau P0/P1/P2.

final result: passed

---

# Design QA — icônes des chapitres QSMS v3.27.15 (2026-09-02)

## Cible et preuves

- Référence visuelle : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-85bb65f3-5992-471d-acbc-84d700d0facd.png` (1 224 × 886 px).
- Rendu local : `C:/CODEX/SeaPilot/docs/design/qsms-chapter-icons-collapsed-v3-27-15.png` (1 227 × 690 px).
- Comparaison plein écran : `C:/CODEX/SeaPilot/docs/design/qsms-chapter-icons-comparison-v3-27-15.png` (2 475 × 928 px).
- Comparaison ciblée du chapitre 03 : `C:/CODEX/SeaPilot/docs/design/qsms-chapter-icons-focus-comparison-v3-27-15.png` (1 020 × 218 px).
- Route : `http://127.0.0.1:5173/modules/procedures?preview=1`.
- Viewport CSS demandé : 1 227 × 894 px, `deviceScaleFactor: 1`. Le navigateur intégré a produit une capture visible de 1 227 × 690 px ; la comparaison ciblée isole et normalise la même ligne de chapitre afin d'éviter de confondre ce rognage avec un écart de design.
- État : profil Admin de prévisualisation, chapitres repliés, données QSMS de démonstration.

## Comparaison visuelle

- Typographie : SeaPilot conserve sa police, ses graisses et sa hiérarchie existantes ; les libellés restent lisibles, sans troncature dans le viewport de référence.
- Espacement et rythme : les pictogrammes utilisent le carré arrondi existant de 26 × 26 px, restent centrés sur la ligne et ne modifient pas la densité de la bibliothèque.
- Couleurs : les tons bleu, vert d'eau, orange et ambre reprennent la sémantique visible dans la référence sans introduire de nouveau token incompatible avec le module.
- Qualité des actifs : tous les pictogrammes proviennent de Lucide, déjà utilisé par SeaPilot ; aucun SVG artisanal, dessin CSS, emoji ou actif raster approximatif n'a été ajouté.
- Contenu : les groupes « Documents non contrôlés » et « ISM - Chapitre non renseigné » sont distincts. Le contrôle Supabase confirme respectivement 21 et 3 sources.
- Icônes : la comparaison ciblée du chapitre 03 confirme le même bâtiment, le même trait et le même traitement bleu. Les 15 correspondances (01 à 13, non contrôlés et non renseigné) sont couvertes par le test de rendu.
- Interactions : le repli/dépli des chapitres a été exercé dans le navigateur intégré. L'ouverture bureau est couverte par des tests de schémas Word, Excel et PowerPoint ; le protocole externe n'a pas été lancé pendant la QA pour ne pas ouvrir une application du poste.
- Responsive : à 753 px de largeur utile, `clientWidth` et `scrollWidth` valent tous deux 753 px ; aucun débordement horizontal n'est introduit par les nouveaux pictogrammes.
- Console : aucune erreur ni alerte navigateur relevée sur la prévisualisation.

## Comparaison et constats

- Premier passage : aucun écart P0, P1 ou P2 sur le composant ciblé. La différence de densité entre la capture SharePoint et l'écran SeaPilot complet est intentionnelle : l'implémentation conserve la coque, les filtres et les contrôles existants de SeaPilot.
- Passage ciblé : la ligne du chapitre 03 a été isolée dans les deux captures ; le pictogramme, le ton, l'alignement et le rayon sont cohérents avec la référence.
- Aucun correctif visuel supplémentaire n'a été nécessaire après comparaison.

## Écarts P0/P1/P2

- P0 : aucun.
- P1 : aucun.
- P2 : aucun.

final result: passed

---

# Design QA — fiche information QSMS v3.27.14 (2026-09-02)

## Cibles et état comparés

- Source visuelle : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-a82bce02-19bd-4ed4-878c-ed0342a261f6.png` (854 × 877 px) et `C:/Users/chris/AppData/Local/Temp/codex-clipboard-d941091b-a573-463b-b857-2acfd0cc8991.png` (1 911 × 190 px).
- Implémentation : capture navigateur intégrée émise pendant cette tâche, URL `http://127.0.0.1:5173/modules/procedures?preview=1`.
- Viewport : 854 × 877 CSS px, densité 1 ; capture d’implémentation 854 × 877 px, sans normalisation.
- État : fiche Administration ouverte sur un document existant, données rapprochées de la capture source (`VPC 06-A`, titre DUERP, navire LANDEMER).
- La source originale et la capture rendue ont été ouvertes dans le même contexte visuel pour la comparaison.

## Résultat visuel

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Typographie : hiérarchie plus nette, poids et tailles cohérents avec les autres modules SeaPilot ; le titre long revient proprement à la ligne.
- Espacement et rythme : sections régulières, grille stable, pied d’actions persistant et aucun débordement horizontal visible.
- Couleurs et tokens : palette SeaPilot respectée ; les états de revue prête/manquante et les alertes J-90 sont sémantiquement distincts.
- Images et actifs : aucun actif raster n’était à reproduire ; les icônes utilisent la bibliothèque Lucide du produit.
- Copie et contenu : la référence calculée, la recherche Projet et le fonctionnement de l’alarme J-90 sont explicités sans réintroduire les champs supprimés.
- Accessibilité et interactions : dialogue et sections nommés, champs associés à leurs labels, fermeture et actions clavier accessibles ; aucune erreur console observée.

La différence de densité avec l’ancienne fiche est intentionnelle : elle correspond au redesign demandé et à la suppression de Type document, Catégorie, Code procédure, Restrictions, Notes et Veille Passerelle. L’en-tête, le bloc Identification et le bloc Validation sont suffisamment lisibles dans la capture complète ; aucun recadrage ciblé supplémentaire n’était nécessaire. La ligne de bibliothèque ne contient plus `PRO · OPE · D` et conserve seulement les badges Navire et Projet.

## Historique de comparaison

1. Première passe à 854 × 877 : aucun défaut P0/P1/P2 ; le code calculé, le titre, les deux premières sections et le pied persistant sont visibles sans collision.
2. Interactions vérifiées : modification Thème/Numéro/Version avec mise à jour immédiate de `VPC 06-A - Titre`, recherche Projet, activation/désactivation de la revue annuelle et absence d’erreur console.

## Implementation checklist

- [x] En-tête `Code - Titre`
- [x] Projet recherchable
- [x] Échéance annuelle et alerte J-90
- [x] Pied d’actions persistant
- [x] Métadonnée technique retirée de la ligne
- [x] Erreurs console contrôlées

## Follow-up polish

Aucun raffinement P3 indispensable au déploiement.

final result: passed

---

# Design QA — Tableau de bord manager (2026-08-25)

## Cibles et état comparés

- Référence validée : `C:/CODEX/SeaPilot/docs/design/home-manager-dashboard-grouped.png` (1920 × 889 px).
- Instruction visuelle finale : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-96919f44-3d9a-4702-804d-1d982d69e22e.png`, utilisée pour supprimer le bandeau `Accès rapides`.
- Implémentation au même format : `C:/CODEX/SeaPilot/docs/design/home-manager-dashboard-implementation-qa.png` (1920 × 889 px, densité 1).
- Capture au viewport natif de travail : `C:/CODEX/SeaPilot/docs/design/home-manager-dashboard-native-qa.png` (1440 × 900 px).
- Capture responsive : `C:/CODEX/SeaPilot/docs/design/home-manager-dashboard-mobile-qa.png` (viewport demandé 390 × 844 px ; surface capturée 375 × 812 px).
- État : préversion Admin, données de démonstration, mardi 25 août 2026 sélectionné, filtre `Tous`, aucun dialogue ouvert.
- La référence complète et la capture d’implémentation finale ont été ouvertes ensemble dans la même comparaison visuelle après la dernière modification du code.

## Résultat visuel

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- La synthèse tient dans un écran de bureau et conserve la hiérarchie validée : salutation, titre, trois compteurs, calendrier à gauche et file consolidée à droite.
- Le calendrier reprend la grille mensuelle, les marqueurs sémantiques, la date active, la légende et les deux prochaines dates clés ; cliquer une date met à jour la file.
- La file est organisée dans l’ordre validé `Achats`, `Temps de travail`, `Flotte & documents`, `Ressources humaines`, avec en-têtes de groupe, quantités et rails de criticité.
- Les filtres, les échéances, les libellés d’action et les chevrons respectent la densité et l’alignement de la référence ; une première passe plaçait les compteurs trop à droite et a été corrigée avant la capture finale.
- Les séparateurs, bordures fines, espacements, tailles de caractères et couleurs d’urgence/échéance/visite suivent le vocabulaire SeaPilot existant.
- La surface manager n’introduit aucun asset raster, dégradé ou illustration : le logo existant et les icônes Lucide déjà utilisées par le produit sont conservés.
- Le bandeau inférieur `Accès rapides` et le bouton `Ouvrir le planning`, présents sur la référence antérieure, sont intentionnellement absents conformément à la dernière demande.
- La coque de navigation noire actuellement livrée par SeaPilot est conservée ; la référence utilisait une approximation bleu marine de cette coque, hors du périmètre de la page d’accueil.

## Données et copie

- Les 21 éléments de la préversion proviennent des jeux de données réalistes des modules ; les compteurs et le nombre de lignes changent avec les données disponibles.
- Les sources consolidées sont les demandes d’achat, alertes de temps de travail, certificats et documents flotte, documents RH, visites médicales et fins de contrat.
- La seule action globale conservée est `Consulter les indicateurs`.
- Les exemples fixes de la maquette sont remplacés par les intitulés, navires, personnes, dates et statuts réels de chaque module ; c’est une différence de contenu attendue, pas un écart visuel.
- Les écrans Armement, Capitaine et Marin restent sur leur accueil existant ; seuls Admin et Direction utilisent le nouveau cockpit.

## Vérification des interactions

- Les filtres `Tous`, `Urgents`, `Cette semaine`, `Achats`, `Documents`, `Flotte`, `Temps de travail` et `Ressources humaines` mettent à jour les catégories et leurs quantités.
- Le filtre `Flotte` n’affiche que le groupe flotte/document ; revenir à `Tous` restaure la file complète.
- Le clic sur la date clé `5 sept — Permis d’Armement` bascule le calendrier sur septembre et affiche les trois éléments associés.
- Les lignes ouvrent la page du module source et `Consulter les indicateurs` cible `/modules/kpi`.
- Aucun débordement horizontal n’est présent aux viewports 1920 × 889, 1440 × 900 et 390 × 844.
- `Accès rapides` et `Ouvrir le planning` sont absents du DOM final.
- Erreurs et avertissements console : aucun.

final result: passed

---

# Planning — lisibilité des bordées et fonctions du personnel (2026-08-28)

## Cible

- Référence validée : `C:/Users/chris/.codex/generated_images/01a04724-460b-79b0-afc3-5a1c9b499384/exec-9c8eb63a-ef8c-4d25-92b7-8b0b15410b3d.png`
- Implémentation locale : `http://127.0.0.1:5173/modules/planning?preview=1`
- Capture d’implémentation : `C:/Users/chris/AppData/Local/Temp/seapilot-planning-qa-centered.png`
- Comparaison côte à côte : `C:/Users/chris/AppData/Local/Temp/seapilot-planning-design-qa-comparison.png`
- Viewport vérifié : 1 936 × 1 048 px, vue Flotte en plein écran, mois d’août 2026.

## Vérifications réalisées

- Chaque ligne de personnel affiche le Prénom NOM puis la fonction métier sur une deuxième ligne.
- La bordée utilise le fond vert d’eau retenu, une ligne verticale et un marqueur circulaire par marin pour rendre la hiérarchie immédiatement lisible.
- Les lignes alternent entre blanc et bleu très pâle sans modifier la couleur des affectations dans le calendrier.
- Les rôles abrégés `MECA`, `PONT` et `CDT` ne sont pas ajoutés à droite des lignes.
- La densité reste compatible avec le planning existant : cinq marins sont lisibles dans une bordée sans créer de colonne supplémentaire.
- Le repli de « Bordée 1 » retire ses cinq lignes, puis le dépli les restaure avec leurs fonctions ; 11 lignes passent à 6 puis reviennent à 11 dans les données de démonstration.
- Le DOM contient les fonctions attendues, notamment « Capitaine » et « Chef Mécanicien ».
- Aucun avertissement ni erreur applicative n’est présent dans la console du navigateur.

## Écarts P0/P1/P2

- P0 : aucun.
- P1 : aucun.
- P2 : les noms et fonctions diffèrent entre la référence et les données de démonstration, ce qui est attendu ; la structure et la hiérarchie visuelle correspondent.

final result: passed

---

# Design QA - Daily Progress Report v3.7.8

## Comparison targets

### Menu ribbon

- Source visual truth: `C:/CODEX/SeaPilot/tmp/design/planning-menu-reference.png`
- Implementation screenshot: `C:/CODEX/SeaPilot/tmp/design/dpr-menu-implementation.png`
- Viewport and state: same in-app browser tab, 1265 x 712 capture, desktop preview dataset, no modal open.
- Comparison evidence: both captures were opened together in the same visual comparison input.

### Generated PDF

- Source visual truth: `C:/CODEX/SeaPilot/tmp/pdfs/goury-january-reference/page.png`
- Implementation render: `C:/CODEX/SeaPilot/tmp/pdfs/dpr-1071-reference-layout.png`
- Rasterization: Poppler at 72 dpi, one portrait page measuring 1896 x 2667.12 points.
- Comparison evidence: both full-page renders were opened together in the same visual comparison input.

## Findings

No actionable P0, P1 or P2 mismatch remains.

- The DPR menu uses the same ribbon component classes, two-row command grid, group separators, icon sizing, badges,
  active state, borders, radius and horizontal overflow behavior as the Planning menu.
- `Saisir un DPR` is the first command in the `DPR` group. `Production` and `Outils` preserve the same visual grammar.
- The PDF reproduces the supplied report frame: BBTM logo, oversized portrait canvas, project/date header, grey mission
  and QHSE section bars, two-column mission content, leading indicators, incident categories and italic footer.
- The exact source logo extracted from the user-provided PDF is reused. Interface icons remain from the project's
  Lucide library.
- Dynamic report values use the selected DPR payload; the filename repeats its DPR number, vessel and date.
- PDF and ZIP generation remain browser-local and create no Supabase object or PDF metadata.

## Interaction verification

- `Saisir un DPR` opens the six-step DPR dialog and the close action restores the workspace.
- Selecting the `P902` project group selects two reports and prepares the matching `DPR-1062 - 01/08/2026` preview.
- Production actions are disabled without a selection and become available from the selected group.
- Browser console errors: none.

## PDF verification

- One page, portrait, 1896 x 2667.12 points.
- Stable filename: `DPR-1071 - GOURY - 29-07-2026.pdf` for the fixture.
- Final Poppler PNG inspection: no clipping, overlap, missing asset, broken glyph or off-page content.

final result: passed

---

# Design QA — Bibliothèque documentaire « Certificats flotte » v3.14.1 (2026-08-11)

## Cibles et état comparés

- Référence SharePoint : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-75259b38-0365-401c-b09c-259a8c52727b.png` (2048 × 952 px).
- Implémentation locale : `http://127.0.0.1:4175/modules/certificates?preview=1`.
- Capture finale : `C:/CODEX/SeaPilot/.data/fleet-library-implementation.png` (1265 × 709 px).
- État : GOURY et la catégorie `01 - Registre International Français` dépliés, zéro document sélectionné.
- La référence complète et la capture finale ont été ouvertes ensemble dans la même comparaison visuelle.

## Résultat visuel

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- La barre de téléchargement reprend les libellés, l'ordre, les états désactivés, la hiérarchie et l'alignement de la référence.
- L'arborescence navire → catégorie → document conserve la densité, les retraits, les connecteurs, les bandes bleu clair et les pastilles de comptage du webpart.
- Les totaux réels sont cohérents : GOURY 29, HIRONDELLE DE LA MANCHE 12, HOLENN EUSA 9, KROKDUR 21, LANDEMER 3, LE ROZEL 22 et SUROIT 22.
- La différence de largeur utile est attendue : la référence montre le webpart seul, tandis que l'implémentation est intégrée à la navigation SeaPilot.
- Une première passe affichait des dates d'expiration inutiles et une icône de dossier trop générique ; ces deux écarts P2 ont été corrigés avant la capture finale.
- Seul subsiste un écart P3 non bloquant : l'icône Lucide `Files` remplace l'icône SharePoint propriétaire.

## Vérification des interactions

- Sélection unitaire et globale, compteur de sélection et activation des actions vérifiés.
- Téléchargement groupé de deux documents vérifié ; le message de succès s'affiche et aucune erreur console n'est produite.
- Le dialogue `Nouveau Document` affiche les 7 navires, les catégories, le titre, les dates et le fichier.
- L'ouverture d'un document réutilise le panneau de détail du certificat.
- Ajout et suppression sont limités aux rôles bureau autorisés ; les fichiers restent dans le bucket Supabase privé.
- Erreurs console : aucune.

final result: passed

---

# Design QA — QHSE KPI / Indicateurs HSE v3.12.24 (2026-08-09)

## Cibles et état comparés

- Référence du tableau HSE : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-9c4fdd65-f0aa-46d8-941e-15cb3b912bdb.png`.
- Référence de navigation QHSE : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-41370d2e-6ffb-4861-af3b-98f4739280d1.png`.
- Implémentation locale : `http://127.0.0.1:4173/modules/kpi?preview=1`.
- Capture d’implémentation : `C:/CODEX/SeaPilot/.data/qhse-kpi-preview.png`.
- État : préversion bureau, QHSE déplié, KPI actif, année 2024 sélectionnée, aucune modale ouverte.
- Les deux références et la capture d’implémentation ont été ouvertes ensemble dans la même comparaison visuelle.

## Findings

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Le tableau de bord quitte le Plan d’action et possède désormais sa propre page `QHSE → KPI`.
- L’entrée KPI est active dans la navigation latérale et le fil d’Ariane affiche `QHSE › KPI`.
- La hiérarchie visuelle, les quatre cartes de synthèse, le filtre annuel, les définitions, les indicateurs HSE et les courbes françaises/IMCA conservent les composants et tokens SeaPilot existants.
- Le bouton `Indicateurs HSE` n’est plus rendu sur la page Plan d’action ; les commandes Actions, Actualiser et Nouvelle action restent inchangées.
- La page KPI conserve les calculs et sources existants sans dupliquer la logique métier : elle appelle les mêmes requêtes versionnées HSE et le même registre d’heures travaillées.

## Vérification des interactions

- Navigation réelle depuis le lien latéral `KPI` jusqu’à `/modules/kpi`.
- Le sélecteur annuel charge 2024 et met à jour heures, cartes et courbes.
- Le dialogue `Définitions et formules` s’ouvre, affiche notamment FAC et TRIR, puis se ferme correctement.
- Les courbes `Fréquence et gravité`, `Accidents enregistrables` et `Prévention, soins et travail adapté` sont présentes.
- Erreurs et avertissements console : aucun.

final result: passed

---

# Design QA — Plan d'action : tableau HSE annuel (2026-08-09)

## Cibles

- En-tête à supprimer : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-a7febe0b-4154-472b-b803-5d9964dd1d33.png`.
- Référence fonctionnelle des indicateurs : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-61f331a8-321c-49e8-9f8f-cdd064c6e140.png`.
- Prototype local : `http://127.0.0.1:4173/modules/actionPlan?preview=1`.
- Capture du tableau : `C:/CODEX/SeaPilot/tmp/action-plan-hse-dashboard.png`.
- La référence de l'en-tête et l'écran Actions final ont été ouverts ensemble dans la même comparaison visuelle.

## Vérifications réalisées

- La bande d'en-tête `Photo / Date - titre / Responsable / Type d'écart / Statut` a entièrement disparu ; les lignes conservent leurs colonnes invisibles et leur alignement.
- Le filtre annuel est visible et sélectionne l'année courante par défaut.
- Les cartes HSE distinguent le nombre de l'année sélectionnée du total historique. La préversion affiche `FAC = 3` et `3 au total`.
- La recette authentifiée de production confirme 2 FAC en 2024 et 1 FAC en 2025 ; l'année 2026 reste donc correctement à 0 tout en affichant `3 au total`.
- Les courbes cumulées TF/TG, LTIFR/TRIR/FAR et RWC/MTC/FAC/SOFR sont séparées en trois lectures explicites, avec axes, légendes et valeurs de fin de période.
- Le dialogue `Définitions et formules` présente les classifications et les six formules sans chevauchement ni troncature.
- Les contrôles Actions, Indicateurs HSE, année et dialogue ont été exercés dans le navigateur intégré.
- Aucun défaut P0, P1 ou P2 ne reste visible.

final result: passed

# Design QA — Suivi du Temps de Travail v3.12.13

## Cibles de comparaison

- Référence utilisateur : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-bbf54d38-a41a-4189-bc1b-0fa97e04880e.png`.
- Capture 15 pouces : `C:/Users/chris/AppData/Local/Temp/working-time-timeline-v3-12-13-1366x768.png`.
- Capture 32 pouces 4K : `C:/Users/chris/AppData/Local/Temp/working-time-v3-12-13-3840x2160.png`.
- La référence et la capture 1366 × 768 ont été ouvertes ensemble dans la même
  comparaison visuelle.

## Résultat visuel

- Le doublon de période visible dans la référence est remplacé par une seule carte
  par marin, qualifiée par le mois affiché et son statut.
- La recherche par nom ou fonction est placée directement au-dessus du catalogue.
- La frise est prioritaire dans la carte de saisie ; elle affiche les 24 repères de
  00 h à 23 h, les 48 demi-heures et le repère terminal 24 h.
- À 1366 × 768, la frise mesure 613 px de large, son `scrollWidth` reste égal à son
  `clientWidth` et aucun libellé horaire ne se chevauche.
- À 3840 × 2160, la page utilise une surface centrale de 1800 px ; la frise mesure
  1085 px et conserve la même hiérarchie sans étirement excessif.
- Les indicateurs sont placés sous la frise. Les signatures passent en disposition
  verticale avant que la zone de saisie ne devienne trop étroite.
- Aucun défaut P0, P1 ou P2 ne reste visible.

## Vérification des interactions

- Deux glisser-déposer disjoints ont produit `05:00–07:00` et `18:00–20:00`, puis le
  bouton unique a affiché « Enregistrer la sélection · 2 périodes ».
- La recherche `Luc` a réduit le catalogue à la seule carte `Luc MARTIN`.
- La navigation ouvre directement le mois courant et les 31 jours restent
  accessibles dans le bandeau horizontal des jours.
- L'onglet Notifications affiche une alerte critique de temps de travail et de repos
  avec les valeurs 24 h et 7 jours.
- Après ajout des RPC de prévisualisation en lecture seule, le rechargement de la
  page ne produit aucune erreur ni aucun avertissement dans la console.

final result: passed

---

# Design QA - Suivi du Temps de Travail v3.12.12

## Cible et comparaison PDF

- Référence maritime fournie : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-0d8e6851-6dfa-48a2-a8a0-7ff046bb7668.png`.
- Rendu SeaPilot : `C:/CODEX/SeaPilot/tmp/pdfs/working-time-register-1.png`.
- Comparaison côte à côte : `C:/CODEX/SeaPilot/tmp/pdfs/working-time-reference-comparison.png`.
- Rasterisation : Poppler à 150 dpi, registre A4 paysage sur la première page et synthèse A4 portrait sur la seconde.

## Résultat

- La première page reprend la structure de la référence : 24 heures divisées en demi-heures, 31 lignes journalières,
  repos sur 24 heures, commentaires, contrôles sur 24 heures et 7 jours et rappel « À ne pas remplir par le marin ».
- Les données disponibles complètent l’en-tête : marin, fonction, mois, navire, OMI, pavillon, validateur et statut.
- Les phases travaillées, les non-conformités et les cumuls sont lisibles sans chevauchement ni texte tronqué.
- La seconde page conserve les commentaires structurés, l’approbation XLSM ou les signatures figées et le journal d’audit.
- Aucun défaut P0, P1 ou P2 n’est visible sur le rendu final.

## Vérification de l’interface

- Vue locale contrôlée à 1920 x 1080 : la frise affiche les 24 heures sans défilement horizontal.
- La croix de retrait est visible en haut à droite de chaque carte `Brouillon` et porte un libellé ARIA nominatif.
- La sélection directe, les indicateurs et le panneau titulaire restent alignés dans la largeur utile.
- Le dialogue de confirmation est déclenché avant tout retrait ; le RPC et le rafraîchissement sont couverts par les tests automatisés.
- Erreurs de console observées pendant le chargement et la vérification : aucune.

final result: passed

---

# Design QA — Suivi du temps de travail v3.12.17

## Résultat

**Bloqué pour la comparaison visuelle automatisée.** La page locale répond correctement sur `/modules/workingTime?preview=1`, mais la connexion au navigateur de contrôle Codex n’a pas abouti après plusieurs tentatives. Il n’a donc pas été possible de produire la capture du prototype nécessaire à une comparaison côte à côte avec la référence `C:/Users/chris/Downloads/f51565b6-4814-4c2c-85ad-2d59516e279a.png`.

## Contrôles exécutés

- Référence et consignes de la pièce jointe relues intégralement.
- Route locale vérifiée avec une réponse HTTP `200`.
- Structure DOM couverte par les tests : barre de commandes, catalogue groupé, calendrier mensuel, 48 demi-heures, analyse automatique, conformité, historique et filtres.
- Régression couverte : deux phases importées pour une même journée, y compris lorsqu’elles proviennent de registres historiques distincts.
- Points de rupture CSS relus pour ordinateur, écran intermédiaire et tablette/mobile (`1450 px`, `1050 px`, `760 px`).
- Accessibilité vérifiée par rôles et libellés dans les tests Testing Library.

## Écarts P0/P1/P2

- P0 : aucun écart fonctionnel détecté par les tests automatisés.
- P1 : aucun écart structurel détecté par la revue DOM/CSS.
- P2 : état visuel non qualifiable sans capture rendue ; une recette visuelle reste requise dès que le navigateur de contrôle est de nouveau disponible.

## États à reprendre visuellement

1. écran 1366 × 768 avec Pierre AUGUIN, août 2026, journée du 3 août sélectionnée ;
2. frise affichant `10:00–12:30` et `13:30–18:00` ;
3. filtre personnel actif/sorti et accordéons de services ;
4. tablette paysage ;
5. historique ouvert et export PDF déclenché.

final result: blocked

---

# Design QA — Plan d'action : alignement des lignes (2026-08-09)

## Cibles et état comparés

- Source visuelle : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-67b90a45-63d6-4456-94e3-0141eb3a7808.png`.
- Implémentation : `http://127.0.0.1:4173/modules/actionPlan?preview=1`.
- Capture bureau : `C:/CODEX/SeaPilot/.data/action-plan-row-alignment-preview.png`.
- Capture mobile : `C:/CODEX/SeaPilot/.data/action-plan-row-alignment-mobile.png`.
- Viewport bureau CSS : 2048 × 1001 px ; capture rendue : 2047 × 1001 px.
- Source : 3449 × 1676 px, affichée avec réduction proportionnelle pour la comparaison globale ; aucune normalisation de densité n'était nécessaire pour juger l'alignement des lignes.
- Viewport mobile CSS demandé : 390 × 844 px ; zone de page mesurée : 375 × 812 px à cause du chrome du navigateur.
- État : onglet Actions, groupes ouverts, données de préversion, aucune modale.
- La source et la capture bureau ont été ouvertes ensemble dans la même comparaison visuelle.

## Résultat de la comparaison

**Findings**

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Typographie : famille, graisse, hiérarchie et retours à la ligne SeaPilot sont préservés ; le titre de chaque action est désormais aligné à gauche.
- Espacement et rythme : les cinq contenus suivent des colonnes stables — titre, échéance, responsable, type d'écart et statut — sans regroupement au centre.
- Couleurs et tokens : couleurs de sévérité, bordures, fonds et états de statut sont inchangés.
- Images et actifs : aucun actif visuel n'est concerné par cette correction ; les icônes existantes sont conservées.
- Copie : aucun texte métier n'a été modifié.

## Évidence ciblée

Une mesure DOM sur les trois lignes de démonstration confirme `display: grid`, `justify-content: stretch` et `text-align: left`. Les débuts de colonnes sont constants à 12, 598, 777, 1060 et 1303 px dans la ligne. Le contrôle mobile confirme `display: flex`, `flex-direction: column`, `text-align: left` et aucun débordement horizontal (`scrollWidth = clientWidth = 375`). La capture globale est suffisamment lisible pour vérifier les titres et métadonnées ; aucun recadrage supplémentaire n'était nécessaire.

## Historique de correction

- Constat initial P1 : la règle générique des boutons imposait `inline-flex` et `justify-content: center` aux lignes, regroupant leur contenu au centre.
- Correctif : restauration explicite de la grille sur `.action-plan-page button.action-plan-row-main`, alignement à gauche de chaque cellule et conservation du mode colonne mobile avec une spécificité équivalente.
- Preuve après correctif : capture bureau ci-dessus, mesures DOM cohérentes et capture mobile sans débordement.

## Vérifications

- Interaction principale : ouverture/fermeture des groupes déjà présente et non modifiée ; trois lignes d'action rendues dans la préversion.
- Erreurs console sur la capture bureau : aucune.
- Vue mobile : hiérarchie verticale conservée et aucun débordement horizontal.

**Open Questions**

- Aucune.

**Implementation Checklist**

- [x] Rétablir la grille de colonnes sur les lignes d'action.
- [x] Aligner à gauche le titre et chaque métadonnée.
- [x] Préserver l'empilement mobile sans débordement.
- [x] Comparer la référence et le rendu local.

**Follow-up Polish**

- Aucun raffinement P3 nécessaire pour cette correction ciblée.

final result: passed

---

# Design QA — Suivi du temps de travail v3.12.18

## Résultat

**Bloqué pour la comparaison visuelle interactive.** La route locale `/modules/workingTime?preview=1` répond en HTTP `200`, mais la connexion au navigateur de contrôle intégré n’a pas abouti lors des tentatives de sélection et de diagnostic. Aucune capture fiable des fenêtres métier n’a donc pu être produite.

## Contrôles exécutés

- tests DOM des commandes supprimées, du libellé « Personnel ancien » et des trois ouvertures de fenêtres ;
- fermeture des fenêtres couverte par leur structure de dialogue, leur bouton nominatif et la gestion de la touche Échap ;
- règles de visibilité vérifiées : import réservé à l’administrateur, HSE / IMCA réservé aux rôles habilités, contrôles travail/repos selon les droits Planning ;
- lint et build de production réussis ;
- export PDF généré, rasterisé avec Poppler et inspecté à sa résolution originale.

## PDF

- fichier contrôlé : `C:/Users/chris/AppData/Local/Temp/seapilot-working-time-qa/registre.pdf` ;
- rendu contrôlé : `C:/Users/chris/AppData/Local/Temp/seapilot-working-time-qa/registre-page.png` ;
- A4 paysage, exactement une page ;
- deux cases de signature visibles au-dessus de la grille ;
- aucune seconde page, aucun chevauchement et aucune mention du nom du produit.

## Écarts P0/P1/P2

- P0 : aucun écart fonctionnel détecté par les 657 tests automatisés ;
- P1 : aucun écart PDF détecté lors de l’inspection du rendu final ;
- P2 : disposition réelle des fenêtres à qualifier visuellement dès que le navigateur intégré redevient disponible.

final result: blocked

## Suivi du temps de travail — rapport de conformité (2026-08-09)

### Références

- `C:/Users/chris/AppData/Local/Temp/codex-clipboard-e21a0094-11c7-429b-887a-795d9bfd5fbc.png`
- `C:/Users/chris/AppData/Local/Temp/codex-clipboard-c32314d7-5958-4387-a2f3-5f64d126c998.png`

### Contrôles réalisés

- Le menu **Armement** est supprimé.
- Le filtre de population est intégré à la carte **Équipage**.
- Le regroupement et le tri utilisent les helpers de la carte RH **Marins par fonction**.
- Les commandes de navigation mensuelle et le commutateur **Jour / Mois** sont placés dans l’en-tête du registre.
- Les journées non conformes possèdent un état rouge explicite et accessible.
- Le rapport PDF BBTM a été généré, rendu en images et contrôlé visuellement : hiérarchie, graphiques, pagination et chapitre final des formules sont lisibles.
- La grille horaire conserve 48 cellules de 30 minutes et affiche la journée complète sans défilement horizontal interne.

### État de la comparaison visuelle

**Bloquée — non validée.** Le navigateur intégré est resté bloqué pendant l’initialisation de la session locale. Aucune capture fiable de l’implémentation n’a donc pu être placée côte à côte avec les références. Les tests de rendu, la compilation et le contrôle visuel du PDF sont passés, mais ce document ne revendique pas une validation visuelle finale de l’écran.

---

# Design QA — Rapport de conformité / multi-sélections v3.12.20

## Cible

- Référence : `C:/Users/chris/Downloads/ChatGPT Image 9 août 2026, 08_55_09.png`
- Vue : modale « Générer un rapport de conformité », étape « 2 — Périmètre »
- Viewport de référence : 2048 × 1151 px

## Vérifications réalisées

- La mise en page conserve les cartes numérotées, les deux colonnes Marins/Navires, le panneau récapitulatif et les tokens SeaPilot existants.
- Le menu est rendu dans le flux de la carte : son ouverture augmente la hauteur de l’étape et ne recouvre pas « Indicateurs inclus ».
- Les états vide, sélection multiple, recherche, ouverture exclusive, fermeture par clic extérieur/Échap et synchronisation du récapitulatif sont couverts par les tests React.
- Les zones interactives principales ont une hauteur minimale de 40 px, des libellés ARIA et un focus visible.
- `pnpm test`, `pnpm lint` et `pnpm build` réussissent.

## Limitation de la recette visuelle

Le contrôleur Chrome persistant de Codex est resté indisponible malgré une réinitialisation et plusieurs tentatives avec délai borné. La capture du rendu local et la comparaison visuelle côte à côte avec la référence n’ont donc pas pu être exécutées dans cette session. La recette fonctionnelle automatisée est complète, mais la validation pixeluelle reste à confirmer sur le déploiement Vercel.

final result: blocked

---

## Dernier contrôle — Plan d'action

Le contrôle le plus récent est **Design QA — Plan d'action : miniature et colonnes à droite (2026-08-09)**, documenté ci-dessous avec sa référence, sa comparaison visuelle et ses mesures DOM.

final result: passed

---

# Design QA — Plan d'action : miniature et colonnes à droite (2026-08-09)

## Cible

- Référence : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-036a2f3b-28f8-4df5-a07c-75abe5d8ceb4.png`
- Prototype local : `http://127.0.0.1:4173/modules/actionPlan?preview=1`
- Contrôle visuel réalisé dans le navigateur intégré Codex, avec la référence et le rendu final placés dans la même comparaison.

## Vérifications réalisées

- Le bouton **Traiter** occupe la première colonne de la ligne, complètement à gauche.
- La miniature de pièce jointe suit le bouton ; elle est recadrée avec `object-fit: cover` et ouvre l'image complète dans un nouvel onglet.
- La date et le titre utilisent la colonne flexible ; Responsable, Type d'écart et Statut conservent des colonnes fixes alignées au bord droit.
- Mesures DOM sur la première ligne à 2 560 px : Traiter x=395, Photo x=485, Titre x=547, Responsable x=1991, Type d'écart x=2208, Statut x=2425.
- Une action soldée ne rend aucun bouton **Traiter** et sélectionne exclusivement `closure_photo_path` comme preuve de traitement.
- La photo de démonstration soldée est chargée à 640 × 427 px, avec un rendu miniature net ; l'actif WebP de prévisualisation pèse 14 Ko.
- 95 fichiers de tests / 670 tests passent, le lint complet et le build de production passent.

## Écarts P0/P1/P2

- P0 : aucun.
- P1 : aucun.
- P2 : aucun.

final result: passed

---

# Planning add-person modal — visual QA

- Source visual truth: `C:\Users\chris\AppData\Local\Temp\codex-clipboard-2eb51068-f4e3-4f87-8fb5-0ac79ad005e4.png`
- Implementation capture: `C:\Users\chris\.codex\visualizations\2026\08\24\01a0327a-13eb-7632-9610-dbc4a742732b\planning-function-order-modal-1758x1035.png`
- Comparison viewport: 1758 × 1035 CSS pixels, device scale 1. Both captures are 1758 × 1035 pixels, so no density normalization was required.
- State: Planning demonstration data, GOURY / Bordée 1, “Ajouter un marin” dialog open.

## Comparison evidence

The source and implementation were inspected together at the same dimensions. The implementation intentionally keeps the existing SeaPilot component styling while applying the requested content and hierarchy changes.

- Full view: all ten requested HR functions are visible without dialog or group scrolling at the desktop reference size. Dialog client/scroll height is 612/612 px and the groups area is 425/425 px.
- Focused region: the long “Directrice Administrative et Financière” heading uses normal white-space in a two-column grid. Its measured box is 228 × 27 px and ends 6 px before the count badge, so it wraps without clipping or overlap.
- Typography and wrapping: existing font, weights and hierarchy are preserved; the long function name wraps cleanly.
- Spacing and layout: the existing four-column desktop grid is preserved, with the exact requested function sequence. The modal remains single-column on the 390 × 844 responsive check with no horizontal overflow.
- Colors and tokens: existing SeaPilot surfaces, borders, badges and primary buttons are unchanged.
- Images and icons: no raster asset was introduced; the existing icon library remains in use.
- Copy and content: undated CDI metadata and the “Fonction non renseignée” group are absent. Boris BROT displays “CDD · Départ 31/12/2026”.
- Interaction: the dialog opens and closes, every visible personnel entry keeps its Ajouter action, and the GOURY Bordée 1 hierarchy is ordered by the same HR-function sequence.
- Runtime: no browser console errors were observed in desktop or mobile checks.

## Comparison history

1. Source finding (P1): the long administrative/financial function collided with its count badge. Fixed with a resilient grid header and wrapping; post-fix measurement confirms no overlap.
2. Source finding (P1): modal groups and board-tree personnel did not follow the requested HR-function sequence. Fixed with one shared normalized comparator; post-fix DOM order matches the ten-function sequence.
3. Source finding (P2): undated CDI metadata and the missing-function group added noise. Fixed by rendering contract metadata only with a departure date and excluding blank HR functions.

No actionable P0, P1 or P2 visual issue remains in the verified states.

final result: passed
