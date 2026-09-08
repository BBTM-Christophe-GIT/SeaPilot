# Temps de travail sans capitaine — v3.39.6

Un Marin peut enregistrer un brouillon et signer sa journée même si aucun capitaine
n'est résolu pour cette date. Sans affectation Planning, les heures restent sans
navire ni bordée ; les paramètres du client ne créent pas d'affectation fictive.

La journée signée reste `submitted`, avec `approver_person_id = NULL`. Elle est
visible dans la file Approbation des Administrateurs, de la Direction et de
l'Armement de la même société. Le premier approbateur habilité la valide.
Sa personne, son compte et sa signature sont figés dans les champs de validation
et les événements d'audit ; la signature du Marin reste conservée séparément.

Le capitaine RH affecté au jour concerné reste l'approbateur lorsqu'il est résolu.
Les droits existants Administrateur/Armement sont conservés. Les nouveaux droits
Direction sont limités aux journées déjà soumises sans capitaine : consultation du
contexte, corrections, justification des écarts et approbation. Ils n'ouvrent pas
la saisie de brouillons pour autrui ni l'approbation des journées avec capitaine.
L'auto-approbation du relais est interdite, même avec plusieurs rôles.

La fenêtre mensuelle de saisie, les signatures actives, les justifications
obligatoires des journées non conformes et le verrouillage après validation
restent applicables. Le Marin ne peut plus resoumettre une journée déjà signée
pour remplacer les éléments figés.

## Livraison

1. Appliquer `20260908211213_working_time_management_approval_fallback.sql`.
2. Déployer le client `3.39.6` depuis le commit publié sur GitHub.
3. Vérifier le déploiement Vercel et l'alias `https://sea-pilot-ten.vercel.app`.

La migration conserve les calculs et règles métier existants. Chaque remplacement
de fonction exige une correspondance unique ; une divergence de schéma annule
la migration. Aucune donnée métier existante n'est réécrite.

## Vérification

- `working_time_management_fallback_test.sql` utilise des identités authentifiées
  Marin, autre Marin, Capitaine, Administrateur, Direction et Armement, ainsi qu'une
  Direction d'une autre société. Le test s'exécute en transaction avec annulation.
- Les tests couvrent les RPC de saisie et d'approbation, la lecture via RLS, les
  deux signatures, l'audit, les écarts, l'auto-approbation, la resoumission et les
  journées avec/sans affectation ou capitaine.
- Les tests React vérifient les actions et la file d'approbation avec les fixtures
  propres à chaque profil. Les vues simulées d'une session Administrateur ne
  constituent pas la source de vérité de cette vérification.
- Validation locale : 46 tests React ciblés, 122 assertions SQL sur six suites
  (relais, capitaine affecté, approbation quotidienne, fenêtre de saisie, calculs
  serveur et cycle de repos), ESLint des fichiers concernés et build de production.
- La suite applicative complète (149 fichiers) et le build ont réussi sur GitHub.
  Les 44 assertions du relais ont aussi réussi sur Supabase en production, dans
  une transaction entièrement annulée, y compris l'installation temporaire de pgTAP.
  La migration est alignée sur la version Supabase `20260908211213`.
- La suite historique `working_time_workflow_permissions_test.sql` conserve
  30 échecs reproduits avant cette migration : elle appelle notamment les anciens
  RPC de validation mensuelle désormais révoqués. Son assertion concernant le
  refus de saisie sans Planning est adaptée au nouveau comportement.

## Retour arrière

Un retour au client précédent masquerait la saisie sans capitaine. Conserver la
migration et les signatures déjà enregistrées jusqu'au traitement des journées
en attente ; ne pas rétablir la contrainte exigeant un capitaine sur ces lignes.
