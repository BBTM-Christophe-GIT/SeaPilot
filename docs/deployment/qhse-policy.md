# Politique QHSE

Version 3.67.0, build 2026-10-02.004. Le bloc **Politique QHSE** est le premier contenu de l’accueil. Le module est aussi accessible dans **QHSE → Politique QHSE** et à `/modules/qhsePolicy`.

## Politique et documents

Le lecteur reprend le chapitre **02 - Politique en Matière de Sécurité et de Protection de l'Environnement** des Procédures QHSE. Sans réglage spécifique, il choisit le PDF publié le plus récent du chapitre, avec un tri déterministe par identifiant en cas d’égalité. Les documents Word, les brouillons et les versions archivées sont exclus. Une version explicitement choisie devenue inaccessible ne peut pas être remplacée silencieusement par une autre.

Administration et Direction peuvent sélectionner une publication existante ou un lien Google Drive HTTPS canonique vers un PDF. Le lien externe conserve les autorisations Google Drive et s’ouvre dans leur aperçu intégré. Les sources et leur publication restent gérées dans Procédures QHSE. Les PDF du stockage privé sont chargés par URL signée ; les publications gérées par le lanceur Drive utilisent sa lecture vérifiée existante. Le lecteur PDF intégré affiche les pages sur canvas, avec pagination, adaptation à la largeur et texte accessible. Aucun document privé n’est copié dans les fichiers publics du site.

## Processus, objectifs et suivi

Les catégories sont nommées **Processus**. Leur nom et leur descriptif sont modifiables. Un objectif comporte un intitulé, un descriptif facultatif, un responsable facultatif, une échéance facultative et un pourcentage initial entre 0 et 100 (deux décimales au maximum).

**Détails et suivi → Ajouter un suivi** enregistre une date, un commentaire obligatoire et un pourcentage. Le pourcentage courant suit la dernière saisie enregistrée, y compris une correction ou une baisse. La date métier et l’heure d’enregistrement sont distinctes ; l’auteur est fourni par l’identité Auth. Les entrées initiales et les suivis restent immuables. L’archivage conserve les objectifs et leur historique ; le filtre des archives les rend consultables. Les processus archivés et leurs objectifs sont exclus de la moyenne des objectifs actifs et du compteur d’objectifs réalisés.

## Accès et persistance

Tous les profils autorisés du même périmètre consultent le module. Seuls **Administration et Direction** de la société active peuvent modifier sa politique, ses processus, ses objectifs et leurs suivis. Armement, Marin et Capitaine restent en consultation. Une configuration de navigation ne transforme pas un profil lecteur en gestionnaire.

La migration `20261002074444_qhse_policy_objectives.sql` ajoute quatre tables avec RLS, les permissions du nouveau module et des RPC publiques `SECURITY INVOKER`. Les seules écritures passent par des fonctions contrôlées du schéma privé `qhse_policy_private` : société active, appartenance active, rôle et module sont vérifiés. Les tables exposées sont en lecture seule pour `authenticated`, sans accès `anon`. Les identifiants du document et les liens sont vérifiés côté serveur.

Créer un objectif et son état initial est atomique ; ajouter un suivi et modifier son pourcentage est également atomique. Une révision attendue et un verrou empêchent une ancienne saisie d’écraser une modification plus récente. Les conflits demandent une actualisation. Une erreur de lecture après une écriture acquittée ne renvoie pas l’écriture.

Appliquer la migration avant le frontend. Aucune variable d’environnement supplémentaire, aucune politique inventée et aucun objectif initial fictif en production.

## Vérification

`supabase/tests/qhse_policy_access_test.sql` est une fixture transactionnelle à annuler : identités Auth réelles indépendantes pour les cinq profils, société étrangère, accès directs et RPC, immutabilité de l’historique, conflits de révision, dates/pourcentages invalides et archives. Les vues simulées Marin et Capitaine d’une session Admin ne servent pas de preuve de permissions.

Les tests frontend couvrent les rôles en lecture, la gestion, la progression et l’historique, les réponses tardives et les échecs d’actualisation. Les tests de préversion utilisent uniquement un état en mémoire, réinitialisé au rechargement. Le PDF public `demo/politique-qhse-demo.pdf` est explicitement marqué **Document de démonstration** et ne reproduit pas la politique réelle de la compagnie.
