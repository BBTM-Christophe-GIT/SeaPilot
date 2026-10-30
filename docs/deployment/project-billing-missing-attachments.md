# Justificatifs indisponibles dans les exports de facturation

Version `3.80.20`, build `2026-10-30.002`.

## Diagnostic

La disponibilité du dossier SeaPilot dans Administration confirme la racine
locale, mais pas l'existence de chaque pièce jointe historique. Un export ZIP
doit lire toutes les pièces des frais sélectionnés ; une seule pièce absente
empêchait l'export et affichait seulement le message générique du lanceur.

Le cas signalé sur P144 en octobre 2026 concerne trois anciens justificatifs
référencés uniquement dans le dossier Drive local. Le dossier est accessible et
le lanceur installé est compatible, mais les trois fichiers enregistrés sont
absents. Ils ne disposent pas d'une copie privée activée dans le registre.
Changer la configuration du dossier ou réinstaller le lanceur ne restaure pas
ces fichiers.

## Comportement corrigé

L'export collecte les erreurs des pièces sélectionnées et indique les noms de
tous les justificatifs indisponibles. Il ne génère aucun ZIP ni PDF fusionné
incomplet. Le PDF seul reste disponible sans lecture des pièces jointes.

Le mode PDF avec annexes ne télécharge que les documents PDF, identifiés par
leur type MIME ou leur extension. Une image ou un document bureautique non PDF
ne peut plus bloquer ce format. Le ZIP inclut toujours tous les formats des
justificatifs sélectionnés. Les frais exclus et l'option globale d'inclusion
restent respectés.

Les copies privées autorisées restent prioritaires sur les anciens reçus Drive.
Les contrôles d'accès et d'intégrité sont conservés, sans repli après un refus
ni suppression d'une pièce absente. Aucune donnée de facture n'est modifiée.

## Rétablissement des fichiers

Pour produire un ZIP complet lorsque des originaux sont absents, rétablir les
fichiers exacts dans le dossier historique ou ajouter de nouveau les justificatifs
depuis les frais du projet. Vérifier leur identité et leur intégrité avant de
modifier une référence. Les originaux ne doivent pas être remplacés par des PDF
reconstitués à partir des montants de la facture.

Aucune migration, nouvelle dépendance ou mise à jour du lanceur n'est requise.
