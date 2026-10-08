# Portefeuille Projet — KPI et favoris personnels (3.60.4)

## Utilisation et types d’opérations

L’utilisation réalisée mensuelle et annuelle compte les jours/navires distincts couverts par des DPR soumis ou validés, non supprimés et rattachés à un projet opérationnel. Les intitulés exacts « Navire à quai » et « Navire en transit » sont exclus, qu’ils soient enregistrés comme projet ou comme texte libre. La comparaison ignore les accents, la casse et les espaces superflus. Un DPR opérationnel le même jour reste compté. Aucun DPR n’est modifié.

Le graphe Types d’opérations propose deux sources avec leurs unités explicites : **Réalisé · DPR** compte les rapports du mois, incluant les deux catégories quai et transit ; **Prévu · planning** conserve les occurrences planifiées. Les deux sources ne sont pas additionnées. Les exclusions de navires, le mois et l’année sélectionnés et le bandeau repliable restent inchangés.

Les sept commandes principales partagent une même grille et une hauteur de 88 px, avec adaptation sur mobile. Le bouton Actualiser est retiré ; les rechargements après modification et la reprise sur erreur restent disponibles.

## Favoris personnels

L’étoile en début de ligne ajoute ou retire un projet des favoris sans ouvrir le dossier. Le filtre **Mes favoris** inclut les projets favoris courants, passés et archivés ; les autres filtres restent applicables. Une sélection vide propose de revenir à tous les projets.

Appliquer `20260928081958_project_personal_favorites.sql` avant le déploiement. La table additive `project_favorites` est indexée par utilisateur et projet ; les préférences suivent le compte sur tous les appareils. La RLS limite lecture, ajout et suppression à l’utilisateur connecté et aux projets de son entreprise qu’il peut consulter. La fonction `projects_set_favorite` est idempotente, s’exécute avec les droits de l’appelant et ne reçoit aucun identifiant utilisateur à usurper. Les clients ne peuvent pas réattribuer un favori par UPDATE.

Une erreur d’enregistrement conserve l’état précédent, affiche un message et permet de réessayer. Un changement de compte invalide les requêtes et mutations de l’ancien compte. La préversion utilise exclusivement des préférences de démonstration locales ; la production persiste les favoris dans Supabase. Les projets, contrats, historiques, fichiers et permissions métier restent inchangés.

Validation : tests des règles KPI, parcours d’ajout/rechargement/retrait/échec de favori, contrôle RLS avec deux comptes, une entreprise distincte et de vrais profils Marin et Capitaine ; transactions de test annulées. Vérifier aussi le rendu des commandes et des étoiles sur ordinateur et mobile.
