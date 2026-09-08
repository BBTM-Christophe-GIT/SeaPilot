# Procédures QSMS — remplacement et publication contrôlée

La migration `20260908044216_procedure_publishing_workflow.sql` introduit le statut `published`, retire `approval_status` des deux tables QSMS, normalise les publications PDF historiques et interdit les doublons `Thème + Numéro`.

Les doublons hérités de SharePoint sont traités avant la création de l'index unique. Le plus ancien identifiant de chaque groupe est conservé ; les suivants reçoivent le premier suffixe pointé disponible (`01.1`, `01.2`, etc.). Les instantanés PDF historiques ne sont pas renommés.

Les politiques RLS garantissent que Capitaine et Marin ne voient que les lignes `published` liées à un objet privé `procedure-documents/published/*.pdf` déclaré avec le MIME `application/pdf`. La politique `storage.objects` impose le même lien et empêche l'accès à une source modifiable ou à un PDF non référencé.

Le remplacement d'une source existante utilise le même chemin Storage avec `upsert: true`. Les politiques existantes `SELECT`, `INSERT` et `UPDATE` du bucket autorisent ce flux aux seuls profils Administration et Direction. Supabase n'étant pas un serveur WebDAV/WOPI, l'enregistrement direct depuis Word au moyen de Ctrl+S reste hors périmètre ; le fichier local modifié est sélectionné une fois dans la fiche SeaPilot, sans suppression préalable.

Contrôles avant livraison :

```powershell
corepack pnpm test src/features/procedures/ProceduresPage.test.tsx src/features/procedures/procedureQueries.test.ts src/features/sharepoint/sharePointImport.test.ts src/App.test.tsx
corepack pnpm lint
corepack pnpm build
corepack pnpm exec supabase test db --local supabase/tests/qsms_procedure_publishing_test.sql
```
