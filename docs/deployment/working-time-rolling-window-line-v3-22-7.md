# Suivi du temps — ligne des 24 heures glissantes v3.22.7

## Résultat utilisateur

- Le 17 août reste le seul jour affiché en alarme pour Arthur MAREST.
- Le 18 août reste neutre, n’est pas coloré en rouge et ne demande aucune justification.
- La portion de la fenêtre fautive qui recouvre le 18 août est représentée par une fine ligne rouge directement dans la frise de saisie 00h–24h.
- La ligne indique `J−1 06:30` comme origine et `fin 06:30` comme borne sur le 18 août ; le détail du contrôle et son attribution au 17 restent accessibles au survol et aux lecteurs d’écran.

## Rendu attendu

Pour la fenêtre du 17 août à 06:30 au 18 août à 06:30, la ligne rouge s’étend de 00:00 à 06:30 dans la frise du 18. Elle matérialise l’impact résiduel sans transformer le 18 en seconde non-conformité.

## Vérification

- Test de l’attribution de l’alarme au 17 août uniquement.
- Test du jour 18 neutre et sans fiche de justification.
- Test du libellé `J−1 06:30`, de la borne `fin 06:30` et d’une largeur de ligne correspondant à 6 h 30 sur 24 heures.
- Contrôle visuel de la frise journalière sur la préversion Vercel.
