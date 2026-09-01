# Suivi du temps — conformité après repos consécutif v3.27.13

## Comportement

- Le repos continu minimum configuré clôt le cycle de travail précédent ; il est de 6 heures pour la politique BBTM.
- Une fois ce repos acquis, un total inférieur à 10 heures de repos sur la fenêtre glissante de 24 heures ne crée plus, à lui seul, un écart `rest_24h`.
- La durée de repos cumulée reste calculée et affichée sans modification.
- Les contrôles des 12 heures par cycle, du travail et du repos sur 7 jours, du fractionnement et du travail de nuit restent appliqués.
- Le calcul enregistré, la recommandation de saisie simple et la recommandation multiphase suivent la même règle.
- Le commentaire d’interface « Compteur remis à zéro après chaque repos continu d’au moins 6 h. » est supprimé ; les bornes de la fenêtre d’analyse restent visibles.

## Déploiement

1. Appliquer `20260901181001_accept_consecutive_rest_as_24h_conformity.sql`.
2. La migration réévalue les fenêtres existantes sans générer de notifications en double et passe le calcul en version 3.
3. Déployer l’application web v3.27.13 (`2026-09-01.0015`).

## Vérification

- Scénario limite automatisé : 8 heures de repos cumulées, dont 6 heures consécutives, restent conformes.
- Scénario Julien LECOCQ : repos du 12 août 2026 à 23 h 30 au 13 août à 06 h 00, soit 6 h 30 consécutives ; l’écart `rest_24h` du 13 août doit disparaître.
- Un repos consécutif inférieur au minimum configuré reste non conforme.
