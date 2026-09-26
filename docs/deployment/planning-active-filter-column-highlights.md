# Planning : filtre actif et surbrillance des colonnes

Version 3.56.0.

Administration → Planning contient le réglage **Activer ou désactiver le filtre actif**.
Il est enregistré pour la société courante, désactivé par défaut et modifiable uniquement
par ses administrateurs. Les autres profils du Planning peuvent lire le réglage.

Le bouton **Filtre actif** du Planning permet un choix personnel, enregistré par compte
et société. Sans choix personnel, le réglage de la société s'applique. La préférence de
Julien LECOCQ a été activée le 26 septembre 2026 après identification unique de son compte ;
aucun nom ni identifiant utilisateur n'est codé dans le client ou les migrations.

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

## Bordée Générique

Dans **Ajouter un marin**, **Bordée Générique** propose d'abord Capitaine, Chef Mécanicien,
2nd Capitaine et les autres fonctions usuelles, puis les fonctions supplémentaires du
personnel disponible. Chaque choix crée un poste indépendant dans la bordée et le navire
sélectionnés ; plusieurs postes de même fonction peuvent coexister. Aucun collaborateur
RH ni compte fictif n'est créé.

Double-cliquer sur une case vide ouvre la préparation d'une période (début, fin, statut,
annotation). Plusieurs périodes discontinues sont possibles. Le double-clic sur une
période permet de la modifier ou de la supprimer ; ses bords et son déplacement ajustent
les dates. Les postes sont persistants et restent visibles avec le filtre actif.

Cliquer sur le nom de la fonction rouvre **Ajouter un marin**. Le remplacement transfère
toutes les périodes, statuts, fonctions exercées et annotations au marin sélectionné,
dans une transaction unique. Les contrôles d'emploi, de conflit, de verrouillage et les
triggers habituels d'affectation s'appliquent. En cas d'échec, aucune affectation partielle
n'est créée et le poste est conservé. Une révision empêche d'écraser une préparation
modifiée depuis son ouverture. Un poste vide peut être supprimé directement.

Les préparations sont réservées à Administrateur, Direction et Armement, protégées par
RLS et des RPC qui contrôlent les rôles et la société. Elles ne sont pas incluses dans les
diffusions du planning et ne donnent aucun droit de Capitaine. Après remplacement, les
affectations suivent le circuit habituel de diffusion.

Migrations additives appliquées avant le client :

- `20260926044910_planning_personal_active_filter.sql` : préférence personnelle privée.
- `20260926044913_planning_generic_crew.sql` : postes, périodes préparées et remplacement atomique.

`supabase/tests/planning_generic_crew_test.sql` teste les trois profils de gestion, les
vrais rôles Marin/Capitaine, l'isolation société/compte, le transfert complet, les conflits,
les révisions obsolètes et l'annulation intégrale en cas d'échec. Il s'exécute sans pgTAP
dans une transaction annulée. Conserver ces tables lors d'un retour au client précédent
pour ne pas perdre les préparations. Le bouton personnel permet de désactiver aussi une
préférence qui prévaut sur le réglage de société.

L'audit Supabase signale les deux RPC génériques comme
[fonctions SECURITY DEFINER appelables par un compte connecté](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
Cet accès est intentionnel : les écritures directes sont interdites, et les RPC vérifient
le rôle de gestion, la société, le navire et la révision. Les fixtures ci-dessus vérifient
le refus des profils terrain. Aucun défaut RLS n'est signalé sur les nouvelles tables.
