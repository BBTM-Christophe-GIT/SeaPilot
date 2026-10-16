# Planning — fenêtre centrée de ±4 mois

Version `3.75.10`, build `2026-10-16.002`.

## Comportement

- La vue principale couvre la date de référence moins quatre mois jusqu'à cette
  date plus quatre mois, bornes incluses. Au 16 octobre 2026 : du 16 juin 2026 au
  16 février 2027. Les fins de mois sont ramenées au dernier jour valide.
- À l'ouverture, le jour de référence est centré dans la partie défilante, en
  tenant compte de la colonne de noms figée. Le zoom, le redimensionnement,
  les commandes de mois et « Aujourd’hui » rétablissent ce centrage.
- « Aujourd’hui » recentre aussi une grille déplacée manuellement lorsque la
  date de référence est déjà aujourd'hui. Les filtres, sélections et éditions
  ne réinitialisent pas le défilement.
- Flotte, Projet et Équipages partagent les mêmes bornes. Dans Flotte, l'éligibilité
  des marins continue à utiliser le mois de référence central ; Équipages conserve
  les personnes employées pendant la plage affichée. Les autres modes du
  modèle, les droits et les lectures du planning diffusé restent inchangés.
- Les dates de création restent indépendantes de la fenêtre de consultation :
  le formulaire d'affectation propose la semaine de référence, le glisser-déposer
  d'un marin conserve ses sept semaines, et les congés/nouvelles politiques
  gardent leur date proposée au lundi de référence. Aucun de ces gestes ne crée
  une période de huit mois ni ne propose une date quatre mois dans le passé.

## Déploiement et retour arrière

Changement exclusivement côté client : aucune migration, variable d'environnement
ou nouvelle dépendance. Le lockfile reste identique. Redéployer le client précédent
rétablit la fenêtre de sept semaines.

## Validation

Les tests du modèle couvrent la continuité des jours, les bornes incluses, les
changements d'année et février bissextile. Les tests de page couvrent la navigation,
le centrage initial, le zoom, le retour à aujourd'hui et la conservation du
défilement lors d'un filtre. Les fixtures Marin/Capitaine contrôlent les accès
réels au planning diffusé et la lecture seule.

La recette navigateur compare deux builds de production issus du même code de
référence, avec les mêmes fixtures de prévisualisation et le même navigateur.
Les mesures concernent le rendu client et la modification locale d'un état
quotidien ; elles n'incluent pas la latence réseau ni l'écriture Supabase.

Mesures du 16 octobre 2026, Chromium `149.0.7827.55`, écran `1440 × 1080`,
sur Windows, sans autre test ou build en cours. Référence : commit `e43d75ce`.
Cinq ouvertures dans de nouveaux contextes, puis un préchauffage et cinq
ouvertures avec cache navigateur. Chaque mesure attend l'état attendu puis deux
images d'animation. Les interactions utilisent la même case de démonstration,
avec un changement de statut et de commentaire contrôlé en rouvrant le formulaire.

| Mesure (médiane de 5 essais) | 49 jours | ±4 mois, 246 jours |
| --- | ---: | ---: |
| Navigation initiale → calendrier visible, cache froid | 733 ms | 738 ms |
| Navigation → calendrier visible, cache chaud | 742 ms | 930 ms |
| Ouverture « Statut et commentaire » | 46 ms | 62 ms |
| Enregistrement local → état affiché | 44 ms | 142 ms |
| Changement de mois → grille affichée | 52 ms | 669 ms |

Les 20 lignes produisent 3 742 éléments DOM avant, contre 15 337 après.
La sauvegarde locale reste entre 102 et 204 ms dans cette recette ; la navigation
mensuelle entre 455 et 739 ms. L'affichage initial à froid varie de 714 à 1 493 ms
avec la nouvelle fenêtre. Le volume supplémentaire coûte surtout lors du
changement de mois : ce changement n'est pas présenté comme une accélération.
Ces cinq essais sur fixtures ne qualifient pas les gros volumes réels ni un
appareil mobile lent (le contrôle mobile utilise un viewport, sans ralentissement CPU).

Les cinq sauvegardes sont confirmées par réouverture du statut et du commentaire.
Les 15 contrôles de géométrie et d'interaction passent : bornes, centrage,
navigation, zoom, vues Flotte/Projet/Équipages, conservation du défilement à
l'édition et au repli de lignes, et rendu mobile `390 × 844` sans débordement de page.
Aucune exception JavaScript ou erreur applicative ; le serveur de prévisualisation
renvoie le même 404 préexistant pour `/favicon.ico` dans les deux builds.
