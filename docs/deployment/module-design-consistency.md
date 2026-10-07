# Préversion de l'harmonisation du design

Branche : `codex/design-consistency`, basée sur `main` au commit `062ce19`.

Les changements concernent uniquement la présentation : tokens communs, fond
noir unique pour sidebar/barre supérieure/logo, titres, actions, surfaces,
contrôles et focus cohérents, puis affichage du portrait utilisateur existant.
La charte se trouve dans `docs/design/design-system.md` et le périmètre des
37 modules dans `docs/design/module-design-audit.md`.

Aucune migration, variable de configuration supplémentaire, permission ou
modification de workflow n'est requise. Le portrait est lu dans le bucket privé
`hr-portraits` par le chargeur existant, pour la fiche de l'utilisateur connecté.
Une photo absente ou inaccessible conserve les initiales et le menu.

Livraison par préversion Vercel de la branche, avec données de démonstration et
authentification de production inchangée. Le retour arrière consiste à retirer
le commit de présentation. Ne pas inclure les modifications locales d'autres
travaux dans cette livraison.

Validation locale : tests de profils et permissions (322 tests), shell et portraits
(46 tests finaux), relance réussie des dix cas ayant dépassé les délais sous charge,
lint et build de production. La CI de la branche vérifie de nouveau la suite
complète et le build sur le commit poussé ; le déploiement Vercel doit être READY
pour ce même commit avant livraison du lien.
