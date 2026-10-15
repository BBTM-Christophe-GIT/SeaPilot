# Temps de travail — couverture des affectations

Version `3.75.0`, build `2026-10-15.005`.

## Règle de décision

Pour chaque affectation réelle, le moteur recherche des fenêtres de **24 heures
écoulées**, respectant les seuils administrés, dont l'union couvre toute
l'affectation. Les fenêtres peuvent se chevaucher ou se toucher ; aucun trou
n'est admis dans une couverture complète. Une fenêtre glissante défavorable ne
constitue pas à elle seule une alerte. Seuls les intervalles qu'aucune fenêtre
compatible ne couvre sont signalés, sur leurs journées respectives.

Toutes les heures enregistrées sont conservées. Les heures connues avant et
après l'affectation restent dans le contexte, notamment pour le cumul sur sept
jours et les cycles délimités par le repos consécutif configuré. Une fenêtre
terminée avant la fin d'un cycle connu ne masque pas les heures ou l'amplitude
de ce cycle. Le moteur résout les politiques datées, y compris celles des
navires, et utilise les changements d'événements et les croisements exacts de
seuils plutôt qu'un échantillonnage horaire.

Les créneaux proposés de trente minutes sont vérifiés individuellement contre
la couverture entière. Leur combinaison est réanalysée avec **tous** les
brouillons des différentes journées et les corrections en cours. Un trou déjà
présent ne bloque pas toutes les nouvelles saisies : une proposition ne doit
ni créer ni agrandir un trou et le créneau suggéré doit lui-même être couvert.

Une couverture utilisant des périodes futures est affichée comme projetée,
sans ajouter de verrou au workflow existant. Une politique ou une affectation
absente produit une indication neutre ; les heures manuelles hors affectation
conservent leur workflow existant. Les seuils stockés ne sont pas modifiés par
cette livraison.

## Interface et droits

Les routes réelles du module retrouvent le graphique horaire de la vue jour,
les poignées d'ajustement des brouillons, et un graphique horaire par journée
dans la vue mois. Le portage conserve les corrections ultérieures de saisie
tactile, d'enregistrement explicite, de réponses asynchrones et de signature.
Il ne réintroduit pas la préversion autonome antérieure.

La conformité est issue d'une seule analyse d'affectation, commune aux vues
jour et mois. Les anciens indicateurs de fenêtres isolées ne recolorent pas
des journées couvertes. L'accueil de gestion utilise également les trous de
couverture, avec leur vraie date, et conserve les métriques du calcul source.

Les utilisateurs peuvent consulter les seuils. Seul un **administrateur** peut
ouvrir l'éditeur ou appeler la RPC d'enregistrement. Les paramètres comprennent
les limites de travail et de repos sur 24 h et sept jours, le repos consécutif,
la fragmentation, les horaires et le maximum de travail de nuit, l'amplitude
et l'intervalle entre repos. Les valeurs absentes ne sont pas remplacées par
des valeurs implicites dans l'affichage.

Les contrôles de lecture utilisent les vrais rôles et les affectations du
Capitaine. L'analyse d'un mois n'autorise pas la lecture de ses autres navires
ou bordées. Les helpers privilégiés restent privés ou répètent les contrôles
de société et de lecture ; aucun paramètre de session fourni par le client
n'est traité comme une preuve de conformité.

## Base et déploiement

Appliquer dans cet ordre, avant le client :

1. `20261015090523_working_time_surrounding_window_analysis.sql` : moteur de
   couverture, analyse groupée et recommandations compatibles.
2. `20261015090935_working_time_assignment_coverage_workflow.sql` : décisions de
   soumission et validation, accueil et preuve de l'analyse pour les nouvelles
   opérations.

Les nouvelles colonnes `compliance_analysis_snapshot` conservent la base de
décision des nouvelles soumissions/validations. Les signatures, événements,
approbations et calculs historiques ne sont pas réécrits. Aucun seuil, compte,
justificatif ni heure de production n'est créé par la recette.

## Vérification

La recette SQL s'exécute dans une base locale dédiée, avec des identités
synthétiques et de vraies sessions `authenticator`/`authenticated`, dans des
transactions annulées. Elle couvre la chaîne continue sur sept jours, le cas
du 13 octobre avec une fenêtre défavorable de 7 h 30 de repos mais une autre
couverture possible, les cycles connus incompatibles, les propositions, les
droits par profil et les décisions signées.

La recette visuelle rend les composants réels avec un client mémoire et des
données synthétiques. Elle vérifie les vues jour/mois sur ordinateur et mobile,
la modification d'un seuil administrateur avec rafraîchissement de l'affichage,
et la consultation seule pour Marin. Les droits ne sont pas déduits d'une
simulation administrateur : ils sont vérifiés séparément par les fixtures SQL.

Les résultats finaux des tests, de la compilation et le commit exact déployé
sont consignés dans la pull request de livraison.

- Base fraîche reconstruite depuis `main` : **201 assertions SQL réussies**
  sur neuf fixtures, dont les vrais profils, le cas du 13 octobre, les
  signatures, les changements de politique et le passage à l'heure d'hiver.
- Frontend : **283 tests** du module et des politiques réussis, puis **27 tests**
  ciblant le dernier changement de découpage des rapports/notifications.
  La suite complète initiale a réussi 3 905 tests ; son unique échec de délai
  dans `PlanningPage` a réussi au rejeu isolé sans modification de code.
- Benchmark synthétique sous une vraie session `authenticator`, avec un délai
  SQL de huit secondes : 22 profils, 198 affectations, 4 356 calculs ; environ
  **0,94 s** couverts et **4,91 s** tous incompatibles, avec 198 alertes exactes.
- Vérifications de production dans des transactions en lecture seule avec le
  même délai : mois du Marin concerné **1,59 s**, mois d'un Capitaine **0,98 s**,
  accueil administrateur sur 121 jours **4,53 s**. Les empreintes des heures,
  registres et approbations du cas contrôlé sont inchangées. Aucun nouvel avis
  de sécurité Supabase n'apparaît après les migrations.

Les fichiers de migration portent exactement les versions enregistrées en
production pour éviter une seconde application lors d'un prochain déploiement.
