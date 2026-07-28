# SeaPilot v3.6.17 — pagination des périodes du planning

## Objet

La lecture de `planning_periods` est désormais paginée par lots de 500 lignes. Cela évite la limite de réponse Supabase de 1 000 lignes et rend l’intégralité de l’import BBTM 2024–2026 disponible dans le calendrier et les documents du planning.

## Validation

- tri stable par date, marin et identifiant ;
- test automatisé couvrant un résultat de plus de 500 périodes ;
- recette attendue en production sur une date de l’import BBTM ;
- version applicative : `3.6.17` ;
- build : `2026-07-28.1558`.
