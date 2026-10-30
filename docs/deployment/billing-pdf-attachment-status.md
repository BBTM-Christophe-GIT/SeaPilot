# PDF de facturation et état des justificatifs

Version `3.80.21`, build `2026-10-30.003`.

## Génération du PDF

Le PDF standard est produit sans lire les pièces jointes. Une vérification
des justificatifs en cours ou en échec ne bloque pas ce format.

Le mode PDF avec annexes lit les justificatifs PDF sélectionnés, vérifie leur
contenu et ajoute uniquement les annexes exploitables. Une pièce manquante,
inaccessible, vide, incomplète ou illisible n'empêche plus la génération du PDF.
Le résultat indique les pièces non jointes et met à jour leur état dans Services
refacturables. Les montants, lignes sélectionnées, références et calculs de
facturation restent inchangés ; aucune facture ni annexe n'est reconstituée.

Le format ZIP + toutes les pièces reste complet : il conserve tous les formats
sélectionnés et signale les pièces requises indisponibles avant l'assemblage.
La présence d'un PDF dans le ZIP ne prouve pas qu'il peut être fusionné ; ce
transfert ne remplace pas un diagnostic de lisibilité déjà établi.

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

## Données et déploiement

Aucune référence métier, copie historique ou pièce indisponible n'est supprimée.
Les vérifications et les avertissements sont propres à la consultation en cours.
Aucune migration, nouvelle dépendance ni mise à jour du lanceur n'est requise.

Cette version remplace la règle de blocage des PDF fusionnés documentée dans
[la version 3.80.20](./project-billing-missing-attachments.md). Le rétablissement
des originaux reste nécessaire pour joindre toutes les pièces ou produire un
ZIP complet ; il n'est plus nécessaire pour produire le PDF demandé.
