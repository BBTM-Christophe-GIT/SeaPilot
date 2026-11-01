# Quantités et références des prestations

Le catalogue des prestations propose quatre modes de quantité :

- **Manuel** : nombre d'unités saisi, avec une valeur par défaut facultative.
- **Période sélectionnée** : nombre de jours entre le début et la fin, inclus.
- **Mois sélectionné** : nombre de jours calendaires du mois de facturation.
- **Types d'opération** : journées de DPR correspondant à l'un des types cochés,
  sur la période sélectionnée. Plusieurs types peuvent être sélectionnés.

Le dernier mode compte une journée une seule fois par navire, même si plusieurs
DPR correspondent aux types choisis. Il ignore les journées sans DPR, les lignes
de complément créées pour l'export et les opérations exclues de la sélection.
Masquer globalement les loyers du PDF ne désactive pas ce calcul des prestations.

Chaque prestation du catalogue peut porter une référence client. Les valeurs
du catalogue sont copiées lors de l'ajout d'une prestation à la facturation.
Les lignes déjà enregistrées conservent leurs valeurs propres : modifier le
catalogue ne modifie pas les factures existantes.

Dans Facturation, le mode, les types d'opération, le montant unitaire et la
référence client restent modifiables après Enregistrer. Pour changer directement
le nombre d'unités calculé, ouvrir **Calcul quantité** et choisir **Manuel**.
Le même menu propose les journées de la période, celles du mois et les types
d'opération. Les types se cochent dans le menu ; Terminer ferme leur sélection.
Enregistrer met à jour la même
ligne. Le total affiché et les exports utilisent le même calcul ; la référence
propre à chaque prestation figure avec sa désignation dans le PDF.

Les anciens enregistrements sans mode explicite gardent leur comportement,
y compris la règle P144 Spread Antipollution (jours du mois moins Weather
Stand-by). Le choix explicite d'un nouveau mode remplace cette règle pour la
ligne concernée. Les valeurs historiques ne sont pas réécrites lors du déploiement.

La migration ajoute les champs au catalogue et aux prestations de facturation.
Elle doit être appliquée avant la mise en production du client qui les écrit.
Le fichier `20261031214439_project_billing_service_quantity_modes.sql` correspond
à la version enregistrée en production. Le test SQL
`supabase/tests/project_billing_service_quantity_modes_test.sql` vérifie les
contraintes, les valeurs historiques et les droits dans une transaction annulée.
Les politiques RLS de société et les droits d'écriture Admin/Direction restent
inchangés. Aucun accès supplémentaire n'est accordé aux autres profils.
