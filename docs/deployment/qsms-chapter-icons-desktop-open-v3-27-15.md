# Procédures QSMS — icônes de chapitres et ouverture bureau v3.27.15

## Livraison

- Version : `3.27.15`
- Build : `2026-09-02.0017`
- Route : `/modules/procedures`
- Profils concernés : tous les profils autorisés au module ; ouverture des sources réservée à Administration et Direction par les droits existants.

## Changements

- pictogramme et couleur propres à chaque chapitre ISM, alignés sur le portail QSMS de référence ;
- groupe séparé « ISM - Chapitre non renseigné » pour les trois sources dont le chapitre est vide ;
- icônes distinctes pour « Documents non contrôlés » et le chapitre non renseigné ;
- ouverture des documents Word, Excel et PowerPoint dans l'application bureau installée, en lecture, via les schémas URI Microsoft Office ;
- suppression du passage par la visionneuse Office Online ;
- conservation du téléchargement par URL Supabase signée.

## Données

Aucune migration SQL n'est requise. Le contrôle de production confirme 21 sources explicitement classées « Documents non contrôlés » et 3 sources avec `ism_chapter` vide.

## Recette

1. Ouvrir `/modules/procedures` avec un profil Administration ou Direction.
2. Vérifier les pictogrammes des chapitres 01 à 12, puis ceux des groupes « Documents non contrôlés » et « ISM - Chapitre non renseigné ».
3. Cliquer sur le nom d'une source `.docx` et confirmer l'ouverture de Word bureau en lecture.
4. Contrôler de la même manière un document Excel ou PowerPoint lorsqu'un tel format est présent.
5. Vérifier que le bouton Télécharger fournit toujours une URL signée avec disposition de téléchargement.
6. Vérifier qu'un PDF publié conserve son ouverture directe et que les profils opérationnels ne voient aucune source modifiable.

## Retour arrière

Revenir au commit précédent de l'application. Aucun objet Storage ni enregistrement Supabase n'est modifié par cette livraison.
