# Projets : dates facultatives et enregistrement du brouillon

Les actions **Créer le projet** et **Enregistrer le brouillon** acceptent un projet
sans dates de début, de fin, de livraison ou de restitution. Une seule borne peut
également être renseignée. Le nom du projet reste obligatoire et les contrôles de
cohérence des dates saisies restent actifs.

Une première opération est créée automatiquement uniquement si le navire principal,
la livraison et la restitution sont tous renseignés. Sinon, le projet est enregistré
sans opération ; celle-ci pourra être ajoutée ensuite depuis le projet ou le planning.
Les dates de livraison et de restitution ne portent plus d’astérisque obligatoire.

Le bouton de brouillon transmet explicitement le statut **Non validé**, sans modifier
le statut sélectionné dans le formulaire avant que la sauvegarde ait réussi.
Les projets créés normalement conservent le statut choisi.

Dans l’aperçu et le PDF de l’offre commerciale, la ligne **DURÉE FERME** est absente
tant que les deux dates du projet ne sont pas renseignées. Cela vaut également pour
la version anglaise (**FIRM PERIOD**). La ligne **CARBURANT** remonte à sa place,
sans laisser de ligne vide. Une fois les deux dates saisies, la durée calendaire
inclusive réapparaît.

La mission et les fichiers saisis pour une première opération ne sont jamais abandonnés
silencieusement : si les informations nécessaires à cette opération manquent, le
formulaire invite à reporter la mission dans **Identification** et les pièces jointes
dans **Documents**, ou à compléter
l’opération avant l’enregistrement.

## Déploiement et validation

Aucune migration ni nouvelle variable d’environnement : la fonction `projects_save`
accepte déjà les dates nulles et conserve les contrôles de société et de rôle.

- Tests de formulaire : brouillon et création sans dates, une seule date, absence de
  navire, statut choisi, échec puis nouvelle tentative, et création automatique
  d’une opération complète.
- Test de mutation : transmission de dates et navires absents sous forme de `null`.
- Tests d’aperçu et du contenu réel des PDF français et anglais : aucune date,
  début seul, fin seule, intervalle complet et journée unique.
- Vérification du module Projets et compilation de production avec pnpm 10.34.5.
