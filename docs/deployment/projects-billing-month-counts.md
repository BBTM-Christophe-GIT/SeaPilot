# Projet — classement mensuel des saisies et compteurs

## Chronologie du projet

Dans **Projets → Facturation**, la chronologie reprend les mois pour lesquels
une facture client est renseignée, les changements de loyer d’affrètement et
la date de fin enregistrée sur le dossier. L’ouverture d’une fiche mensuelle
pour préparer un relevé ne suffit pas à faire apparaître un mois facturé.

Les dates et références de facture sont enregistrées sur la fiche mensuelle.
Pour les loyers, les services refacturables, les prestations BBTM et la saisie
brute, les sélections d’export restent modifiables. Le statut facturé d’une
ligne nécessite le rattachement de cette ligne à la facture client émise.

## Classement des lignes et compteurs

Les saisies brutes sont affichées selon leur date de prestation, dans les bornes
inclusives de la période sélectionnée. Le tableau, sa pastille, son sous-total,
le relevé et l'export PDF utilisent les mêmes lignes. Une ligne datée d'octobre
enregistrée auparavant depuis septembre apparaît ainsi en octobre, même si la
fiche d'octobre n'existe pas encore. Une période personnalisée peut couvrir
plusieurs mois.

L'enregistrement d'une ligne crée ou réutilise la fiche du mois de sa date de
prestation. Une modification de date qui fait sortir la ligne de la période
affichée la retire du tableau après un enregistrement réussi, sans modifier les
paramètres de la facture affichée.

Les cinq catégories sont déroulées à l'ouverture et à chaque changement de mois
ou de projet. Elles restent repliables manuellement. Chaque titre est précédé
d'une pastille verte indiquant le nombre d'enregistrements : journées de
loyers, services refacturables, prestations BBTM enregistrées, saisies brutes et documents du
suivi de facture. Le compteur reste visible à zéro. Une ligne brute vierge
proposée automatiquement ne compte pas comme un enregistrement et ne bloque pas
le PDF ; toute saisie ou ligne ajoutée explicitement conserve la protection
contre un export contenant des modifications non enregistrées.

Aucune migration de données, de schéma ou de droits n'est requise. Les anciennes
associations de fiche ne gouvernent plus le classement des saisies brutes ; elles
sont corrigées lors d'un prochain enregistrement de la ligne.

Validation : tests d'intégration septembre/octobre (associations historiques
erronées, mois sans fiche, changement de date et export), tests des lignes brutes,
vérification du rendu sur ordinateur et mobile, et compilation de production.
