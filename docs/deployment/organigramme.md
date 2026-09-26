# Organigramme RH

Version 3.57.0. Le module `Ressources Humaines → Organigramme`, à côté de RH / Brevets,
est réservé aux profils Administrateur et Direction, y compris par URL directe.
Appliquer `20260926060139_organigramme.sql`,
`20260926122325_organigramme_categories_links.sql` puis
`20260926125755_organigramme_personnel_contacts.sql` avant de déployer le client.

## Données et actualisation

La RPC `organigramme_snapshot` renvoie les noms, fonctions, emails, téléphones,
navires, bordées et responsabilités de la société active. Elle utilise les droits de
l'appelant (SECURITY INVOKER), vérifie le profil, l'appartenance à la société et
la permission du module. Les coordonnées proviennent de `people.email` et
`people.phone` ; les contacts d'urgence familiaux et les autres données privées
du dossier RH ne sont pas renvoyés. Aucune copie de dossier RH n'est créée.

À la date choisie, les journées du Planning ont priorité sur les affectations,
puis les périodes importées, puis les bordées permanentes. La priorité s'applique
par personne, pour éviter de conserver un ancien rattachement après une mutation.
Les affectations annulées, les personnes sorties et les navires sortis sont exclus.
Les affectations provisoires restent incluses : il s'agit d'une structure d'équipe,
pas d'une crew list attestant des embarquements. Repos et congés ne retirent pas
une personne de son équipe. Les rattachements simultanés sont conservés ; la vue
par fonction regroupe leurs indications sur une seule carte par marin et fonction.
Les bordées permanentes ne sont pas historisées : elles servent de complément à la
date choisie, sans prétendre reconstituer un organigramme historique certifié.

Actualisation à l'ouverture, toutes les 60 secondes lorsque la page est visible,
au retour sur la fenêtre et via Actualiser. Les exports sont désactivés pendant le
chargement et en cas d'erreur. Aucun repli silencieux vers des données fictives en production.

## Structure complémentaire et référence

Référence conservée : **87-Organigramme.docx**, pied de page **REP 03-B**.
L'original fourni reste hors des assets publics. Les noms et adresses du document
ne sont pas copiés dans la préversion publique, qui utilise des données fictives.

À la demande de l'utilisateur, la migration initialise IN EXTENSO, Marine Assistance
et RICHEMONT AVOCATS avec leurs missions du document, pour BBTM uniquement.
Les responsabilités Direction, Administration, Yard et maintenance sont liées aux
fiches RH quand la correspondance prénom/nom est unique et active. Les noms suivent
ensuite les fiches RH et les personnes sorties disparaissent du diagramme.
La rubrique Modifier la structure permet d'ajouter, modifier, ordonner et supprimer
les responsabilités. Les noms et missions libres restent à maintenir manuellement.
Ces entrées décrivent des responsabilités ; elles n'inventent pas de liens hiérarchiques.

## Catégories et liens personnalisés

Dans Modifier la structure, les quatre grandes catégories (Direction & Administration,
Intervenants externes, Équipages par fonction, Sans affectation) peuvent être renommées.
Les noms des navires restent gérés dans le module Flotte. Les libellés personnalisés
s'appliquent aux filtres, aux sélecteurs, au diagramme et aux exports.

Chaque catégorie peut porter plusieurs liens, avec un libellé facultatif, vers une
autre catégorie (y compris un navire), un groupe (bordée ou fonction) ou une personne
(fiche RH ou intervenant libre). Les liens peuvent être modifiés ou supprimés ; les
doublons et les liens d'une catégorie vers elle-même sont refusés. Le diagramme
regroupe ces relations dans des branches en pointillés sous les équipes ; le PDF
reprend les mêmes branches sur la page unique.

Les personnes sont référencées par identifiant, les bordées par navire et nom de bordée,
et les fonctions par libellé normalisé. Renommer une catégorie ou muter une personne
ne rompt pas le lien. Renommer une bordée ou une fonction demande de modifier sa cible.
Une cible sortie des effectifs ou absente de la vue/des filtres n'est pas exportée :
un compteur signale les liens non affichés, qui restent enregistrés. L'option sans
navires retire aussi leurs mentions dans les relations et masque les liens ciblant
directement une catégorie navire. Les libellés libres saisis par l'utilisateur sont conservés.

Les tables `organigramme_categories` et `organigramme_links` sont protégées par RLS
et les mêmes restrictions Admin/Direction que les responsabilités. Les RPC d'écriture
utilisent SECURITY INVOKER ; les cibles RH, intervenants et navires sont vérifiées
dans la société active, même pour une écriture directe via PostgREST. La configuration
est courante et partagée par société, pas historisée à la date du Planning.

## Exports

- PDF vectoriel sur **une seule page paysage**, contenant toutes les catégories,
  tous les navires, les bordées, les personnes et les liens de la sélection.
  Logo BBTM, date, présentation et référence REP 03-B / fichier d'origine conservés.
  Le format commence à A3 et s'agrandit automatiquement selon le contenu pour garder
  les noms lisibles. Les dimensions extrêmes sont plafonnées sous la limite PDF de
  14 400 points, puis le diagramme est réduit uniformément sans couper de carte ni
  créer de page supplémentaire. À l'impression, choisir Ajuster à la feuille pour
  utiliser un format de papier plus petit.
- PNG haute résolution ou SVG vectoriel : uniquement le diagramme, sans en-tête
  ni pied de page. L'option Afficher les navires retire aussi leurs mentions dans
  la vue par fonction. Le PNG limite sa résolution pour respecter la mémoire du
  navigateur ; le SVG garde la précision intégrale.
- Les filtres (navire, direction, externes, non-affectés) s'appliquent à l'aperçu
  comme aux exports. Les navires sont classés du plus long au plus court et affichés
  côte à côte sur une seule rangée, avec leurs bordées en dessous. Les autres
  catégories sont centrées au-dessus et au-dessous de la flotte.

## Liste du personnel et numéros d'urgence

Deux vues supplémentaires préparent des listes nominatives avec fonction, nom,
email et téléphone. Le personnel est regroupé selon le classement habituel des
fonctions (Capitaine en premier), puis par ordre alphabétique. Les personnes
doivent être dans les effectifs à la date de situation ; les responsabilités
libres des intervenants externes ne sont pas des fiches du personnel.

La liste du personnel sélectionne initialement tous les effectifs. La liste des
numéros d'urgence sélectionne initialement les sédentaires. Chaque liste dispose
d'une sélection indépendante, par fonction entière ou par personne. La recherche
filtre uniquement l'affichage, sans modifier le contenu sélectionné pour le PDF.
Une sélection vide désactive l'export. Les téléphones manquants sont signalés.
Les coordonnées se modifient dans RH / Brevets.

Les sélections sont conservées entre les vues et pendant les actualisations tant
que le module reste ouvert. Elles ne sont pas enregistrées après rechargement ou
fermeture de la page. Une personne absente du nouvel instantané n'est plus exportée.
Rétablir les sédentaires réactive la sélection par défaut des urgences.

Chaque liste s'exporte en PDF A4 portrait, avec logo BBTM, date, en-têtes répétés
et pagination si nécessaire pour garder les coordonnées lisibles. L'export des
deux listes commence toujours les numéros d'urgence sur une nouvelle page.
La liste d'urgence utilise un thème rouge bordeaux, des lignes rose pâle et les
téléphones en gras, à l'écran comme dans le PDF. Le logo BBTM est incorporé depuis
son image d'origine, sans recoloration. La liste du personnel garde le thème bleu.
La contrainte d'une seule page paysage concerne le diagramme, pas ces tableaux.
Les mêmes droits Administrateur/Direction s'appliquent à ces coordonnées et exports.

## Validation et retour arrière

Tests Vitest du modèle, du diagramme, des profils, des sélections et des PDF ; test SQL transactionnel
`supabase/tests/organigramme_access_test.sql` sur de vrais rôles authentifiés,
terminé par ROLLBACK. Contrôler aussi les PDF et PNG générés dans un navigateur.
Pour masquer le module, désactiver ses permissions Admin/Direction. Un retour du
client à la version précédente peut conserver la migration additive et les saisies.
Ne pas supprimer la table de responsabilités sans exporter ces données.
