# Icône du navire ILE DE FRANCE

L’illustration fournie est associée au navire actif BBTM `ILE DE FRANCE`
(`IDF`, société 1, navire 349). Elle utilise les champs `illustration_*`
du référentiel partagé de la flotte.

La vignette `ile-de-france-8760583e4fff7d54.webp` mesure 228 × 171 pixels
et pèse 3 956 octets. Le catalogue contient désormais dix vignettes,
pour 43 884 octets au total, sous le budget de 120 Ko.

Le PNG original reste dans le bucket privé `fleet-media`, au chemin
`1/349/bbtm-ile-de-france-71c5a41a0052ca54.png`. Son empreinte SHA-256 est
`71c5a41a0052ca54cc2607983da1d42da3f86890f82aaa7b92cb5b0eaf2245a9`.
La photo principale existante et ses références `photo_*` sont conservées.

Le catalogue partagé et les RPC existants diffusent cette icône dans les
sélecteurs Levage, Produits Chimiques, Exercices, Plan d’Action, Audits
documentaires et internes, ainsi que dans l’organigramme et ses exports.
Aucune règle d’accès ni structure de base de données ne change.

## Préparation et import ciblés

Les scripts acceptent `--only <slug>` pour traiter une seule illustration,
sans relire les autres PNG originaux ni modifier leurs vignettes.
Sans ce paramètre, ils conservent leur fonctionnement sur tout le catalogue.

```powershell
python scripts/prepare-bbtm-fleet-thumbnails.py --source-dir '<dossier des PNG>' --only ile-de-france
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>' --only ile-de-france
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>' --only ile-de-france --backup-file '<nouvelle sauvegarde JSON hors dépôt>' --apply
```

L’import utilise les variables de processus `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY`, sans les écrire dans Git. Il vérifie le nom,
l’acronyme, la société, les empreintes et le contenu privé sauvegardé.
Publier la vignette sur Vercel avant de mettre à jour sa référence en base.
