# SeaPilot v3.12.6 — interface de saisie du temps de travail

Date de livraison : 4 août 2026.

Cette étape livre la surface responsive de saisie et de recommandation du module
« Suivi du Temps de Travail ». Les recommandations réutilisent exclusivement les
politiques datées de `planning_work_rest_policies` et le moteur de fenêtres
glissantes déjà en production. Aucune valeur réglementaire n’est introduite par
l’interface.

## Saisie assistée

La page `/modules/workingTime` propose désormais :

- une navigation par semaine ou par mois, avec période précédente, suivante et
  retour à la période courante ;
- les filtres personne, navire, bordée et période autorisés par le profil ;
- une grille de 24 heures au pas de 30 minutes ;
- une sélection par clic-glissé, au clavier ou par saisie précise des heures de
  début et de fin ;
- les cartes Travail sur 7 jours, Repos consécutif, Alertes et Statut ;
- les badges Conforme, Alerte, Non conforme et Politique requise ;
- un panneau latéral réunissant les deux signatures et la décision de workflow.

Les éléments interactifs ont un focus visible, des libellés ARIA et des cellules
de grille annoncées comme travail enregistré, repos ou sélection courante.

## Recommandation autoritative

La RPC `working_time_interval_recommendation` simule un intervalle sans
l’enregistrer. Elle fusionne les chevauchements existants et hypothétiques puis
renvoie :

- le travail encore disponible sur 24 heures et sur 7 jours ;
- l’impact sur le repos total et le repos consécutif ;
- l’heure limite de fin compatible ;
- la prochaine reprise compatible ;
- la durée supplémentaire maximale recommandée et les règles enfreintes.

Le navigateur ne transmet que la personne, les horodatages, le fuseau, le
navire, la bordée et l’identifiant éventuel du créneau corrigé. Il ne fournit
aucun agrégat de conformité. Les contrôles d’accès de la RPC reprennent le
périmètre personnel, la bordée publiée du capitaine et les rôles de gestion.

Une personne déjà non conforme reçoit `0 h 00` comme durée supplémentaire
recommandée. La recommandation de reprise reste affichée. Une égalité exacte à
un minimum ou maximum configuré ne produit aucune violation.

## Vues par profil

- Marin : ses propres registres et sa saisie personnelle.
- Capitaine : ses registres, ceux de sa bordée publiée et le panneau de
  validation, sans auto-validation.
- Administrateur / Armement : périmètre de gestion et politiques datées selon
  les permissions existantes.

Les règles restent appliquées dans les RPC et les politiques RLS ; le filtrage
visuel n’est pas considéré comme un contrôle de sécurité.

## Migration et vérifications

La migration
`20260804124034_working_time_entry_recommendations.sql` ajoute les fonctions
privées de simulation d’intervalles fusionnés et la RPC publique de
recommandation, exécutable uniquement par les utilisateurs authentifiés et
autorisés.

Les vérifications couvrent les permissions, l’absence de persistance d’une
simulation, les limites exactes, la durée recommandée, l’heure limite, la
prochaine reprise et le cas déjà non conforme. La livraison inclut également les
tests React de la grille 48 cellules, de la navigation journalière, du clavier et
du contrat RPC, ainsi qu’un contrôle navigateur ordinateur/mobile sans erreur
console.
