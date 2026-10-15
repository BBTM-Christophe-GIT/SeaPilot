# Reprise des émissions et enregistrements — 3.74.9

Les journaux de production du 15 octobre 2026 confirment deux émissions de notes
de frais refusées avec « Le PDF doit être enregistré avant émission ». Les notes
restent en préparation : leur PDF est déjà vérifié dans le stockage Blob privé,
alors que le validateur ne cherchait que dans `storage.objects`. Le bouton mobile
« Réessayer l'émission » réutilise la note et ses justificatifs existants.

Les lectures DPR dépassaient également le délai de quatre secondes sous un
véritable profil Marin. Les contrôles de société, de rôle et de Planning étaient
répétés pour chaque rapport et chaque ligne enfant. Les identifiants lisibles et
modifiables sont maintenant calculés une fois par requête. Voir
[le périmètre DPR](./dpr-dashboard-access-scope.md).

Les recommandations du temps de travail lançaient le calcul complet d'une plage
pour obtenir une autorisation et une politique, avant de recommencer le calcul
pour toutes les plages. La validation est isolée et les recherches d'extension
s'arrêtent au premier candidat non conforme, comme l'exigeait déjà le résultat
du calcul cumulatif précédent. Les règles de conformité et d'accès restent
appliquées côté serveur.

## Déploiement

Appliquer ces migrations avant le client, dans cet ordre :

1. `20261015073507_expense_note_blob_issuance.sql`
2. `20261015073626_working_time_recommendation_single_validation.sql`
3. `20261015073628_optimize_dpr_report_access_scope.sql`
4. `20261015073631_optimize_working_time_captain_period_access.sql`

La dernière migration filtre les affectations de bordée et résout une seule fois
l'identité du capitaine avant d'évaluer les journées de Planning. Elle conserve
les contrôles quotidiens des fonctions, des statuts et des dates.

Aucune reprise automatique des émissions n'est déclenchée. L'utilisateur reprend
sa note existante. Les statuts d'envoi ambigus et les transmissions déjà effectuées
conservent leurs protections contre les doublons.

## Vérification

Les tests SQL utilisent des comptes authentifiés distincts, des données
synthétiques et des transactions annulées. Ils couvrent les profils Marin et
Capitaine, les refus hors société, les autorisations du module, les fichiers
absents/inactifs et le stockage historique. Les tests DPR vérifient aussi un
historique de 1 300 rapports sous un budget de quatre secondes.

Les tests frontend et d'envoi de notes utilisent un relais simulé : aucune note
réelle n'est envoyée pour tester cette correction. Les vues de profils simulées
depuis un compte administrateur ne sont pas utilisées comme preuve d'accès.
