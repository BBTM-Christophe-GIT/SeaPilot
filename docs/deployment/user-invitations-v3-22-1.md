# SeaPilot v3.22.1 — secours au quota des invitations

## Incident corrigé

Le 20 août 2026, Supabase Auth a accepté deux emails d'invitation puis rejeté les suivants avec
`429 over_email_send_rate_limit`. Le projet utilise encore le fournisseur SMTP intégré, limité à
deux emails Auth par heure. La fonction `admin-invite-user` transformait ce refus en erreur générique
`502`, sans solution de continuité pour l'administrateur.

## Nouveau fonctionnement

- La fonction tente toujours l'envoi normal avec `inviteUserByEmail`.
- Si Supabase renvoie précisément la limite d'envoi, la fonction génère un lien d'invitation à usage
  unique avec `auth.admin.generateLink`, crée le profil et les rôles, puis renvoie ce lien uniquement
  à l'administrateur authentifié.
- La fenêtre reste ouverte, affiche la cause exacte et permet de copier le lien personnel.
- Le lien n'est ni journalisé, ni mis en cache, ni enregistré en base. L'administrateur doit le
  transmettre exclusivement à la personne invitée.
- Les autres erreurs d'Auth restent bloquantes et aucune clé serveur n'est exposée au navigateur.

## Configuration durable recommandée

Configurer le SMTP Microsoft 365 ou un autre SMTP BBTM dans **Supabase > Authentication > Emails >
SMTP Settings**. Les identifiants SMTP doivent être saisis dans Supabase et ne doivent jamais être
commis dans Git. Une fois le SMTP actif, relever la limite horaire Auth selon le débit réellement
nécessaire ; le secours manuel reste disponible en cas d'indisponibilité ponctuelle.

## Déploiement et contrôle

Le client 3.22.1 est rétrocompatible avec l'ancienne réponse de la fonction. Déployer le client, puis
`admin-invite-user`. Vérifier ensuite les deux chemins : envoi normal et réponse `manual_link` simulée.
Une requête non authentifiée doit toujours recevoir `401` et un non-administrateur doit rester refusé
par `provision_invited_seapilot_user`.
