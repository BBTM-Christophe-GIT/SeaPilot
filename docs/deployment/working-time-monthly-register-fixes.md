# Registres mensuels : accès et export

Version frontend : **3.71.15**, build **2026-10-11.002**.

La consultation du registre de septembre dépassait parfois le délai serveur :
chaque ligne de calcul répétait la résolution de l'entreprise, des rôles et de
la fiche RH. Les politiques de lecture résolvent ces paramètres une seule fois
par requête et conservent le périmètre de chaque profil. Les délais serveur ne
sont pas augmentés et aucune donnée de travail, de repos ou de validation n'est
modifiée par cette correction.

Le chargement complet a également révélé un timeout de lecture des signatures
pour le Capitaine. Le garde filtre désormais les registres qui désignent
réellement le signataire avant de vérifier leurs permissions, au lieu de tester
tous les registres de l'entreprise. Les preuves, droits et règles Storage
restent identiques.

Dans le PDF, un registre dont la fonction RH du titulaire est **Capitaine**
présente uniquement la case **Capitaine / Valideur**, en bas à droite.
Les autres registres conservent leurs deux cases. Le séparateur des colonnes
de cumul commence sous le titre **À NE PAS REMPLIR PAR LE MARIN**.

L'export recharge la dernière signature de profil enregistrée pour chaque
signataire identifié, depuis le stockage privé et avec les droits du compte
connecté. Il couvre les registres historiques, les imports et les validations
quotidiennes. Les preuves et dates de validation historiques sont conservées :
afficher l'image actuelle ne crée aucune nouvelle validation. Une erreur de
chargement est signalée au lieu de produire silencieusement une signature vide.

## Validation et livraison

Les droits Marin et Capitaine sont vérifiés avec des comptes distincts dans
les fixtures SQL, conformément à AGENTS.md. La recette visuelle de démonstration
sert uniquement à vérifier la mise en page et le parcours d'export.

Migrations appliquées à SeaPilot, dans cet ordre :
`20261011074048_working_time_monthly_read_performance.sql`, puis
`20261011075206_working_time_signer_signature_read_performance.sql`.
Appliquer ces migrations avant de livrer le frontend ; aucune variable
d'environnement ni dépendance nouvelle n'est nécessaire.

- 88 tests frontend ciblés réussis : requêtes, modèle, workflow, page et exports.
- 132 assertions SQL réussies : 49 de lecture/performance et de Capitaine
  temporaire, 24 de signature et Storage, 17 de validation quotidienne,
  12 de fonction RH Capitaine et 30 de calcul serveur.
- Lecture des signatures actives et d'export testée sous 8 secondes avec
  2 200 registres non liés, pour des comptes Marin et Capitaine distincts.
- Suite GitHub complète réussie : 3 212 tests Vitest et 4 tests Python.
- ESLint et build de production réussis avec pnpm 10.34.5.
- Recette Playwright à 1440 × 1000 et 390 × 844 : exports des deux profils,
  signatures visibles, case unique à droite et titre dégagé ; aucune erreur
  de console ni débordement horizontal.

La base locale ancienne a été alignée sur les définitions de contrôle d'accès
en production avant les fixtures. Un contrôle DPR de la suite Capitaine
temporaire reste en échec sur cette base locale ; il ne concerne pas les
registres et aucune fonction DPR n'est modifiée par cette livraison.

Le contrôle Supabase conserve les alertes existantes. Il signale en plus la
fonction `working_time_readable_calculation_ids()` comme exécutable par
`authenticated` en `SECURITY DEFINER`, ce qui est intentionnel pour la RLS :
aucun paramètre fourni par le client, authentification et entreprise courante
contrôlées, adhésion active requise, droits Capitaine conservés. L'exécution
est refusée à `anon` ; la RLS reste activée. Voir
[le contrôle Supabase des fonctions exposées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Mesures après la migration mensuelle sur les comptes réels en production, septembre 2026,
avec les projections du client et une limite de 8 secondes : Admin, 3 855
calculs en quatre pages (869, 138, 118 et 118 ms) ; Capitaine, 406 calculs
autorisés en 1 184 ms. Les intervalles prennent 225 ms pour l'Admin (940 lignes)
et 3 072 ms pour le Capitaine (158 lignes). Les périmètres restent respectivement
54 et 4 personnes. Avant correction, le contrôle des droits sur les calculs
prenait 6 994 ms pour l'Admin et dépassait 8 secondes pour le Capitaine.

Après la migration des signatures, les neuf requêtes de chargement du workspace
passent toutes sur septembre : maximum par requête 1 385 ms pour l'Admin et
3 302 ms pour le Capitaine. Les signatures actives prennent 128 ms (25 signatures
Admin) et 718 ms (4 signatures Capitaine), contre un timeout de 8 secondes pour
le Capitaine avant cette seconde correction. Il s'agit de lectures avec les
projections, périmètres et marges du client, sans modifier les registres.

## Retour arrière

Revenir au frontend précédent restaure la mise en page et le chargement
antérieurs des signatures. Conserver les données et les signatures privées.
Pour revenir aux politiques SQL précédentes, restaurer leurs définitions
depuis les migrations antérieures ; ce retour peut réintroduire la lenteur.
