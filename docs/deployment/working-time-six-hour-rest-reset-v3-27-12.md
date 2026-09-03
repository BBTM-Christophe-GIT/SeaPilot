# Suivi du temps — remise à zéro après 6 h de repos v3.27.12

## Comportement

- Le plafond configuré de 12 heures porte sur le cycle de travail courant.
- Une période continue de repos de 6 heures ou plus remet ce compteur à zéro.
- Une période de repos de moins de 6 heures, y compris 5 h 59, ne le remet pas à zéro.
- Les contrôles du repos total sur 24 heures, du travail et du repos sur 7 jours, du repos consécutif, du fractionnement et du travail de nuit restent inchangés.
- Les recommandations de saisie simple et multiphase utilisent la même règle que le calcul de conformité enregistré.

## Déploiement

1. Appliquer `20260901170416_reset_work_limit_after_six_hours_rest.sql`.
2. La migration recalcule les fenêtres existantes sans générer de notifications en double.
3. Déployer l’application web v3.27.12 (`2026-09-01.0014`).

## Vérification

- 5 h 59 de repos : le travail antérieur reste comptabilisé.
- 6 h de repos : le compteur repart à zéro au début de la période de travail suivante.
- Un repos terminal d’au moins 6 h laisse un compteur courant à zéro.
- Le total de travail sur 7 jours n’est pas remis à zéro.
