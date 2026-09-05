# KPI — proposition de refonte complète

Statut : maquette validée par l’utilisateur (« oui, validé ! »), implémentation v3.32.0. Aucune modification du schéma Supabase.

- Aperçu : https://p.superdesign.dev/draft/555f235c-974a-46b5-a862-feffb1d325ac
- Canvas : https://superdesign.dev/teams/72b387e8-4c5d-44bd-8ae5-97dbc2f1181c/projects/f9960330-f385-426d-9e3c-dedc8ae59b48?node=draft-variant-555f235c-974a-46b5-a862-feffb1d325ac
- Source de maquette : `.superdesign/tmp/kpi-workspace-proposal.html` ; version distante 2.
- Concept initial Image Gen : `C:/Users/chris/.codex/generated_images/01a0687a-575a-7e41-a39e-c7c323524d7d/exec-c320f122-9d6e-44ad-9a12-c59ab5210045.png` (composition uniquement ; mini-PDF et données illustratifs, remplacés dans la maquette HTML).

## Organisation

1. En-tête compact : Pilotage QHSE, actualisation, définitions.
2. Filtres multisélection communs : années, navires, projets. Afficher le périmètre et la fraîcheur réelle des données.
3. Bande de synthèse : TF/LTIFR, TG, TRIR, heures d’exposition ; situation à date des actions en retard et renouvellements RH clairement identifiée comme telle.
4. Analyse par onglets : Sécurité, Prévention, Environnement, RH. Sélecteur TF/TG/TRIR évitant de mélanger les unités sur un axe. Accès aux autres indicateurs existants dans ces vues.
5. Alertes liées aux modules existants, avertissement de qualité compact avec détails accessibles.
6. Atelier du rapport : 11 modèles existants dans une liste compacte, sélection de pages physiques, réglages du graphique actif à gauche ; aperçu PDF visible, zoom, navigation et plein écran à droite.
7. Export principal de la sélection (y compris une page), ZIP secondaire. Nombre réel de pages issu du PDF préparé et non du nombre de modèles.

## Garde-fous pour l’implémentation après accord

- Réutiliser les générateurs PDF, la méthodologie versionnée, le registre HSE et les requêtes Supabase existants. Pas de nombres de maquette dans le code métier.
- Si filtre projet et exposition non ventilée : taux indisponibles, ne jamais substituer les heures flotte. Recalculer les taux multiannuels sur les sommes des numérateurs et dénominateurs, ne pas moyenner des taux.
- Distinguer zéro enregistré, absence de données et exhaustivité non certifiée. Ne pas traiter un stock actuel d’actions comme un cumul annuel.
- Conserver le cumul journalier remis à zéro mensuellement, les valeurs de fin de mois, les 12 mois, les totaux annuels réels. XBEE vert ; réduction paramétrée existante, hypothèse explicite, pas de modification de méthode.
- Tendances et prévisions indépendantes par graphique ; désactiver avec raison lorsque non pertinentes ou données insuffisantes. Ne jamais extrapoler l’accidentologie comme engagement sécurité.
- Aperçu et export doivent partager strictement le même périmètre, les mêmes réglages et pages. Une modification invalide le document préparé ; recalcul puis export, pas d’export silencieux d’un aperçu périmé.
- Logos PDF et format A4 natifs inchangés ; ne pas reprendre les dimensions miniaturisées de la maquette comme dimensions d’impression. Pied de page : numéro uniquement. Aucun SeaPilot dans le PDF.
- Sur mobile : filtres repliables, zones de clic accessibles, bascule Sélection/Aperçu et export accessible ; ne pas rendre les contrôles minuscules pour gagner de la place.
- États à réaliser : chargement, erreur avec réessai, sélection vide, périmètre sans données, accès restreint, aperçu à actualiser, génération, succès et téléchargement.

## Vérification de la maquette

Logos publics exacts vérifiés dans le HTML sauvegardé et chargés dans le navigateur. Vue 1600 px sans débordement horizontal. Cartouche environnemental placé avant le numéro dans le papier A4. Bascule Tendance fuel testée sans activation de Prévision fuel. La maquette n’effectue aucun calcul Supabase ni export réel ; elle indique explicitement cette limite.

La génération distante Superdesign a échoué faute de crédits ; import HTML de conception effectué sans achat. Le workflow Superdesign impose la validation du design avant modification de l’application. Après accord : implémentation, tests pertinents, build, revue, commit/push/PR et vérification Vercel selon AGENTS.md.
