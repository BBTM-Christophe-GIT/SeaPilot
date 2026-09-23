# Registre des Exercices — version 3.51.2

Route : `/modules/emergencyExercises`, menu **Registres → Registre des Exercices**.
Choisir l’année, éventuellement un navire via son illustration, puis un marin pour
exporter son carnet. La vue **Flotte** est sélectionnée par défaut. Le graphique
et le tableau s’actualisent avec chaque filtre. Les navires sans illustration ont
une icône de remplacement. Les filtres affichent les navires actifs, une seule fois
par nom, du plus long au plus court. Les historiques des navires archivés restent
comptés dans la vue flotte et les carnets individuels.

## Accès et sources

| Profil | Marins accessibles | Sélection initiale |
| --- | --- | --- |
| Administration, Direction, Armement | Tous les marins offshore de la société active | En poste, tous les marins du filtre |
| Capitaine | Lui-même et sa bordée, selon les affectations Planning non annulées | Toute sa bordée |
| Marin | Sa propre fiche liée au compte | Lui-même |

« En poste » reprend les dates RH : embauche commencée et départ absent ou futur.
Le périmètre Capitaine réutilise `captain_shares_watch_with_person` : même société,
navire et bordée, affectations qui se chevauchent, affectation du capitaine non
échue. Un compte sans fiche liée reçoit une liste vide, jamais une flotte ouverte.
Les rôles se cumulent ; un rôle de bureau donne le périmètre société.

Les RPC `emergency_exercises_people` et `emergency_exercises_report` vérifient
l’identité authentifiée, l’adhésion active à la société et la permission du module.
Le serveur valide chaque identifiant de marin/navire demandé. Les implémentations
dans le schéma privé ne renvoient que les identités autorisées et des totaux mensuels.
Les politiques DPR/RH existantes ne sont pas élargies : un Marin peut retrouver ses
exercices dans un DPR rédigé par son capitaine sans lire le reste de ce DPR.

Source : DPR soumis/validés non supprimés, année civile de `report_date`, exercices
et présence dans `dpr_crew_members`. Une entrée d’exercice est comptée une seule
fois par DPR, même si plusieurs membres ou fonctions correspondent au filtre.
Les libellés historiques sont conservés. Incendie puis abandon sont placés en
premier et surlignés comme dans l’ancien Dashboard.

Les TBT déclarés dans `dpr_hse_actions` avec `tbt_performed = true` sont considérés
comme des exercices. Ils sont regroupés sur une ligne **TBT — thème libre** et inclus
dans le graphique, les totaux mensuels/annuels et le PDF. Un TBT est compté une seule
fois par DPR, indépendamment du nombre d’exercices prédéfinis ou de participants.
Un DPR contenant seulement un TBT est inclus. Les mêmes filtres de statut, année,
navire, société et personnel s’appliquent aux deux sources.

Le thème reste saisi librement dans la rubrique **Actions HSE → Thème du TBT** du DPR,
sans correspondance obligatoire dans `emergency_exercise_types`. Le texte original
reste dans le DPR ; le registre regroupe les TBT quel que soit leur thème. La règle
existante de saisie d’un thème non vide dans le DPR est conservée.

## PDF

Document A4 avec graphique et tableau mensuel ; l’en-tête précise le marin, l’année
et le navire ou « Toute la flotte ». Les longues listes continuent sur plusieurs
pages. Le PDF individuel peut aussi être généré pour une année sans exercice.

Nom historique : `Exercices-Urgence-Prénom-NOM-Année.pdf`, accents retirés et
caractères autres que lettres, chiffres, points, tirets et underscores remplacés
par des tirets. Aucun suffixe navire n’est ajouté.

Pied de page historique inchangé sur toutes les pages :
`REP 08-A - Verifiez la liste de diffusion pour vous assurer d avoir toujours la derniere version de ce formulaire.`

## Déploiement et validation

Appliquer dans l’ordre les migrations suivantes avant le client (déjà appliquées) :

1. `20260922200914_emergency_exercises_register.sql`
2. `20260922201159_emergency_exercises_vessel_illustration.sql`
3. `20260923053355_emergency_exercises_active_vessels.sql`
4. `20260923060419_emergency_exercises_tbt.sql`

Aucune nouvelle variable d’environnement ni dépendance.
`supabase/tests/emergency_exercises_access_test.sql` vérifie les cinq profils réels
avec claims Auth et rôle SQL authenticated, les autres sociétés/bordées, la
révocation, l’anonymat, le filtre personnel/navire/année et l’absence de doublons.
Toutes les données de test sont annulées par rollback. Les simulations de profils
de l’interface ne constituent pas la preuve des droits.

Tests Vitest : agrégation, nommage, filtres, réponses obsolètes, états vides et
erreurs, PDF vide et pagination avec pied de page sur chaque page.
Les fixtures SQL couvrent aussi les TBT seuls, les thèmes libres, les TBT non cochés,
les DPR multi-exercices/multi-participants, les brouillons, les DPR supprimés,
les années précédentes, les anciens marins et l’isolation entre sociétés.
Recette navigateur : menu réel en aperçu, ordinateur et mobile, illustrations,
filtre navire, changement d’année, téléchargement et console.
