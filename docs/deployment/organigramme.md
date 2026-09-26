# Organigramme RH

Version 3.57.0. Le module `Ressources Humaines → Organigramme`, à côté de RH / Brevets,
est réservé aux profils Administrateur et Direction, y compris par URL directe.
Appliquer `20260926060139_organigramme.sql` avant de déployer le client.

## Données et actualisation

La RPC `organigramme_snapshot` renvoie uniquement les noms, fonctions, navires,
bordées et responsabilités de la société active. Elle utilise les droits de
l'appelant (SECURITY INVOKER), vérifie le profil, l'appartenance à la société et
la permission du module. Aucune copie de dossier RH n'est créée.

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

## Exports

- PDF A4 paysage vectoriel : logo BBTM, date, présentation, référence REP 03-B,
  fichier d'origine et pagination. Trois colonnes au maximum par page ; titres
  répétés et cartes entières lors des continuations.
- PNG haute résolution ou SVG vectoriel : uniquement le diagramme, sans en-tête
  ni pied de page. L'option Afficher les navires retire aussi leurs mentions dans
  la vue par fonction. Le PNG limite sa résolution pour respecter la mémoire du
  navigateur ; le SVG garde la précision intégrale.
- Les filtres (navire, direction, externes, non-affectés) s'appliquent à l'aperçu
  comme aux exports. Les navires sont classés du plus long au plus court.

## Validation et retour arrière

Tests Vitest du modèle, du diagramme, des profils et de l'écran ; test SQL transactionnel
`supabase/tests/organigramme_access_test.sql` sur de vrais rôles authentifiés,
terminé par ROLLBACK. Contrôler aussi les PDF et PNG générés dans un navigateur.
Pour masquer le module, désactiver ses permissions Admin/Direction. Un retour du
client à la version précédente peut conserver la migration additive et les saisies.
Ne pas supprimer la table de responsabilités sans exporter ces données.
