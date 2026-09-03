# Rapport Certificats Flotte - Plan d'Action

Le dialogue **Générer un rapport** du module Certificats flotte propose un périmètre **Liste des documents**. Ce périmètre accepte un ou plusieurs navires et conserve les autres périmètres historiques : flotte, navire, catégorie, document et écart.

Le contenu du PDF est indépendant du périmètre. L'utilisateur peut éditer :

- la liste des documents uniquement ;
- la liste des écarts uniquement ;
- les deux listes dans le même rapport.

Au moins un contenu doit être sélectionné. Pour le périmètre Liste des documents, au moins un navire doit également être sélectionné.

## Liste documentaire

Le rapport commence par une page de synthèse. Chaque navire commence ensuite sur une nouvelle page et aucun autre navire ne partage ses pages. Si le contenu d'un navire dépasse une feuille, les pages suivantes portent la mention **Suite**.

Dans chaque navire, les documents sont regroupés par catégorie dans un tableau **Suivi documentaire** présentant le document, l'échéance et un indicateur binaire :

- **Échu** lorsque la date d'échéance est antérieure à la date d'édition du rapport ;
- **Valide** dans les autres cas.

Lorsqu'aucune date d'échéance n'est renseignée, la colonne Échéance affiche **Validité illimitée** et l'état reste **Valide**.

## Écarts et actions

Lorsque la liste des écarts est incluse, chaque navire présente d’abord, par catégorie :

- une synthèse **1 - Liste des écarts et état du traitement** liée aux documents de cette catégorie ;
- le statut et le pourcentage d’avancement de chaque écart.

Les fiches détaillées viennent ensuite. Chaque écart commence obligatoirement sur une nouvelle page et regroupe :

- le constat et ses métadonnées ;
- l’**Action corrective** avec sa mise en forme enrichie ;
- l’inventaire de toutes les pièces jointes, y compris les PDF, fichiers Word et Excel ;
- les images intégrées au fil des pages lorsqu’elles sont disponibles ;
- l’historique du traitement.

Un écart long peut continuer sur plusieurs pages, mais l’écart suivant démarre toujours sur une nouvelle page. Les bandeaux de synthèse, de détail, d’action corrective et de pièces jointes utilisent le bleu BBTM ; l’ancien accent orange n’est plus utilisé.

La liste globale des écarts séparée des navires et catégories n'est plus utilisée. En mode **Liste des écarts uniquement**, la même organisation par navire et catégorie est conservée sans afficher le tableau documentaire.

## Identité du rapport

Le titre visible et les métadonnées PDF utilisent **Certificats Flotte - Plan d'Action**. Le générateur retire sans distinction de casse le mot `Seapilot` de tous les textes injectés dans le rapport, y compris les titres documentaires, les constats, les suivis et les légendes de pièces jointes.

Le nom de fichier suit le format `BBTM-Certificats-Flotte-Plan-d-Action-AAAA-MM-JJ.pdf`.

## Saisie de l’action corrective

Le dialogue **Déclarer un écart** / **Modifier l’écart** contient un éditeur enrichi **Action corrective**. Il prend en charge les titres, le gras, l’italique, le soulignement, les listes, l’alignement et les liens HTTP(S) ou `mailto:`. Le HTML est assaini avant affichage et avant intégration au PDF.

Le même dialogue permet d’ajouter plusieurs pièces à l’action corrective (PDF, PNG, JPEG, DOCX et XLSX, 50 Mo maximum par fichier). Les pièces sont stockées dans le bucket privé `fleet-certificates` sous le type historique `treatment`, afin de conserver les règles RLS et le nettoyage automatique existants.

La migration `20260903123000_fleet_finding_corrective_action.sql` ajoute la colonne `fleet_certificate_findings.corrective_action`. Elle doit être appliquée avant le déploiement du client.
