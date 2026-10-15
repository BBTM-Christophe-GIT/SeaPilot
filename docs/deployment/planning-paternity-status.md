# Planning — statut Congés Paternité

Version `3.75.6`, build `2026-10-15.011`.

Le statut canonique **Congés Paternité** est proposé pour les journées, les
groupes de journées, les affectations et les postes fictifs. Les variantes de
casse et d'accents sont normalisées. L'ancien libellé « Congés Paternités » est
également reconnu, sans réécriture des données historiques. La grille conserve ses fonctions de
copier-coller et de déplacement avec ce statut. Un filtre dédié permet de
retrouver les congés paternité en vue Équipages, y compris lorsqu'ils sont
saisis à la journée dans une affectation en mer. La recherche porte sur les
jours effectifs dans la plage affichée. Son dessin reprend la palette des congés.

## Solde de la vue Équipages

| Statut | Contribution de la journée |
| --- | ---: |
| Congés Paternité | 0,00 |
| Arrêt Maladie | 0,00 |
| Accident du Travail | 0,00 |
| Congés ordinaires | −1,00 |

Zéro est une **variation quotidienne**. Le solde cumulé n'est pas remis à zéro :
avec une référence de 10,00, trois journées successives de paternité, maladie et
accident du travail laissent le solde à 10,00. Une journée de congés ordinaires
suivante le fait passer à 9,00 ; une journée en mer le ferait ensuite passer à
10,05. Les règles de priorité des sources, de conflits, de référence en fin de
journée et de période d'emploi sont conservées.

Cette règle s'applique aux statuts d'affectation, aux périodes historiques et
aux corrections journalières. Le statut n'est pas un nouveau type de demande
d'absence P1.2 et ne remplace pas le circuit existant d'approbation des congés.
Aucune durée réglementaire ni règle de paie n'est déduite de cette demande.
SILAE conserve un statut « à préciser » faute de correspondance fournie ; le
calendrier personnel continue de masquer le motif sous « Indisponible ».

## Serveur et déploiement

La migration `20261015135510_planning_paternity_status.sql` étend uniquement les listes de statuts
des validateurs existants : `save_planning_assignment_day_details`,
`apply_planning_grid_cells` et `planning_save_generic_crew_row`. Les RPC de
plages, les variantes historiques, le copier-coller, le déplacement et la
résolution des postes fictifs réutilisent ces contrôles. Le statut Accident du
Travail devient également disponible pour les postes fictifs.

Appliquer la migration serveur avant la version frontend. Les contrôles de
société, d'autorisation, de révision, de conflit et d'historisation restent en
place. Les profils Marin et Capitaine conservent la lecture du Planning publié,
sans édition ni accès à la vue Équipages. Le compteur est calculé dans le
frontend à partir des références existantes ; aucun historique n'est réécrit.

La migration a été appliquée le 15 octobre 2026 sur le projet SeaPilot avant
le déploiement frontend. Les propriétaires, autorisations, chemins de recherche
et modes de sécurité des trois fonctions sont identiques avant et après ; les
constats de l'audit de sécurité Supabase restent identiques. La migration accepte
les deux définitions précédentes connues et s'arrête sans modification partielle
si elle rencontre une définition inattendue.

## Vérification

Les tests TypeScript couvrent la normalisation, les sélecteurs, le filtre,
l'affichage des cellules, le poids des trois statuts et la reprise du cumul
après une journée de congés ordinaires. Les intégrations Planning vérifient la
saisie d'une journée et d'une période et un solde restant à 10,00 pendant les
trois journées neutres.

Les tests SQL utilisent des comptes authentifiés distincts, des sociétés
différentes et les RPC réelles dans une base locale isolée. Ils vérifient les
enregistrements, les plages, la grille, les postes fictifs, les refus pour les
profils de lecture et le maintien des contrôles existants. Ils passent sur la
définition Git et sur l'ancienne définition déployée qui autorisait le libellé
pluriel. Les régressions journées, postes fictifs, soldes et calendrier personnel
passent également.

La recette navigateur utilise les composants de production avec des données
de test hors production, avec des comptes de test Marin et Capitaine distincts
de l'administrateur. Elle vérifie la saisie, l'actualisation, les trois journées
à contribution nulle, le filtre des libellés ancien et canonique et l'affichage
sur ordinateur et tablette. Le Browser plugin local n'étant pas disponible, elle
utilise le Playwright fourni sans nouvelle dépendance. Aucune note de mise à
jour intégrée n'est ajoutée, conformément aux règles du projet.
