# Certificats flotte — tri naturel des objets v3.27.7

## Changement

Le pilotage du traitement classe les écarts selon deux critères :

1. année de la date d'échéance, de la plus ancienne à la plus récente ;
2. objet de l'écart dans chaque année : ordre numérique naturel `1` à `100` lorsque l'objet commence par un nombre, ou ordre alphabétique `A` à `Z` dans les autres cas.

Les écarts sans année d'échéance exploitable sont placés après les écarts datés.

## Exemple KROKDUR

Les objets datés de 2025 commencent par `1. Document unique de prévention`, `2. Relevés périodiques`, `3. Registre`, `4. Ligne de mouillage`, `5. TOILETTE`. Les objets datés de 2026 viennent ensuite et redémarrent à `1. Pompe de cale à bras`.
