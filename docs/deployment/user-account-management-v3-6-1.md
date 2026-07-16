# SeaPilot v3.6.1 — gestion des comptes utilisateurs

Migration : `202607160009_user_account_management.sql`

Edge Function : `admin-manage-user`

## Fonctionnement

La page **Administration > Gestion des utilisateurs** propose deux actions par utilisateur :

- **Renvoyer** : renvoie une invitation lorsque le compte n’est pas encore activé, ou un lien de réinitialisation du mot de passe lorsqu’il est déjà actif ;
- **Supprimer** : retire immédiatement les rôles et l’adhésion à l’entreprise, dissocie la fiche RH puis effectue une suppression logique du compte Supabase Auth.

La suppression logique rend le compte inutilisable tout en conservant son identifiant technique. Les fiches RH, publications, demandes, validations et autres références historiques ne sont donc pas supprimées.

## Sécurité

- les actions passent exclusivement par l’Edge Function avec la clé serveur Supabase ;
- le navigateur n’a jamais accès à la clé `service_role` ;
- le RPC vérifie que l’auteur est un administrateur actif de la même entreprise ;
- un administrateur ne peut pas supprimer son propre compte ;
- un compte actif dans plusieurs entreprises ne peut pas être supprimé par un administrateur local ;
- l’accès est retiré dans PostgreSQL avant la suppression logique Auth ;
- le RPC n’est pas exécutable par `anon` ou `authenticated`.

## Déploiement

```powershell
npx supabase db push --linked
npx supabase functions deploy admin-manage-user
npx supabase migration list --linked
npx supabase db lint --linked --schema public --level warning
```

La fonction utilise les secrets injectés automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, ainsi que les paramètres existants `SEAPILOT_APP_URL` et `SEAPILOT_ALLOWED_ORIGINS` lorsqu’ils sont définis.

## Recette

1. Ouvrir **Administration > Gestion des utilisateurs** avec un compte administrateur.
2. Cliquer sur **Renvoyer** pour une invitation non activée et vérifier la réception d’un nouvel email.
3. Cliquer sur **Renvoyer** pour un compte activé et vérifier la réception d’un email de réinitialisation.
4. Annuler une confirmation de suppression et vérifier que la ligne reste présente.
5. Confirmer la suppression d’un autre utilisateur.
6. Vérifier que sa ligne disparaît, qu’il ne peut plus se connecter et que sa fiche RH est toujours présente sans compte associé.
7. Tenter de supprimer son propre compte et vérifier le refus serveur.
8. Vérifier qu’un non-administrateur ne peut pas invoquer l’Edge Function.

## Limites d’envoi

Les emails Supabase sont soumis aux limites de fréquence Auth et à la configuration SMTP du projet. Si un email vient d’être envoyé, l’interface demande d’attendre avant un nouvel essai.
