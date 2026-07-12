# SeaPilot — inventaire et règles du Planning SPFx

Dernière vérification : 12 juillet 2026.

Cette fiche est la mémoire de migration du module Planning. Elle consolide l’inventaire SharePoint du Dashboard SPFx, les liens Power Query/IQY connus, les tables Supabase SeaPilot et les règles métier effectivement utilisées par l’ancien module.

## Sources nécessaires

| Source SharePoint | Type | Identifiant / URL connue | Usage SPFx | Cible SeaPilot |
| --- | --- | --- | --- | --- |
| `RH - Personnel BBTM` | Liste | `/sites/QHSE/Lists/RH%20%20Personnel%20BBTM` | Marins actifs, fonctions, grades, contrats, dates d’embauche et de départ, options d’affectation, alertes RH | `people` |
| `BBTM - Flotte` | Liste | `/sites/QHSE/Lists/BBTM%20%20Flotte` | Navires actifs, acronymes, type d’unité et sortie de flotte | `vessels` |
| `KPI - Projets-Planning` | Liste | ID `e1c7e91f-8fb3-4b2e-9c9a-015396cf49c9`, vue `282D2303-FBE6-438C-8426-91A2161DDD6E` | Blocs projets, dates, client, deux navires, statut et facturation | `planning_projects` |
| `BBTM - Projets` | Liste | `/sites/QHSE/Lists/BBTM%20%20Projets` | Catalogue des projets actifs et valeurs d’affréteur proposées à la création | Référence d’import projets ; les enregistrements affichés viennent de `planning_projects` |
| `SMTR - Journees - Planning` | Liste | ID `e711a664-6c52-4e4e-95cc-0843ac7c5253`, vue `A724B2E7-B821-41FF-9C91-0519FB7360C1` | Source Slot365, journées, statuts, rythme, bordée, heures, repos et commentaires | `planning_days` |
| `SMTR - Planning Periodes` | Liste | ID `c03eb1f4-1d24-4d86-b91e-9afaaa45870b`, vue `87262130-BEE2-46A5-9E55-62E4971C86EF` | Périodes reconstituées depuis Slot365, navire, bordée, fonction et statut | `planning_periods` |
| `Certificats Flotte BBTM` | Bibliothèque | ID `fff33cda-20da-4a9b-8b55-46630ee5e8b0`, `/sites/QHSE/Certificats%20Flotte%20BBTM` | Panneau latéral des alarmes certificats par navire | `fleet_certificates` |
| `Brevets et Visites Medicales` | Bibliothèque | `/sites/QHSE/Brevets%20et%20Visites%20Mdicales` | Échéances RH à moins de 90 jours : médical, brevets et formations | `hr_documents` |

SeaPilot ajoute `planning_assignments` comme source native pour les affectations créées directement dans l’application. Cette table ne remplace pas les deux listes SMTR importées : les trois sources sont fusionnées à l’affichage, avec priorité aux périodes SMTR afin d’éviter les doublons exacts.

## Liens Power Query / IQY

- Journées SMTR : `https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=e711a664-6c52-4e4e-95cc-0843ac7c5253&View=A724B2E7-B821-41FF-9C91-0519FB7360C1&RowLimit=0&RootFolder=`
- Périodes SMTR : `https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=c03eb1f4-1d24-4d86-b91e-9afaaa45870b&View=87262130-BEE2-46A5-9E55-62E4971C86EF&RowLimit=0&RootFolder=`
- Projets Planning : `https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=e1c7e91f-8fb3-4b2e-9c9a-015396cf49c9&View=282D2303-FBE6-438C-8426-91A2161DDD6E&RowLimit=0&RootFolder=`

## Règles métier récupérées

### Période et navigation

- La vue `Semaine` conserve la règle SPFx d’une fenêtre opérationnelle de 14 jours.
- La vue `Mois` affiche le mois avec ses semaines de débordement pour garder une grille continue.
- La vue `An` couvre du 1er janvier au 31 décembre.
- Navigation précédent/suivant, sélecteurs mois/année, zoom horizontal et plein écran natif restent disponibles.
- Les week-ends sont différenciés et peuvent être masqués dans les réglages.

### Structure équipage

- Hiérarchie : navire → bordée → marin.
- `ARMEMENT - CHERBOURG` utilise le groupe `Armement` et le statut par défaut `À Terre`; les autres navires utilisent `En Mer`.
- Ordre prioritaire des fonctions : Capitaine, Chef mécanicien, 2nd/Second Capitaine, Bosco/Maître d’équipage, puis ordre alphabétique.
- Les navires et bordées sont réductibles. Les filtres navire et marin s’appliquent à toutes les sources.
- Une période SMTR prime sur une affectation native strictement équivalente. Une journée SMTR déjà couverte par une période n’est pas redessinée.

### Statuts, Slot365 et rythmes

- Couleurs : `En Mer` vert, `À Terre` jaune, `Repos` rose, `Vacance` noir, `Arrêt de travail` rouge, `Formation` bleu.
- Slot365 accepte les codes `1` à `6` et est normalisé sur 365 positions. Les périodes importées conservent `Slot365SourceId` et `Slot365SourceKey`.
- `Sans Rythme` applique le statut choisi sur la période.
- `7/7` applique `En Mer` chaque jour.
- `5/7` applique `En Mer` du lundi au vendredi et `Repos` le week-end.
- `10/10` conserve le cycle historique SPFx : 10 jours en mer puis 8 jours de repos.
- `14/14` conserve le cycle historique SPFx : 15 jours en mer puis 13 jours de repos.
- Pour un rythme automatique, la date de fin est bornée par la date de départ RH ; à défaut, elle va au 31 décembre de l’année.

### Projets et statuts

- Un projet est dessiné sur chaque navire associé, avec les dates inclusives.
- Les chevauchements restent lisibles grâce aux pistes de blocs du calendrier.
- Statuts : `À planifier` ambre, `Validé` vert, `En cours` bleu et `Facturé` violet.
- Les icônes SPFx d’origine sont réutilisées pour `À planifier`, `Validé` et `À facturer`.
- Le panneau `Facturation` liste les projets de l’année dont le statut ne contient pas `Facturé`.

### Panneau latéral

- `Certificats` : alarme trois mois avant l’échéance ; les éléments expirés sont prioritaires.
- `Marins non affectés` : personnel actif, de type personnel, sous contrat et présent sur la période, absent de toute affectation navire.
- `Facturation` : projets non facturés de l’année sélectionnée.
- `Alertes` : brevets, formations et visites médicales arrivant à échéance dans les 90 jours ou déjà expirés.

### Droits et actions SeaPilot

- Lecture : Admin, Direction, Armement, Capitaine et Marin, selon les politiques RLS existantes.
- Modification : Admin, Direction et Armement.
- La création d’une affectation écrit dans `planning_assignments` avec la source `seapilot`.
- Le clic sur une affectation ou un projet ouvre une fiche détaillée ; une affectation native sélectionnée peut être dupliquée.

## Écarts assumés avec le SPFx

- Le module SeaPilot utilise Supabase comme source d’exécution : il ne contacte pas SharePoint depuis le navigateur.
- Les gestes complexes de déplacement/redimensionnement Slot365 restent une étape ultérieure tant qu’un service d’écriture transactionnelle n’est pas défini côté Supabase. La lecture, les règles de reconstruction, les filtres, la création native et les panneaux d’analyse sont migrés.
- La suppression d’une période importée n’est pas exposée dans le cockpit pour ne pas casser la traçabilité SharePoint.

