# Déploiement ciblage navire et personnes — v3.28.6

Date : 3 septembre 2026

- le mode `Un ou plusieurs navires` propose une sélection de navires et une sélection nominative complémentaire ;
- l'aperçu déduplique les personnes déjà incluses par le planning ;
- la diffusion enregistre l'union des affectations du planning et des personnes ajoutées ;
- la note conserve le périmètre `vessels` et reste classée sous chaque navire sélectionné dans la bibliothèque ;
- le périmètre affiché dans la fiche et le PDF mentionne le nombre de personnes ajoutées.

La migration `20260903075755_service_note_combined_vessel_people_targeting.sql` met à jour les fonctions protégées de sauvegarde et de résolution des destinataires. Aucun nouveau droit de table n'est accordé.
