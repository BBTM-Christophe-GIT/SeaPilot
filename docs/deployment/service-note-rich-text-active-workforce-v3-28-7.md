# Déploiement mise en forme et effectifs actifs — v3.28.7

Date : 3 septembre 2026

- le message d'une note de service utilise un éditeur riche avec Aptos par défaut et une barre d'outils accessible ;
- l'aperçu et le PDF commun reprennent la mise en forme nettoyée ;
- le sélecteur nominatif expose toutes les fiches RH courantes liées à un compte SeaPilot actif ;
- les anciens collaborateurs, les fiches sans compte, les comptes inactifs et l'émetteur restent exclus de la liste, de la diffusion et du registre de signatures.

La migration `20260903082732_service_note_rich_text_active_workforce.sql` remplace les deux fonctions protégées de ciblage. Elle n'ajoute ni table ni droit anonyme. Les balises et styles du corps sont nettoyés dans l'application avant affichage et avant génération PDF.
