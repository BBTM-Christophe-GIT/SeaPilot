# Planning v3.2 — interface hiérarchique et crew list

Version cible : `3.2.0`.

## Périmètre

- arborescence Flotte navire → bordée → marin sans icônes décoratives ;
- actions contextuelles : fiche navire, ajout de bordée et ajout de marin ;
- lieu quotidien conservé uniquement pour `ARMEMENT - CHERBOURG` ;
- texte court indépendant sur chaque jour d’une affectation colorée ;
- sélection visible et aperçu complet des cases pendant un déplacement ;
- plein écran placé avec le zoom, week-ends toujours visibles et outils regroupés en Navires, Armement et Marins ;
- libellé utilisateur `Décision d’effectif` à la place de `Matrice` ;
- menu de publication renommé `Autres actions (n)` avec description de chaque commande ;
- crew list Excel/PDF A4 paysage choisie par date, navire et bordée, construite exclusivement depuis les données Supabase.

Le fichier `D-2-8 CREW LIST.xlsx` sert seulement de référence de structure et de mise en page. Sa feuille `Datas` n’est jamais lue par l’application. Les colonnes non présentes dans le schéma actuel (`nationalité`, `pays de naissance`, `visa/permis de séjour`) restent vides ; SeaPilot signale le nombre de profils incomplets après génération au lieu d’inventer une valeur.

## Ordre de migration

1. Vérifier que `202607140004_planning_fleet_daily_locations.sql` est appliquée.
2. Appliquer `202607140005_planning_assignment_daily_notes.sql`.
3. Exécuter `supabase db lint --linked`.
4. Exécuter `supabase db push --dry-run` et confirmer qu’aucune migration inattendue ne reste.
5. Déployer le client `3.2.0`.

La migration ajoute uniquement un index unique partiel et une RPC authentifiée. Elle ne crée pas de table, ne réécrit pas les journées existantes et peut être rejouée sans danger.

## Contrôles avant déploiement

1. TypeScript, ESLint, tests et build de production réussis.
2. Vérifier que `people` expose `birth_date`, `birth_place`, `identity_document_type` et `identity_document_number` au rôle Planning autorisé.
3. Vérifier que les politiques RLS de `planning_days`, `planning_assignments`, `people` et `vessels` sont actives.
4. Confirmer qu’aucune ligne n’emploie déjà `source_label = 'seapilot-assignment-note'` hors de cette fonction.
5. Tester l’interface à 1440 × 900 et 1366 × 1024 (iPad 12,9 pouces paysage).

## Contrôles après déploiement

1. Ouvrir Flotte et confirmer que les navires sans marin ne sont pas affichés.
2. Vérifier les boutons fiche navire, ajouter une bordée et ajouter un marin, puis leurs permissions.
3. Confirmer que seul `ARMEMENT - CHERBOURG` affiche le lieu quotidien.
4. Saisir deux textes différents sur deux jours d’une même affectation, actualiser et vérifier leur persistance.
5. Déplacer une affectation : toutes les cases de destination doivent être prévisualisées avant le dépôt et la barre source doit être en surbrillance.
6. Vérifier le défilement horizontal sur Jour, Semaine, 2 sem., Mois et An.
7. Ouvrir Outils et vérifier les groupes Navires, Armement et Marins ; le plein écran doit rester à côté du zoom.
8. Générer une crew list Excel puis PDF pour une date/navire/bordée connus ; ouvrir les deux fichiers et contrôler A4 paysage, équipage, rangs et identité disponible.
9. Vérifier qu’un rôle lecture seule ne peut modifier ni navire, ni affectation, ni texte quotidien.
10. Vérifier qu’une période publiée refuse l’écriture côté RPC même si l’interface est contournée.

## Retour arrière

Le client `3.1.2` ne connaît pas encore ce `source_label`. Pour éviter qu’il interprète ces lignes comme des journées équipage, appliquer la procédure suivante avant de le redéployer :

1. exporter les lignes `planning_days` où `source_label = 'seapilot-assignment-note'` ;
2. supprimer la fonction `public.save_planning_assignment_day_note(bigint, date, text)` ;
3. supprimer l’index `public.planning_days_assignment_note_unique_idx` ;
4. ne supprimer les lignes techniques qu’après validation de l’export ;
5. redéployer le client `3.1.2`.

La crew list est générée côté client et n’ajoute aucune donnée ; elle ne nécessite aucune opération de retour arrière.
