# SeaPilot v3.7.7 — DPR PDF à la demande

Date de livraison : 1er août 2026.

## Objet

Le module Daily Progress Report adopte la vue « liste + aperçu PDF » : indicateurs métier, filtres, sélection d'un
projet ou d'un navire en un clic, prévisualisation du document sélectionné et production unitaire ou groupée. Une
sélection multiple crée un fichier ZIP contenant exactement un PDF par DPR.

Le PDF affiché ou téléchargé est toujours généré depuis l'identifiant du DPR visible et sélectionné. La sélection
est limitée au résultat filtré ; un DPR devenu invisible est immédiatement retiré de la sélection. Cette règle
supprime la cause du défaut où un ancien identifiant masqué pouvait produire le mauvais document.

## Invariant de stockage

Les PDF DPR ne sont jamais déposés dans Supabase :

- le navigateur génère le Blob PDF à la demande pour l'aperçu ou le téléchargement ;
- le ZIP est assemblé en mémoire et téléchargé sans upload intermédiaire ;
- `dpr_files` ne conserve que les photos et pièces jointes ;
- le bucket `dpr-pdfs` est supprimé via l'API Storage avant la migration ;
- le trigger `dpr_reject_stored_pdf` rejette toute tentative future de métadonnée PDF ou d'usage du bucket retiré ;
- le chargeur historique ignore les PDF SharePoint et les marque comme exclus de la migration de fichiers.

## Ordre de déploiement

1. Inventorier le bucket distant avec `supabase storage ls ss:///dpr-pdfs --recursive --linked --experimental`.
2. Supprimer ses objets avec `supabase storage rm -r ss:///dpr-pdfs --linked --experimental`. Cette étape passe par l'API Storage
   afin d'éviter des objets orphelins.
3. Appliquer `supabase db push --linked`, qui exécute `20260801121733_dpr_on_demand_pdfs.sql` sans modifier
   directement les tables internes de Storage.
4. Vérifier l'absence du bucket, des métadonnées PDF et la présence du trigger avec les tests SQL
   `dpr_on_demand_pdf_test.sql`.
5. Déployer le client v3.7.7.

## Recette fonctionnelle

- filtrer sur un projet puis cocher son en-tête : tous ses DPR visibles sont sélectionnés ;
- vérifier que l'aperçu affiche le même numéro, la même date, le même navire et le même projet que la ligne active ;
- modifier le filtre et vérifier que les sélections masquées disparaissent ;
- télécharger un DPR et confirmer qu'un seul PDF est produit ;
- sélectionner plusieurs DPR et confirmer que le ZIP contient un fichier PDF distinct par DPR ;
- confirmer qu'aucun nouvel objet ou ligne `file_kind = 'pdf'` n'apparaît dans Supabase.

## Retour arrière

Le retour arrière applicatif peut redéployer la version précédente, mais il ne doit pas recréer `dpr-pdfs` ni
réactiver le stockage des PDF. Les PDF étant reproductibles depuis les données structurées, aucune sauvegarde des
objets supprimés n'est nécessaire. Toute restauration de l'ancien modèle de persistance exige une décision
d'architecture explicite et une nouvelle migration ; elle ne fait pas partie du rollback opérationnel.
