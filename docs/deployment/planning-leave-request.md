# Planning — demande de congés dédiée

« Demander des congés » ouvre uniquement les champs Marin, Type, Début, Fin et
Motif, avec Annuler et Envoyer la demande. Le centre de conflits, ses indicateurs,
sa liste de demandes et le bouton Nouvelle demande restent hors de cette fenêtre.

La fiche RH du profil connecté est présélectionnée, même si elle arrive après
l'ouverture ou ne figure pas dans les personnes du planning affiché. Les managers
peuvent sélectionner une autre personne. Pour Marin et Capitaine, le choix reste
limité au profil connecté. Sans fiche associée, aucun autre marin n'est choisi
automatiquement. La fenêtre se ferme après enregistrement et actualisation réussis ;
un échec conserve les champs saisis.

Le type Indisponibilité est retiré du formulaire partagé. Les anciens enregistrements
sont lus comme des Congés et convertis en base par la migration
`20260910132240_normalize_planning_unavailability_to_leave.sql`. Un trigger normalise
également les écritures des anciens clients avant le contrôle du type. Les RPC et
les politiques RLS existantes conservent leurs contrôles de périmètre et de profil.

Les statuts internes historiques `Vacance` restent compatibles avec les RPC et les
imports. Leur libellé affiché devient Congés : barres du planning, cases journalières,
statuts, filtres, infobulles et messages de déplacement.

## Déploiement et validation

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
