# Organigramme RH

Version 3.57.2. Le module `Ressources Humaines → Organigramme`, à côté de RH / Brevets,
est réservé aux profils Administrateur et Direction, y compris par URL directe.
Appliquer `20260926060139_organigramme.sql`,
`20260926122325_organigramme_categories_links.sql`,
`20260926125755_organigramme_personnel_contacts.sql` puis
`20260926184326_organigramme_hierarchy_default_watches.sql` et
`20260926185333_organigramme_watch_function_inheritance.sql` puis
`20260926191457_organigramme_personnel_names.sql` avant de déployer le client.

## Données et actualisation

La RPC `organigramme_snapshot_v2` renvoie les noms, fonctions, emails, téléphones,
navires, bordées et responsabilités de la société active. Elle utilise les droits de
l'appelant (SECURITY INVOKER), vérifie le profil, l'appartenance à la société et
la permission du module. Les coordonnées proviennent de `people.email` et
`people.phone` ; les contacts d'urgence familiaux et les autres données privées
du dossier RH ne sont pas renvoyés. Aucune copie de dossier RH n'est créée.

Les compositions sont désormais propres à l'organigramme : aucune lecture ni
écriture des affectations, journées, périodes ou bordées du Planning. La migration
crée deux bordées **vides** par navire actif (Bordée 1 et Bordée 2), sans importer
les équipes du Planning. Composer les bordées permet de créer, renommer, supprimer
une bordée, sélectionner ses membres et préciser leur fonction à bord. Une fonction
laissée vide suit la fiche RH. Une sélection vide reste vide après actualisation.
La recherche ne retire pas les personnes déjà sélectionnées.

Les tables `organigramme_watches` et `organigramme_watch_members` conservent ces
compositions par société ; la RPC `save_organigramme_watch` les remplace atomiquement
après contrôle des personnes et du navire. RLS et RPC imposent les mêmes droits
Administrateur/Direction et refusent les données d'une autre société. La suppression
d'une bordée supprime uniquement ses membres dans l'organigramme.

La date filtre les personnes et navires présents, mais les compositions sont
courantes, sans historique. Leur édition est disponible à la date du jour.
Les personnes sorties et les navires sortis sont exclus. Un marin peut figurer
dans plusieurs bordées ; la vue par fonction regroupe ces indications sur une carte
par marin et fonction. Les marins sans bordée apparaissent dans Sans affectation,
regroupés par fonction pour éviter une colonne excessivement longue avant composition.
L'ancienne RPC `organigramme_snapshot` reste disponible pour les clients déjà
ouverts avant la livraison ; le nouveau client utilise exclusivement la v2.

Actualisation à l'ouverture, toutes les 60 secondes lorsque la page est visible,
au retour sur la fenêtre et via Actualiser. Les exports sont désactivés pendant le
chargement et en cas d'erreur. Aucun repli silencieux vers des données fictives en production.

## Structure complémentaire et référence

Référence du modèle actuel : **87-Organigramme.pdf**, pied de page **REP 03-B**.
Le document initial **87-Organigramme.docx** reste la référence de provenance.
L'original fourni reste hors des assets publics. Les noms et adresses du document
ne sont pas copiés dans la préversion publique, qui utilise des données fictives.

À la demande de l'utilisateur, la migration initialise IN EXTENSO, Marine Assistance
et RICHEMONT AVOCATS avec leurs missions du document, pour BBTM uniquement.
Les responsabilités Direction, Administration, Yard et maintenance sont liées aux
fiches RH quand la correspondance prénom/nom est unique et active. Les noms suivent
ensuite les fiches RH et les personnes sorties disparaissent du diagramme.
La rubrique Modifier la structure permet d'ajouter, modifier, ordonner et supprimer
les responsabilités. Les noms et missions libres restent à maintenir manuellement.
Le champ `hierarchy_rank` est distinct de l'ordre d'affichage. Les rangs numériques
forment des niveaux verticaux : rang 1 en haut, puis 2, etc. Le statut **Support**
place les personnes sur les côtés, en gris avec des branches en pointillés.
Les responsabilités sans rang restent identifiées Rang à définir. L'ordre départage
les personnes de même rang. La RPC `save_organigramme_responsibility` enregistre
ces informations ; l'ancienne RPC reste compatible avec les clients précédents.

La migration initialise, pour BBTM uniquement, Benjamin BON au rang 1,
Christophe MINASSIAN et Julien LECOCQ au rang 2, Adam DEBORDEAUX au rang 4,
Sophie HAMEL et Antoine MONCEAUX en Support. Les intervenants externes sont à gauche
de la hiérarchie. Ces niveaux ne définissent pas de rattachement individuel entre
deux personnes. Tous les rangs restent modifiables dans Modifier la structure.

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

- Trois présentations : Par navire et bordée, Par bordée (même nom de bordée
  regroupé entre navires), Par fonction. Le Capitaine est toujours classé en premier
  au sein d'une bordée. L'aperçu s'ajuste initialement à la largeur disponible ;
  les pourcentages de zoom permettent ensuite de lire les détails.
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
  toutes les vues. Le PNG limite sa résolution pour respecter la mémoire du
  navigateur ; le SVG garde la précision intégrale.
- Les filtres (navire, direction, externes, non-affectés) s'appliquent à l'aperçu
  comme aux exports. Les navires sont classés du plus long au plus court et affichés
  côte à côte sur une seule rangée, avec leurs bordées en dessous. Les autres
  catégories occupent le dessus et le dessous de la flotte ; les supports sont
  latéraux et les intervenants externes restent à gauche de la direction.

## Liste du personnel et numéros d'urgence

Deux vues supplémentaires préparent des listes nominatives avec fonction, nom,
email et téléphone. Les deux listes commencent par la fonction Président, puis
Julien LECOCQ, Christophe MINASSIAN et Sophie HAMEL lorsqu'ils sont sélectionnés.
Les autres personnes sont regroupées selon le classement habituel des fonctions,
puis par nom de famille et prénom (collation française). Les stagiaires sont toujours
en dernier. Les priorités nominatives sont des exceptions au regroupement général :
si leur fonction est partagée, elle apparaît dans un bloc prioritaire puis dans le
groupe des autres membres, sans modifier la fonction RH ni dupliquer une personne.

L'arborescence présente un en-tête par groupe de fonction, puis ses personnes
indentées sous la colonne **Prénom NOM**, à l'écran et dans les PDF. Les noms de
famille s'affichent en majuscules. La RPC renvoie les champs RH `firstName` et
`lastName` séparément afin de trier correctement les noms/prénoms composés.
Le regroupement ne change ni la sélection ni les coordonnées. Les personnes
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

Tests Vitest du modèle, des rangs, du diagramme, des profils, du compositeur de bordées,
des sélections et des trois PDF d'une page ; test SQL transactionnel
`supabase/tests/organigramme_access_test.sql` sur de vrais rôles authentifiés,
terminé par ROLLBACK, couvrant aussi l'isolation par société, les sélections vides,
le remplacement atomique et l'indépendance du Planning. Contrôler aussi les PDF et
PNG générés dans un navigateur. La préversion permet des compositions et rangs
fictifs en mémoire ; ils sont réinitialisés au rechargement complet de la page.
Pour masquer le module, désactiver ses permissions Admin/Direction. Un retour du
client à la version précédente peut conserver la migration additive et les saisies.
Ne pas supprimer la table de responsabilités sans exporter ces données.
