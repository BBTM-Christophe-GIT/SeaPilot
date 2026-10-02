# Politique QHSE

Version 3.67.1, build 2026-10-02.005. Le bloc **Politique QHSE** est le premier contenu de l’accueil. Le module est aussi accessible dans **QHSE → Politique QHSE** et à `/modules/qhsePolicy`.

## Politique et documents

Le lecteur reprend le chapitre **02 - Politique en Matière de Sécurité et de Protection de l'Environnement** des Procédures QHSE. Sans réglage spécifique, il choisit le PDF publié le plus récent du chapitre, avec un tri déterministe par identifiant en cas d’égalité. Les documents Word, les brouillons et les versions archivées sont exclus. Une version explicitement choisie devenue inaccessible ne peut pas être remplacée silencieusement par une autre.

Administration et Direction choisissent le document dans la liste recherchable de tous les **PDF publiés** des Procédures QHSE. La sélection se fait par identifiant ; aucune nouvelle URL libre n’est enregistrée. Le choix automatique conserve le dernier PDF du chapitre 02. Une première page miniature s’affiche dans le module et s’agrandit au clic. Les sources et leur publication restent gérées dans Procédures QHSE. Les PDF du stockage privé sont chargés par URL signée ; les publications gérées par le lanceur Drive utilisent sa lecture vérifiée existante. Le lecteur PDF intégré affiche les pages sur canvas, avec pagination, adaptation à la largeur et texte accessible. Aucun document privé n’est copié dans les fichiers publics du site. Une ancienne URL externe reste consultable ; pour l’export, il faut choisir un PDF publié dont les octets sont accessibles.

## Processus, objectifs et suivi

Les catégories sont nommées **Processus**. Leur nom et leur descriptif sont modifiables. Un objectif comporte un intitulé, un descriptif facultatif, un responsable, une échéance facultative et un pourcentage initial entre 0 et 100 (deux décimales au maximum). Le responsable est une personne **En poste**, l’**équipage d’un navire** ou un **bureau** nommé, par exemple « Armement - Cherbourg ». Le critère RH En poste utilise la date d’entrée et une date de départ absente ou strictement postérieure à aujourd’hui à Paris ; la case `active` ne remplace pas ce critère. Les options de personnel sont réservées aux gestionnaires, sans exposer les fiches RH aux lecteurs. Le serveur vérifie la société et l’éligibilité du responsable choisi. Les anciennes affectations sont conservées.

**Détails et suivi → Ajouter un suivi** enregistre une date, un commentaire obligatoire et un pourcentage. Le pourcentage courant suit la dernière saisie enregistrée, y compris une correction ou une baisse. La date métier et l’heure d’enregistrement sont distinctes ; l’auteur est fourni par l’identité Auth. Les entrées initiales et les suivis restent immuables. L’archivage conserve les objectifs et leur historique ; le filtre des archives les rend consultables. Les processus archivés et leurs objectifs sont exclus de la moyenne des objectifs actifs et du compteur d’objectifs réalisés.

Un suivi peut inclure jusqu’à **10 pièces jointes de 25 Mio chacune** : PDF, images, documents bureautiques et fichiers texte courants. Le responsable est également figé dans les nouveaux suivis ; les historiques antérieurs ne reçoivent pas de responsable inventé rétroactivement. Le transfert utilise des jetons temporaires propres à l’utilisateur, puis enregistre atomiquement progression, historique et références des fichiers. Un échec ne crée pas de suivi partiel. Les pièces finalisées ne peuvent être remplacées ni supprimées par les comptes de l’application.

## Export PDF

**Exporter le PDF** compile le document original, tous les processus et objectifs, leur historique et leurs pièces jointes, avec identification des archives. Les pages PDF sont reprises dans leur taille d’origine ; les images sont rendues en annexes sans découpage. Les fichiers originaux, y compris les formats bureautiques, sont aussi intégrés au PDF et repérés dans l’inventaire. Le dossier ne contient pas d’URL signée privée. Une pièce indisponible, incohérente ou illisible bloque l’export complet au lieu d’être omise. Les lecteurs autorisés peuvent également exporter ce qu’ils consultent.

## Accès et persistance

Tous les profils autorisés du même périmètre consultent le module. Seuls **Administration et Direction** de la société active peuvent modifier sa politique, ses processus, ses objectifs et ajouter leurs suivis. Armement, Marin et Capitaine restent en consultation. Marin et Capitaine consultent **tous les objectifs et suivis de leur société**, y compris les pièces jointes, sans limitation au responsable affecté. Une configuration de navigation ne transforme pas un profil lecteur en gestionnaire.

La migration `20261002074444_qhse_policy_objectives.sql` ajoute quatre tables avec RLS, les permissions du nouveau module et des RPC publiques `SECURITY INVOKER`. Les seules écritures passent par des fonctions contrôlées du schéma privé `qhse_policy_private` : société active, appartenance active, rôle et module sont vérifiés. Les tables exposées sont en lecture seule pour `authenticated`, sans accès `anon`. Les identifiants du document et les liens sont vérifiés côté serveur.

La migration `20261002113902_qhse_policy_owners_and_attachments.sql` ajoute les responsables structurés, la capture du responsable au suivi, les références immuables de pièces jointes et le bucket privé `qhse-policy-attachments`. Des politiques Storage restrictives empêchent l’écrasement et la suppression des preuves finalisées, même si une autre politique générale existe. Les lecteurs de la société accèdent uniquement aux fichiers référencés par un suivi, par URL signée ou téléchargement privé ; les transferts non finalisés restent propres au gestionnaire qui les a préparés.

Les jetons de transfert expirent après 24 heures. Le client nettoie les échecs observés ; une fermeture du navigateur pendant un transfert peut laisser un objet privé non finalisé. Aucun purgeur périodique n’est installé : leur suppression doit être effectuée par l’API Storage, en conservant tous les jetons finalisés et leurs preuves.

La migration `20261002114529_qhse_policy_upload_company_index.sql` couvre la clé étrangère de société des transferts. Le schéma privé reste volontairement sans politiques de lecture directe : seuls les RPC contrôlés accèdent aux jetons.

Créer un objectif et son état initial est atomique ; ajouter un suivi et modifier son pourcentage est également atomique. Une révision attendue et un verrou empêchent une ancienne saisie d’écraser une modification plus récente. Les conflits demandent une actualisation. Une erreur de lecture après une écriture acquittée ne renvoie pas l’écriture.

Appliquer la migration avant le frontend. Aucune variable d’environnement supplémentaire, aucune politique inventée et aucun objectif initial fictif en production.

## Vérification

`supabase/tests/qhse_policy_access_test.sql` est une fixture transactionnelle à annuler : identités Auth réelles indépendantes pour les cinq profils, société étrangère, accès directs et RPC, immutabilité de l’historique, conflits de révision, dates/pourcentages invalides et archives. Les vues simulées Marin et Capitaine d’une session Admin ne servent pas de preuve de permissions.

`supabase/tests/qhse_policy_owners_attachments_test.sql` vérifie ces mêmes profils avec les responsables En poste, les affectations étrangères, la sélection de PDF publiés et les droits Storage. Les objets de cette fixture sont des métadonnées synthétiques annulées avec la transaction ; les tests de lecture et d’export vérifient séparément les octets PDF, images et fichiers bureautiques.

Les tests frontend couvrent les rôles en lecture, la gestion, la progression et l’historique, les réponses tardives et les échecs d’actualisation. Les tests de préversion utilisent uniquement un état en mémoire, réinitialisé au rechargement. Le PDF public `demo/politique-qhse-demo.pdf` est explicitement marqué **Document de démonstration** et ne reproduit pas la politique réelle de la compagnie.
