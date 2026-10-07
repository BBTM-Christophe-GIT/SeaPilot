# Accueil : ouverture des fiches et achats à traiter

La version `3.68.3` ouvre l'élément associé à chaque chip de l'accueil : demande
d'achat, certificat flotte, élément LSA, fiche information de procédure, dossier
RH ou journée de temps de travail. Les profils autorisés aux sources ouvrent la
fiche information de procédure ; les autres profils ouvrent la publication PDF
accessible en lecture seule. Les liens portent l'identifiant interne de
l'élément ; le module cible le retrouve parmi les données accessibles au profil.

Les demandes d'achat de l'accueil sont limitées au statut métier **À traiter**,
avec la même classification que le module Achats. Les demandes refusées, en
commande, à réception et traitées sont exclues. Une date de livraison souhaitée
ne retire pas une demande explicitement « À traiter » de cette catégorie.

Les liens d'achat sélectionnent la bonne étape et la bonne page de la liste,
y compris après le chargement asynchrone. Les liens RH sélectionnent le
collaborateur et la rubrique Documents ou Contrat. Un document RH non rattaché
ouvre sa fiche pour les gestionnaires autorisés. Les alertes de temps de
travail ouvrent le collaborateur et la journée concernés. Les droits d'accès et
les périmètres réels Marin/Capitaine restent appliqués dans les modules cibles.

Validation : tests de navigation, de filtrage et de profils sur les modules
concernés, puis compilation de production et contrôle du déploiement Vercel.
Aucune migration de base de données ni modification de configuration n'est
nécessaire.
