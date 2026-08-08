# Rapport de suivi du temps de travail

## Accès et périmètre

Le bouton **Rapport de conformité** est disponible dans le groupe **Documents** du module de suivi du temps de travail pour les rôles `admin`, `direction` et `armement`.

Le rapport peut être configuré :

- par année, trimestre ou mois ;
- pour la compagnie entière, une sélection de marins ou une sélection de bordées ;
- pour tous les navires ou une sélection multiple de navires ;
- avec une ou plusieurs familles d’indicateurs : KPI IMCA, indicateurs français, journées non conformes.

## Sources de données

- Les heures réelles proviennent exclusivement des intervalles horodatés visibles par le profil connecté.
- Les journées non conformes proviennent des fenêtres calculées côté serveur. Un couple marin/date est compté une seule fois, même si plusieurs fenêtres de calcul sont en écart.
- Les heures d’exposition HSE et les événements de sécurité proviennent des tables HSE protégées par RLS.
- La méthodologie HSE applicable est résolue selon sa période d’effet. Aucune valeur réglementaire n’est ajoutée lorsque la configuration est absente.

## Contenu et export

L’aperçu comprend un résumé exécutif modifiable, les chiffres clés, une évolution temporelle, une répartition des journées non conformes, les hypothèses et les formules. Le PDF reprend le logo BBTM en haut à gauche et le titre **Rapport de suivi du temps de travail**.

Le dernier chapitre du PDF contient les formules et les multiplicateurs de la méthodologie sélectionnée. Les valeurs non configurées sont explicitement indiquées comme telles.

## Registre mensuel

Chaque marin conserve un seul registre mensuel. La vue **Jour** reste la vue de saisie par défaut. La vue **Mois** présente chaque date, les phases de travail, le total, l’affectation navire/bordée, les repos, le cumul sur sept jours et le statut. Un clic sur une date ramène à la vue journalière.

Les journées non conformes sont signalées en rouge dans le bandeau journalier et dans la table mensuelle.
