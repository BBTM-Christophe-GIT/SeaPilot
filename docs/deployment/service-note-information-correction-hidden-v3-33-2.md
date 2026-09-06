# Notes de service — masquage de la correction temporaire (v3.33.2)

## Changement livré

- masque le bouton temporaire `Modifier` sur les notes diffusées, archivées et rappelées pour tous les profils ;
- conserve le bouton `Modifier` historique des brouillons pour les profils `Administrateur` et `Direction` ;
- ne modifie aucun statut, aucune transition de workflow et aucune donnée existante ;
- conserve en arrière-plan le RPC protégé `update_service_note_information` pour une éventuelle réactivation ultérieure.

## Validation attendue

- une note diffusée ne présente plus le bouton `Modifier` ;
- les actions existantes `Télécharger` et, pour la dernière note diffusée, `Rappeler` restent disponibles ;
- un brouillon conserve son bouton `Modifier`, son enregistrement et sa diffusion habituels ;
- la version affichée par l'application est `3.33.2`.
