# Pastilles d’échéance par navire — 3.76.3

Les icônes du Registre LSA, du Registre des Apparaux de levage et du Registre des Remorques affichent les mêmes couleurs que l’Inventaire Pharmacie : orange pour les matériels dont l’échéance est entre aujourd’hui et J+30 inclus, rouge pour une échéance dépassée. Chaque matériel est compté une seule fois dans son registre. Une date absente ou invalide ne produit aucune pastille. Un résultat nul n’affiche pas de zéro.

Le LSA lit uniquement l’échéance courante `lsa_items.expires_on` des fiches non supprimées. Les anciennes versions et les événements de renouvellement ne sont pas comptés. Les apparaux et les remorques lisent `lifting_inventory.inspection_due_on` des matériels actifs, séparément par `kind` ; les brouillons et les rapports de contrôle historiques ne créent aucun doublon. Les seuils existants des fiches et synthèses restent inchangés (90 jours pour les fiches LSA, 60 jours pour les fiches de levage). Les nouvelles pastilles utilisent 30 jours. Le module Grue n’est pas modifié.

Les lectures compactes sont paginées et soumises aux politiques RLS existantes. Les compteurs portent sur tous les navires accessibles et restent indépendants du navire choisi, des filtres, de la recherche et de la vue Inventaire/Rapports. Aucun nouvel accès, aucune migration et aucune donnée réelle ajoutée aux aperçus publics.

Le calcul utilise le calendrier Europe/Paris. Les compteurs sont actualisés après une modification, au retour sur la fenêtre et toutes les 30 secondes lorsque la page est visible. Les réponses d’un ancien client ou registre sont ignorées. Si la lecture échoue, les compteurs sont indisponibles et un message permet de réessayer ; une erreur n’est jamais remplacée par un faux zéro.

Les pastilles possèdent des descriptions accessibles et les cartes conservent la sélection au clavier ainsi que le tri existant par longueur. Les aperçus utilisent des échéances fictives pour illustrer les deux états, avec des comptages distincts entre apparaux et remorques.

Validation du 21 octobre 2026 : 153 tests ciblés réussis (18 fichiers : LSA, levage, calculs, rafraîchissement et manuel), ESLint et build de production réussis. Les tests couvrent J0/J30/J31, le calendrier Paris, les dates inconnues, les matériels retirés, la pagination au-delà de 1 000 matériels, les erreurs sans faux zéro et les réponses tardives. La lecture lente peut finir sans être remplacée par chaque intervalle de rafraîchissement. Les politiques RLS et fixtures de profils existantes ont été relues ; aucun changement d’accès ni de stockage.

Recette Playwright/Edge (plugin Browser indisponible) sur les trois routes à 1366 × 768 et 390 × 844 : pastilles présentes, séparation des registres, compteurs inchangés après sélection, recherche et filtre, navigation clavier et coche visible, aucun débordement horizontal ni erreur applicative. Scripts et captures conservés hors dépôt ; la recette utilise uniquement les données fictives de l’aperçu.
