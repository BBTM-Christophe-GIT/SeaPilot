# PDF de facturation et état des justificatifs

Version `3.80.22`, build `2026-10-31.001`.

## Génération du PDF

Le PDF standard est produit sans lire les pièces jointes. Une vérification
des justificatifs en cours ou en échec ne bloque pas ce format.

Le mode PDF avec annexes lit les justificatifs PDF sélectionnés, vérifie leur
contenu et ajoute uniquement les annexes exploitables. Une pièce manquante,
inaccessible, vide, incomplète ou illisible n'empêche plus la génération du PDF.
Le résultat indique les pièces non jointes et met à jour leur état dans Services
refacturables. Les montants, lignes sélectionnées, références et calculs de
facturation restent inchangés ; aucune facture ni annexe n'est reconstituée.

Le ZIP contient la synthèse et toutes les pièces sélectionnées disponibles,
quel que soit leur format. Les pièces manquantes, incomplètes ou inaccessibles
ne bloquent plus son téléchargement. Après un export PDF avec annexes ou ZIP,
le message liste uniquement les noms des fichiers non intégrés. La présence
d'un PDF dans le ZIP ne prouve pas qu'il peut être fusionné ; ce transfert ne
remplace pas un diagnostic de lisibilité déjà établi.

## Tableau Services refacturables

Chaque fichier est accompagné de son état : disponible, manquant, invalide,
inaccessible ou copie locale à vérifier. Un frais sans pièce affiche l'absence
de justificatif. Les fichiers restent identifiables et leurs liens conservés.

Les copies accessibles en ligne sont vérifiées sans ouvrir le connecteur
Windows. Une ancienne pièce uniquement référencée sur Drive local n'est pas
déclarée manquante sur la seule absence de copie en ligne : elle reste à vérifier
sur ce PC. Le contrôle explicite des justificatifs ou l'export avec annexes
peut utiliser le lanceur après l'action de l'utilisateur.

Les changements de projet, compte, mois ou documents annulent les contrôles
devenus obsolètes. Une réponse tardive ne peut pas modifier l'état d'une autre
période. L'enregistrement de l'export ne supprime pas le diagnostic des annexes
du mois. Les erreurs d'autorisation ne sont pas présentées comme des fichiers
absents et ne déclenchent aucun contournement des contrôles d'accès.

## Affichage compact des pièces

Depuis la version `3.80.22` (build `2026-10-31.001`), chaque pièce occupe une
ligne compacte. Les noms longs utilisent une
ellipse ; le nom complet reste dans l'infobulle et le nom accessible du bouton.
Les fichiers en erreur ont une puce légèrement rouge et une pastille rouge
avec triangle blanc. Leur cause apparaît sous le fichier sur une seule ligne
synthétique. Aucun diagnostic visible n'est ajouté pour un fichier disponible
ou non vérifié. Le diagnostic complet reste disponible au survol et dans la
description accessible du fichier. Plusieurs pièces
restent présentées séparément et le bouton Ajouter conserve sa hauteur normale.
Sur mobile, le défilement horizontal reste contenu dans le tableau et les
commandes tactiles gardent leur taille minimale.

## Données et déploiement

Aucune référence métier, copie historique ou pièce indisponible n'est supprimée.
Les vérifications et les avertissements sont propres à la consultation en cours.
Aucune migration, nouvelle dépendance ni mise à jour du lanceur n'est requise.

Depuis la version 3.80.21, la règle de blocage des PDF fusionnés documentée dans
[la version 3.80.20](./project-billing-missing-attachments.md) est levée ; la
version 3.80.22 lève également le blocage des ZIP. Le rétablissement des
originaux reste nécessaire pour joindre toutes les pièces, mais plus pour
télécharger un PDF ou un ZIP avec les pièces disponibles.
