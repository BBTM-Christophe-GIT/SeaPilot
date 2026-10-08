# Accueil — alarmes et périmètre de la file consolidée (v3.39.2)

## Évolution

La file consolidée de l’Accueil est maintenant disponible pour tous les profils. Les éléments échus y sont
signalés en rouge. Les échéances à venir comprises entre aujourd’hui et J-90 inclus sont signalées en orange.

Le calendrier et la section « Prochaines dates clés » conservent leur calcul et leur affichage existants.

## Périmètre Capitaine et Marin

Pour un profil Capitaine ou Marin sans rôle sédentaire complémentaire, la file est construite à partir de son
affectation Planning active à la date du jour :

- les données liées à un navire sont limitées au navire affecté ;
- les données liées à une personne sont limitées à la même bordée sur ce navire ;
- si l’affectation ne renseigne aucune bordée, le périmètre devient l’ensemble du navire ;
- en l’absence d’affectation active ou si sa lecture échoue, la file reste vide afin de ne pas exposer un autre
  périmètre.

Les filtres sont appliqués dès les requêtes lorsque la source le permet, puis contrôlés une seconde fois dans la
construction de la file. Les politiques RLS Supabase restent la barrière d’autorisation de référence.

## Recette

1. Avec un profil Admin, Direction ou Armement, ouvrir l’Accueil et vérifier la présence de la file consolidée.
2. Vérifier qu’une échéance dépassée apparaît en rouge et qu’une échéance comprise entre J-0 et J-90 inclus
   apparaît en orange.
3. Vérifier qu’une échéance à J-91 n’est pas en alarme orange.
4. Contrôler que « Prochaines dates clés » conserve son contenu et son comportement antérieurs.
5. Avec de vrais comptes Capitaine et Marin disposant d’affectations Planning, vérifier que seules les données du
   navire et de la bordée actifs sont visibles.
6. Vérifier qu’un compte Capitaine ou Marin sans affectation active n’obtient aucun élément de la file.

## Retour arrière

Revenir au commit précédent restaure l’Accueil par profil et les couleurs antérieures. Aucune donnée ni migration
de base n’est concernée.
