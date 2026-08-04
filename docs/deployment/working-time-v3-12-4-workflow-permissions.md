# SeaPilot v3.12.4 — workflow et autorisations du temps de travail

Date de livraison : 4 août 2026.

Cette étape livre le workflow opérationnel des registres individuels de temps de
travail. Les règles sont appliquées à la fois par l’interface, les RPC Supabase,
les déclencheurs de verrouillage et les politiques RLS.

## Parcours utilisateur

- le marin consulte et complète son propre registre, l’enregistre en brouillon,
  appose explicitement sa signature de profil active puis le soumet ;
- le capitaine complète son registre et ceux des marins de sa bordée, uniquement
  lorsqu’une publication Planning couvre le navire, la bordée et la date ;
- le capitaine contrôle les registres soumis de sa bordée, sans pouvoir valider
  son registre personnel ;
- un autre capitaine autorisé, l’Armement ou un administrateur peut valider le
  registre personnel du capitaine ;
- une validation verrouille les créneaux et commentaires ; une réouverture exige
  un motif conservé dans l’audit.

La Direction ne reçoit aucun droit implicite de saisie, de validation ou de
réouverture.

## Non-conformités et signatures

Les heures non conformes restent conservées et visibles. Avant validation, chaque
date non conforme calculée par le serveur doit comporter un commentaire enregistré
par un compte ayant le rôle Capitaine. Les signatures du titulaire et du validateur
sont des instantanés versionnés comprenant l’identité, le navire et la bordée afin
de préserver l’historique du registre.

## Autorité serveur

La migration `20260804082751_working_time_workflow_permissions.sql` ajoute les RPC
de contexte, d’ouverture de registre, de saisie et retrait logique d’un créneau,
de commentaire et de transition de statut. Les écritures directes des comptes
authentifiés restent révoquées : les RPC vérifient les rôles, la société, les
affectations du Planning publié, le statut du registre et les signatures actives.

Les déclencheurs refusent toute mutation d’un registre validé. Le retrait d’un
créneau est logique et motivé, ce qui préserve les heures historiques et la piste
d’audit.

## Interface

La page `/modules/workingTime` affiche les registres accessibles, leurs créneaux
horodatés, les signatures de profil, les journées non conformes et les actions
autorisées selon le statut. La préversion SeaPilot fournit des données de
démonstration pour contrôler les vues Admin, Armement, Capitaine et Marin.

## Vérifications

- reconstruction complète de la base locale à partir de toutes les migrations ;
- 120 assertions pgTAP sur le modèle, les politiques, les calculs et le workflow ;
- lint Supabase sans erreur de schéma ;
- tests React des requêtes, états, signatures, commentaires et verrouillages ;
- contrôle visuel ordinateur et mobile, sans débordement horizontal ni erreur de
  console ;
- lint TypeScript et build de production.

La migration est destinée au déploiement automatisé après fusion de la pull
request. Elle ne doit pas être appliquée manuellement à la production avant la
fusion.
