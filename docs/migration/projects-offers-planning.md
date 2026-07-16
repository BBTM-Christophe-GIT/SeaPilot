# Projets — offres, contrats SUPPLYTIME et occurrences Planning

Date : 16 juillet 2026.

## Décisions livrées

- `projects` reste le catalogue commercial et contractuel.
- `planning_projects` reste le registre des exécutions opérationnelles.
- Une exécution porte l'optionnel `planning_projects.catalog_project_id` ; plusieurs lignes peuvent référencer le même projet catalogue.
- Seuls `admin` et `direction` créent une occurrence via `projects_create_planning_occurrence`. La fonction vérifie société, projet non archivé, navire et dates dans la base.
- Les anciennes lignes Planning demeurent valides sans lien. Aucun rapprochement par titre et aucune suppression implicite ne sont introduits.

## Modèles documentaires retrouvés

L'inspection du module SPFx `modules/projects` confirme que le seul modèle contractuel embarqué est constitué de deux images SUPPLYTIME 2017 et de 36 zones positionnées dans `ProjectsDisplay.ts` : 34 cases et deux signatures.

| Actif SeaPilot | Origine SPFx | Taille | SHA-256 |
|---|---|---:|---|
| `supplytime-page-01.png` | `modules/projects/assets/supplytime-page-01.png` | 281 180 octets | `18DFBC14716CAA2B406CDCD396CD15444219E1D1C6CDFEE32E9214B0C863F62A` |
| `supplytime-page-02.png` | `modules/projects/assets/supplytime-page-02.png` | 238 670 octets | `CDB6DB79764F18EF98D7ECFDC7BE64DDCD15AF3C64ED99D618A4733E6191B249` |

Les copies versionnées dans SeaPilot sont strictement identiques. Aucun modèle vierge DOCX/PDF d'offre n'est présent dans le dépôt SPFx. La bibliothèque SharePoint contient des offres historiques dont les rubriques ont permis de reconstruire le tableau commercial : client, représentant, projet, forme de contrat, navires, mission, livraison/restitution, mobilisation/démobilisation, durées, tarifs, carburant, port, facturation et paiement.

## Génération et frontière documentaire

- L'offre PDF est construite à partir des colonnes typées SeaPilot et des rubriques historiques observées.
- Le contrat PDF pose les données canoniques et les clauses `supplytime_data` sur les deux pages graphiques SPFx.
- Les valeurs typées stables priment sur une ancienne valeur JSON pour les montants, navires, parties, dates, ports et période.
- La génération est effectuée dans le navigateur et déclenche un téléchargement pour relecture humaine.
- Après validation, l'utilisateur ouvre `Documents Contractuels` et dépose le fichier dans SharePoint. SeaPilot n'envoie aucun binaire à Supabase, Vercel ou Supabase Storage.
- Le document généré n'est pas considéré comme signé ni automatiquement publié. La validation commerciale et contractuelle reste obligatoire.

## Relation un-à-plusieurs avec le Planning

La migration additive `202607160004_projects_offers_planning_occurrences.sql` ajoute :

- une clé étrangère composite `(catalog_project_id, company_id)` vers `projects(id, company_id)` ;
- un index partiel par société, projet et dates ;
- la RPC transactionnelle `projects_create_planning_occurrence` ;
- aucune contrainte obligeant à lier les opérations historiques.

Chaque appel crée intentionnellement une nouvelle ligne. Une seconde rotation, campagne ou intervention du même projet ne met donc pas à jour la première occurrence.

## Lisibilité des formulaires

La fenêtre Projets possède désormais ses propres variables de surface, texte, bordure et ombre. Son fond est opaque et son voile est renforcé ; elle ne dépend plus de variables CSS privées au panneau Planning. La largeur, la hauteur avec défilement interne et le comportement mobile sont conservés.

## Retour arrière

Revenir à la version applicative précédente n'efface aucune donnée. La colonne et les lignes liées doivent rester en place. Si la création d'occurrences doit être suspendue, révoquer temporairement l'exécution de la RPC pour `authenticated` ou redéployer l'interface précédente ; ne pas supprimer les occurrences déjà créées.
