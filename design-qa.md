# Design QA — RH maître–détail et carte Fiche RH

## État comparé

- Source visuelle : `C:/CODEX/SeaPilot/docs/design/hr-profile-card-reference.png`
- Implémentation : `C:/CODEX/SeaPilot/docs/design/hr-master-detail-implementation.png`
- Comparaison complète et focalisée : `C:/CODEX/SeaPilot/docs/design/hr-master-detail-comparison.png`
- Viewport : 1536 × 1024
- État : administrateur, 18 collaborateurs actifs, Adrien BOIS sélectionné, 11 documents, onglet Documents actif.

## Surfaces de fidélité

- Typographie : hiérarchie nom, fonction, statut, indicateurs, informations personnelles, onglets et documents conforme à la référence ; la police du produit reste celle de SeaPilot.
- Espacement et rythme : même séquence avatar/identité, quatre indicateurs, informations personnelles, cinq onglets et groupes documentaires. La carte est plus compacte et utilise un défilement interne afin de rester visible à côté de la liste.
- Couleurs : palette blanche, bleu SeaPilot et états vert/orange/rouge alignés sur la référence et les jetons existants.
- Images et icônes : aucun actif raster manquant ; avatar à initiales et icônes proviennent du système de composants existant.
- Contenu : 11 documents et groupes Pont, Machine, Formation de Sécurité, Visite Médicale et Safety Induction représentés avec échéance et statut.
- Responsive : grille maître–détail sur écran large, empilement sous 1180 px, métriques et informations personnelles réorganisées sur mobile.

## Interactions contrôlées

- Cliquer Marie LEROY remplace immédiatement Adrien BOIS dans la carte et active la ligne sélectionnée.
- Les onglets Documents, Compétences, Formations, Visites médicales et Historique changent le contenu affiché.
- Les catégories documentaires se déplient et se replient.
- La branche Sédentaire contient cinq sous-niveaux fonctionnels et se replie comme un niveau 1.
- Aucun contrôle nommé Actif et aucun numéro de marin ne sont présents dans les lignes collaborateurs.
- L’ouverture de la fiche complète reste disponible depuis la carte.
- Aucune erreur ou alerte provenant de l’application locale dans la console.

## Findings

- Aucun écart P0, P1 ou P2 restant.
- P3 accepté : la référence affiche Nationalité ; le modèle RH actuel ne possède pas ce champ, donc la carte utilise Lieu de naissance.
- P3 accepté : les cases de sélection documentaire et l’action Renouveler conservent les fonctions opérationnelles existantes, absentes de la capture de référence.

## Historique de comparaison

- Premier passage : composition, densité, onglets, statuts et documents alignés ; aucun correctif produit P0/P1/P2 requis.
- Le cadrage de la preuve focalisée a été ajusté pour comparer la carte à taille lisible, sans changement de l’interface.

## Checklist

- [x] Liste compacte sans numéro de marin ni case Actif.
- [x] Carte Fiche RH persistante à droite.
- [x] Sélection d’un collaborateur au clic.
- [x] Arborescence Sédentaire à deux niveaux.
- [x] Onglets et groupes documentaires interactifs.
- [x] Vérification desktop, responsive, tests et console.

final result: passed

## Mise à jour — affichage des informations de la Fiche RH (2026-07-12)

- Demande : supprimer l'apparence de boutons/cartes autour de chaque information dans toutes les sections de la Fiche RH.
- Décision : conserver la grille responsive, mais présenter les libellés et valeurs sur fond blanc, sans bordure ni rayon, avec un séparateur horizontal discret.
- Portée : mode lecture seule de la Fiche RH uniquement ; les champs du mode modification restent clairement identifiables comme contrôles de formulaire.
- Intention visuelle : affichage plus léger, simple et moderne, avec une hiérarchie renforcée entre libellé secondaire et valeur principale.
- Livraison : version applicative `1.1.1`, incluant cette refonte sur la production Vercel.
