# Suivi du temps — attribution des alarmes glissantes v3.22.6

## Résultat utilisateur

- Une non-conformité est rattachée à la date du dernier créneau de travail qui contribue à la fenêtre fautive.
- Le lendemain n’est ni coloré en rouge ni soumis à une nouvelle justification lorsque la fenêtre reste non conforme avant toute nouvelle heure travaillée.
- La vue journalière du lendemain conserve l’information dans une fine bande rouge clair « Impact des 24 h glissantes ».
- La vue mensuelle reprend les indicateurs de fin de journée conformes pour le lendemain.

## Cas Arthur MAREST des 17 et 18 août 2026

Le 17 août porte l’alarme de 13 heures de travail pour un maximum de 12 heures sur 24 heures. La fenêtre qui se termine le 18 août à 06:30 ne contient encore que les créneaux du 17 : elle est donc présentée comme un impact glissant rattaché au 17. Le 18 reste neutre, ne demande aucune justification et affiche ses valeurs conformes de fin de journée.

## Vérification

- Test de l’attribution au dernier jour travaillé dans la fenêtre.
- Test de la ligne mensuelle neutre et conforme le 18 août.
- Test de la bande d’impact avec la fenêtre du 17 août à 06:30 au 18 août à 06:30.
- Test de l’absence de fiche de justification pour le 18 août.
