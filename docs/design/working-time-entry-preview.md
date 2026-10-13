# Préversion de saisie du temps de travail

La préversion autonome est disponible à `/previews/working-time.html` (et à
`/previews/working-time` sur Vercel). Elle réutilise les composants SeaPilot et
le tableau de saisie avec des personnes fictives. Les données et les seuils
restent en mémoire jusqu'au rechargement. Aucune écriture Supabase ni modification
des politiques du module de production n'est effectuée.

## Journées de calcul et repos longs

La lecture est unique : les boutons « 24 h glissantes » et « Depuis le dernier
repos long » ont été retirés. Une interruption atteignant le repos continu minimal
configuré (6 h initialement) clôture la journée de calcul **au début de ce repos**.
La suivante commence **au même instant**, et comprend donc ce repos avant la
reprise du travail. La coupure n'est placée ni à minuit ni à la fin du repos.
Un repos plus court ne remet pas le compteur à zéro.

Exemple : le 13 octobre, 06:00–12:00 et 13:00–18:30 ; le 14 octobre,
02:00–07:00, 08:00–12:00 et 18:00–22:00.

- La journée précédente va du **13 à 18:30 au 14 à 12:00** : 9 h de travail,
  8 h 30 de repos calculé ; elle est clôturée à 12:00.
- La suivante va du **14 à 12:00 à 22:00** : 6 h de repos puis 4 h de travail.
  Son repère de 24 h est le 15 à 12:00 ; aucun repos futur n'est présumé.
- Aucun de ces cumuls de travail ne dépasse 12 h : aucun repère de dépassement
  du travail n'est ajouté à 21:00.

Le graphique montre les bornes et le cumul de la journée courante, les journées
clôturées concernées et le repos qui déclenche la coupure. Le contrôle de travail
porte sur la journée de calcul la plus chargée touchant la fenêtre analysée :
un dépassement antérieur ne disparaît pas lorsqu'une nouvelle journée commence.
Les bandes d'écart sont calculées indépendamment par journée, puis réunies.
Sans précédent connu, le départ est candidat et les valeurs restent à confirmer.

Ce découpage est la convention fonctionnelle demandée pour la **préversion**.
Il ne constitue pas une interprétation juridique automatiquement applicable à
tous les navires. Le cumul brut sur 24 h reste affiché séparément ; le repos total
sur 24 h, le fractionnement et les cumuls sur sept jours restent des contrôles
distincts. Dans l'exemple, le brut est de **13 h de travail et 11 h de repos**,
avec trois interruptions : 4 h, 1 h et 6 h. Le contrôle du nombre de périodes
peut donc encore signaler un autre écart si le seuil vaut 2 et l'historique est
attesté. Un repos continu de 6 h ne dispense pas à lui seul du repos total requis.

L'[article L5544-15 du Code des transports](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000023086525/LEGISCTA000023074211/2026-06-04/)
traite distinctement du repos total par période de 24 h, de son fractionnement et
du repos continu. L'[observation de l'OIT sur les contrôles de repos](https://normlex.ilo.org/dyn/nrmlx_fr/f?p=NORMLEXPUB%3A13100%3A0%3A%3ANO%3A%3AP13100_COMMENT_ID%2CP13100_LANG_CODE%3A3240333%2Cen)
explique le risque d'omettre des écarts si seules les fenêtres commençant au repos
principal sont examinées. Les RPC et politiques de production restent les
références opérationnelles pour les vrais comptes ; leur calcul est inchangé.

## Seuils et amplitude

Dans **Conformité → Modifier les seuils**, huit paramètres restent réglables :
travail maximal par journée de calcul (12 h), repos sur 24 h (10 h), repos continu
(6 h), travail sur sept jours (84 h), repos sur sept jours (77 h), nombre de
périodes de repos (2), intervalle entre repos (14 h) et amplitude (14 h).
Le champ technique historique `maxWork24Hours` représente désormais le plafond
par journée de calcul dans cette préversion et son libellé visible l'explicite.
Les seuils sont illustratifs ; le régime applicable n'est pas choisi automatiquement.
Le coefficient **congés/repos reste 1,05**. La moyenne de 11 h nécessite un cycle
défini et n'est pas transformée en plafond quotidien.

L'exemple initial du 13 octobre comprend 06:00–12:00 enregistré et 13:00–20:00
à enregistrer : 13 h de travail dans une même journée de calcul. Le seuil de 12 h
est atteint à 19:00 et la bande d'écart couvre 19:00–20:00. Passer le plafond de
travail à 14 h retire cet écart sans modifier les heures. Le calcul est immédiat
pendant la sélection et l'ajustement des bords.

L'amplitude est mesurée entre le premier et le dernier travail d'une séquence,
avec un nouveau départ après le repos continu minimal. L'exemple 04:00–08:00,
12:00–16:00, 22:00–24:00 donne les amplitudes 12 h et 2 h ; le maximum est 12 h.
Passer le repos minimal à 7 h rejoint les séquences et donne 20 h d'amplitude.
Le début réel d'une séquence engagée la veille est conservé ; les plages futures
après la fin analysée ne sont pas incluses.

Les chevauchements sont fusionnés avant les calculs. Les fenêtres brutes de 24 h
et de 168 h se terminent à la dernière plage sélectionnée, ou enregistrée du jour.
La frise suit l'horloge locale ; les calculs utilisent le temps écoulé. Le jeu
fictif atteste la couverture du 6 octobre à 00:00 au 14 octobre à 00:00. En dehors
de ces bornes, les contrôles restent à confirmer. Une journée vide n'atteste pas
un repos. Le contrôle porte sur les fenêtres affichées, pas sur toutes les
fenêtres possibles du registre.

## Saisie jour et tableau mensuel

Un repos final attesté atteignant le seuil ouvre également la nouvelle journée
avec 0 h de travail avant toute reprise. Une date vide ou un historique incomplet
ne suffit pas à attester ce repos.

La grille jour conserve ses 48 cases de 30 minutes et les graduations à chaque
heure, de 00 h à 24 h. Chaque période à enregistrer dispose d'une poignée de début
et de fin. Les glisser ajuste les heures sans supprimer la période ; les autres
périodes sont conservées. La durée minimale est de 30 minutes, les limites sont
00:00 et 24:00, et les bords s'arrêtent aux périodes voisines. Les cibles de début
et de fin sont distinctes même à une frontière commune ou sur une plage de 30 min.

Les flèches déplacent le bord de 30 minutes ; Home/End rejoignent les bornes
accessibles. Échap, une annulation du pointeur ou une perte de capture annulent
le glissement. Les poignées sont absentes en lecture seule ou pendant une
correction enregistrée, et désactivées durant l'enregistrement.
L'option `allowPhaseResize` reste désactivée par défaut dans le composant partagé :
seule cette préversion l'active.

La vue mois affiche **un graphique pour chaque jour dans le tableau**, sur un axe
commun 00–24 h. Les heures enregistrées et à enregistrer sont distinguées, et le
total évite le double compte. Les périodes traversant minuit sont réparties entre
les lignes. Une ligne vide indique l'absence de saisie, sans certifier le repos.
Ouvrir une journée ou changer de mois conserve les brouillons. Sur mobile, le
sélecteur de date reste visible et la frise défile à l'intérieur du tableau.
Les périodes traversant l'heure répétée d'un changement d'heure conservent leurs
bornes réelles, une indication explicite et une durée calculée en temps écoulé.

Les autres parcours sont conservés : sélection multiple, brouillon, correction,
retrait motivé, équipage, import XLSM, signature, justification et réouverture.
Une validation n'efface pas les écarts. Les états et signatures sont fictifs.
Les droits Marin/Capitaine se vérifient dans le code, les RPC/RLS et les fixtures
des vrais profils, jamais depuis une simulation de rôle de la session courante.

## PDF

Les deux exports reçoivent uniquement les périodes enregistrées, leurs commentaires
et les états/signataires courants. Les périodes en attente, seuils, diagnostics,
repères et bandes d'écart ne leur sont jamais transmis. Les commentaires saisis
restent exportés. Les exports du module de production sont inchangés.

## Développement et vérification

Utiliser pnpm 10.34.5 via Corepack : `corepack pnpm dev --host 127.0.0.1 --port 5192
--strictPort`, puis ouvrir `http://127.0.0.1:5192/previews/working-time.html`.
Aucune migration, dépendance ou variable d'environnement nouvelle n'est nécessaire.

Vérification : tests du module, lint ciblé, compilation TypeScript et build de
production ; QA navigateur desktop 1440 × 1024 et mobile 390 × 844, bords de plages,
graphiques mensuels, bornes de calcul, changement de seuils et PDF limités aux
heures enregistrées. La comparaison visuelle est consignée dans `design-qa.md`.
