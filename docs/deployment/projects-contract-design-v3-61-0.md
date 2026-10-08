# Projets — présentation des contrats, v3.61.0

Le sélecteur **Type de contrat** se trouve sous le numéro de projet, dans la navigation de l’assistant. La carte qui rappelle le projet et son client conserve une hauteur adaptée à son contenu dans chaque étape, y compris sur petit écran.

Les formulaires de remorquage et d’affrètement reprennent les espacements, les couleurs et les panneaux de l’offre commerciale. Les champs d’affrètement sont regroupés par parties, navire, durée, assurance et signataires. Les champs, leurs valeurs par défaut, les calculs et la sauvegarde existants sont conservés.

Les aperçus et les nouveaux exports PDF de ces deux contrats utilisent un bandeau bleu nuit, des rubriques numérotées et des tableaux de valeurs. Ils partagent la même mise en page vectorielle et les mêmes sauts de page. Les longs champs se poursuivent sur la page suivante ; le nombre de pages dépend du contenu. Les documents déjà archivés restent inchangés.

## Sources des clauses

`src/features/projects/assets/contract-previews/contract-terms.json` reprend les paragraphes des modèles DOCX existants, avec leur nom, empreinte SHA-256 et plage de paragraphes. Les textes et la numérotation des clauses restent ceux des modèles. Un test compare intégralement ces paragraphes aux fichiers sources ; toute évolution contractuelle future doit mettre à jour les deux ensemble.

`helvetica-metrics.json` contient les largeurs des caractères Helvetica normal et gras de pdf-lib à 1 000 points. Le retour à la ligne utilise ces métriques pour garder l’aperçu SVG et le PDF cohérents.

## Vérification et déploiement

- Tests des formulaires, des types de contrat, des données des documents, des clauses et de la pagination des champs longs.
- Contrôle visuel de la carte dans les 20 combinaisons type/étape, de l’affichage mobile et des PDF des deux contrats.
- Compilation de production avec pnpm 10.34.5.
- Aucune migration de base de données ni nouvelle variable d’environnement.
