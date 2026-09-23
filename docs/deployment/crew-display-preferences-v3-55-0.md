# Préférences Équipages — v3.55.0

Dans **Administration → Équipages**, chaque administrateur peut enregistrer son
format **Prénom NOM** ou **NOM Prénom**, et son tri préféré. Les préférences sont
personnelles, liées au compte et à la société active, et suivront le compte sur
ses appareils. Aucun changement de nom n’est écrit dans les fiches RH.

Dans **Planning → Équipages**, le sélecteur **Trier par** propose :

- Période d’embarquement : comportement précédent, conservé par défaut.
- NOM : A à Z : nom de famille puis prénom, avec une comparaison française.
- Fonction : Capitaine, Chef Mécanicien, 2nd Capitaine, Maître d’équipage,
  Maître Machine, Matelot ; les autres fonctions suivent. Le nom puis le prénom
  départagent les marins de même rang. La fonction de référence est celle de la
  fiche RH. Le regroupement Équipes conserve chaque équipe ensemble.

Le changement de tri dans le Planning est temporaire ; **Enregistrer mes
préférences** dans Administration définit le choix utilisé aux prochaines
ouvertures. Les profils non administrateurs ayant accès à Équipages peuvent
changer temporairement le tri, mais ne lisent ni n’écrivent les préférences.
Les droits de consultation du Planning pour Marin et Capitaine sont inchangés.
Les noms historiques sans fiche RH liée sont conservés tels qu’importés.

## Déploiement et sécurité

Appliquer la migration `20260923201855_planning_crew_display_preferences.sql`
avant le client. Elle crée une table avec RLS par société et propriétaire, et une
RPC SECURITY INVOKER qui vérifie le rôle admin. Aucune permission anonyme.
Administration reste inaccessible aux autres profils même si une ancienne ligne
de la matrice de navigation l’autorise.

La migration a été appliquée au projet SeaPilot le 23 septembre 2026.
Les 22 assertions SQL (enregistrement, mise à jour, isolation entre comptes,
valeurs invalides et refus par profil) ont été exécutées en transaction annulée,
avec des profils de test distincts. pgTAP n’étant pas installé sur le projet lié,
les assertions ont été exécutées sous forme de blocs PL/pgSQL équivalents.
Aucun utilisateur de test n’est conservé. Aucun nouvel avis de sécurité ne
concerne la table ou la RPC ajoutées.

## Recette

Tests Vitest : formatage des noms composés, ordre des fonctions et variantes,
tri indépendant des périodes, filtre conservé après changement de format,
sauvegarde/restauration et erreurs de lecture/écriture, navigation par profil.
Résultat : 130 tests ciblés réussis.
Contrôle navigateur sur données de démonstration administrateur : saisie et
enregistrement, navigation vers Équipages, application des préférences et
changement de tri ; contrôle visuel bureau 1440 × 1000 et mobile 390 × 844.
Aucune erreur applicative ni surcouche d’erreur ; seul le favicon absent du
serveur de développement retourne 404. Playwright/Edge a été utilisé avec le
runtime fourni, le plugin Browser n’étant pas disponible.

Retour arrière : redéployer le client précédent ; la nouvelle table peut rester
en place et n’affecte aucune donnée de Planning.
