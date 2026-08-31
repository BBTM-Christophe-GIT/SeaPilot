# Projets — contrat de remorquage BBTM (v3.24.0)

## Changement

- L’aperçu du contrat de remorquage restitue les six pages du modèle BBTM et permet de naviguer de la page 1 à la page 6.
- Le formulaire dédié n’affiche que les données utiles au contrat, avec les numéros du document : parties, remorqué, remorqueur, conditions, ports, créneaux, temps de connexion et déconnexion, tarif, coûts, paiement et conditions particulières.
- Les conditions du remorqué, coûts facultatifs, conditions de paie et TVA sont préremplis avec les valeurs commerciales demandées.
- Les caractéristiques détaillées du remorqué et du remorqueur alimentent la première page. L’assureur RC/P&I du remorqueur est administrable dans la fiche Flotte.
- Les signatures de l’affréteur et de l’armateur sont placées sur la première et la sixième page. L’émetteur, la date en français et sa signature proviennent de la fiche RH.
- Le document généré est un PDF vectoriel de six pages fondé sur le modèle contractuel fourni ; il est conservé dans le stockage documentaire SeaPilot/Supabase, sans SharePoint.

## Données

- Migration `20260831072727_add_vessel_liability_insurer.sql` : ajout de `vessels.liability_insurer` pour l’assureur RC/P&I.
- Les nouveaux champs propres au contrat restent regroupés dans `project_contracts.supplytime_data` ; les caractéristiques du remorqué restent dans `project_towed_assets`.

## Validation attendue

- Navigation complète `1 / 6` à `6 / 6` dans l’aperçu.
- Présence des données aux emplacements 1 à 19 de la première page et des deux signatures en page 6.
- Génération d’un PDF de six pages sans altération des clauses contractuelles du modèle.
- Tests, lint et build de production verts avant déploiement.
