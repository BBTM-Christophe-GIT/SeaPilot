# Planning : filtre actif et surbrillance des colonnes

Version 3.56.0.

Administration → Planning contient le réglage **Activer ou désactiver le filtre actif**.
Il est enregistré pour la société courante, désactivé par défaut et modifiable uniquement
par ses administrateurs. Les autres profils du Planning peuvent lire le réglage.

Lorsqu’il est activé, les lignes de collaborateurs sans affectation non annulée entre
aujourd’hui (date de Paris, incluse) et la fin de la période affichée sont masquées.
Dans la vue Flotte, le critère s’applique à chaque ligne navire/bordée/collaborateur.
Dans Équipages, il s’applique au collaborateur dans le périmètre des filtres affichés.
Les événements passés d’une ligne conservée restent visibles. Une période entièrement
passée conserve son affichage historique. Les lignes qui viennent d’être ajoutées restent
temporairement visibles afin de permettre la saisie de leur première affectation.
La désactivation conserve exactement les règles d’affichage antérieures.

Un clic sur un jour de l’en-tête ajoute ou retire une surbrillance bleue légère sur toute
sa colonne. Le clic-glissé sélectionne ou désélectionne un groupe ; plusieurs jours
discontinus peuvent être sélectionnés. Les boutons fonctionnent aussi avec Entrée/Espace.
Les cellules sous la surbrillance restent éditables et leurs couleurs de statut visibles.
La sélection est conservée uniquement en mémoire pendant la visite du Planning : aucune
écriture en base, localStorage ou sessionStorage, et remise à zéro au démontage/rechargement.
Elle n’affecte ni les exports ni les données du planning.

## Déploiement

Appliquer `supabase/migrations/20260926041132_planning_display_settings.sql` avant le client.
Cette migration ajoute une table protégée par RLS et une RPC `SECURITY INVOKER`.
Elle ne modifie aucune affectation, publication ou règle d’accès aux collaborateurs.
Elle a été appliquée au projet Supabase lié, avec le filtre laissé désactivé.

En cas d’échec de lecture, le Planning affiche un avertissement et son contenu habituel.
L’administration empêche alors de modifier une valeur inconnue. En cas d’échec d’écriture,
la valeur enregistrée reste affichée et une erreur explicite est présentée.

## Vérification

- Tests du filtre : désactivé, fin aujourd’hui, période future, affectation annulée,
  affectation hors fenêtre, ancien navire, historique et ligne en cours de création.
- Tests de l’administration : lecture, activation/désactivation, relecture, erreurs réseau.
- Tests de la surbrillance : jours discontinus, clic-glissé, clavier, remise à zéro.
- Régressions Planning et Administration, dont les fixtures des vrais profils Marin/Capitaine.
- `supabase/tests/planning_display_settings_test.sql` décrit les contrôles pgTAP.
  Le projet distant ne possède pas pgTAP : les contrôles équivalents ont été exécutés dans
  une transaction avec assertions SQL et fixtures de rôles, puis annulés par `ROLLBACK`.
  Les lectures par société, écritures Admin, refus Direction/Armement/Capitaine/Marin,
  contournements par UPDATE et privilèges anonymes sont vérifiés.

Retour arrière fonctionnel : désactiver le filtre dans Administration → Planning.
La migration additive peut rester installée lors d’un retour à la version client précédente.
