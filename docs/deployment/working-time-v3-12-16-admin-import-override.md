# SeaPilot v3.12.16 — remplacement XLSM administrateur

## Règle livrée

L’import annuel XLSM est strictement réservé au rôle `admin`. Un administrateur peut remplacer une journée existante différente, y compris lorsqu’elle appartient à un registre signé, soumis ou validé, sans fournir de motif et sans réouvrir le registre.

Le fichier XLSM reste considéré comme une source déjà approuvée :

- les journées strictement identiques sont ignorées ;
- les journées différentes sont remplacées lorsque l’option est active, cochée par défaut ;
- un registre déjà `validated` conserve ce statut ;
- aucune validation `reopened` n’est créée ;
- l’événement automatique `approved_import`, le SHA-256 du fichier, le lot, la ligne source et les intervalles annulés conservent la preuve complète du remplacement.

Le contournement du verrou est transactionnel et limité au lot d’import, à la société et à la personne sélectionnée. En dehors de cette transaction, les intervalles des registres signés, soumis ou validés restent immuables.

## Migration

Appliquer avant le client `3.12.16` :

```text
supabase/migrations/20260808153712_working_time_admin_import_override_validated.sql
```

Cette migration :

1. restreint `working_time_can_manage_imports` au seul rôle `admin` ;
2. retire l’exigence de justification libre du RPC d’aperçu ;
3. autorise le verrou d’intervalle uniquement pendant le commit du lot administrateur contrôlé ;
4. conserve le recalcul différé et atomique des fenêtres de travail et de repos.

## Recette

1. Avec un profil `armement`, vérifier que l’assistant n’est pas affiché et que les RPC d’import répondent `42501`.
2. Avec un administrateur, déposer un XLSM puis laisser « Remplacer les journées existantes différentes » activé.
3. Vérifier qu’aucun champ « Motif d’audit » n’est demandé.
4. Importer une journée différente d’un registre `validated` et confirmer que l’import aboutit.
5. Vérifier que le registre est toujours `validated`, qu’aucun événement `reopened` n’existe et qu’un événement `approved_import` référence le fichier.
6. Réimporter les mêmes données et confirmer qu’elles sont classées strictement identiques sans créer de nouveaux intervalles.

## Retour arrière

Ne pas supprimer les intervalles ni les événements d’audit créés par un import. En cas de régression du client, redéployer la version précédente et corriger le comportement avec une nouvelle migration. La migration de sécurité doit rester appliquée afin de ne pas rendre l’import aux rôles non administrateurs.
