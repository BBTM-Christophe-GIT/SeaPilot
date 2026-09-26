# Organigramme RH

Version 3.59.0. Le module `Ressources Humaines → Organigramme`, à côté de RH / Brevets,
est réservé aux profils Administrateur et Direction, y compris par URL directe.
Appliquer `20260926060139_organigramme.sql`,
`20260926122325_organigramme_categories_links.sql`,
`20260926125755_organigramme_personnel_contacts.sql` puis
`20260926184326_organigramme_hierarchy_default_watches.sql` et
`20260926185333_organigramme_watch_function_inheritance.sql` puis
`20260926191457_organigramme_personnel_names.sql` puis
`20260926202417_hr_portraits_and_organigramme_media.sql` puis
`20260926220402_organigramme_emergency_defaults.sql` et
`20260926221451_organigramme_emergency_default_grants.sql` avant de déployer le client.


## Interface et photos

Le diagramme est le premier contenu, à gauche du panneau **Réglages** sur bureau.
Les éditeurs de bordées et de structure s’ouvrent dans un tiroir avec fermeture
Échap et retour du focus. Sur écran étroit, les réglages passent après le diagramme.
La sélection des documents conserve les choix indépendants du personnel et des urgences.
Les illustrations des navires reprennent `illustration_thumbnail_url`, avec le
catalogue de flotte puis un pictogramme générique en repli. Elles sont intégrées
aux fichiers exportés, sans dépendance réseau après téléchargement.

Dans **RH / Brevets → fiche → Identité**, Administrateur, Direction et Armement
peuvent ajouter, remplacer ou retirer une photo JPEG/PNG (5 Mo maximum). L’original
est écrit et vérifié par le lanceur Drive 2.4 dans **Ressources Humaines/<dossier du
collaborateur>**, puis enregistré comme document administratif. Le chemin réutilise
le dossier RH existant. Une copie carrée de 320 px, sans métadonnées, est stockée dans
le bucket **privé** `hr-portraits` pour l’affichage automatique. Les références
`people.photo_document_id` / `photo_storage_path` sont validées ensemble : bon
collaborateur, même société, document Drive image et objet réellement présent.
Les lectures suivent les RLS RH existantes (Marin : soi ; Capitaine : périmètre RH).
Aucune URL publique de portrait n’est créée. Pas de nouvelle version du lanceur.

La photo remplace les initiales dans la liste RH et l’en-tête de fiche, et apparaît
dans les cartes de l’organigramme. Sans photo, les initiales RH restent affichées.
**Inclure les photos dans les exports** contrôle PDF/PNG/SVG, indépendamment de
l’affichage à l’écran. Les images sont embarquées dans les fichiers. Si une photo
référencée ne peut pas être chargée, une alerte propose Actualiser ou l’export sans
photos ; aucun export « avec photos » incomplet n’est présenté comme réussi.
Retirer/remplacer la photo conserve l’original dans les documents RH et supprime
uniquement l’ancienne miniature devenue inutilisée. Le document utilisé comme
photo ne peut pas être supprimé avant retrait de la photo du profil.

La responsabilité d’affichage de Julien LECOCQ devient **Capitaine d’Armement -
Superintendant Technique**, au même rang. Les listes de contacts reprennent les
fonctions définies dans les responsabilités liées aux personnes. La qualification
RH source n’est pas modifiée par cette personnalisation de l’organigramme.

Validation : tests des avatars, téléversement/erreurs/archivage, filtrage des
bordées, deux présentations, présence/absence des images et PDF d’une page ;
`supabase/tests/hr_portraits_test.sql` valide les rôles réels et les références
forgées dans une transaction annulée. Compléter avec les tests SQL Organigramme et
Drive RH. La préversion garde les photos ajoutées uniquement en mémoire locale.

Contrôle visuel du 26 septembre 2026, sur données fictives :

| Point du concept | Résultat vérifié dans le navigateur |
| --- | --- |
| Diagramme prioritaire | Premier panneau, réglages de 300 px à droite sur bureau. |
| Hiérarchie des actions | Onglets soulignés, PDF dans l’en-tête, image dans les réglages. |
| Palette | Marine, sarcelle et gris clair ; logo et navigation SeaPilot existants conservés. |
| Édition | Tiroirs bordées/structure avec Échap ; personnes déjà affectées exclues. |
| Lisibilité | Zoom initial 90 %, centrage du dirigeant, vue Ajuster et agrandissement disponibles. |
| Écran étroit | Vérifié à 390 px : aucun débordement de page, réglages après le diagramme. |
| Fichiers | PDF d’une page et PNG téléchargés puis inspectés, icônes navires incorporées. |

Les données, fonctions et liens réels du module sont conservés : les noms, avatars
et compteurs fictifs du concept graphique ne constituent pas une source métier.

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
La recherche ne retire pas les personnes déjà sélectionnées. Le sélecteur masque
les collaborateurs déjà présents dans une autre composition manuelle, même sur le
même navire. L’édition conserve les membres de la bordée ouverte, y compris après
renommage ou décochage. Les doublons historiques sont conservés, sans suppression
silencieuse ; il n’y a pas de nouvelle contrainte d’unicité en base.

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
Les mentions « Rang 1 », « Rang 2 », « Rang à définir » et « Support » restent
visibles uniquement dans l'éditeur de structure. Elles ne sont pas dessinées sur
les cartes de l'organigramme ni dans les exports PDF, PNG ou SVG. Les rangs continuent
de déterminer les niveaux, les positions latérales et les couleurs des cartes.
L'ordre départage les personnes de même rang. La RPC `save_organigramme_responsibility` enregistre
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

- Deux présentations : **Par navire** (avec les bordées sous chaque navire) et
  **Par fonction**. La vue autonome Par bordée est supprimée. Le Capitaine reste
  premier au sein d’une bordée. L’aperçu commence à 90 %, centré sur le dirigeant ;
  Ajuster donne une vue d’ensemble. Le bouton Agrandir masque les réglages.
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
- Les filtres (navires, direction, externes, non-affectés) s'appliquent à l'aperçu
  comme aux exports. Les navires sont classés du plus long au plus court et affichés
  côte à côte sur une seule rangée, avec leurs bordées en dessous. Les autres
  catégories occupent le dessus et le dessous de la flotte ; les supports sont
  latéraux et les intervenants externes restent à gauche de la direction.

Le filtre **Navires à afficher** permet de cocher plusieurs navires, avec un compteur,
**Tous les navires** et **Aucun navire**. Tous est le choix initial et inclut les
navires nouvellement composés après actualisation. Une sélection explicite, y compris
vide, reste conservée entre les deux vues et les actualisations tant que le module
reste ouvert. Les personnes sans affectation ne sont affichées qu'en mode Tous.
Les listes du personnel et d'urgence gardent leurs propres sélections.

Un navire sans aucun membre disponible dans ses compositions manuelles est masqué
dans le filtre, le diagramme et les exports PDF/PNG/SVG, même s'il a des bordées vides
enregistrées. Les lignes du Planning ou les personnes absentes de l'instantané ne
le rendent pas visible. Un navire ayant au moins une bordée composée conserve ses
autres bordées, même vides. Tous les navires restent disponibles dans **Composer les
bordées** et dans l'éditeur des liens. Les liens vers un navire masqué restent
enregistrés mais ne sont pas dessinés. Aucune migration supplémentaire n'est nécessaire.

## Cartes et contenu des exports de l’organigramme

Les cartes de personnes partagent la même largeur et la même hauteur dans chaque
catégorie, y compris les rangs et supports de Direction & Armement (ou son nom
personnalisé). Les équipages partagent également une taille commune entre navires.
La hauteur s’adapte au contenu le plus long ; aucun nom ni renseignement n’est tronqué.
Les portraits sont circulaires, centrés et recadrés sans déformation. Leur diamètre
commun par catégorie utilise l’espace disponible, de 64 à 80 px au lieu de 48 px.
Les illustrations des navires conservent leurs proportions.

Dans **Réglages → Exports → Informations à inclure**, six cases contrôlent les
photos, e-mails, téléphones, fonctions, navires et bordées pour les PDF, PNG et SVG.
L’aperçu montre exactement cette sélection. Les noms restent visibles. Les e-mails
et téléphones sont décochés au départ ; les autres informations sont incluses.
Les coordonnées proviennent des fiches RH liées, sans inventer de coordonnées pour
les intervenants libres. Décocher les fonctions ou les bordées masque également
leurs titres de groupe et les contextes correspondants des liens.

Ces choix restent conservés pendant les changements de présentation, d’onglet et
les actualisations, jusqu’au rechargement de la page. Le choix Navires est commun
à l’affichage et aux exports. Ils concernent le diagramme ; les listes de personnel
et d’urgence proposent les mêmes six cases avec des réglages indépendants. Une photo indisponible
bloque les exports avec photos ; décocher Photos permet de poursuivre.

L’export PDF est placé dans le même bloc **Exports** que les images PNG/SVG.
Les cartes et leurs options ne nécessitent aucune nouvelle dépendance.
Le module reste réservé aux comptes Administrateur et Direction.

## Liste du personnel et numéros d'urgence

Deux vues supplémentaires préparent des listes nominatives avec fonction, nom,
email et téléphone, ainsi que photos rondes, navires et bordées en option. Les six
cases **Informations à inclure** sont propres à chaque document et pilotent aussi
les colonnes de l’aperçu. Les noms restent visibles. Par défaut, fonctions, emails
et téléphones sont inclus ; photos, navires et bordées sont décochés.
Les deux listes commencent par la fonction Président, puis
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
numéros d'urgence reprend la liste par défaut enregistrée pour l’entreprise, ou
les sédentaires lorsqu’aucune liste n’a été enregistrée. Chaque liste dispose
d'une sélection indépendante, par fonction entière ou par personne. La recherche
filtre uniquement l'affichage, sans modifier le contenu sélectionné pour le PDF.
Une sélection vide désactive l'export. Les téléphones manquants sont signalés.
Les coordonnées se modifient dans RH / Brevets.

Les sélections sont conservées entre les vues et pendant les actualisations tant
que le module reste ouvert. Les réglages de contenu restent temporaires.
Pour les urgences, modifier les cases puis **Enregistrer comme liste par défaut**
mémorise les identifiants en base dans `organigramme_emergency_defaults`, par société.
Cette liste est partagée entre Administrateur et Direction et relue à la prochaine
connexion, y compris sur un autre poste. **Charger la liste par défaut** annule les
choix temporaires. **Rétablir les sédentaires** prépare une nouvelle sélection sans
écraser la sauvegarde tant que l’utilisateur n’enregistre pas. Une liste vide est
mémorisable et ne réactive jamais automatiquement les sédentaires.
Une personne absente du nouvel instantané n’est plus exportée. Les coordonnées
restent issues des fiches RH, sans copie dans la table de préférences.
La RPC `save_organigramme_emergency_default` et les politiques RLS limitent lecture
et écriture aux profils autorisés de la société et refusent les contacts étrangers.

Les responsabilités de Direction & Armement restent distinctes des fonctions à
bord : la fonction RH est conservée dans l’instantané, puis la fonction de la bordée
la remplace uniquement si elle est renseignée. Les listes de contacts reprennent
l’intitulé de bureau pour les personnes ayant une responsabilité de bureau.

Chaque liste s’exporte en PDF A4 portrait, avec logo BBTM et date. Le personnel
tient sur **une seule page**, en adaptant l’échelle du tableau vectoriel à son
contenu sans supprimer de personnes. Une sélection très longue réduit la taille
du texte. Les urgences conservent des caractères de taille fixe et des en-têtes
répétés, avec pagination si nécessaire. L’export des deux listes commence toujours
les numéros d’urgence sur la deuxième page, avec une pagination globale.
La liste d'urgence utilise un thème rouge bordeaux, des lignes rose pâle et les
téléphones en gras, à l'écran comme dans le PDF. Le logo BBTM est incorporé depuis
son image d'origine, sans recoloration. La liste du personnel garde le thème bleu.
Le diagramme reste sur une seule page paysage ; le personnel est sur une page portrait.
Les mêmes droits Administrateur/Direction s'appliquent à ces coordonnées et exports.

## Validation et retour arrière

Tests Vitest du modèle, des rangs, du diagramme, des profils, du compositeur de bordées,
des sélections et des deux PDF d'une page ; test SQL transactionnel
`supabase/tests/organigramme_access_test.sql` sur de vrais rôles authentifiés,
terminé par ROLLBACK, couvrant aussi l'isolation par société, les sélections vides,
le remplacement atomique et l'indépendance du Planning. Contrôler aussi les PDF et
PNG générés dans un navigateur. La préversion permet des compositions et rangs
fictifs en mémoire ; ils sont réinitialisés au rechargement complet de la page.
Seule sa liste d’urgence par défaut est mémorisée localement dans le navigateur.
Pour masquer le module, désactiver ses permissions Admin/Direction. Un retour du
client à la version précédente peut conserver la migration additive et les saisies.
Ne pas supprimer la table de responsabilités sans exporter ces données.
