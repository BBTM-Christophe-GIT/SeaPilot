# Réparation d'une fiche RH vide en doublon

La migration `20261008102754_remove_empty_duplicate_person.sql` conserve la fiche
RH complète `368`, liée au compte de connexion, et supprime uniquement la fiche
vide et non liée `393`. Le compte, les documents RH, les affectations Planning et
les temps de travail de la fiche conservée restent inchangés.

Avant suppression, la migration verrouille les deux fiches et vérifie leur
entreprise, leur identité, leur numéro marin et leurs données. Elle interrompt
la transaction si le doublon contient une donnée différente ou possède une
référence dans une table liée, les périodes de congés ou les rôles d'urgence.
Elle ne fusionne aucune autre fiche et peut être rejouée sans effet.

Validation : exécuter `supabase/tests/empty_duplicate_person_repair_test.sql`
avec `psql` sur la base cible. Ce test applique la migration dans une transaction
annulée, vérifie la conservation de toutes les autres fiches et de leurs liens,
puis vérifie le rejeu. Appliquer ensuite uniquement cette migration et confirmer
l'absence de `393` et la conservation du compte associé à `368`.

Conserver avant application un export privé de `393` en dehors de Git. Pour
annuler la réparation, restaurer cet export uniquement après vérification de
l'identité et de l'absence de nouvelles références. Aucune modification du
client ni des autorisations Marin/Capitaine n'est nécessaire.

Appliquée en production le 8 octobre 2026. La vérification confirme une seule
fiche active liée au compte, avec ses 11 documents RH, 5 affectations Planning,
6 intervalles et 1 registre de temps de travail conservés. Les tests de refus
d'une identité différente, d'une donnée propre au doublon et d'une nouvelle
référence avec suppression en cascade ont été exécutés dans des transactions
annulées. Les 200 tests RH/administration et le build de production passent.
