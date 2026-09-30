# Audit ISM Interne

Le menu **Audits** regroupe eCMID, Audit ISM Externe, Audit ISM Interne et Audit Client. Le module interne comporte le planning, les grilles, la synthèse des écarts et le graphique comparant les résultats annuels par site et chapitre ISM.

Le manuel d’utilisation comprend une notice pour chacune des quatre entrées, avec les étapes et les droits du module interne. eCMID, Audit ISM Externe et Audit Client sont des espaces en préparation.

## Référence et notation

La grille initiale reprend les 61 questions et les consignes de vérification de l’onglet **Grille d’audit** du fichier `Grille d'audit BBTM.xlsx`. Les deux barèmes absents, références **10.4** et **11.2.3**, ont été confirmés à **3 points** par l’utilisateur. La grille complète comporte donc **183 points** avant exclusion des réponses N/A. Le classeur ne contient pas de réponses, de constats ou de scores historiques renseignés. Le graphique reprend les chapitres ISM et les résultats réellement enregistrés, avec un résultat N-1 absent lorsque cet audit n’existe pas.

La réponse Conforme vaut le barème maximum, Incomplet sa moitié et Non Conforme zéro. N/A retire le barème du dénominateur. Chaque grille peut être adaptée à un site ou un navire et chaque audit copie ses questions et sa version. Les modifications ultérieures d’une grille ne changent pas les audits précédents. Un audit terminé conserve ses réponses, ses observations, son auditeur, sa date réelle et sa version de grille sans modification.

## Planning annuel

La migration crée huit cibles BBTM : Armement - CHERBOURG, Yard - LE HAVRE, GOURY, LE ROZEL, LANDEMER, SUROIT, KROKDUR et HIRONDELLE DE LA MANCHE. Les navires sont reliés aux identifiants réels de la flotte, sans créer de nouveaux navires. Les dates de référence sont initialement vides : elles doivent être renseignées ou sont initialisées lors de la première planification.

Chaque site possède une date de référence annuelle. La fenêtre autorisée court de trois mois calendaires avant cette date à trois mois après. Un seul audit est prévu par site et année de campagne ; la date planifiée peut appartenir à l’année civile voisine lorsque la fenêtre franchit décembre/janvier. Le serveur valide la fenêtre, qui reste liée à la référence du site après un déplacement du rendez-vous. La date réelle d’exécution reste enregistrable en dehors de la fenêtre pour conserver un audit réalisé en retard.

## Écarts et profils réels

Une question peut avoir plusieurs écarts : non conformité majeure, non conformité mineure ou remarque. Chaque écart a une description, une échéance et un responsable, soit une personne active de la société, soit une fonction sur un navire actif : Capitaines, Chefs Mécaniciens ou Équipage. Le serveur reconstruit le libellé du responsable à partir des données réelles.

Administrateur, Direction et Armement peuvent gérer les grilles, planifier et réaliser les audits et affecter les écarts. Les vrais comptes Capitaine et Marin peuvent consulter les audits contenant leurs écarts et enregistrer le traitement de ceux qui leur sont affectés. La fonction collective est vérifiée à partir d’un embarquement **confirmé et en cours**, dans la société active et sur le navire désigné. Un rôle de planning générique utilise la fonction RH ; un rôle de planning explicite est prioritaire. Un capitaine ne reçoit pas les écarts réservés aux chefs mécaniciens du seul fait de son profil.

Le responsable peut enregistrer un suivi et proposer l’état **Traité, à vérifier**. Un gestionnaire vérifie ensuite et clôture. Une réouverture par le gestionnaire reste tracée. La création, les changements d’affectation ou d’échéance et chaque traitement créent un événement avec identité et horodatage serveur. Les utilisateurs du client ne peuvent pas insérer ou modifier directement les audits ou leur journal.

Les droits de navigation sont enregistrés pour les cinq profils sur les quatre entrées du menu Audits. Ils ne remplacent pas les règles de données : l’accès au module interne reste limité aux audits et écarts autorisés par le serveur.

## Déploiement et vérification

1. Appliquer la migration additive `supabase/migrations/20260930214840_internal_audits.sql` avant de déployer le client. Les RPC publiques sont `SECURITY INVOKER`, les écritures contrôlées et les fonctions RLS sont dans le schéma non exposé `internal_audit_private`. Les cinq tables ont RLS et des droits de lecture explicites.
2. Exécuter `corepack pnpm test src/features/internalAudits --pool=forks --maxWorkers=1`, les tests d’intégration du menu et `corepack pnpm build` avec pnpm 10.34.5.
3. Exécuter `supabase test db supabase/tests/internal_audits_test.sql` sur la base locale après application du schéma. Le fichier utilise des comptes authentifiés distincts et des fixtures de société, personnel et embarquements réels ; tous les changements de recette sont annulés par `ROLLBACK`.
4. Vérifier les conseillers de sécurité Supabase et confirmer en production les huit sites, la grille de 61 lignes, les permissions de navigation et les signatures RPC.
5. Vérifier que Vercel déploie le commit poussé et ouvrir Audit ISM Interne dans l’application. Valider planning, copie de grille, sauvegarde des réponses, écart, traitement, synthèse et comparaison annuelle. Ne pas utiliser les vues de profil simulées de l’administrateur comme preuve du comportement Capitaine/Marin.

Les tests SQL couvrent les affectations personnelles et collectives, les comptes Capitaine et Marin réellement séparés, l’absence d’accès d’un utilisateur non affecté ou d’un administrateur d’une autre société, les barèmes falsifiés, les fenêtres calendaires, la conservation des réponses terminées et les événements de résolution/clôture. Les tests TypeScript vérifient notamment la transmission des permissions serveur, la validation des responsables et la remontée des refus du workflow.

En cas de retour arrière du client, conserver les tables et l’historique. La migration n’altère pas les modules précédents. Exporter les données avant toute suppression manuelle des objets du module.

## Recette du 1er octobre 2026

La migration a été appliquée au projet SeaPilot `szlvyrrmvdvhzixilymh`. Le contrôle distant confirme huit sites, les six liens vers les navires actifs, une grille de 61 questions totalisant 183 points, cinq tables avec RLS et six RPC publiques invoker interdites aux anonymes. Aucun audit ni date anniversaire fictif n’est créé en production. Les conseillers Supabase ne signalent aucun objet du nouveau module ; leurs autres signalements concernent les objets existants.

Les 60 contrôles pgTAP passent sur la base locale avec de vrais utilisateurs authentifiés distincts, notamment Capitaine, Marin, chef mécanicien et autre société. La recette navigateur utilise uniquement les données de démonstration : question ajoutée à la grille LE ROZEL (version 2), émission d’un écart majeur avec responsable et échéance, traitement puis clôture avec deux événements, finalisation avec réponses figées, comparaison 2026/2025 et absence explicite de 2024. Les changements d’onglet ou de sélection sont bloqués tant que les réponses ou la grille ne sont pas enregistrées ou annulées.

Après intégration avec le dernier `main`, les 111 tests Vitest du module, des permissions, du shell et d’App passent, ainsi que le lint ciblé et la compilation de production de la version 3.62.0. L’interface a été contrôlée sur ordinateur et à 390 pixels, sans débordement de page ni erreur console actuelle. Le mode de démonstration sert à cette recette visuelle ; les autorisations des profils réels sont vérifiées par les fixtures SQL et les réponses serveur des tests UI.
