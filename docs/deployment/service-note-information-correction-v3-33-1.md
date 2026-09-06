# Correction temporaire des notes de service — v3.33.1

## Livraison

- Ajout du bouton temporaire `Modifier` aux notes diffusées, archivées et rappelées pour les profils `Administrateur` et `Direction`.
- Écran de correction dédié pour la date, l'objet, le nom d'émetteur affiché et le contenu enrichi.
- Aperçu en direct du document commun avec les signatures déjà enregistrées.
- Périmètre, destinataires, signatures, pièces jointes, chrono, statut et données de diffusion non modifiables.

## Sécurité et données

La migration `20260906063608_service_note_information_correction.sql` ajoute le RPC protégé `update_service_note_information`. Son `UPDATE` énumère uniquement les champs d'information autorisés et contrôle explicitement l'appartenance à la société ainsi que le rôle `admin` ou `direction`. L'accès `anon` est révoqué et les politiques RLS existantes continuent d'interdire la modification directe d'une note déjà diffusée.

## Vérifications

- 12 tests Vitest du module Notes de Service.
- 19 assertions pgTAP sur l'autorisation et l'invariance du workflow.
- Build de production TypeScript/Vite.
- Parcours Playwright desktop 1280 × 720 et mobile 390 × 844 : ouverture, modification, aperçu, enregistrement et retour sur la note diffusée avec le même chrono et le même registre de signatures.

Version applicative : `3.33.1` — build `2026-09-06.002`.
