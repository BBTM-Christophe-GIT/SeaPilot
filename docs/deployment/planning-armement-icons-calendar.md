# Planning — Armement, actions des navires et calendrier

Livraison avec la fenêtre centrée de la version `3.75.10`.

## Affichage

Armement et ses bordées/marins sont placés avant les navires dans la frise Flotte,
y compris après fusion des lignes d'audit. La frise Projet donne la même priorité
à Armement. Les sélecteurs conservent le tri commun des navires par longueur.

Les boutons d'action des navires sont sous leur nom en vue Flotte et Projet.
La disposition compacte de Projet tient dans les lignes existantes de 38 px ;
les lignes agrandies par des projets superposés, visites ou audits conservent leur
hauteur. Les commandes, infobulles et accès des profils restent identiques.

## Calendrier

Le lien personnel d'abonnement conserve son URL et son jeton. Le calendrier
personnel diffusé et les téléchargements ICS incluent les statuts opérationnels,
congés, formations et indisponibilités ; seules les journées au statut Repos
normalisé sont exclues. Les changements de statut quotidiens sont pris en compte.
Les commentaires internes et les motifs privés ne sont pas ajoutés à l'abonnement.

Une journée déjà exportée qui devient Repos est annulée avec son UID existant pour
la retirer du calendrier abonné. La projection reste limitée à la personne du compte
et aux versions diffusées ; les règles Marin/Capitaine et la révocation restent en place.

La migration et la recette du flux sont détaillées dans
[Calendrier personnel du planning](./personal-planning-calendar.md).

## Recette

- Tests de priorité Armement avec ajout d'audits et conservation des groupes.
- Comparaison navigateur avant/après sur ordinateur et mobile : ordre, boutons
  sous le nom, hauteurs des lignes courtes et hautes, défilement et centrage.
- Tests des statuts et des changements quotidiens dans le téléchargement ICS.
- Fixtures SQL de calendrier personnel : statuts, exclusions de Repos, annulations,
  périmètre du propriétaire et planning diffusé uniquement.
- Lint ciblé, build de production et contrôle du commit déployé avant livraison.
