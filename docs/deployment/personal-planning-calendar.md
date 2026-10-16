# Calendrier personnel du planning

Version frontend : **3.72.0**, build **2026-10-11.003**.

Le menu du compte, sous l’adresse de l’utilisateur, propose **Ajouter mon planning (.ics)**.
La fenêtre crée un lien d’abonnement personnel à ajouter une seule fois à un calendrier.
Le compte doit être associé à une fiche du personnel active et disposer d’un accès au planning dans son entreprise.

## Utilisation

- Copier le lien puis choisir un abonnement par URL dans Outlook, Google Agenda ou Calendrier Apple.
- Le même abonnement suit chaque nouvelle diffusion, sans télécharger ou importer un nouveau fichier.
- Une importation locale d’un fichier `.ics` reste figée. L’interface propose l’abonnement pour répondre au besoin de mises à jour automatiques.
- Le calendrier fournit des événements à la journée en lecture seule. Les changements sont disponibles dès la diffusion et récupérés au rythme du calendrier client ; le délai n’est pas garanti par SeaPilot.
- Le lien est affiché pendant la session de l’utilisateur. Il ne peut pas être relu depuis la base de données. Après une nouvelle connexion, un lien existant peut être remplacé avec confirmation.
- Remplacer ou désactiver le lien coupe son accès. Les événements déjà importés ou mis en cache restent sous le contrôle du calendrier client.

## Architecture et confidentialité

`personal_planning_calendar()` permet de vérifier la projection personnelle sous session authentifiée. Le flux d’abonnement utilise
`GET /functions/v1/planning-calendar/<token>/planning.ics` et un jeton aléatoire de 256 bits.
Seul son hash SHA-256 est conservé dans un schéma privé avec RLS et sans privilèges pour `anon` ou `authenticated`.
Le lien permet de lire le planning : ne pas le partager, le journaliser ou le placer dans une documentation.

Les RPC authentifiées ne reçoivent aucun identifiant de personne. La fonction Edge hache le jeton et appelle une RPC
réservée au service. Chaque lecture vérifie de nouveau le compte, ses droits, l’entreprise et la fiche du personnel.
Les événements proviennent exclusivement des instantanés diffusés et concernent la personne du compte.
La sélection d’un marin dans le Planning et les vues de rôle simulées ne changent jamais le propriétaire du lien :
les RPC utilisent uniquement `auth.uid()` et sa fiche du personnel. Le dialogue est remonté à chaque changement
du véritable compte connecté (`sessionUserId`). Aucun identifiant de marin n’est transmis à ces RPC.
Les statuts du planning sont exportés, y compris Congés Paternité, Arrêt Maladie, Accident du Travail,
Arrêt de travail, RTT, Extra et Formation. Seul Repos, après normalisation (dont « Débarqué »), est exclu des événements actifs.
Les commentaires internes, noms d’autres personnes, raisons médicales et destinations privées ne sont pas exportés.
Un texte de statut inconnu conserve le libellé générique Indisponible plutôt que recopier un motif libre.
Les UID restent stables pour une personne/entreprise/journée. Les journées supprimées sont renvoyées comme annulées.
Une journée devenue Repos est également renvoyée comme annulée avec son UID initial et le libellé « Planning supprimé »,
afin de retirer les événements déjà importés. Ces marqueurs persistent pour les abonnés qui sautent une diffusion.
Une journée avec des affectations contradictoires indique « Planning à confirmer » sans choisir arbitrairement un navire.

Les avis Supabase sur cette table privée sans policy (refus par défaut) et les quatre RPC authentifiées
`SECURITY DEFINER` sont intentionnels : stockage inaccessible, `auth.uid()` obligatoire, vérification des droits
dans chaque RPC de lecture/création, révocation limitée au propriétaire et `search_path` fixé. Aucun accès anonyme
n’est accordé à ces RPC. Les helpers non filtrés restent privés.

## Déploiement

1. Vérifier et appliquer `supabase/migrations/20261011065558_personal_planning_calendar_subscription.sql` (version alignée sur la migration distante).
2. Exécuter `supabase/tests/personal_planning_calendar_test.sql` sur une base de test (fixtures transactionnelles annulées).
3. Déployer `planning-calendar` avec les fichiers `index.ts`, `handler.ts` et `ics.ts`.
4. Le réglage `verify_jwt = false` de cette fonction est nécessaire pour les clients calendrier qui ne disposent pas de la session SeaPilot. L’authentification par jeton personnel est appliquée dans le handler puis dans la RPC réservée au service.
5. Déployer le frontend depuis le commit testé. Aucun nouveau secret ou variable frontend n’est requis.
6. Vérifier un abonnement de test, puis diffuser une modification et vérifier la nouvelle version du même flux. Une URL invalide ou révoquée doit répondre 404, les mutations HTTP 405.

### Statuts du calendrier — 16 octobre 2026

Appliquer ensuite `20261016091421_planning_calendar_all_statuses_except_rest.sql`. Cette migration ne remplace ni
les jetons ni les URL existantes et ne modifie aucun accès : elle complète les statuts reconnus dans deux helpers privés
et exclut Repos des journées actives. Le handler et le sérialiseur Edge sont inchangés ; aucun redéploiement Edge
n’est nécessaire pour cette correction.

Exécuter les deux recettes transactionnelles `personal_planning_calendar_test.sql` et
`personal_planning_calendar_statuses_test.sql`. La seconde crée deux véritables comptes de test Marin/Capitaine,
vérifie la liaison du jeton à son propre utilisateur/personnel, le refus d’identifiants cibles, l’égalité des statuts
entre lecture authentifiée et abonnement, tous les statuts reconnus, les corrections quotidiennes et les annulations
durables. Les données et jetons de test sont annulés à la fin ; aucun jeton brut n’est affiché.

Le téléchargement ICS proposé par les exports de Planning conserve son périmètre et ses filtres autorisés.
Il ajoute le statut au titre, découpe les changements de statut/fonction et retire chaque journée Repos, même au milieu
d’une affectation active. Une correction non Repos sur une affectation Repos reste exportée. Les plages sont limitées
aux dates demandées ; les heures civiles de Paris sont conservées lors du passage heure d’été/heure d’hiver.

Validation locale : 92 assertions SQL réussies (74 sur les accès, données personnelles et révocations, 18 sur les
statuts et deux comptes distincts), tests calendrier/exports/fonctions réussis, lint ciblé et contrôle TypeScript réussis.
Le contrôle historique de l’absence d’USAGE sur tout le schéma `private` est remplacé par le refus d’EXECUTE
sur le helper d’identité : des migrations ultérieures accordent USAGE pour d’autres modules, tandis que les tables
et helpers du calendrier restent sans privilèges pour le navigateur.

La préversion affiche la fenêtre avec les actions désactivées et n’appelle aucun service de production.
Les profils Marin et Capitaine sont validés avec des fixtures distinctes et les règles SQL, conformément à `AGENTS.md`.

Le frontend ne doit pas importer les sources des fonctions Edge : `.vercelignore` exclut le dossier
`supabase/` du build Vercel. Le téléchargement statique inutilisé et son import du sérialiseur ICS ont été
retirés ; les RPC d’abonnement restent inchangées. Le sérialiseur est conservé dans la fonction Edge
qui fournit le calendrier actualisé. Le contrôle TypeScript est également exécuté sur une copie du frontend
sans le dossier `supabase/` pour vérifier cette contrainte de déploiement.

Validation du 11 octobre 2026 : 43 tests Vitest ciblés (menu, dialogue, RPC, ICS et handler),
73 assertions pgTAP transactionnelles, lint des fichiers modifiés et build de production réussis.
Le test historique du menu a dépassé son délai sous charge lors de la première passe ; les 16 tests du menu
passent en worker unique avec un délai de 60 secondes. La dernière passe des huit tests du calendrier
utilise `--pool=forks --maxWorkers=1 --testTimeout=60000` après un délai de démarrage des workers threads sous charge.
La recette Playwright en 1440×900 et 390×844 valide
le bouton, la fenêtre, Escape, la réouverture et l’absence de RPC en préversion ; seul le favicon existant
répond 404. Les abonnements dans les applications tierces n’ont pas été installés pour cette recette.
La migration et la fonction Edge sont déployées dans le projet SeaPilot : GET avec un jeton inexistant renvoie
404, POST renvoie 405, sans cache, et les privilèges distants interdisent toute lecture anonyme des RPC ou du stockage privé.

## Retour arrière

Revenir au frontend précédent et désactiver la fonction Edge pour interrompre les abonnements.
Conserver les données de la table privée pendant l’investigation ; une suppression ferait perdre tous les abonnements.
