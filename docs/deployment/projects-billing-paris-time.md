# Horaires des DPR dans les éléments de facturation

Version `3.80.19`, build `2026-10-30.001`.

Les commentaires d'accostage et d'appareillage ajoutaient systématiquement deux
heures. Cette règle historique était appliquée aux heures saisies dans SeaPilot,
alors que le formulaire DPR les conserve déjà comme heures civiles de Paris.
Elle ignorait aussi le passage à l'heure d'hiver des données importées en UTC.

Le chargement des éléments de facturation distingue désormais la provenance :

- Les heures des DPR natifs SeaPilot sont reprises telles qu'elles apparaissent
  dans le formulaire, sans conversion supplémentaire.
- Les anciens horodatages SharePoint, y compris le repli sur les escales
  normalisées d'un DPR importé, représentent des instants UTC. Leur affichage
  utilise `Europe/Paris`, avec le décalage correspondant à leur date.

La règle s'applique à tous les projets, navires, dates et opérations qui
affichent des mouvements de port, dans le tableau de facturation et ses exports.
Elle ne dépend pas du fuseau du navigateur ou du serveur. Les heures enregistrées
ne sont pas réécrites ; aucune migration, configuration ou dépendance n'est
nécessaire. Les PDF déjà téléchargés doivent être générés à nouveau.

## Vérification

Les régressions couvrent les valeurs enregistrées du GOURY pour P144 :
appareillage du DPR du 11 octobre 2026 à `11h00` et accostage du 20 octobre à
`08h00`. Elles couvrent aussi d'autres dates et projets, les heures natives en
hiver, les imports UTC en été et en hiver, ainsi que les horodatages avec un
décalage explicite. Le chemin vérifié va du chargement des DPR aux commentaires
des lignes utilisées pour l'export.

Les droits des profils Marin et Capitaine et le RPC `dpr_save_payload` sont
inchangés. La vérification de ces profils utilise les tests dédiés et les règles
RPC/RLS du dépôt, sans prendre les vues de simulation pour référence.

La priorité historique des champs de `source_payload` pour les DPR importés est
conservée. Cette correction ne modifie pas la réconciliation des imports.
