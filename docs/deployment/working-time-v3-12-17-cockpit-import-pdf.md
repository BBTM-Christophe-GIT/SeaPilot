# SeaPilot v3.12.17 — cockpit mensuel, import et PDF

## Résultat livré

- Le module affiche une seule entrée de catalogue par marin et consolide tous ses intervalles du mois, y compris ceux encore rattachés à un ancien registre hebdomadaire.
- La fin d’un import XLSM recharge immédiatement le workspace Temps de travail en plus du Planning. Deux phases disjointes importées le même jour apparaissent donc sur la frise sans rouvrir la page.
- L’écran adopte le cockpit mensuel validé : commandes métier supérieures, équipage par service, mois complet, frise 00 h–24 h compacte, analyse automatique et conformité latérale.
- Les administrateurs, l’Armement et la Direction peuvent rechercher le personnel actif ou sorti. Le périmètre d’édition reste limité aux fiches actives et aux droits existants.
- La génération PDF n’utilise plus un import JavaScript déclenché au clic. Une récupération unique des modules Vite périmés protège également les sessions restées ouvertes pendant un déploiement.

## Migration

Appliquer avant le client `3.12.17` :

```text
supabase/migrations/20260808191000_working_time_personnel_catalog.sql
```

La fonction `working_time_entry_context` renvoie désormais `grade_label`, `departed_on` et `active`. Les rôles `admin`, `direction` et `armement` peuvent lire le catalogue de leur société, y compris les fiches sorties. Les règles d’écriture, de bordée, de signature et de validation ne changent pas.

## Recette ciblée

1. Ouvrir Pierre AUGUIN en août 2026 et sélectionner le 3 août.
2. Vérifier les deux périodes `10:00–12:30` et `13:30–18:00` sur la frise et dans l’historique.
3. Importer de nouveau le classeur approuvé et confirmer que la page se rafraîchit sans doublon.
4. Générer le registre PDF mensuel, puis contrôler les 48 demi-heures, les totaux et les signatures disponibles.
5. En administrateur, basculer le filtre entre « Personnel actif » et « Personnel sorti » ; confirmer qu’une même personne n’apparaît qu’une fois.
6. Vérifier la mise en page à 1280 × 720, 1366 × 768 et en mode tablette paysage.

## Retour arrière

Le client précédent peut être redéployé sans supprimer les données. Conserver la migration : elle élargit uniquement le catalogue en lecture et ne modifie aucune donnée RH ni aucun intervalle.
