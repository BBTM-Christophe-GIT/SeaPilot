# Planning, RH et périmètre DPR Marin — v3.22.18

## Comportement livré

- La vue Planning **Équipages** classe les lignes de personnel par nom, puis par prénom. Le regroupement par équipe conserve son ordre alphabétique habituel.
- La fiche RH expose **Supprimer la personne** uniquement au profil Administrateur. Direction et Armement conservent la création et la modification, sans droit de suppression.
- Le profil Marin retrouve dans **Mes DPR** uniquement les rapports dont il est l'émetteur. Il peut enregistrer et modifier son propre DPR pendant 72 heures après sa création ; ensuite, le DPR passe en consultation pour lui et reste modifiable par les autres profils DPR autorisés.

## Déploiement

Appliquer `20260827094744_hr_admin_delete_and_marin_dpr_window.sql` avant d'exposer la version frontend. La migration sépare les politiques d'insertion, de modification et de suppression de `people`, étend la lecture DPR du Marin à ses propres rapports et applique la fenêtre de 72 heures aux RPC et aux écritures des tables DPR.

La suppression RH reste physique et respecte les clés étrangères existantes : PostgreSQL la refuse lorsqu'une donnée opérationnelle protégée référence encore la personne.

## Vérifications

- Vitest couvre le tri par nom, la visibilité Administrateur de l'action RH, le filtre DPR par émetteur et les états Modifier/Consulter avant et après 72 heures.
- `human_resources_admin_delete_person_test.sql` vérifie le refus de Direction et Armement puis l'autorisation Administrateur.
- `dpr_role_matrix_test.sql` vérifie la lecture des seuls DPR émis par le Marin, le refus d'écriture après 72 heures et la reprise de modification par Direction.
