# Audit du suivi du temps de travail

## Amplitude et charge Supabase, 5 novembre 2026

Le registre affiche une jauge dès que la journée est modifiable. Elle suit
l’amplitude des séquences de travail touchées par la saisie, périodes
enregistrées et pauses courtes comprises. Un repos consécutif suffisant
ouvre une nouvelle séquence. La jauge indique 12 h en régime normal, exige
une justification à partir de 12 h 01 pour une saisie à la minute et signale
le franchissement du maximum d’urgence de 14 h. Le commentaire est conservé
avec le créneau ou le lot enregistré via le RPC existant. Les autres motifs
de commentaire et les contrôles de couverture restent applicables.

Les cartes de non-conformité regroupent leurs champs sur moins de lignes.
Sur une carte type avec un motif et le formulaire complet, le rendu
Chromium mesure 48 % de surface en moins sur ordinateur et 45 % sur
Pixel 7, par rapport aux styles précédents.

Sur les 24 h se terminant le 5 novembre à 14 h 56 (heure de Paris), les logs
de production Supabase donnent les résultats suivants, requêtes de
pré-vérification CORS exclues.

| RPC | Appels | Temps moyen à l’origine | P95 | Erreurs HTTP |
| --- | ---: | ---: | ---: | ---: |
| Analyse de couverture du registre | 191 | 1,90 s | 5,45 s | 3 |
| Alertes de couverture (accueil) | 37 | 5,86 s | 8,37 s | 10 |

Depuis le 28 juin, les requêtes SQL du module totalisent 43,2 % du temps
d’exécution cumulé pour le rôle `authenticated` (78 054 s sur 180 520 s).
L’ancien RPC de recommandation des phases représente 51,8 % de ce temps
historique du module et a reçu zéro appel durant les 24 h observées.
L’analyse de couverture du registre cumule environ 7 242 s pour 3 067
appels avec une seule lecture de bloc hors du cache partagé.
Ces durées incluent les attentes. Le taux de saturation CPU nécessite
la série temporelle de l’instance, inaccessible pendant cet audit.
Voir [les statistiques SQL Supabase](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
et [le tableau de bord de l’instance](https://supabase.com/dashboard/project/szlvyrrmvdvhzixilymh/observability/database).

La jauge se calcule dans le navigateur. L’analyse serveur du brouillon
attend le relâchement du pointeur, puis 600 ms de stabilité. Un panneau
ouvert émet un seul appel de couverture à la fois dans son périmètre authentifié.
Pendant cet appel, les brouillons intermédiaires sont écartés au profit
du dernier état. Un test avec une réponse différée vérifie ces deux cas.
L’effet en production se mesure après diffusion en comparant le nombre
d’appels du RPC, son temps cumulé et le CPU sur des plages de trafic
comparables.

## Audit d’octobre 2026

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
