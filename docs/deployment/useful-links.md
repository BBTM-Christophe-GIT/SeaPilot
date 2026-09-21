# Liens utiles — v3.48.0

Le module `/modules/usefulLinks` est accessible depuis le menu principal, près de l’accueil.
Administration → Navigation contient une ligne « Liens utiles » pour chacun des cinq profils.
La migration active initialement le module pour tous les profils ; l’administrateur peut retirer cet accès.
La matrice contrôle aussi les lectures et écritures en base, y compris par API directe.

Le répertoire est partagé par société. Administration et Direction peuvent ajouter, modifier et supprimer
des liens, créer ou renommer des catégories et déplacer les liens entre catégories. Les autres profils
consultent les liens. La suppression d’une catégorie conserve ses liens dans « Sans catégorie ».
La recherche porte sur les titres et catégories, sans distinction d’accents. Les liens s’ouvrent dans
un nouvel onglet avec `noopener noreferrer`. Les URL complètes figurent uniquement dans le formulaire.

## Données initiales et icônes

La migration charge les 15 liens demandés pour la société BBTM, dans cinq catégories modifiables.
Les liens SupplHi, Veracity, DNV et Docusign utilisent une page d’entrée stable, sans état OAuth,
nonce ni challenge PKCE expirables. Le portail maritime DNV est ouvert depuis My Services, conformément
à [la documentation DNV](https://maritime.dnv.com/DocumentApprovalHelp/MyDNVGL.html).
Les deux invitations Teams conservent leurs adresses et sont nommées « Teams · Réunion 1 » et
« Teams · Réunion 2 » en attendant les titres choisis par l’utilisateur.

Les favicons déclarées par les portails sont utilisées en priorité, puis `/favicon.ico` pour les nouveaux sites.
Le service Google S2 sert de secours ; seul le nom d’hôte lui est transmis, jamais les chemins,
paramètres ni identifiants de réunion. Les requêtes d’icônes n’envoient pas de référent.
Des initiales remplacent l’image si elle ne peut pas être chargée. Les sites protégés peuvent exposer
une icône générique au service. La préversion publique utilise des URL publiques de démonstration,
sans invitations Teams ni identifiant de navire, et ne permet pas d’enregistrer.

## Livraison et validation

Appliquer `supabase/migrations/20260921194845_useful_links.sql` avant le client.
Exécuter `supabase/tests/useful_links_access_test.sql` dans une transaction annulée : identités
authentifiées distinctes Administration, Direction, Armement, Capitaine et Marin ; lectures, écritures,
révocation, société, appartenance inactive et accès anonyme. Ne pas utiliser le simulateur de profil.

Le manuel intégré comprend une notice Liens utiles pour les profils autorisés.
Tests client : `pnpm test src/features/usefulLinks src/features/manual src/features/permissions src/features/shell/AppShell.test.tsx src/features/admin/AdminPage.test.tsx src/App.test.tsx`.
Vérification : `pnpm lint`, `pnpm build`, puis recherche, édition et affichage mobile dans un navigateur.
En cas de retour au client précédent, conserver les tables et désactiver les permissions du module ;
ne pas supprimer les liens saisis par les utilisateurs.
