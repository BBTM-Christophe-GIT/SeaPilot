# Déploiement registre de signatures — v3.28.5

Date : 3 septembre 2026

- signature avec image : image et libellé `Signé le : JJ/MM/AAAA`;
- signature enregistrée sans image : pastille verte `Signé` et date;
- validation historique archivée : image lorsqu'elle existe, sinon pastille verte, sans date;
- suppression des libellés `Signé le Non renseignée`, `Signature historique validée` et de l'explication d'absence d'image.

La règle est partagée entre l'aperçu HTML et le PDF téléchargé. Aucun changement de schéma ou de donnée Supabase n'est requis.
