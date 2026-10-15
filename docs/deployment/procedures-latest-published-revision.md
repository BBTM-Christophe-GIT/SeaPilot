# Procédures : dernière version PDF publiée

Version `3.75.3`, build `2026-10-15.008`.

## Comportement

La publication de **TEC 07-B** supprime du catalogue les publications PDF
**TEC 07-A**. La clé est le thème et le numéro du document, normalisés sans
distinction de casse ni espaces de bord. L'identifiant de la source n'est pas
la clé : certaines publications historiques de références différentes sont
rattachées à une même source.

Seules les versions strictement inférieures sont supprimées. Les doublons de
version identique sont conservés. Les documents sans référence numérotée,
notamment les documents DNC historiques, ne sont pas regroupés arbitrairement.
Les versions alphabétiques suivent l'ordre A, B, …, Z, AA ; les versions
numériques se comparent par segments. Les familles de versions différentes ou
non reconnues sont conservées.

Un brouillon préparé ou un échec de conversion ou de validation ne retire pas
la version publiée. La publication et le remplacement sont effectués dans une
même transaction, y compris pour les anciens imports de PDF. Une tentative de
publier une version plus ancienne qu'une version déjà publiée est refusée.
Les éventuels liens QHSE suivent la nouvelle publication avant suppression de
l'ancienne. Les profils Armement, Capitaine et Marin restent en lecture seule.

La suppression utilise le fonctionnement habituel de SeaPilot : la publication
disparaît du module et son accès est révoqué ; les archives techniques privées
Blob et Drive sont conservées. Les sources modifiables ne sont pas supprimées.

Les titres de la bibliothèque, de l'aperçu et de la liste PDF exportée masquent
uniquement l'extension finale `.pdf`, quelle que soit sa casse. Les noms et
extensions réels restent disponibles pour les téléchargements et les fichiers.
Après une publication, la bibliothèque est rechargée depuis le serveur. Une
erreur de rechargement est signalée sans annuler la publication confirmée.

Le transfert refuse aussi une référence ou une version de source modifiée
pendant l'envoi. En cas de réponse réseau incertaine, le PDF transféré est
conservé pour ne pas casser une publication qui aurait déjà été confirmée par
le serveur.

## Audit des publications existantes

Le contrôle en lecture seule du 15 octobre 2026 porte sur **75 PDF publiés**.
Sept références sont présentes plusieurs fois : OPE 01, TEC 02.6, TEC 02.8,
VPC 02.2, VPC 02.3, VPC 02.4 et VPC 02.6. Toutes leurs versions sont **A**.
Il n'existe donc aucune version strictement inférieure à supprimer lors de cet
audit. Les trois documents sans référence numérotée sont conservés.

## Validation

Appliquer avant le client, dans cet ordre :

1. `20261015115034_procedure_legacy_atomic_publication.sql`
2. `20261015115043_procedure_latest_published_revision.sql`

Ces migrations ont été appliquées en production. Le contrôle après application
confirme zéro version inférieure restante et la conservation des 75
publications et 137 sources : les empreintes des lignes publiées, des sources
et des paramètres QHSE sont identiques avant et après. Les contrôles de
sécurité ne signalent aucun nouveau point.

Vérifier les remplacements A → B, Z → AA et les versions numériques, les autres
références et les versions égales, la préparation d'un brouillon, les échecs,
les liens QHSE et les autorisations des vrais profils SQL. Contrôler également
que les lecteurs ne peuvent plus accéder à une publication supprimée, que la
bibliothèque rechargée conserve seulement les versions servies et que les noms
des téléchargements restent inchangés.

Recette effectuée sur une base locale isolée avec le rôle de migration
`postgres`, puis des sessions `authenticator` et les vrais profils SQL :
fixtures de remplacement et d'import atomique, accès Blob, workflow Drive et
publication QSMS réussis. L'import atomique passe 30 assertions et la suite
QSMS 20 assertions. Deux connexions simultanées confirment le refus d'une
publication obsolète en READ COMMITTED et REPEATABLE READ.

Les tests Procédures et des adaptateurs documentaires passent. Le test Chrome
du composant réel avec données synthétiques confirme le rechargement de la
bibliothèque après remplacement, le titre SMS 06 A sans extension et le
téléchargement du PDF avec son extension et ses octets d'origine. Les fixtures
Marin et Capitaine ne chargent pas les sources. La liste PDF exportée a été
générée, rendue et contrôlée visuellement.
