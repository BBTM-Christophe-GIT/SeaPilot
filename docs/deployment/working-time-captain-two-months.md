# Approbation des journées par le Capitaine

L’ouverture d’une approbation d’un autre mois pouvait sélectionner le marin et
la journée avant le chargement du registre demandé, puis perdre cette cible.
L’interface affichait alors « registre mensuel en cours de création automatique »
pour un registre simplement absent du workspace courant. Le registre de septembre
d’Émilien LAFFAITEUR existait déjà ; ses journées des 20, 21 et 22 septembre 2026
étaient attribuées à Pierre LEPRETRE. Les vérifications en lecture avec l’identité
authentifiée de Pierre confirment son accès au registre et au catalogue de septembre.

La navigation doit conserver le marin, la date et le mois jusqu’au chargement du
workspace cible, remettre la recherche et le filtre personnel en cohérence, puis
ouvrir la journée demandée. Un registre indisponible reçoit un message adapté à
cet état ; le message de création est réservé à une création réellement engagée.

## Fenêtre d’approbation

Le Capitaine peut approuver, corriger ou justifier une journée déjà soumise entre
la date du jour moins **deux mois calendaires** et la date du jour, bornes incluses.
La date de référence est calculée en **Europe/Paris**. Le 11 octobre 2026, la fenêtre
va donc du **11 août au 11 octobre 2026** : le 10 août et le 12 octobre sont hors
fenêtre, les journées des 20–22 septembre sont dans la fenêtre.

La soustraction porte sur les mois du calendrier, avec ajustement au dernier jour
du mois si nécessaire ; elle ne correspond pas à une durée fixe de 60 jours.
Le serveur contrôle la fenêtre au moment de l’action. Un accès antérieur à la page
ne permet pas de contourner sa clôture.

L’approbateur reste celui de la journée soumise, avec contrôle de l’identité,
de la société et de son autorité Capitaine selon les affectations Planning à la
date travaillée, y compris les fonctions Capitaine temporaires. La signature active
du validateur, la signature figée du titulaire et les justifications de
non-conformité restent obligatoires. Les journées déjà validées restent verrouillées.

Les droits de gestion restent ceux du workflow existant : Administration et
Armement, ainsi que Direction pour les journées sans capitaine résolu. La lecture
historique, la clôture de saisie au 5 du mois suivant et l’auto-validation existante
des propres journées conformes d’un Capitaine conservent leurs règles distinctes.
Cette correction n’approuve aucune journée à la place de Pierre et ne réécrit
aucune signature ni preuve de validation existante.

## Déploiement et vérification

Appliquer `supabase/migrations/20261011195953_working_time_captain_approval_window.sql`
avant de livrer le client. Le helper
`public.working_time_captain_approval_date_allowed(date)` expose uniquement un
booléen de fenêtre au rôle `authenticated`, sans accès anonyme. La migration ajoute
le contrôle aux branches Capitaine de `validate_working_time_day`,
`working_time_can_comment_register` et `working_time_actor_can_edit_day`.
Elle refuse de s’appliquer si les gardes attendues ont divergé et conserve les
contrôles d’accès et politiques RLS existants.

Exécuter `supabase/tests/working_time_captain_approval_window_test.sql` sur la base
migrée avec les fixtures Auth réelles, en transaction annulée. Elle couvre les bornes
passée et future, les affectations historiques terminées, les autres profils/sociétés,
les signatures, la justification et les droits de gestion. Les tests client couvrent
également les mois courts, le changement d’année et la date locale Paris.

```powershell
pnpm test src/features/workingTime/WorkingTimeWorkflowPanel.test.tsx src/features/workingTime/workingTimeQueries.test.ts src/features/workingTime/workingTimeEntryWindow.test.ts src/features/workingTime/workingTimeApprovalWindow.test.ts src/features/workingTime/useWorkingTimeWorkspace.test.ts
pnpm build
```

Les tests React doivent reproduire un chargement différé d’octobre vers septembre,
conserver le marin et chacune des dates 20, 21 et 22, et vérifier le message d’un
registre absent sans fausse annonce de création. Les vues Marin/Capitaine simulées
depuis une session Admin ne constituent pas une preuve des permissions réelles.

La migration est appliquée au projet SeaPilot `szlvyrrmvdvhzixilymh` le
11 octobre 2026. Les vérifications en lecture avec l’identité authentifiée de
Pierre confirment son accès au registre de septembre et l’autorisation des trois
journées des 20, 21 et 22 septembre. Les demandes restent soumises, sans validation
effectuée à sa place. La fixture de régression SQL réussit sur la base migrée avec
annulation complète de ses comptes, registres, approbations et métadonnées fictives.
Les huit suites client ciblées réussissent (99 tests), ainsi que le lint des sept
fichiers frontend modifiés et la compilation de production avec pnpm 10.34.5.
