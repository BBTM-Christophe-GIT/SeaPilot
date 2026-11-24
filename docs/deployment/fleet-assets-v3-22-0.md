# SeaPilot 3.22.0 — Référentiel Navires et brochure BBTM

## Portée

- `Navires`, dans le menu `Opérations`, présente désormais la source mixte sous trois catégories : Navires, Bureaux et Quais.
- La migration importe ou actualise les 14 lignes non vides du fichier IQY `BBTM - Flotte` et conserve les identifiants, versions et dates de la source SharePoint.
- La classification suit la règle métier exacte : `Armement - Cherbourg` est un bureau, `YARD - Le Havre` est un quai, toutes les autres lignes sont des navires.
- Chaque navire possède une fiche structurée, une photo et son propre onglet `Décision d’effectif`. Les bureaux et quais n’exposent ni décision d’effectif ni brochure.
- `Éditer brochure` génère à la demande un PDF de trois pages aux couleurs BBTM. Le document ne contient aucune marque SeaPilot et n’est pas persisté dans Supabase.
- Le client charge `jsPDF` et son module de tableaux uniquement au moment de l’édition d’une brochure.

## Base de données

Appliquer `20260820070225_restructure_fleet_assets_and_decouple_planning.sql` avant le déploiement du client.

La migration :

1. ajoute les champs structurés et les métadonnées de photo/brochure à `public.vessels` ;
2. réalise un upsert idempotent de la source IQY dans la société `bbtm` ;
3. crée le bucket privé `fleet-media`, limité aux images JPEG, PNG et WebP de 10 Mo maximum, avec lecture par société et écriture administrateur ;
4. ajoute `companies.staffing_decision_planning_enabled`, forcé à `false` ;
5. neutralise les alertes et bloqueurs de publication liés à la décision d’effectif tant que ce commutateur reste désactivé.

La photo GOURY et ses caractéristiques techniques initiales proviennent de la brochure BBTM 2024 fournie pour la recette.

## Vue d’ensemble du navire

La fiche regroupe les champs par catégorie. Les métadonnées d’import SharePoint
sont conservées dans la base pour le suivi de la source.

Appliquer `20261124074903_fleet_vessel_net_tonnage_summer_freeboard.sql` avant
de déployer le client en production. La migration ajoute deux champs
facultatifs à `public.vessels` pour la jauge nette et la hauteur du franc-bord
d’été en millimètres. Les administrateurs peuvent les renseigner dans
**Navires → Modifier**. Ils apparaissent dans **Dimensions et tonnage**.
Les valeurs historiques de déplacement lège restent disponibles pour la
brochure et l’export de flotte.

## Vérification

1. Vérifier 14 lignes source : 12 navires, 1 bureau et 1 quai.
2. Ouvrir `Navires > GOURY` et contrôler la photo, l’IMO `9213870`, la jauge `293 UMS` et la puissance `750 kW`.
3. Ouvrir `Décision d’effectif` et vérifier que les situations sont limitées au navire sélectionné et que le message de déconnexion du Planning est visible.
4. Ouvrir les catégories Bureaux et Quais et confirmer l’absence du bouton brochure et de l’onglet de décision d’effectif.
5. Éditer la brochure GOURY, rendre les trois pages et rechercher `SeaPilot` dans le texte extrait : aucune occurrence ne doit être trouvée.
6. Vérifier l’interface à 1440 px et 390 px sans débordement horizontal.

## Retour arrière

Le retour arrière applicatif consiste à redéployer le client précédent. Conserver les nouvelles colonnes et le bucket pendant cette phase évite toute perte de données. Le commutateur Planning reste `false` ; ne le réactiver qu’avec un workflow métier explicitement validé. Les lignes importées ne doivent pas être supprimées automatiquement lors d’un rollback.

## Export du tableau de flotte

Dans **Opérations → Navires**, ouvrir **Flotte** dans la barre d’actions.
La fenêtre s’ouvre avec toutes les cases décochées. Elle liste les navires actifs
accessibles au compte, indépendamment de la recherche et de la catégorie
affichée. Choisir au moins un navire et une langue. Les caractéristiques sont
facultatives. Le nom du navire figure toujours en première colonne.

Choisir le français, l’anglais ou les deux. Une seule langue télécharge
directement le PDF. L’export dans les deux langues télécharge un ZIP contenant
les deux PDF.

Chaque tableau utilise le logo et la charte BBTM sur une page A4 sans pied de
page. La mise en page s’adapte à la sélection. Si elle est trop dense pour
rester lisible sur une page, réduire le nombre de navires ou de caractéristiques.
Les valeurs libres telles que les noms de ports et les références techniques
sont reprises de la fiche navire.
Dans la version anglaise, les types « Navire de charge » et « Remorqueur fluvial »
sont traduits par « Cargo ship » et « River tug ».

La génération s’effectue dans le navigateur à partir du référentiel autorisé
pour le compte. Aucune migration ni configuration de déploiement n’est nécessaire.
