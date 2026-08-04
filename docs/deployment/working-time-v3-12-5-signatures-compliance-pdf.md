# SeaPilot v3.12.5 — signatures, non-conformités et registre PDF

Date de livraison : 4 août 2026.

Cette étape finalise les preuves de signature et la documentation des journées
non conformes du module « Suivi du Temps de Travail ». Elle ne modifie ni les
seuils administrateur ni le moteur de fenêtres glissantes livré en v3.12.3.

## Signatures de profil

La fiche RH propose désormais un onglet « Signature » permettant à la personne,
à l’Armement ou à un administrateur autorisé :

- d’importer un PNG ou de dessiner une signature ;
- de créer une nouvelle version sans supprimer les versions historiques ;
- de consulter la version active, sa date, sa taille et son empreinte SHA-256.

Les objets sont conservés dans le bucket privé `working-time-signatures`, limité
à 1 Mo et au type `image/png`. Les politiques Storage n’ouvrent que le chemin
`société/personne/uuid.png` autorisé par le serveur. Un objet déjà enregistré
comme version historique ne peut plus être supprimé par le client.

L’enregistrement d’une version de profil ne signe aucun registre. La signature
du marin n’est figée que lors de « Signer et soumettre » ; celle du validateur
n’est figée que lors de « Contrôler et valider le registre ».

## Réponse obligatoire aux non-conformités

Chaque date ayant au moins un calcul serveur non conforme reste marquée
`NON CONFORME`, même après commentaire. Avant validation, un capitaine doit
enregistrer les cinq éléments suivants :

- catégorie de cause ;
- contexte opérationnel ;
- action immédiate ;
- repos compensateur prévu ;
- commentaire obligatoire.

Les RPC et l’interface appliquent la même règle. Les heures ne sont jamais
supprimées ni corrigées automatiquement par cette réponse.

## Preuves et audit

Chaque signature ou validation conserve un instantané de l’identité, des rôles,
du navire, de la bordée, de la politique, des intervalles, des calculs non
conformes et de la réponse du capitaine. La preuve de signature contient le
signataire, la date exacte, la version, le chemin privé, la taille, le type MIME
et l’empreinte SHA-256.

Le registre peut être exporté en PDF depuis sa fiche. Le document reprend les
créneaux, les résultats 24 h et 7 jours, les journées `NON CONFORME`, les cinq
champs de réponse, les signatures figées dans leurs cases et le journal d’audit.
Une signature active plus récente ne remplace jamais la preuve historique.

## Migration et vérifications

La migration
`20260804111058_working_time_signatures_compliance_pdf.sql` ajoute les champs de
réponse structurée, les instantanés d’intervalle et de conformité, les RPC de
dépôt et d’enregistrement PNG, ainsi que les politiques Storage associées.

Vérifications de livraison :

- reconstruction complète de la base locale depuis toutes les migrations ;
- 56 assertions pgTAP sur le workflow, les droits de signature, le bucket privé,
  la réponse structurée et les preuves figées ;
- tests unitaires des requêtes, du workflow, du hachage/dépôt et du PDF ;
- lint TypeScript, build de production et contrôle visuel ordinateur/mobile.

La migration est destinée au déploiement automatisé après fusion de la pull
request. Aucune valeur réglementaire implicite n’est ajoutée.
