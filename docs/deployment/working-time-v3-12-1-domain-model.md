# SeaPilot v3.12.1 — modèle métier du temps de travail

Date de livraison : 3 août 2026.

Cette étape installe le modèle Supabase du module « Suivi du Temps de Travail ». Elle ne remplace ni les politiques ni le moteur de contrôle P1.3 du Planning.

## Source de vérité

`working_time_intervals` est l’unique source de vérité du temps travaillé. Chaque intervalle conserve :

- la personne RH et son registre ;
- la date locale, le début et la fin absolus ;
- le fuseau IANA et l’offset UTC réellement constaté ;
- le navire et la bordée, lorsqu’ils existent ;
- le commentaire, l’auteur, la source et la clé d’import idempotente.

Les durées quotidiennes, hebdomadaires, mensuelles et glissantes ne sont pas stockées. Elles seront recalculées à partir des intervalles. Une exclusion PostgreSQL interdit deux intervalles actifs qui se chevauchent pour une même personne.

Les sources prévues sont `manual`, `excel_import`, `planning`, `sedentary_planning`, `migration` et `api`. La source `sedentary_planning` permettra d’appliquer ultérieurement la règle métier d’une journée Planning sédentaire égale à 8 heures, tout en matérialisant le résultat sous forme d’intervalle auditable.

## Tables créées

- `working_time_registers` : registres hebdomadaires ou mensuels et état du workflow ;
- `working_time_intervals` : intervalles de travail canoniques ;
- `working_time_day_comments` : commentaire quotidien destiné notamment aux non-conformités ;
- `working_time_profile_signatures` : versions immuables des signatures de profil ;
- `working_time_validations` : transitions et instantanés de preuve ;
- `working_time_audit_events` : historique technique append-only de chaque mutation.

Les registres portent uniquement une référence vers `planning_work_rest_policies`. Aucun seuil réglementaire n’est dupliqué. Lors d’une signature ou validation, la politique effectivement liée est figée dans la preuve afin qu’une modification administrative future ne réécrive pas l’historique.

## Workflow

Les statuts sont :

1. `draft` ;
2. `awaiting_sailor_signature` ;
3. `submitted` après signature du marin ;
4. `validated` après validation du capitaine de la même bordée ;
5. `reopened` lorsqu’une correction motivée est demandée.

La fonction `transition_working_time_register` applique les seules transitions autorisées. La signature du marin et la validation du capitaine exigent chacune une signature de profil active. La validation capitaine réutilise les affectations du Planning, avec le même navire, la même bordée et une période qui se chevauche, y compris pour les registres historiques.

## Identité et preuves

La liaison entre Auth et les ressources humaines reste `people.user_id`, conformément au mécanisme SeaPilot existant. Aucun second annuaire utilisateur n’est créé.

À chaque signature ou validation, `working_time_validations` fige :

- l’identité du salarié concerné ;
- l’identité de l’auteur ;
- la version, le chemin, le type MIME, la taille et le SHA-256 de la signature ;
- la liste des navires et des bordées présents dans les intervalles ;
- la politique P1.3 alors associée au registre.

Les images sont placées dans le bucket privé `working-time-signatures`, limité à 1 Mio et aux formats PNG, JPEG et WebP. Un fichier versionné n’est ni écrasable ni supprimable par un client authentifié ; les validations conservent ainsi une référence stable vers l’objet signé.

## Sécurité

Toutes les nouvelles tables publiques ont RLS activé. Les clients authentifiés disposent uniquement de `SELECT` filtrés, des aides de lecture utilisées par RLS et des fonctions contrôlées nécessaires aux signatures et transitions. Les écritures directes sont révoquées.

Les lectures autorisent :

- le salarié sur ses propres registres ;
- le capitaine sur la bordée couverte par ses affectations Planning ;
- les profils `admin`, `direction` et `armement` dans leur société active.

Les fonctions `SECURITY DEFINER` internes ne sont exécutables ni par `anon` ni directement par `authenticated`. Les fonctions publiques contrôlées vérifient explicitement l’utilisateur, la société active, la personne RH et le périmètre Planning.

## Migration et vérifications

Migration : `20260803212001_working_time_domain_model.sql`.

Vérifications réalisées localement :

- remise à zéro complète de Supabase et application de toutes les migrations ;
- 44 assertions pgTAP dans `working_time_domain_model_test.sql` ;
- lint de la base sans erreur ;
- tests du modèle TypeScript, lint applicatif et build de production.

La migration utilise `btree_gist` sans épingler de version, conformément au changement Supabase annoncé pour août 2026. Les droits Data API sont accordés explicitement, conformément au nouveau comportement des tables publiques Supabase.

## Import des classeurs 2025 et 2026

Les imports Excel utiliseront `source_type = 'excel_import'`, le nom du classeur et de la feuille dans `source_reference`, puis une clé de ligne stable dans `source_record_key`. L’unicité de cette clé rendra les reprises d’import idempotentes. Les fichiers transmis ne sont pas encore importés dans cette étape.

## Retour arrière

Avant tout retour arrière, exporter les six tables et conserver le bucket privé. Les preuves de signature et de validation sont des données historiques : elles ne doivent pas être supprimées lors d’un simple retour arrière applicatif. Revenir au commit précédent suffit pour le client ; la suppression des objets Supabase ne doit être envisagée qu’après export, validation juridique et confirmation qu’aucune donnée de production n’a été créée.
