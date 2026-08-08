# Import du planning BBTM

Ce flux transforme les classeurs `BBTM - PLANNING 2024.xlsx` et
`BBTM PLANNING.xlsx` en périodes historiques SeaPilot. Il sépare
volontairement la prévisualisation de l'écriture en base : la commande applicative
ne modifie jamais la production.

## Périmètre validé

- L'onglet `PLANNING GENERAL` du classeur 2024 est lu du 1er janvier au
  31 décembre 2024. L'onglet `AT GOURY`, consacré au détail des travaux, est
  exclu pour éviter de dupliquer les affectations déjà présentes dans le planning
  général.
- Les onglets `2025` et `2026` sont lus jusqu'au 30 juin 2026 inclus. La demande
  « 31 juin 2026 » est interprétée comme le 30 juin, le 31 juin n'existant pas.
- Seul le personnel est traité, y compris Office, Extra et Stagiaires.
- Les pictogrammes et numéros de téléphone placés après les noms sont supprimés
  avant le rapprochement et dans les fichiers de prévisualisation.
- L'alias `KIKI` est remplacé par `CHRISTOPHE BINET`.
- Les affectations, statuts, exclusions et commentaires suivent les règles
  documentées dans l'onglet `Règles` du classeur de prévisualisation.
- Les 131 cellules initialement placées dans `À vérifier` ont reçu une décision
  ciblée : 113 journées `Vacance`, 16 journées `A Terre` et 2 journées `En Mer`.
- Les 17 cellules initialement exclues ont reçu une décision ciblée `A Terre`.
  La valeur Excel d'origine est conservée comme commentaire pour ces 148
  décisions afin de garder la justification visible dans SeaPilot.
- Ces décisions sont identifiées par onglet et adresse de cellule. Les mêmes
  codes ou textes libres rencontrés ailleurs restent soumis aux règles générales
  et ne sont pas importés automatiquement.
- Une bordée n'est proposée que lorsque deux marins ou plus ont au moins trois
  jours communs, un recouvrement d'au moins 60 % et des débuts distants de trois
  jours au maximum. Il ne peut y avoir que `Bordée 1` et `Bordée 2` par navire ;
  les groupes supplémentaires sont répartis alternativement entre ces deux
  bordées. Les affectations isolées sont réparties entre ces mêmes bordées :
  aucune période en mer ne conserve la valeur `Affectation`.
- Toutes les affectations à Armement Cherbourg utilisent la bordée `Armement`.

## Générer la prévisualisation

Le catalogue JSON contient deux tableaux `people` et `vessels`. Les personnes
exposent `id`, `name`, `active`, `functionLabel` et `gradeLabel`; les navires
exposent `id`, `name` et `active`. Il peut être fourni explicitement pour figer
l'audit ou être lu en mode consultation depuis le projet Supabase lié.

```powershell
pnpm import:bbtm:preview -- `
  --source "$env:USERPROFILE\Downloads\BBTM - PLANNING 2024.xlsx" `
  --source "$env:USERPROFILE\Downloads\BBTM PLANNING.xlsx" `
  --decisions ".\outputs\BBTM_Planning_2024_2026 corrigé.xlsx" `
  --cutoff 2026-06-30 `
  --output ".data\bbtm-planning-preview.json" `
  --supabase-workdir "$PWD"
```

L'option facultative `--decisions` lit les colonnes `Statut`, `Navire` et, si
elle contient une fonction maritime précise, `Catégorie` de l'onglet
`À vérifier`. Une ligne sans décision est exclue de l'import. Une affectation
`En Mer` sans navire reste à vérifier et n'est pas importée.

La fonction enregistrée dans `planning_periods.function_label` est résolue dans
l'ordre suivant : fonction corrigée dans le classeur, fonction du profil RH,
grade du profil RH, puis catégorie générique en dernier recours. Les crew lists
et attestations utilisent ainsi la fonction maritime disponible au lieu du
libellé générique `Équipage`.

L'option `--source` peut être répétée. La commande produit trois fichiers :

- `bbtm-planning-preview.json` : détail de l'audit ;
- `bbtm-planning-preview.apply.sql` : import transactionnel préparé ;
- `bbtm-planning-preview.rollback.sql` : retour arrière du seul lot BBTM.

Elle n'exécute aucun des scripts SQL.

## Validation avant production

Avant d'appliquer l'import :

1. valider les correspondances de l'onglet `Personnes` ;
2. contrôler les lignes restantes dans `À vérifier` et confirmer les lignes
   volontairement ignorées dans `Exclus` ;
3. valider les propositions de l'onglet `Bordées` ;
4. régénérer l'aperçu après toute modification de règle ;
5. contrôler que le nombre attendu dans le script SQL correspond au nombre de
   périodes importables affiché dans `Synthèse`.

### Validation des documents issus de l'import

Les périodes historiques importées sont consommées par les trois parcours :

- la crew list réglementaire, filtrée par date, navire et bordée ;
- l'attestation d'armement, pour les périodes `En Mer` du marin et des navires
  sélectionnés ;
- les exports Planning, Liste d'équipage, Marin et calendrier.

Avant la mise en production, générer au moins un exemple de chaque document.
Une crew list complète exige la date et le lieu de naissance ainsi que le type
et le numéro de pièce d'identité de chaque marin. Une attestation exige le
numéro de marin, la date de naissance, un brevet Pont ou Machine, la fonction
à bord et l'immatriculation du navire. L'import du planning ne complète pas ces
données RH ou flotte manquantes.

## Application et retour arrière

Le script d'application :

- ouvre une transaction et prend un verrou dédié au lot ;
- cible la société dont le code est `bbtm` ;
- remplace uniquement les lignes portant
  `source_label = 'bbtm-planning-xlsx-v1'` ;
- vérifie le nombre exact de lignes insérées ;
- annule toute l'opération en cas d'erreur ou de période verrouillée.

Chaque ligne dispose également d'une `slot365_source_key` stable. Les données
provenant d'autres imports ou de saisies SeaPilot ne sont ni modifiées ni
supprimées.

Si la prévisualisation validée n'est pas convaincante après application, exécuter
le script `.rollback.sql`. Il supprime exclusivement les périodes de la société
BBTM portant ce `source_label`. Le retour arrière doit être testé immédiatement
après l'import, avant toute publication du planning concerné.
