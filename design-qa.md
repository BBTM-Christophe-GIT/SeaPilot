# Design QA — Planning SeaPilot 1.2.0

- Source visuelle : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-f177a116-cec1-4428-a082-e9b9f4d843a7.png`
- Implémentation contrôlée : `https://sea-pilot-ten.vercel.app/modules/planning`
- Capture d'implémentation : `C:\Users\chris\.codex\visualizations\2026\07\12\019f5779-262c-7352-a5b5-4eb4dad56818\planning-production-2048x1073.png`
- Comparaison côte à côte : `C:\Users\chris\.codex\visualizations\2026\07\12\019f5779-262c-7352-a5b5-4eb4dad56818\planning-comparison.png`
- État contrôlé : production authentifiée, vue mensuelle, juillet 2026, version 1.2.0.
- Viewport de comparaison : capture physique 2048 × 1073 (viewport CSS 2560 × 1341 sur un affichage Windows à 125 %).

## Comparaison pleine page

La référence SPFx et SeaPilot ont été placés dans la même image de comparaison. Le cockpit SeaPilot conserve la densité et la structure de la source : barre de période et de filtres, grille temporelle mensuelle, jours et week-ends différenciés, zone hiérarchique navire/bordée/marin, panneau latéral à quatre onglets et actions compactes. Le shell SeaPilot reste volontairement visible pour préserver la navigation globale du produit.

## Comparaisons ciblées

- Barre d'outils : les trois vues, les filtres, le zoom, la navigation temporelle, les actions d'édition, la duplication, le plein écran et le menu secondaire sont alignés sur la hiérarchie visuelle de la référence.
- Grille : les mois, semaines, jours, week-ends et date courante sont lisibles et alignés ; le défilement horizontal reste disponible pour les périodes denses.
- Panneau latéral : les onglets Certificats, Marins non affectés, Facturation et Alertes reprennent la structure et les badges de la source.
- États vides : l'absence actuelle de navires, projets et affectations dans les tables SeaPilot est affichée proprement sans casser le cadrage. Les alertes RH et les marins non affectés utilisent les données présentes.

## Interactions vérifiées en production

- Semaine, Mois et An : changement de période confirmé.
- Filtre marin : sélection de `Arthur MAREST`, puis retour à `Tous les marins`.
- Onglets : Certificats, Marins non affectés, Facturation et Alertes.
- Réglages : ouverture et fermeture du panneau.
- Plein écran : entrée et sortie natives confirmées.
- Nouvelle affectation : ouverture du formulaire, présence des champs et fermeture sans écriture.
- Console : aucune erreur ni alerte navigateur.
- Version affichée : `v1.2.0`.

## Constats

- Aucun écart P0, P1 ou P2 relevé sur le rendu et les interactions du module.
- [P3] Les tables de planning de production ne contiennent pas encore les navires, projets et affectations historiques SharePoint. Ce manque de données n'altère pas le module ; il est documenté dans `docs/migration/planning-spfx-inventory.md` pour la phase d'import.

## Historique de comparaison

- Itération 0 : rendu local bloqué par les droits Supabase.
- Itération 1 : déploiement Vercel authentifié, comparaison complète et contrôles fonctionnels effectués ; aucun correctif visuel bloquant requis.

final result: passed
