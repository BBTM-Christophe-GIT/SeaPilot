# Filtres navires — 3.51.1

Les filtres et sélecteurs utilisent le comparateur commun `fleetDisplay.ts` : longueur hors tout décroissante, longueur du catalogue existant si la fiche est incomplète, navires sans longueur connue ensuite, puis quais et bureaux. Les choix globaux (« Flotte », « Tous les navires ») restent en tête. Les libellés servent seulement à départager les longueurs identiques.

La règle est appliquée aux registres Exercices, Produits Chimiques et Levage, à l'accueil, aux notes de frais, aux projets/facturation, aux certificats et aux sélecteurs d'export Planning. Les listes déjà triées (Plan d'action/KPI, DPR, Planning, temps de travail, procédures et demandes d'achat) gardent le même comparateur. Les requêtes de sélection DPR, Planning et temps de travail transportent désormais la longueur enregistrée ; le comparateur accepte aussi directement les champs `length_overall` et `asset_kind` des RPC.

Le RPC `private.emergency_exercises_people` conserve ses vérifications de société, module et profil et ne propose que les navires actifs. Tamaris, BBTM 2710, Écréhouel et la seconde fiche Hirondelle étant inactifs, ils ne figurent plus dans les filtres. Les noms sont également dédoublonnés côté client, après restriction au périmètre autorisé. Aucun navire ni DPR n'est supprimé ; l'historique des exercices reste inclus dans la vue globale.

Déploiement : appliquer `20260923053355_emergency_exercises_active_vessels.sql`, exécuter `supabase/tests/emergency_exercises_access_test.sql` (fixtures authentifiées des cinq profils, transaction annulée), puis livrer le client. La migration remplace seulement le RPC privé de sélection, sans nouvelle permission.

Contrôles : ordre numérique et longueurs importées, une seule Hirondelle malgré les variantes d'espacement/casse, bon identifiant transmis au filtre, exclusion des navires inactifs pour Marin/Capitaine et les trois profils de gestion, conservation des totaux historiques, export et navigation existants.

Cette correction n'ajoute aucune note au catalogue des mises à jour.
