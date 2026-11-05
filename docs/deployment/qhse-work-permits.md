# QHSE · Permis de Travaux

Dans **QHSE → Permis de Travaux**, créez un permis pour votre navire ou site et sélectionnez une des huit checklists. Les quatre plans du GOURY et la vue 3D épurée du Yard Le Havre sont disponibles. Sur un plan, vous pouvez placer, déplacer ou retirer le repère d’un permis et dessiner plusieurs zones d’exclusion, y compris sur des ponts différents.

À la création, la date correspond au jour courant à Paris. Renseignez l’heure de début et les contrôles d’ouverture. Le permis reste dans **En attente de signature** jusqu’à la validation par le capitaine effectivement affecté, depuis son compte et avec sa signature active enregistrée dans son dossier RH. Avant la première pause, toute modification du périmètre signé, y compris des zones d’exclusion, remet le permis en attente de signature. Dès la première pause, le périmètre est verrouillé pour conserver l’historique. Le repère peut toujours être déplacé sur son plan ou retiré, et la checklist de fermeture peut être complétée.

La **frise des permis ouverts** affiche les permis signés jusqu’à leur clôture, y compris ceux ouverts les jours précédents. Elle affiche les travaux en cours en vert et les travaux en pause en orange, avec un libellé pour chaque état. La durée de travail affichée déduit les pauses. À la clôture, le serveur enregistre l’heure de fin réelle et le permis rejoint les **Archives**, consultables en lecture seule.

Les profils opérationnels consultent et modifient les permis des navires et sites auxquels ils sont affectés. Administration et Direction disposent de la vue globale de leur entreprise. Le modèle **Stockage au chariot élévateur** reste signalé comme à valider, car le document fourni reprend des contrôles propres au levage à la grue.

## Déploiement et recette

Appliquer la migration `20261105052516_qhse_work_permits.sql` avant la mise en service du client. Elle crée le registre et contrôle côté serveur le périmètre de lecture et de modification, l’identité du capitaine signataire, les transitions et la conservation des archives.

- Vérifier les droits avec des fixtures distinctes pour Marin, Capitaine affecté, Capitaine hors périmètre, Administration et Direction. Tester le refus de signature en l’absence d’une signature RH active et l’isolation entre entreprises.
- Vérifier le parcours complet sur les plans du GOURY et du Yard Le Havre, de la création à la clôture. Contrôler le déplacement et le retrait du repère, les zones d’exclusion sur plusieurs ponts, la remise à signature d’un permis modifié, le décompte du temps de pause et l’archivage.
- Exécuter les tests ciblés et la compilation de production, puis vérifier que Vercel a déployé le commit livré.


## Plans complémentaires de la flotte

Les vues vectorielles de LE ROZEL et LANDEMER sont consultables séparément dans le registre. Les vues isolent les tracés du navire et les noms de locaux disponibles. Les pictogrammes, flèches de sécurité et tableaux des plans de sécurité sont retirés.

- **LE ROZEL** — pont principal, pont supérieur de passerelle, pont inférieur, pont de la passerelle et profil.
- **LANDEMER** — pont principal, sous pont principal, vue de dessus de détail et profil. La vue de détail ne porte pas de libellé dans le document source.

Les scans de KROKDUR et SUROIT nécessitent un plan technique sans annotations pour être intégrés. Le nettoyage des scans a modifié certains détails du dessin.

Appliquer la migration `20261105063020_qhse_work_permit_fleet_plans.sql` avant le déploiement du client. Vérifier qu’un repère et une zone d’exclusion sont enregistrables sur chaque nouveau plan et qu’un plan propre à un autre navire est refusé.
