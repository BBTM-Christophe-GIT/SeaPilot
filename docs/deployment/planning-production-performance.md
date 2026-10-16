# Planning — performance sur les données réelles

Version `3.75.12`, build `2026-10-16.004`.

## Diagnostic

La session de production réellement connectée affichait encore `3.75.10` ; elle
a été rechargée en `3.75.11` avant le diagnostic. Le planning Flotte contient
94 lignes sur 123 jours, 11 562 cellules de jour et 36 602 nœuds dans le calendrier.
Les anciennes mesures sur les 20 lignes de démonstration ne représentent pas ce volume.

Deux lectures réseau authentifiées ont mesuré environ 1 853–2 035 ms pour les
périodes, 1 509–1 623 ms pour les affectations et 1 224–1 410 ms pour l'historique.
Ces requêtes sont parallèles : leurs durées ne s'additionnent pas.
Le profil CPU montre aussi des normalisations de texte et calculs de dates répétés.

## Corrections

- Les 123 libellés de date sont partagés par les lignes. Les documents RH sont
  indexés par personne et les contextes d'affectation calculés une fois par ligne.
- Le plus décoratif des cellules vides utilise le CSS : trois nœuds en moins
  par cellule, sans changer son bouton, son nom accessible ou son action.
- La comparaison des anciennes affectations est limitée au même couple
  personne/navire, au lieu de parcourir tous les événements pour chaque affectation.
- Un statut quotidien relit uniquement les journées de son marin. Une opération
  structurelle relit les affectations et journées des personnes source/destination,
  sur toutes leurs dates pour récupérer les découpages et déplacements de notes.
  Les révisions et résultats restent autoritatifs côté serveur.
- Le journal se recharge en arrière-plan et ne retarde plus la confirmation
  d'une modification. Les réponses anciennes ne peuvent remplacer un journal récent.
- Les règles SQL calculent une fois les permissions communes à l'entreprise.
  Le prédicat d'origine reste utilisé pour les droits personnels, navires affectés
  et délégations. Les frontières d'entreprise, rôles et privilèges sont conservés.

La fenêtre de ±2 mois, les hauteurs réduites de 10 %, les statuts, les exports et
les règles des vrais profils Marin/Capitaine sont conservés.

## Mesure SQL et isolation des écritures

Sur la base réelle, sous un compte administrateur autorisé :

| Opération SQL isolée | Avant | Après |
| --- | ---: | ---: |
| Lecture des périodes par RPC | 671,7 ms | 55,0 ms |
| Lecture des affectations par RPC | 587,5 ms | 28,7 ms |
| Lecture des 250 dernières entrées d'historique | 260,4 ms | 67,4 ms |
| Modification quotidienne par RPC, annulée | 119,8 ms | 104,1 ms |

Ces temps sont SQL, sans transport HTTP ni rendu navigateur. L'essai d'écriture
appelle la vraie RPC sur une affectation existante dans une sous-transaction
annulée. Les données de l'affectation, ses journées et le journal sont vérifiés
identiques après l'essai ; aucune modification opérationnelle ne reste enregistrée.
Script : `supabase/validation/planning_rpc_rollback_benchmark.sql`.

## Comparaison du navigateur sur le volume réel

Le replay local reprend les relations, dates, statuts et volumes réels, avec
anonymisation avant transfert : 94 lignes, 123 jours et 11 562 cellules. Les
réponses API sont interceptées localement, sans identifiant de connexion ni
écriture en production. Le même poste compare les bundles 3.75.11 et 3.75.12,
sans compilation ni tests concurrents. Médianes de cinq essais :

| Opération du navigateur | Avant | Après |
| --- | ---: | ---: |
| Première ligne visible après navigation | 2 066 ms | 1 752 ms |
| Actualiser le planning monté | 1 269 ms | 776 ms |
| Ouvrir le dialogue de modification | 202 ms | 128 ms |
| Enregistrer et afficher la note modifiée | 1 355 ms | 1 186 ms |
| Passer au mois suivant | 922 ms | 576 ms |
| Nœuds du document complet | 37 495 | 17 194 |

Les mesures visuelles attendent deux frames après le résultat. Le chargement
vérifie une ligne réellement visible, l'actualisation attend la réponse des
périodes et la fin du chargement, l'enregistrement attend la fermeture du
dialogue et la note dans la cellule. Cinq réouvertures confirment le statut et
la note enregistrés dans le replay. Le nombre de lignes, les dates et le
centrage sur aujourd'hui restent identiques.

La recette compare aussi Flotte, Projet et Équipages sur ordinateur et mobile :
268 lignes appariées gardent leur hauteur à 0,1 px près, les icônes restent sous
les noms et dans les lignes, et les 18 contrôles de peinture au centre et aux
deux bords réussissent sans erreur JavaScript.

Pour le marin modifié dans cet essai, la relecture passe de 308 journées
(196 828 octets JSON) à une seule (640 octets). Ces temps isolent le coût du
navigateur et des réponses : ils ne représentent pas une latence réseau réelle.
Les temps SQL ci-dessus mesurent séparément le serveur de production.

## Livraison et validation des accès

La migration `20261016101417_optimize_planning_company_permission_initplans.sql`
est appliquée au projet de production SeaPilot. Les 280 assertions de
`supabase/tests/planning_company_initplans_test.sql` réussissent localement et en
production : comptes authentifiés de recette de chaque rôle, entreprise étrangère, compte inactif,
délégations datées, valeurs NULL, visibilité RLS et RPC. Tous les comptes et
enregistrements de recette sont annulés par transaction.

Le retour arrière SQL est conservé dans
`supabase/validation/planning_company_permission_initplans_rollback.sql`.
Aucun nouveau droit, index, secret ou dépendance n'est ajouté.
