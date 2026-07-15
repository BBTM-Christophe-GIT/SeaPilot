# SeaPilot v3.5.0 — invitations administrateur et activation de compte

## Périmètre

La version 3.5.0 ajoute un parcours d’invitation réservé aux administrateurs, sans inscription publique. L’administrateur renseigne l’email, le nom, les rôles et, facultativement, le marin RH associé. Une Edge Function crée l’utilisateur Auth avec `service_role`, puis un RPC transactionnel crée le profil, l’adhésion à l’entreprise, les rôles, le lien RH et la trace d’audit.

Le navigateur ne reçoit jamais la clé `service_role`. Le RPC revérifie indépendamment que l’auteur est un administrateur actif de son entreprise. Les invitations sont consultables uniquement par un administrateur de la même entreprise grâce à la RLS.

## Ordre de déploiement

1. Confirmer un point de restauration Supabase récent.
2. Contrôler le différentiel :

   ```powershell
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

3. Appliquer `supabase/migrations/202607150004_user_invitation_workflow.sql`, puis la correction de lint
   `supabase/migrations/202607150005_user_invitation_lint_cleanup.sql` :

   ```powershell
   supabase db push --linked
   supabase db lint --linked
   ```

4. Déployer la fonction avant le client :

   ```powershell
   supabase functions deploy admin-invite-user
   ```

5. Déployer le client 3.5.0 sur Vercel.

## Configuration

Secrets automatiques de la fonction :

- `SUPABASE_URL` ;
- `SUPABASE_SERVICE_ROLE_KEY`.

Secrets facultatifs :

- `SEAPILOT_APP_URL=https://sea-pilot-ten.vercel.app` ;
- `SEAPILOT_ALLOWED_ORIGINS`, liste d’origines additionnelles séparées par des virgules.

Conserver `auth.enable_signup=false`. La longueur minimale des nouveaux mots de passe est de 12 caractères. Les URL Auth doivent autoriser `https://sea-pilot-ten.vercel.app/auth/update-password` (le joker de production déjà configuré la couvre).

Avant un usage régulier, configurer un SMTP BBTM dans Supabase Auth. Sans SMTP personnalisé, le service email intégré est soumis à une limite basse et ne convient pas aux invitations en volume. Aucune clé SMTP ne doit être commise dans Git.

## Contrôles avant déploiement

- TypeScript, lint, tests et build passent ;
- le dry-run n’annonce que `202607150004` et `202607150005` sur une base 3.4.3 ;
- la création publique de comptes reste désactivée ;
- l’administrateur de recette possède une adhésion active et le rôle `admin` dans son entreprise ;
- l’adresse de redirection d’activation est autorisée dans Supabase Auth.

## Contrôles après déploiement

1. Une requête sans JWT vers `admin-invite-user` renvoie `401`.
2. Le bouton **Inviter un utilisateur** est visible dans Administration.
3. Le volet charge uniquement les personnes RH actives sans compte associé.
4. Une invitation de recette crée exactement un profil, une adhésion, les rôles sélectionnés, le lien RH facultatif et une entrée `user_invitations`.
5. Le lien reçu ouvre `/auth/update-password` et permet un mot de passe d’au moins 12 caractères.
6. L’utilisateur peut ensuite se connecter et ne voit que les modules autorisés.
7. Un non-administrateur ne peut ni exécuter le RPC ni lire l’audit des invitations.

## Retour arrière

Le retour arrière le plus sûr est de redéployer le client 3.4.3 et de conserver la migration additive. Désactiver ou supprimer la fonction Edge empêche toute nouvelle invitation sans affecter les comptes existants.

Pour retirer aussi le schéma, exporter d’abord `public.user_invitations`, puis supprimer la fonction SQL et la table selon les notes de la migration. Ne supprimer aucun utilisateur Auth déjà activé : les profils, rôles et liens RH sont des données métier en production.
