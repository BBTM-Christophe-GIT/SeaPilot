# Planning v3.6.16 — import historique BBTM

La version `3.6.16` prépare l'import réversible du planning du personnel BBTM
pour 2024, 2025 et 2026 jusqu'au 30 juin 2026 inclus.

## Contenu

- rapprochement des personnes et navires avec le catalogue SeaPilot ;
- normalisation des noms, statuts, commentaires et bordées ;
- deux bordées maximum par navire et bordée `Armement` à Cherbourg ;
- reprise de la fonction maritime depuis les corrections ou le profil RH ;
- intégration des périodes historiques dans les crew lists, attestations
  d'armement, exports Excel et calendriers ;
- scripts SQL transactionnels d'application et de retour arrière, limités à
  `source_label = 'bbtm-planning-xlsx-v1'`.

## Contrôles de mise en production

1. Exécuter les tests, le lint et le build de production.
2. Vérifier que Vercel sert `v3.6.16` et le build `2026-07-28.1539`.
3. Appliquer le script d'import préparé.
4. Contrôler le nombre de périodes, les dates extrêmes et la source du lot.
5. Générer une crew list, une attestation et un export depuis une sélection
   dont les profils RH et l'immatriculation du navire sont complets.

Le script de retour arrière supprime uniquement le lot BBTM identifié par son
`source_label`. Il doit rester disponible pendant la recette.
