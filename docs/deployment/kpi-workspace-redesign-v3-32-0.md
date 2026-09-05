# Pilotage QHSE — v3.32.0

## Périmètre

Implémentation de la maquette Superdesign v2 validée par l’utilisateur : [proposition](https://p.superdesign.dev/draft/555f235c-974a-46b5-a862-feffb1d325ac). La refonte concerne `/modules/kpi`, pas le menu général, le schéma Supabase, les droits ni les générateurs PDF.

- Filtres années/navires/projets multisélection communs à la synthèse et aux rapports, avec date d’arrêté et heure de lecture.
- Synthèse de direction : TF/LTIFR, TG, TRIR, exposition, actions actuellement en retard et titres RH à renouveler pendant le mois courant.
- Analyse Sécurité / Prévention / Environnement / RH, changement d’indicateur et comparaison des années sélectionnées. Définitions et limites accessibles sans quitter le module.
- Atelier de 11 modèles : sélectionner les rapports, puis les pages physiques exactes ; une seule page est possible. Trois rapports initiaux : santé/sécurité 1, consommations et plan de formation.
- Tendances et prévisions indépendantes pour chaque graphique. Leur disponibilité est déterminée par le générateur existant, avec explication lorsqu’il ne dispose pas de données suffisantes. Les échéances RH connues et l’accidentologie ne sont pas extrapolées.
- Aperçu PDF.js A4 local, navigation, zoom, agrandissement et ouverture du document natif. Le Blob affiché est exactement celui téléchargé, sans régénération cachée au clic Exporter.
- Une modification de périmètre, de rapports ou d’options invalide immédiatement l’aperçu et l’export. Les réponses tardives ne remplacent jamais le périmètre actif. Les pages exclues restent exclues lors d’un réglage graphique ; un changement de périmètre réinitialise la sélection physique.
- ZIP secondaire explicitement destiné aux rapports cochés **complets**, séparés en fichiers. Sur mobile : bascule Sélection / Aperçu.

## Données et limites

Les taux multiannuels sont recalculés sur les sommes des événements et des heures, jamais sur une moyenne des taux. Les références entreprise 2023–2025 ne sont pas arbitrairement distribuées sur les projets ou navires. Les mois sans ventilation restent absents des graphiques. Un zéro enregistré ne vaut pas certification d’exhaustivité.

Contrôle Supabase en lecture seule le 05/09/2026 : 20 387 h d’exposition sur 2026, aucune ligne d’exposition affectée à un projet, 14 actions ouvertes en retard ; DPR : 309,197 m³ de fuel consommé et 806,654 m³ d’eau avitaillée. Ces nombres sont des constats d’audit, **pas des constantes du code**. Les données évoluent pendant la journée.

Les alertes sont un stock à la date d’édition. La population RH filtrée navire/projet est identifiée par les personnes du registre d’exposition accessible ; une absence de ventilation donne « — ». Les lectures et exports restent limités par le client Supabase et les RLS du profil réel. Aucune vue simulée Marin/Capitaine n’a servi de preuve d’autorisation.

## Technique

Ajout de `pdfjs-dist@6.3.289`. Le contrôle de sécurité préalable a écarté la branche 5.6 affectée par [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j). Le minimum Node déclaré devient 22.13, cohérent avec la CI Node 22 et Vercel Node 24 existants. Le moteur et son worker sont servis par l’application, chargés pour l’aperçu ; aucun PDF n’est envoyé à un service tiers. Aucune couche de scripting PDF n’est instanciée. Les tâches de rendu, documents et URL Blob sont libérés à la sortie/changement.

Le dossier local de dépendances provenait de pnpm 11 ; il a été réinstallé avec **pnpm 10.34.5**, verrouillage figé, sans changement de configuration globale ni autorisation de nouveaux scripts de dépendances. `pnpm-lock.yaml` contient uniquement la nouvelle dépendance et ses transitives.

## Vérification visuelle et fidélité

Méthode : IAB pour le parcours réel ; Playwright CLI en complément pour enregistrer les captures et récupérer les téléchargements. Les captures de la maquette et de l’implémentation ont été inspectées avec `view_image` à 1600 × 1200 ; contrôle mobile à 390 × 844 et dans le viewport IAB courant. PDF exporté contrôlé avec pypdf et rendu Poppler.

| Point comparé | Référence et résultat |
| --- | --- |
| Texte et hiérarchie | Pilotage QHSE, phrase d’introduction, Actualiser, Définitions, filtres, synthèse, analyse puis Composer le rapport conservés. Diff de texte visible : détails de couverture et date réelle explicités ; FAR ajouté au sélecteur existant ; Exporter précise « en PDF ». |
| Composition | Bande de six indicateurs ; analyse et priorités côte à côte ; atelier unique avec rail de 330 px et papier A4. Première version trop haute corrigée : graphique compact, barre d’aperçu réunie sur desktop, export replacé en tête. |
| Typographie | Titre 25 px, indicateurs 27–28 px, contrôles 10–12 px, familles et aides secondaires 9–10 px. Pas de tailles navigateur par défaut. Capitalisation des rapports harmonisée. |
| Palette et composants | Fond froid, panneaux blancs, bordures bleu-gris fines, rayons 6–8 px, bleu d’action #0c5598, avertissements ambre. Pas de nouvelle décoration ou de dégradé. |
| Logos et papier | Assets BBTM et moteur PDF inchangés. Le logo reste dans son emplacement natif de 20 mm ; seul le document entier est mis à l’échelle à l’écran. Aucun SeaPilot dans le PDF, pieds « 1 », « 2 », « 3 » sur l’export de test. |
| Aperçu | L’iframe native restait vide dans IAB : remplacée par le rendu des octets PDF avec PDF.js. Papier portrait effectivement rendu, pas une image de maquette. |
| Mobile et contrôles | Bascule entre réglages et aperçu, export accessible, filtres multisélection lisibles ; absence de débordement horizontal vérifiée. |

Écarts intentionnels : shell réel intégral conservé (la maquette simplifiait certains modules), données de démonstration explicitement identifiées en local, avertissements réels, synthèse annuelle et mentions méthodologiques du PDF existant maintenues. Les réglages indisponibles restent visibles et expliqués. Le texte du PDF n’est pas remplacé par celui du mini-document illustratif de la maquette.

Parcours vérifiés : chargement, filtres et invalidation immédiate, sélection vide, une page, navigation d’aperçu, agrandissement, export des octets consultés, indépendance tendance/prévision, limites des données, retour mobile Sélection/Aperçu. Les tests de calcul couvrent taux pondérés, trous historiques, exposition projet manquante et stock d’actions antérieur à l’année filtrée.

Captures locales de vérification (non versionnées) : `output/playwright/kpi-workspace-approved.png`, `kpi-workspace-implementation.png`, `kpi-workspace-mobile.png`, `kpi-workspace-pdf-page.png`. L’export de test contient trois pages A4 595,28 × 841,89 pt, numérotées 1 à 3, sans le mot SeaPilot.

## Livraison

Suite complète : **1 015 tests réussis, 141 fichiers**, avec deux workers. Contrôle final après mise à jour du lecteur : **46 tests KPI réussis, 7 fichiers**, build de production et lint ciblé réussis ; audit des dépendances de production sans vulnérabilité connue. Un premier démarrage à quatre workers avait dépassé le délai de démarrage des workers sur le poste ; aucune modification des délais du projet. Les attentes asynchrones des seuls tests du composeur tolèrent cinq secondes pour sa préparation différée.

Branche de livraison : `codex/kpi-workspace-redesign`. Cible : [module KPI en production](https://sea-pilot-ten.vercel.app/modules/kpi). Les références de commit, les résultats CI et les déploiements correspondants sont rattachés à la pull request de cette branche. Aucun changement de base de données ni de politique d’accès n’est nécessaire.
