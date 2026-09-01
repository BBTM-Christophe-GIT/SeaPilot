# Certificats flotte — pilotage des écarts v3.27.4

## Changements

- Les écarts sont triés de A à Z sur leur objet, sans tenir compte d'un éventuel préfixe numérique.
- Le curseur d'avancement reste local tant que le bouton `Ajouter` du suivi n'a pas été utilisé.
- Le clic sur `Ajouter` enregistre le pourcentage et la note dans une transaction unique et produit un seul événement d'historique.
- Un bouton `Modifier` est disponible à côté de la suppression pour mettre à jour le type, l'objet, la description, l'échéance et le responsable sans recréer l'écart ni perdre son historique.

## Base de données

La migration `20260901121009_fleet_finding_followup_history.sql` ajoute la fonction transactionnelle `save_fleet_certificate_finding_followup` et adapte l'audit de l'avancement pour intégrer la note au même événement.

## Vérification

1. Ouvrir un document contenant plusieurs écarts et confirmer le tri alphabétique.
2. Déplacer le curseur et confirmer qu'aucune ligne d'historique n'apparaît avant `Ajouter`.
3. Ajouter le suivi et confirmer qu'une seule ligne contient le nouveau pourcentage et la note.
4. Modifier l'écart puis confirmer que les événements antérieurs sont toujours présents.
