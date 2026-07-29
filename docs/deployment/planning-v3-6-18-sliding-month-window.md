# Planning v3.6.18 — fenêtre mensuelle glissante

## Comportement livré

- La vue mensuelle commence toujours le lundi de la semaine qui contient la date de référence.
- Elle affiche les sept semaines suivantes, soit 49 jours continus, du lundi au dimanche.
- Au 29 juillet 2026, la première colonne est donc le lundi 27 juillet 2026 et la fenêtre se termine le dimanche 13 septembre 2026.
- Les commandes de mois et le bouton « Aujourd’hui » recalculent la fenêtre à partir de leur nouvelle date de référence.

## Déploiement

Cette évolution est uniquement côté client : aucune migration Supabase ni variable d’environnement supplémentaire n’est requise. Vérifier après déploiement que la première colonne de la préversion Planning correspond au lundi de la semaine courante.
