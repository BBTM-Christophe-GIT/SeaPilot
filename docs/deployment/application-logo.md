# Logo de l’application

Administration → Logo de l’application (`/modules/admin?section=branding`) permet aux administrateurs BBTM actifs de remplacer le logo global. Choisir une image affiche un aperçu local ; seul Enregistrer le logo publie le changement. Rétablir le logo par défaut remet le logo SeaPilot orange livré avec l’application.

Formats acceptés : PNG, JPEG ou WebP, entre 1 octet et 2 Mo, au plus 4 096 pixels par côté et 8 millions de pixels au total. Un format horizontal est recommandé. Le client vérifie la signature du fichier et le décodage avant le transfert. Les SVG et les URL externes ne sont pas acceptés.

Le même logo est utilisé dans le shell, à la connexion et sur les pages de mot de passe. Le client charge sa configuration au démarrage et au retour sur la fenêtre ; une image inaccessible revient au logo fourni. Les logos personnalisés utilisent les mêmes dimensions et le même cadrage que le logo fourni : 144 pixels dans le menu, jusqu’à 280 pixels sur les écrans de connexion et de mot de passe, et 44 × 44 pixels dans le menu réduit. Les proportions sont conservées et le cadre masque les marges, comme pour le logo par défaut.

## Stockage et droits

La migration `20261014072533_application_branding_logo.sql` crée une configuration globale dans le schéma non exposé `application_branding_private`, avec BBTM comme société propriétaire immuable. La lecture anonyme `get_application_branding()` ne retourne que le chemin du logo, la révision, la capacité de modification et la date. Aucun identifiant de société ou d’auteur n’est public.

Le bucket public `application-branding` rend le logo accessible avant connexion. Il contient uniquement des images de marque destinées à être publiques. Ses écritures passent par les règles Storage et `save_application_logo(p_logo_path, p_expected_revision)` ; elles vérifient la société, le rôle admin actif, le propriétaire du fichier, son chemin, sa taille, son MIME et la révision attendue. Direction, Armement, Marin, Capitaine, administrateur d’une autre société, compte inactif et visiteur ne peuvent pas publier ni restaurer le logo.

Chaque transfert utilise un chemin unique `logos/<utilisateur>/<uuid>.<png|jpg|webp>` sans écrasement. Une révision périmée impose une actualisation. Le logo courant est protégé contre la suppression ; après un échec de publication, le client tente de nettoyer uniquement son nouveau transfert. Les anciennes images publiées sont conservées. Aucun fichier du bucket ne doit contenir de document privé.

Les règles restrictives empêchent une ancienne politique permissive d’élargir les droits de ce bucket. La migration `20261014072812_application_branding_logo_lock_order.sql` ordonne les verrous objet puis configuration pour éviter un blocage entre publication et nettoyage.

Les remarques du conseiller Supabase sur la table privée sans politique et sur la lecture publique `SECURITY DEFINER` sont intentionnelles : la table ne possède aucun privilège direct client, et la projection publique est contrôlée par les assertions de la fixture. Le schéma privé n’est pas exposé à PostgREST.

## Vérification et déploiement

Appliquer les migrations avant le client. La configuration initiale conserve le logo fourni, sans publication de fichier. Aucune nouvelle variable d’environnement ni dépendance n’est nécessaire. Un retour au client précédent ne nécessite aucune suppression de données.

`supabase/tests/application_branding_logo_test.sql` vérifie les véritables rôles JWT, les refus intersociétés, la projection publique, les limites des fichiers, la concurrence par révision et la protection de l’image courante. La transaction utilise uniquement des comptes et métadonnées synthétiques et se termine par un rollback.

Les tests frontend couvrent validation, aperçu, erreurs, changement de révision, enregistrement, restauration et repli du logo partagé. En préversion, le formulaire fonctionne avec des URL locales temporaires et sans appel à Storage ou aux RPC de publication. Ce mode sert à vérifier le rendu ; les droits sont vérifiés séparément par les fixtures SQL.


Validation de livraison : 106 tests frontend ciblés réussis, ESLint ciblé propre, fixture SQL réelle réussie et endpoint HTTP anonyme vérifié. Recette locale du choix de fichier, de l’enregistrement et de la restauration à 1 440 × 1 000 et 390 × 844 ; formulaire également contrôlé à 320 × 844.
