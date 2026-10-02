# Schéma des grilles et participants aux audits internes

La migration `20261002060006_internal_audit_grid_roles_participants.sql` ajoute les fonctions RH des questions, la suppression logique des grilles et les participants aux audits internes. Les audits historiques conservent leurs copies des questions, leurs réponses et leurs références de grille.

## Grilles et fonctions RH

La propriété facultative `hrFunction` de chaque question contient un libellé RH de l’entreprise active. Une propriété absente ou vide correspond à une question sans fonction affectée. `internal_audits_overview()` retourne `hrFunctions`, construit à partir des fonctions des personnes RH actives de cette entreprise. Le serveur refuse les nouvelles fonctions inventées et conserve les anciens libellés déjà présents sur la même question, même s’ils ne figurent plus dans le catalogue actif.

`internal_audit_archive_template(p_template_id uuid, p_version integer)` vérifie le droit `canManage`, l’entreprise et la version, puis passe la grille à `active=false`. Les grilles archivées sont absentes du catalogue renvoyé par l’overview et ne peuvent plus servir à créer un audit. Les audits existants restent accessibles et leurs brouillons restent modifiables. La grille conservée ne peut pas être réactivée par un ancien client.

## Participants et signatures de profil

`internal_audit_participants` conserve une identité et une référence de signature de profil indépendantes pour chaque participant. La sélection explicite envoyée par `internal_audit_save()` utilise uniquement `participantPersonIds`, une liste de personnes RH de l’entreprise. Les nouveaux participants sélectionnés doivent être actifs. Une personne déjà conservée dans cet audit reste sélectionnable après son départ, sans bloquer les sauvegardes ou la finalisation. Le serveur produit les noms, prénoms, fonctions et références de signature ; il ignore les objets d’identité ou de signature envoyés par le client.

Les sauvegardes d’audit, modifications d’écart et traitements ajoutent aussi leurs véritables auteurs. Une personne sélectionnée qui contribue apparaît une seule fois. Retirer sa sélection en brouillon conserve sa participation réelle. Une fois l’audit réalisé, la sélection et les réponses restent figées ; un nouveau traitement peut encore ajouter son véritable auteur au rapport sans réécrire l’audit.

Pour une personne RH, les noms et prénoms viennent de sa fiche. Pour un auteur disposant d’un compte sans fiche RH, le rapport conserve le nom d’affichage du profil ou son email, sans inventer de prénom, de personne RH ou de signature. Les auteurs des traitements historiques sont repris à partir de leurs comptes réellement enregistrés ; une ancienne fiche RH inactive conserve ses vrais nom et prénom. Le texte libre de l’auditeur n’est pas converti en identité RH.

La signature correspond à une **signature de profil enregistrée**, pas à une signature de l’audit. Aucun horodatage `signed_at` n’est ajouté. Les références existantes restent conservées. Une signature de profil déposée pendant la préparation complète un snapshot encore vide lors d’une sauvegarde ou de la finalisation. Les modifications ultérieures de la fiche RH ou de la signature de profil ne remplacent pas les snapshots existants.

Le JSON des audits contient `participants` (`personId`, `userId`, `firstName`, `lastName`, `functionLabel`, `signatureSnapshot`, `source`) et `participantPersonIds` pour la sélection explicite. `source` vaut `contributor` pour un auteur réel, même s’il est aussi sélectionné, et `selected` pour une personne uniquement sélectionnée. La liste `participantPersonIds` conserve indépendamment la sélection explicite. `personId` peut être nul pour un auteur sans fiche RH. Les URL temporaires de signature sont produites uniquement par le client et ne sont pas persistées.

## Accès et vérification

Les RPC publiques restent `SECURITY INVOKER` et les opérations gardées restent dans `internal_audit_private`. Les anciens points d’écriture privés sont révoqués. La table des participants applique RLS et n’accepte aucune écriture directe des clients. La nouvelle règle de lecture Storage vérifie que le bucket `working-time-signatures` et le chemin figurent dans un participant d’un audit accessible à l’utilisateur ; elle n’ouvre aucun autre fichier.

Les tests utilisent de vrais comptes Admin, QHSE avec rôle Armement, Capitaine, Marin et Admin d’une autre entreprise. Ils vérifient les copies historiques, l’archivage, les catalogues RH, les identités et signatures non falsifiables, les participants sans fiche RH, les contributions après réalisation et l’isolation des entreprises.

```powershell
supabase test db --local supabase/tests/internal_audits_test.sql supabase/tests/internal_audit_grid_participants_test.sql
```

La migration est additive. Un retour au client précédent peut conserver les nouvelles structures ; les archives existantes restent supprimées du catalogue actif et les audits historiques sont préservés.

## Vérification du 2 octobre 2026

Les 135 assertions SQL passent sur la base locale avec des utilisateurs authentifiés distincts. La migration est appliquée au projet SeaPilot ; le contrôle distant confirme RLS sur la table des participants, l’absence d’écriture directe des clients, trois RPC publiques invoker interdites aux anonymes et une politique de lecture des signatures limitée aux audits autorisés. Les conseillers de sécurité ne signalent aucun objet ajouté par cette migration. Les deux modèles actifs existants restent conservés ; aucune donnée d’audit de démonstration n’est créée en production.
