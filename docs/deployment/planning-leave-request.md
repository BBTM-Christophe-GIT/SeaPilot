# Planning — demande de congés dédiée

« Demander des congés » ouvre les champs Marin et Type, le choix de période,
les soldes compacts et le Motif, avec Annuler et Envoyer la demande. Le centre de conflits, ses indicateurs,
sa liste de demandes et le bouton Nouvelle demande restent hors de cette fenêtre.

La fenêtre limite sa largeur à 1 040 px. Les cartes Congés et RTT conservent leurs
couleurs, illustrations et jauges circulaires de 116 px, avec une typographie et des
espacements réduits. Le motif facultatif suit les soldes ; les actions restent dans
le pied de fenêtre pendant le défilement. Sur mobile, les compteurs s'empilent.

Le bouton **Période** ouvre un calendrier : un clic choisit une journée, deux clics
choisissent les bornes d'une période, dans n'importe quel ordre. Deux mois sont
affichés lorsque la largeur le permet, un seul sur mobile. Les changements restent
temporaires jusqu'à **Appliquer** ; **Annuler** ou Échap ferme seulement le calendrier
et restitue le focus au bouton. Le clavier permet de parcourir les jours, semaines,
mois et années. Les horaires existants sont conservés et restent ajustables dans
une section repliée. Une fin à minuit correspond au lendemain du dernier jour
inclus ; les heures inexistantes lors d'un changement d'heure sont refusées.
L'envoi de la demande est suspendu tant que le calendrier est ouvert.

Seuls Christophe MINASSIAN et Sophie HAMEL utilisent les compteurs annuels Congés
et RTT. Pour toute autre personne, **Solde de Congés/Repos** affiche la valeur de la
vue Équipages au jour de saisie, même si la demande porte sur une période future.
Le calcul du Planning reste inchangé et les droits annuels ne sont pas applicables
aux marins. Le détail et la migration requise sont décrits dans
[planning-rtt-counters.md](./planning-rtt-counters.md). Le formulaire de traitement
P1.2 conserve ses champs de dates habituels.

La fiche RH du profil connecté est présélectionnée, même si elle arrive après
l'ouverture ou ne figure pas dans les personnes du planning affiché. Les managers
peuvent sélectionner une autre personne. Pour Marin et Capitaine, le choix reste
limité au profil connecté. Sans fiche associée, aucun autre marin n'est choisi
automatiquement. La fenêtre se ferme après enregistrement et actualisation réussis ;
un échec conserve les champs saisis.

La liste Marin de cette fenêtre ne propose que les fiches actives encore en poste
à la date locale du jour : embauche non future et départ non atteint. Une date
d'embauche non renseignée reste compatible avec une fiche active sans départ.
Le filtre ne dépend pas du mois de planning consulté ni des dates de congés saisies.
Il s'applique aussi au profil connecté ajouté hors planning ; une sélection devenue
inéligible après actualisation est vidée et l'envoi est désactivé. Les fiches RH et
les demandes historiques sont conservées. Aucune migration supplémentaire requise.

Le type Indisponibilité est retiré du formulaire partagé. Les anciens enregistrements
sont lus comme des Congés et convertis en base par la migration
`20260910132240_normalize_planning_unavailability_to_leave.sql`. Un trigger normalise
également les écritures des anciens clients avant le contrôle du type. Les RPC et
les politiques RLS existantes conservent leurs contrôles de périmètre et de profil.

Les statuts internes historiques `Vacance` restent compatibles avec les RPC et les
imports. Leur libellé affiché devient Congés : barres du planning, cases journalières,
statuts, filtres, infobulles et messages de déplacement.

## Déploiement et validation

- Version 3.67.3 : 155 tests ciblés sur neuf fichiers réussis (calendrier, modèle
  de période, demande, soldes, P1.2, requêtes, calcul partagé Équipages et préversion).
  `corepack pnpm lint` et `corepack pnpm build` réussis. Recette navigateur en
  1440 × 900, 390 × 844 et 320 × 740 : jour seul, période, annulation et Échap,
  projection des compteurs, droits dans une fenêtre séparée et affichage crew
  indépendant des dates de demande. Aucun débordement dans la fenêtre ou le
  calendrier et aucune erreur console. Les vrais profils Marin et Capitaine
  sont contrôlés par les fixtures Auth/RPC/RLS décrites dans la documentation
  des compteurs, sans utiliser une simulation de profil depuis la session Admin.
- Filtre des personnes en poste : 94 tests ciblés réussis sur le formulaire, le
  modèle Planning, le profil connecté et les consommateurs de ce profil. Les cas
  couvrent un départ passé ou le jour même, une fiche inactive, une embauche future,
  un départ futur, un planning historique et une sélection devenue inéligible.
  Recette Chrome locale en 1440 × 1100 et 390 × 844 avec une fiche active déjà partie :
  personne exclue, choix d'une personne en poste et annulation vérifiés, aucune erreur
  applicative. Browser plugin non disponible ; validation par Playwright.
- Migration appliquée à SeaPilot le 10 septembre 2026, avant le client : une demande
  convertie, zéro ancienne valeur restante, dix demandes conservées. L'empreinte
  des champs autres que le type et la date de mise à jour est identique avant/après.
  La conversion possède son entrée d'audit.
- Normalisation des écritures historiques et rejet d'un type invalide vérifiés dans
  une transaction annulée. RLS active ; aucun nouvel avis de sécurité lié au changement.
- `corepack pnpm test src/features/planning --reporter=dot --maxWorkers=1` :
  325 tests réussis, dont profils administrateur, Marin et Capitaine, arrivée tardive
  du profil, conservation du choix explicite, erreur d'enregistrement et annulation.
- `corepack pnpm lint` et `corepack pnpm build` réussis.
- Recette Playwright/Chrome sur la route Planning en 1440 × 1100, 390 × 844 et
  320 × 740 : formulaire seul, profil connecté présélectionné, types disponibles,
  annulation/réouverture, Échap, focus et affichage Congés dans le planning.
  Aucun débordement horizontal ni erreur applicative. En local, la requête automatique
  vers `favicon.ico` renvoie une 404 indépendante de ce parcours.
