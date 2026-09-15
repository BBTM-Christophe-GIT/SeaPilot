# SILAE — personnes supplémentaires (3.39.11)

L’export inclut désormais les trois personnes demandées malgré leur grade Sédentaire :

| Personne | Matricule RH | Fonction SILAE | Code ENIM | Catégorie |
| --- | --- | --- | --- | --- |
| Benjamin BON | 00001 | Capitaine | AA01A | 15 |
| Antoine MONCEAUX | 00019 | Capitaine | AA01A | 15 |
| Julien LECOCQ | 00002 | Chef Mécanicien | CB01A | 15 |

Les exceptions utilisent le prénom et le nom normalisés et ne dispensent pas des contrôles d’emploi actuel. Les fiches RH ne sont pas modifiées. Les fonctions temporaires maritimes continuent à déterminer le code et la catégorie pendant leur période ; les anciennes valeurs génériques Équipage/crew ou la fonction de bureau Président ne les remplacent pas.

Les trois noms sont cochés dans la liste modifiable et la confirmation reste obligatoire avant de télécharger. Le classeur conserve ses cellules texte et les zéros initiaux des matricules.

La ligne Armement - Cherbourg n’a pas d’immatriculation. Pour les journées qui lui sont affectées, le contrôle NumNavire reste applicable : aucune immatriculation n’est inventée. Une valeur ou une règle utilisateur reste à préciser pour les journées à terre de Benjamin BON et Julien LECOCQ. Les anomalies sont visibles avant confirmation et la sélection reste modifiable.

Validation : éligibilité nominative, exclusions des anciens et autres sédentaires, fonctions par période, confirmation modifiable, données RH inchangées et contenu XML du classeur avec les trois matricules/codes/catégories en texte. Aucun changement de schéma ou de droits.

53 tests ciblés SILAE réussis, lint et build de production validés. Contrôle navigateur à 1440 × 1000 et 390 × 844 sur un planning de test explicitement associé à un navire de test ; le fichier téléchargé contient 1 928 cellules texte, avec les matricules 00001/00002/00019 et les classifications attendues. Les données de production ont été consultées en lecture seule pour vérifier l’identité, le grade et les affectations.
