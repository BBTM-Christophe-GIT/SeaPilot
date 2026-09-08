# Gestion des documents RH — 8 septembre 2026

L’onglet Documents des fiches collaborateurs permet aux profils Admin, Direction et Armement de modifier les métadonnées d’un document et de le supprimer après confirmation. L’ajout, le renouvellement et la modification proposent **Sans date de péremption**. Une date absente est enregistrée comme `NULL`, affichée « Sans échéance » et omise du nom généré lors d’un dépôt.

La modification conserve le fichier et son adresse : nom, catégorie, délivrance, péremption, notes et aptitude médicale peuvent être corrigés sans déposer de nouvelle pièce. Les dates inversées sont refusées. Les statuts ordinaires sont recalculés ; les statuts Manquant et Validation restent inchangés. Les groupes, compteurs et notifications sont actualisés après les opérations.

La suppression relit la référence courante du document. Elle retire le fichier du bucket RH avant ses métadonnées, car la lecture Storage autorisée repose sur la présence de la ligne. Une erreur Storage conserve la fiche ; une erreur SQL après suppression du fichier conserve un message explicite permettant de réessayer. Les sources SharePoint restent dans SharePoint. Les entretiens annuels utilisent toujours leur parcours distinct.

## Déploiement

Aucune migration ni variable d’environnement supplémentaire. `hr_documents.expires_on` accepte déjà `NULL`. Les politiques RLS existantes autorisent les gestionnaires de l’entreprise courante et refusent les mutations documentaires aux profils Marin et Capitaine.

## Validation

- 84 tests Vitest du module RH : ajout avec/sans échéance, nom généré, modification des informations, états et dates, confirmation/annulation/suppression, gestion des erreurs, suppression de fichier avant sa fiche, lien SharePoint et permissions par rôle. Exécution sous Node 24 avec `pnpm test src/features/humanResources --pool=forks --maxWorkers=1` ; le processus worker `threads` de Node 22 n’avait pas démarré dans l’environnement local.
- Test transactionnel `supabase/tests/hr_document_management_test.sql` exécuté contre la base liée : cinq utilisateurs synthétiques avec les rôles réellement attribués, CRUD autorisé pour les trois gestionnaires et refus d’écriture pour Marin/Capitaine. Le test se termine par `ROLLBACK`.
- Compilation de production et lint.
- Recette navigateur sur données synthétiques : création sans péremption, changement de catégorie et de notes, réintroduction d’une échéance, annulation et nouvelle tentative de suppression ; contrôle bureau 1440 × 1100 et mobile 390 × 844. Le composant réel est monté avec un client de test en mémoire. La recette UI n’utilise aucune donnée ni mutation de production.
- Playwright avec Edge installé (Browser plugin non disponible) : page et titre corrects, contenu visible, aucune erreur applicative, aucun overlay Vite et aucun débordement horizontal. Le navigateur bloque le WebSocket de rechargement à chaud local ; ces messages de développement sont isolés des erreurs applicatives et n’affectent pas les interactions testées.

## Retour arrière

Revenir au déploiement précédent. Aucun retour arrière SQL n’est requis ; les documents sans échéance restent compatibles avec la lecture du client antérieur. Les suppressions confirmées sont définitives.
