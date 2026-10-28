# Noms et repères des zones sur les cartes

Version 3.80.11 — 28 octobre 2026.

Les cartes Projet et Opération en Mer, ainsi que leurs exports PDF, affichent
le nom de chaque zone dans son étiquette. Les noms longs passent sur plusieurs
lignes ; une zone sans nom utilise « Zone N ». Les références des sommets et des
tableaux conservent leurs identifiants stables Z1.1, Z1.2, etc.

Chaque trait de repère rejoint un sommet réel du polygone. Le placement favorise
des sommets non communs et éloignés des repères déjà utilisés, lorsque la géométrie
le permet. Les zones et leurs coordonnées ne sont pas déplacées. Les étiquettes
évitent les autres noms, les points et les repères de la carte.

Le calcul reste borné et intervient lors du placement des étiquettes ; la caméra
conserve le déplacement et le zoom existants pendant les interactions à la souris.
