# Manuel d’utilisation — v3.47.0

Depuis la v3.48.0, la notice [Liens utiles](./useful-links.md) complète ce catalogue : 18 notices sont disponibles lorsque tous les modules du Marin sont autorisés. Les vérifications ci-dessous décrivent la livraison initiale du manuel.

L’icône point d’interrogation entre la cloche et l’identité ouvre `/manual`. Le sommaire reprend les noms des modules du Marin et propose une recherche dans les titres et le contenu, sans distinction de casse ni d’accents. Chaque notice contient l’objectif, le périmètre Marin, les étapes, les points à retenir et un lien vers le module. Une notice peut être ouverte directement via `/manual/:moduleKey`.

Les 17 notices couvrent Accueil, KPI, Certificats flotte, Procédures QHSE, Notes de Service, Plan d’Action, QHSE documentaire (route historique), Daily Progress Report, Navires, Demande d’Achat, Notes de frais, Planning, RH / Brevets, Suivi du Temps de travail, Marad, Documents Techniques et Levage. Les deux écrans en attente de migration sont explicitement décrits comme tels.

Le manuel est accessible aux comptes authentifiés depuis l’en-tête. Son contenu est destiné au profil Marin, y compris quand un autre profil le consulte. Le sommaire et les liens directs utilisent les modules effectivement chargés par `AppShell` depuis `role_module_permissions` ; aucun droit supplémentaire n’est accordé. Une notice masquée ou inconnue affiche « Notice indisponible ». Aucune requête métier, nouvelle permission, migration ou variable d’environnement n’est nécessaire. Les notices et leur style sont chargés à l’ouverture du manuel.

## Sources et maintenance

Le contenu est centralisé dans `src/features/manual/manualGuides.ts`. Les noms sont issus de `APP_MODULES`. Actualiser les notices lors d’un changement de comportement métier ; le test de couverture détecte l’ajout d’un module autorisé par défaut au Marin sans notice.

La recette d’accès utilise des fixtures de comptes authentifiés Marin et Capitaine, sans `rolesOverride` ni simulation de session administrateur. Les contrôles métier ont été relus dans les composants et leurs tests, ainsi que les migrations de périmètre : DPR personnel et fenêtre de 72 heures, achats opérationnels, Planning diffusé de toute la flotte (`20260921121717`), actions affectées et rapports personnels (`20260916205252` / `20260916212108`), notes de frais personnelles et véhicules (`20260917092601` / `20260917134330`). Les autorisations existantes restent inchangées.

## Vérification et livraison

- Tests du manuel : placement du point d’interrogation, fermeture des notifications, chargement des droits, couverture des notices, navigation clavier/focus, liens modules, recherche, absence de résultat, accès direct refusé et authentification.
- 56 tests ciblés du manuel, de la navigation et des permissions réussis ; lint et compilation production réussis avec pnpm 10.34.5.
- Recette Chrome avec fixtures de sessions authentifiées Marin et Capitaine, sans mode préversion : ouverture depuis le point d’interrogation, 17 notices, recherche sans accents, absence de résultat, rechargement d’un lien direct, ouverture du module et notice inconnue. Console sans erreur ni avertissement, aucune surcouche d’erreur. Affichage vérifié à 1440 × 1000, 390 × 844 et 320 × 844, sans débordement horizontal. Les réponses réseau sont des fixtures ; aucune écriture métier ni test sur une session de production.
- Déploiement Vercel du commit de la branche, sans opération sur la base de données.

Retour arrière : revenir au client précédent ; aucune donnée à restaurer.
