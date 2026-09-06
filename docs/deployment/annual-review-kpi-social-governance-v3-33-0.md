# Entretien et KPI Social et Gouvernance — v3.33.0

## Livraison fonctionnelle

- **Entretien Professionnel et d’Evaluation** : début au quart d’heure, durée de 15 minutes à 8 heures, année calculée depuis la date de début.
- Objectifs N+1 multiples avec objectif, pourcentage d’atteinte et commentaire ; le texte enrichi existant devient **Commentaire général**.
- Suivi du pourcentage jusqu’à l’échéance par Administrateur, Direction, Armement et Capitaine. Marin conserve une lecture seule.
- Échéance RH initiale au 31 décembre de N+1, répercutée sur le document archivé et modifiable uniquement par Administrateur et Direction.
- KPI **Indicateur RSE — Social et Gouvernance** : radar anonyme de bien-être (échelle 1–4), propositions ESG issues des réponses management, sélection par thème et commentaire riche de la Direction dans le PDF.
- Nouveau type de rapport d’évènement **Discrimination et atteintes au droits Humains**. Les détails sont visibles uniquement par l’émetteur et Christophe MINASSIAN ; le KPI ne reçoit qu’un décompte agrégé.

## Sécurité et données

La migration `20260906050024_annual_review_kpi_social_governance_v3_33_0.sql` expose uniquement des RPC contrôlées pour les écritures sensibles. Les réglages bruts du KPI ne sont pas accessibles au client. Les réponses collaborateur n’alimentent le radar que lorsque le partage avec le manager a été explicitement accepté. Les propositions ESG proviennent exclusivement des réponses du management finalisées et ne sont publiées que si Administrateur ou Direction les sélectionne.

Les politiques et fonctions de signalement appliquent la confidentialité en base : un profil Administrateur, Direction ou Armement non émetteur et différent de Christophe MINASSIAN ne peut ni lire le rapport, ni ses fichiers, ni devenir responsable du traitement.

## Vérifications attendues avant production

- Tests unitaires et de composants Vitest.
- Build de production et lint ESLint.
- Tests pgTAP du workflow annuel, du workflow Action Plan et du KPI Social/Gouvernance.
- Rendu visuel des PDF Entretien et Social/Gouvernance.
- Conseiller/lint Supabase, migration distante, déploiement Vercel et contrôle de la version `3.33.0`.
