# Accueil — échéances à 90 jours et couleurs d'alerte

Version : `3.39.5` — build `2026-09-08.003`.

## Comportement

- Les documents Flotte et RH dont l'échéance dépasse 90 jours sont exclus des éléments de l'accueil,
  donc de la file consolidée, des compteurs et des dates clés. Un statut importé « manquant », « à valider »
  ou périmé ne contourne plus cette limite. L'échéance du certificat reste la référence, même avec une visite planifiée.
- J-90 est inclus ; J-91 et J-1210 sont exclus. Les échéances déjà dépassées restent visibles.
- La même limite s'applique aux livraisons futures. Les demandes à traiter immédiatement, les documents
  manquants sans date et l'inaptitude médicale déclarée conservent leur alerte immédiate.
- Les lignes rouges utilisent un fond rouge plus soutenu et les lignes orange un fond doré. Les bordures,
  les libellés d'échéance, le survol et le focus clavier gardent cette distinction.

Le filtrage concerne uniquement l'accueil. Les fiches, actions et workflows des modules restent identiques.
Les requêtes, règles RLS et périmètres Marin/Capitaine ne changent pas. Aucune migration ni variable
d'environnement supplémentaire n'est nécessaire.

## Validation

- Tests de régression des échéances Flotte, RH et Achats : passé, aujourd'hui, J-90, J-91 et J-1210,
  statuts importés, visite planifiée, absence de date et inaptitude déclarée.
- Tests existants de l'accueil et des périmètres Capitaine/Marin via leurs fixtures de profils.
- Build de production et vérification visuelle de la file consolidée, de ses filtres et de sa navigation.

## Déploiement et retour arrière

Déploiement Vercel habituel depuis `main`. Pour revenir en arrière, redéployer la version `3.39.4`.
Aucune donnée n'est modifiée par cette correction.
