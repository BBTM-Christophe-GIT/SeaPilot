# Accueil personnalisé par profil (v3.20.0)

La version `3.20.0` remplace l’accueil générique de SeaPilot par un cockpit métier adapté au profil connecté.

## Profils couverts

- **Administrateur** : comptes, droits, référentiels et contrôles transverses.
- **Direction** : indicateurs, projets, arbitrages QHSE et demandes d’achat.
- **Armement** : planning des équipages, brevets et temps de travail.
- **Capitaine** : DPR, situation du bord, certificats et relève.
- **Marin** : planning personnel, heures, documents et embarquement.

Le rôle prioritaire suit l’ordre `admin`, `direction`, `armement`, `capitaine`, `marin`. La simulation de profil disponible pour les administrateurs actualise également le contenu de l’accueil.

## Expérience utilisateur

Chaque vue conserve le même squelette afin de limiter la charge d’apprentissage :

1. salutation et deux actions principales ;
2. trois accès prioritaires pour la journée ;
3. contexte métier et parcours opérationnel ;
4. quatre raccourcis vers les modules utiles ;
5. deux repères ou communications adaptés au profil.

Les cartes sont de vrais liens vers les modules SeaPilot. En préversion, les profils navigants utilisent le navire de démonstration ; aucune donnée fictive nominative n’est affichée en production.

## Responsive et accessibilité

- grille en deux colonnes sur grand écran et une colonne sur tablette ;
- actions et raccourcis empilés sur mobile ;
- libellés natifs, focus clavier visible et icônes décoratives masquées aux lecteurs d’écran ;
- animations désactivées lorsque `prefers-reduced-motion` est actif.
