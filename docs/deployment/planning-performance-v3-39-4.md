# Planning — performances v3.39.4

Le Planning affiche ses données opérationnelles dès qu'elles sont disponibles, sans attendre le journal.
Les opérations, contrôles, filtres, publications, exports et droits des profils gardent leur périmètre.

## Modifications

- `usePlanningOverview` charge le journal séparément. Son échec est signalé sans masquer la grille ; une réponse
  ancienne ne remplace pas un journal plus récent reçu après une mutation. Son arrivée ne reconstruit pas les lignes.
- Le journal conserve ses 250 dernières entrées et tous les champs affichés. Le JSON technique `payload`, inutilisé
  dans l'interface, reste stocké en base mais n'est plus téléchargé pour afficher la liste.
- `read_planning_periods` retourne toutes les périodes autorisées en une réponse JSON, sans pagination OFFSET.
  Une empreinte SHA-256 du contenu visible, de l'utilisateur et de la société est recalculée sous RLS à chaque lecture.
  Si elle est inchangée, le client réutilise son tableau en mémoire. Une modification, suppression ou modification
  du périmètre visible invalide le cache. Aucun TTL ne masque une modification, aucun cache persistant n'est créé.
  Le premier chargement conserve les périodes historiques nécessaires aux contrôles et aux exports globaux.
- « Tout le groupe de cases » utilise une seule RPC transactionnelle qui appelle la fonction quotidienne existante.
  Les limites de dates, statuts, commentaires, autorisations et déclencheurs d'audit sont conservés ; l'affectation
  n'est ni découpée ni recréée. En cas d'erreur, tout le groupe est annulé.
- Les lignes de frise sont mémoïsées et leurs gestionnaires accèdent aux dernières valeurs validées par React.
  La sélection d'une ligne n'invalide plus les autres lignes d'équipage. Le formateur de dates est réutilisé.
- La page Planning et JSZip sont chargés à la demande. Les trois imports statiques de JSZip ont été déplacés dans
  les opérations qui l'utilisent (archives RH, attestation DOCX, import Excel du temps de travail).
- Les politiques de lecture RH évaluent les contrôles d'identité et de rôle invariants une seule fois par requête.
  Les contrôles de bordée du Capitaine restent corrélés à chaque personne. Les prédicats et droits sont inchangés.
  Seul l'index de journal strictement redondant est retiré ; les index société/date et date globale restent présents.

## Mesures et portée

Mesures locales du 8 septembre 2026, avant déploiement du client :

| Élément | Avant | Après |
| --- | ---: | ---: |
| JavaScript principal minifié | 2 065 246 octets (production v3.39.3) | 1 742 097 octets (build local) |
| Même fichier, compression gzip Node | 537 894 octets | 438 893 octets |
| Enregistrement d'un groupe de 30 jours | 30 appels RPC | 1 appel RPC |
| Construction du formateur, 10 000 dates identiques | 2 645 ms | 43 ms avec réutilisation |

Le JavaScript principal diminue d'environ 16 % brut et 18 % gzip. Le bloc Planning de 209 Ko est téléchargé lors
de l'ouverture du module. Le test du formateur est un microbenchmark Node, pas une mesure du temps d'ouverture
du Planning. Le gain de latence de bout en bout dépend du réseau et du volume de données ; aucun pourcentage
global n'est déduit de ces chiffres. Le serveur relit toujours les périodes sous RLS pour garantir la fraîcheur.

## Déploiement et recette

1. Appliquer `20260908103600_optimize_planning_reads_and_batch_days.sql` avant le client (réalisé sur la base liée).
2. Exécuter `supabase/tests/planning_performance_test.sql` comme `postgres`. Le script crée des fixtures Armement,
   Marin et Capitaine dans une transaction puis annule toutes les données. Il compare les résultats RLS avec les
   anciens prédicats, la complétude des périodes, l'invalidation du cache, les refus d'édition, les 30 états quotidiens,
   la conservation de l'affectation et le retour à son statut initial. Cette recette a réussi ; aucun compte fictif
   ne subsiste. Les vues simulées d'un compte administrateur ne servent pas à valider les droits des autres profils.
3. Exécuter les tests Planning, App, RH et Temps de travail, le lint des fichiers concernés et `corepack pnpm build`.
4. Vérifier dans le navigateur la navigation vers Planning, Flotte/Équipages, les filtres, le zoom et le menu de case.
5. Fusionner la PR puis vérifier le déploiement Vercel du commit exact et la version sur l'alias de production.

Les dépendances restent identiques (pnpm 10.34.5, lockfile inchangé). Le build conserve l'avertissement existant
sur la taille de certains autres blocs et l'import mixte de `projectDocumentStorage`.

## Retour arrière

Redéployer le client précédent suffit : les nouvelles RPC sont additives et les anciens appels restent disponibles.
Les politiques optimisées sont équivalentes et l'index conservé couvre la même clé que celui supprimé. Ne pas
supprimer les nouvelles RPC tant qu'un client v3.39.4 peut encore les utiliser.
