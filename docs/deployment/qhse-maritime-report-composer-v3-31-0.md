# KPI maritime — rapports harmonisés et composition PDF

Version 3.31.0 · 5 septembre 2026.

## Livraison et règles de design

- Les dix modèles conservés restent disponibles ; ajout du plan de formation RH (modèle 11). Aucun ancien modèle supprimé n’est réactivé.
- Le modèle de consommation validé est la référence : A4 portrait, marges 14 mm, largeur 182 mm, fond blanc, titres bleu #126082, texte #1a2739, filets #dae3ec, rayons 2 mm, graphiques vectoriels et tableaux à entêtes gris clair.
- Logo original conservé dans son cadre 20 × 20 mm, proportions intactes ; aucun nom du logiciel dans les PDF. Pied de page : numéro uniquement.
- Les modèles ne sont plus assimilés à des pages physiques. Une préparation produit un manifeste des pages réellement générées. La sélection permet une seule page ou un sous-ensemble, assemblé en un PDF numéroté à partir de 1. Le sommaire est recalculé pour la sélection finale.
- Les tableaux détaillés ne sont plus tronqués à 34/48/56 lignes. Les pages de continuation sont sélectionnables séparément. Les exports individuels et ZIP restent disponibles.

## Contrat des graphiques

| Rapport | Comparaison et forme | Données / unité |
| --- | --- | --- |
| Santé / sécurité 1 | TF et TG mensuels, courbes séparées ; bilan annuel en table | Événements classifiés, heures d’exposition, jours perdus |
| Santé / sécurité 2 | Typologie et causes, barres horizontales | Registre HSE et causes documentées, nombres |
| Sécurité navire | Exercices et couverture TBT, barres mensuelles | DPR, nombres et % des lignes HSE |
| Environnement | Déchets solides/liquides, barres mensuelles | DPR, kg et litres séparés |
| Gouvernance | Contrats et propositions, barres de répartition | RH / actions ; pas de radar inventé |
| Escales | Heures mensuelles et motifs, barres | Accostage/appareillage ; objectifs Supabase |
| RH | Répartitions âge/genre, fonction, contrat | Personnes avec dates d’emploi connues |
| Consommations | Cumuls mensuels quotidiens et GES annuels, modèle validé | Eau avitaillée m³ ; fuel consommé L / 1 000 ; tCO₂e |
| Formation | Échéances mensuelles connues, barres | Documents RH, pas des formations réalisées |

Tendance et prévision ont des options distinctes par graphique. Une régression nécessite au moins trois mois terminés documentés. La prévision porte sur les mois futurs de l’année en cours, à partir des trois derniers mois complets ; les observations et totaux ne sont jamais modifiés. Traits pleins / losanges / pointillés distinguent réel / tendance / prévision sans reposer seulement sur la couleur. Les graphiques catégoriels et échéanciers connus n’ont pas de prévision statistique. Pas de prévision automatique d’accidents ou de taux sécurité sur ces faibles effectifs. Les déchets n’ont pas de certification de complétude mensuelle : les options demandées signalent l’insuffisance au lieu d’inventer une projection.

## Définition des indicateurs sécurité

- LTI = FAT + LWDC ; chaque décès est compté une seule fois.
- TF / LTIFR = LTI × 1 000 000 / heures ; TG = jours perdus × 1 000 / heures.
- TRIR = (FAT + LWDC + RWC + MTC) × 1 000 000 / heures. FAC, near miss et trajet exclus.
- FAR = FAT × 100 000 000 / heures.
- Les taux ne sont jamais additionnés ni moyennés. Registre HSE canonique et actions liées dédoublonnés via action_item_id ; les actions classifiées sans ligne synchronisée sont conservées une fois.

Références primaires consultées : [IMCA Safety Statistics, définitions et formules](https://www.imca-int.com/media/gayf5252/imca-safety-statistics-2021-leaflet.pdf), [INRS ED 6012, fréquence et gravité](https://www.inrs.fr/dam/inrs/CataloguePapier/ED/TI-ED-6012.pdf). Aucun benchmark externe n’est présenté comme une valeur Supabase.

## Audit Supabase et limitations métier

Le schéma vivant a été interrogé avant modification. L’erreur d’exposition venait d’une colonne inexistante `exposure_hours` : les lignes contiennent `exposure_seconds`, converties en heures. Les DPR et leurs sous-tables, les événements et l’exposition sont paginés afin de ne plus perdre les lignes au-delà du plafond PostgREST.

Au contrôle du 05/09/2026 :

- Historiques entreprise officiels : 2023 = 11 454 h / 1 091 hommes-jours ; 2024 = 25 883 h / 2 394 ; 2025 = 36 230 h / 3 448.
- Registre HSE : 10 événements, dont 1 LWDC et 10 jours perdus en 2024. Avec les heures officielles, TF 2024 = 38,64 et TG = 0,386, pas les anciennes valeurs Power BI calculées sur un autre dénominateur.
- Aucune certification de zéro événement pour 2023 : taux absents, et non zéro. Pour l’année courante, « zéro enregistré » n’est pas présenté comme une preuve d’exhaustivité.
- Exposition 2026 : 2 002 lignes, 20 394,5 h d’exposition ; 777 lignes sans heures réelles, utilisant le repli planifié. Le rapport avertit que la base est mixte et doit être validée avant comparaison IMCA externe.
- Les 3 443 lignes d’exposition ont `project_id IS NULL`. Aucun taux par projet n’est inventé, et les historiques entreprise ne sont pas proratisés arbitrairement. Même périmètre années/navires/projets au numérateur et au dénominateur.
- 19 groupes date/navire/projet ont plusieurs DPR soumis/validés (certains projets non renseignés peuvent représenter des activités différentes). Les enregistrements restent intacts ; les groupes du périmètre exporté sont signalés avec leurs IDs pour rapprochement métier.
- Environnement : les deux modèles utilisent le facteur direct MDO applicable dans Supabase (actuellement 2,85 tCO₂e/m³) et l’hypothèse XBEE de 15 %. Il s’agit d’émissions estimées, pas mesurées.
- RH : une sélection projet/navire repose uniquement sur les affectations documentées dans le registre ; absence d’affectation ≠ effectif zéro. Les historiques RH sont limités par les dates d’entrée/départ actuelles.
- Formation : échéances de titres/formations et nombre de visites médicales uniquement, sans restrictions ni diagnostics individuels. Les tarifs historiques codés dans le PDF RH ne sont pas repris, conformément à la contrainte Supabase exclusivement. Budget, heures de formation réalisées et taux de réalisation sont à structurer ultérieurement.

Aucune écriture métier, migration ou modification de RLS n’est nécessaire. Les requêtes applicatives restent soumises aux droits du compte connecté. Les comptes Marin/Capitaine simulés ne sont pas utilisés comme preuve de visibilité réelle.

## Vérification effectuée

- 35 tests ciblés : calculs, filtres, absence vs zéro, pagination de 1 201 lignes, dédoublonnage, indépendance des options, exclusion des rubriques escale vides et extraction d’une page. ESLint KPI sans erreur ; compilation TypeScript et build Vite de production réussis.
- Onze modèles PDF natifs produits avec un instantané réel Supabase, puis assemblage avec sommaire et export d’une seule page. Revue visuelle de chaque modèle et des continuations ; vérification des nombres français, entêtes, axes, absence de troncature des tableaux et pied de page numérique.
- Interface testée dans le navigateur à 1 280 px et à 390 px : préparation, cases de sélection, export d’une seule page, état sans sélection, aperçu PDF. Aucune largeur horizontale excédentaire sur mobile. La simulation Admin locale teste le workflow, pas les valeurs métier ; les calculs ont été rapprochés séparément avec Supabase.
- Fidélité : logo et proportions conservés ; mêmes marges et palette que la consommation ; titres/tableaux/cartouches partagés ; graphiques vectoriels ; avertissements lisibles séparés des résultats. Les tables longues produisent de vraies pages sélectionnables, pas une réduction illisible de la police.
- Les avertissements de build sur les bundles volumineux et les imports mixtes JSZip/projets existaient déjà. Aucune dépendance ni politique de lifecycle modifiée.

Le déploiement est assuré par la PR et le workflow Vercel associés à cette version. La validation de production doit contrôler la version affichée et l’export depuis le compte réellement connecté.

Les instantanés et PDF de contrôle contenant des données RH restent hors du dépôt, dans le répertoire temporaire de la session. Aucun secret ni document RH n’est commité.
