# Registre LSA — version 3.53.0

Le menu **Registres → Registre LSA** reprend la présentation du Registre des
Remorques : cartes des navires, compteurs, inventaire par type, recherche sans
accents et documents filtrables par année. La sélection du navire est partagée
avec les registres de levage. Les échéances restent présentes sur l’accueil et
ouvrent désormais le Registre LSA.

Les quatre catégories demandées sont : 07.2 Life Jacket, 07.4 GMDSS,
07.6 Pyrotechnie et 07.8 Bouée, Feux à retournement et MOB. Les autres catégories
de Certificats flotte, notamment les radeaux/HRU, restent en place.

## Transfert

Migrations : `20260923095002_lsa_register.sql` et
`20260923095146_lsa_vessel_index.sql` (index de la relation navire).

Inventaire avant transfert sur SeaPilot :

| Catégorie | SUROIT | LANDEMER | Total |
| --- | ---: | ---: | ---: |
| Life Jacket | 11 | 14 | 25 |
| GMDSS | 3 | 2 | 5 |
| Pyrotechnie | 5 | 12 | 17 |
| Bouée, Feux à retournement et MOB | 0 | 1 | 1 |
| Total | 19 | 29 | 48 |

Trois versions PDF en attente de validation et trois événements de renouvellement
sont également transférés. Les PDF restent dans leur emplacement Storage privé :
leurs chemins, tailles, noms, dates et statuts sont conservés. Aucun fichier binaire
n’est supprimé.

La migration verrouille les sources, sauvegarde chaque ligne complète dans
`private.lsa_transfer_audit`, copie les fiches dans `lsa_items`, les versions dans
`lsa_versions` et les événements dans `lsa_renewal_events`. Elle compare chaque
colonne de chaque ligne avec la copie et vérifie la présence et la taille des
fichiers avant toute suppression de la source. Une différence ou une dépendance
supplémentaire (visite, constat, prestataire, rapport de levage) interrompt toute
la transaction. Les identifiants et séquences sont conservés/réinitialisés.

Les quatre catégories sont ensuite retirées du catalogue des certificats et une
contrainte empêche leur recréation par un ancien client ou import. Un futur import
doit cibler le Registre LSA pour ces catégories ; il ne doit pas contourner cette
contrainte. L’historique d’import original est conservé dans chaque fiche.

## Accès

Le menu hérite de la visibilité de Certificats flotte au déploiement et dispose de
sa propre permission `lsa`. RLS applique le périmètre société et navire des
certificats d’origine, y compris aux versions et événements. Marin et Capitaine
sont en lecture seule. Administration, Direction et Armement ajoutent/modifient
les fiches de leur société via un RPC contrôlé. Une modification concurrente est
refusée ; l’utilisateur doit recharger. Les tables ne permettent aucune écriture
directe au rôle authentifié. Les PDF en attente gardent leur statut d’origine.

## Vérifications et livraison

- Essai complet de migration avec transaction annulée : copie exacte, contrôle
  des fichiers et tests `supabase/tests/lsa_register_access_test.sql`.
- Ces fixtures créent de vrais comptes et affectations pour les cinq rôles,
  vérifient la lecture des navires autorisés, refusent les autres sociétés et
  navires non affectés, puis testent la révocation du module et les modifications
  concurrentes. Les fixtures sont annulées après le test.
- Tests React : filtres combinés, réinitialisation, changement de navire,
  modification persistée, accès Marin/Capitaine en lecture seule, retrait des
  catégories et conservation des alertes d’accueil.
- Vérification visuelle locale sur Edge/Playwright : 1440 × 1100 et 390 × 844,
  inventaire, filtres, vue documentaire et filtre année. Données synthétiques de
  prévisualisation uniquement ; les droits réels sont contrôlés par les fixtures SQL.
- Appliquer la migration et vérifier les copies **avant** de publier le client.
  La note de mise à jour `3.53.0-lsa-register` est présentée par le centre existant.

## Résultat sur SeaPilot

Migration appliquée le 23 septembre 2026 : 48 fiches, 3 versions et 3 événements
présents dans LSA, 0 ligne restante dans les quatre catégories sources, 0 différence
avec les instantanés privés. Les 3 objets PDF existent avec les tailles attendues.
Les fixtures SQL passent après application, puis sont annulées.

Le contrôle Supabase ne signale aucun avertissement de sécurité sur les nouveaux
objets exposés. L’information « RLS sans politique » sur l’audit privé est
intentionnelle : aucun utilisateur applicatif ne peut lire cette sauvegarde.

## Retour arrière

Ne pas redéployer seul un ancien client : il ne connaît pas les tables LSA.
Privilégier une correction du client. Si un retour des données est indispensable,
prendre un instantané des tables LSA et réconcilier les modifications intervenues
depuis le transfert ; l’audit privé conserve l’état initial pour comparaison.
Ne supprimer ni les fichiers Storage ni les tables LSA pendant cette opération.
