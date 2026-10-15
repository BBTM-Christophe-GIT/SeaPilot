# Audit du suivi du temps de travail — octobre 2026

Voir aussi [l’audit de saisie et de repos du 15 octobre](working-time-entry-rest-audit.md)
pour les corrections clavier et tactiles et la règle confirmée : 10 heures de
repos sur 24 heures, dont 6 heures consécutives.

Les corrections portent sur les résultats asynchrones et les reprises après une
réponse perdue. Elles conservent les seuils de travail/repos, les signatures
obligatoires, les calendriers métier et les droits appliqués par Supabase.

| Parcours | Contrôle et correction |
| --- | --- |
| Catalogue et registres mensuels | Le workspace appartient au client, au profil et à la période chargés. Un ancien résultat ne réapparaît pas après un changement de contexte ; un chargement échoué retire les données éditables. La désactivation termine aussi l'indicateur de chargement. Un ancien callback de rechargement ne peut pas annuler la demande d'un nouveau périmètre. |
| Brouillon et correction des phases | Une recommandation correspond exactement au client, à la personne, aux phases et au contexte Planning affichés. Les boutons restent bloqués avant sa réponse, après un refus ou pendant un résultat indéterminé. Une erreur de calcul indique « Analyse indisponible », sans déclarer la politique absente. Le bouton de reprise relance uniquement le calcul. |
| Droits de saisie quotidienne | Le booléen strict `actor_can_edit_day` du contexte serveur s'applique uniquement au `register_id` mensuel sélectionné. Cela respecte aussi les exceptions d'édition historique déjà accordées en production. Un contexte d'un autre registre est refusé ; les anciens payloads sans booléen conservent le calendrier frontend existant. |
| Signature et approbation d'une journée | Une première sauvegarde ne déclenche pas une seconde écriture après navigation ou fermeture du module. Les messages restent liés à la personne et à la journée concernées. Une mutation confirmée suivie d'un rafraîchissement échoué reste présentée comme enregistrée ; aucune écriture n'est répétée automatiquement. Une demande de retrait ne suit pas une autre journée. |
| Import XLSM | Les modifications pendant le contrôle invalident son aperçu. Les réponses d'un ancien fichier sont ignorées. Tous les contrôles éditables sont verrouillés pendant le commit ; un import terminé ne peut pas être validé à nouveau. |
| Reprise d'import | Après une réponse de commit incertaine, « Vérifier l'état de l'import » relit uniquement le batch exact via SELECT/RLS. `imported` avec sa synthèse et sa date confirme le résultat enregistré. Sinon un nouveau contrôle est requis. Le RPC de preview, qui modifie le batch, ne sert pas de lecture de rapprochement. Un ancien callback de rafraîchissement ne publie pas d'erreur dans un nouveau contexte. |
| Signature de profil | Le fichier ou dessin en attente ne suit pas une autre fiche RH. Une ancienne lecture ou un ancien upload ne publie pas de résultat dans le contexte d'un nouveau client. Si la réponse d'enregistrement est perdue, une lecture de la version exacte permet de confirmer son hash et son identité ; l'image immuable est conservée pour protéger une éventuelle preuve déjà enregistrée. |
| Export du registre mensuel | Les instantanés de validation sont paginés et limités aux registres visibles de la période, avec ordre stable. L'historique global dépassant 1 000 événements ne fait plus disparaître une ancienne preuve de signature. Les images privées sont téléchargées à la demande par l'adaptateur documentaire commun. |
| Rapport de conformité et KPI HSE | Le résultat appartient au client et aux filtres demandés. Une réponse en retard ne devient pas le rapport ou l'indicateur d'un nouveau périmètre ; un ancien rapport n'est plus exportable après modification de ses filtres. |

Les fixtures frontend couvrent séparément Marin, Capitaine, Armement, Direction
et Admin. Elles ne remplacent pas les comptes authentifiés et les règles RLS/RPC.
Les vérifications SQL des droits et des calculs restent dans les suites
`supabase/tests/working_time_*_test.sql`.

Voir [l'audit serveur et son ordre de déploiement](working-time-server-audit.md)
pour la correction des comparaisons d'identité NULL et la migration
`20261014202431_harden_working_time_actor_scope.sql`. Les six migrations
historiques restaurées documentent les définitions déjà appliquées en production
et ne doivent pas être réexécutées comme une nouvelle réparation.

La suite frontend du module comporte **173 tests**. Validation reproductible :

```powershell
corepack pnpm exec vitest run src/features/workingTime
corepack pnpm build
```

Sur un poste où le démarrage simultané des workers échoue, la même suite peut
être lancée avec `--pool=forks --maxWorkers=1`, sans modifier les délais des tests
ni les règles serveur. Les tests de races utilisent des réponses différées
contrôlées, des données fictives et des appels Supabase simulés.

Aucune journée réelle, signature réelle, import comptable ou notification n'est
créé pour cette recette frontend. Les contrôles de production en lecture seule
et les preuves des profils réels sont rapportés séparément ; les fixtures ne
constituent pas une recette navigateur de chaque compte collaborateur.
