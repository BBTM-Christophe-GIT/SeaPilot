# RH — classification ENIM par fonction v3.22.13

## Résultat utilisateur

La section **Contrat et dates** de chaque fiche RH affiche désormais deux informations en lecture seule :

- `Code Fonction ENIM` ;
- `Catégorie`.

Elles sont visibles lors de la consultation, de la modification et de la création d'un collaborateur. La prévisualisation se met à jour dès que la fonction est sélectionnée.

| Fonction | Code Fonction ENIM | Catégorie |
| --- | --- | ---: |
| Capitaine | AA01A | 15 |
| 2nd Capitaine | CA01A | 12 |
| Chef mécanicien | CB01A | 15 |
| 2nd Mécanicien | EB01A | 12 |
| Maître d'Equipage | MA01A | 7 |
| Matelot qualifié | PA01A | 5 |
| Matelot Polyvalent | PA01A | 5 |

## Garantie de cohérence

Les colonnes `people.enim_function_code` et `people.enim_category` sont générées et stockées par PostgreSQL à partir de `people.function_label`. Ce choix couvre automatiquement tous les chemins d'écriture : création RH, modification de fonction en cours de mois, imports SharePoint et mises à jour administratives directes.

Les valeurs existantes sont recalculées lors de la migration. Une fonction non répertoriée produit deux valeurs nulles, et les colonnes générées ne peuvent pas être modifiées indépendamment de la fonction.

Les listes de fonctions RH et Planning reconnaissent aussi `2nd Mécanicien` ainsi que la variante `Second Mécanicien`. Le mot-clé `2nd-mecanicien` est ajouté aux règles de visibilité RH. Les règles RLS existantes de `people` restent la source d'autorisation pour les profils Marin et Capitaine.

## Vérification

- test pgTAP des sept correspondances, du recalcul en cours de mois, de la remise à zéro et de la protection contre l'écriture manuelle ;
- tests unitaires du mapping TypeScript et du chargement Supabase ;
- tests d'interface de la consultation, de la modification et de la création RH ;
- tests dédiés des vues en lecture seule Marin et Capitaine ;
- contrôle du build de production et de la préversion Vercel.
