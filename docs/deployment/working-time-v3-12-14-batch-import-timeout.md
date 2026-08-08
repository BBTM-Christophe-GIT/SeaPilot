# SeaPilot v3.12.14 — validation des imports annuels

Cette livraison corrige l’expiration SQL observée lors de la validation d’un classeur
XLSM annuel comportant une centaine de journées.

## Cause et correction

Chaque intervalle importé déclenchait immédiatement un recalcul complet des fenêtres
glissantes de travail et de repos affectées. Un classeur de 104 journées pouvait donc
exécuter plusieurs centaines de recalculs successifs dans la même requête et dépasser
le délai du rôle authentifié.

La migration `20260808113643_working_time_batch_import_timeout.sql` :

- diffère uniquement les recalculs déclenchés à l’intérieur du RPC d’import protégé ;
- conserve l’insertion, le remplacement, l’audit et la validation dans une transaction
  atomique ;
- reconstruit une seule fois toutes les fenêtres autoritatives de la personne avant le
  retour du RPC ;
- fixe un délai ciblé de 60 secondes sur la validation annuelle et de 30 secondes sur
  son aperçu, sans augmenter le délai global des autres requêtes ;
- ne modifie ni les autorisations RLS, ni les droits d’exécution publics.

L’interface efface désormais le message de succès du contrôle dès que la validation
commence. En cas d’expiration, elle affiche un message français indiquant que la
transaction n’a importé aucune journée et que la validation peut être relancée.

## Recette

Le test pgTAP couvre 50 assertions. Il inclut un lot synthétique de 104 journées,
contrôle son import atomique en moins de 8 secondes et vérifie la reconstruction des
fenêtres glissantes. Les tests React vérifient aussi qu’un échec de validation ne
laisse plus simultanément un message vert et un message rouge.

```text
npx supabase db reset --local
npx supabase test db --local supabase/tests/working_time_excel_import_test.sql
pnpm test
pnpm lint
pnpm build
```

## Déploiement

1. appliquer la migration Supabase ;
2. déployer le client `3.12.14` ;
3. relancer « Valider l’import » sur le lot déjà contrôlé ;
4. vérifier que les journées sont importées et que le lot passe à l’étape
   « Traçabilité » ;
5. contrôler les registres mensuels et les alertes de travail/repos recalculées.
