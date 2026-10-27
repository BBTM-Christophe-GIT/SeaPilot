# Numéros et icônes des points isolés

Version 3.80.4 — 27 octobre 2026.

Les cartes affichent le champ « Numéro » des points isolés, par exemple B04.
Le texte complet reste dans le titre et le nom accessible ; le libellé visuel
est limité à 18 caractères. Un numéro vide conserve le repère historique P1,
P2… selon sa position d’origine dans la liste, y compris après un point sans
coordonnées valides. Les menus de déplacement/suppression identifient aussi le
numéro saisi. La description et les coordonnées restent modifiables. La
description reste dans la fiche et l’infobulle ; le libellé de la carte utilise
uniquement le numéro.

Six symboles sont proposés dans le même vert que les points isolés : bouée,
repère de position, plate-forme offshore, parc éolien, corps-mort et ancre.
Le choix « Simple » conserve le carré d’origine et supprime réellement la clé
de métadonnée. Le catalogue SVG 24 × 24 est également utilisé pour le PDF,
avec des tracés vectoriels sans téléchargement ni image matricielle.

Le champ optionnel `isolatedPointIcon` accepte uniquement `buoy`, `pin`,
`platform`, `wind-farm`, `mooring` ou `anchor`, dans les points isolés. Il est
rejeté sur les waypoints de route, les zones et leurs sommets. L’absence de ce
champ reste une absence ; aucune valeur par défaut n’est ajoutée aux anciennes
fiches. La copie Projet → Opération en Mer et les exports conservent le choix.
Les droits, calculs de navigation, dessins des zones et waypoints sont inchangés.

Migration : `20261027200543_project_isolated_point_icons.sql`. Elle étend
uniquement la validation JSON privée, sans modification de lignes métier,
RPC d’accès ou règles RLS. L’appliquer avant le frontend et recharger SeaPilot
pour utiliser le nouvel éditeur. Vérification distante : six valeurs retenues,
objet historique inchangé et aucun nouvel avis de sécurité.

Un retour arrière du frontend peut conserver cette extension SQL. Ne pas
rétablir l’ancien validateur d’overlay après l’enregistrement de points avec
icônes : ces clés seraient alors rejetées.

Validation : tests du catalogue, saisie/clavier/lecture seule, sauvegarde et
réouverture, JSON/SQL, import indépendant, rendu SVG/PDF, absence d’images dans
l’annexe, conservation des zones et routes, build de production et contrôles
visuels ordinateur/mobile.
