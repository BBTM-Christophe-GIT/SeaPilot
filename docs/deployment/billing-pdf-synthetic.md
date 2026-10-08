# PDF Éléments de facturation

Version `3.71.1` applique le design **Tableau synthétique** choisi à l’export PDF du module Projets.

Le bandeau bleu contient uniquement le logo et **Éléments de facturation**. Le projet, le mois, la période et la référence client sont indiqués juste dessous. Le navire reste en tête lorsqu’aucune ligne brute n’est exportée ; lorsque ces lignes sont incluses, leurs navires figurent dans le tableau.

**Loyers d'Affrètement** occupe la colonne de gauche. **Frais imputables** puis **Prestations BBTM** partagent la colonne de droite. **Détail des Opérations** reprend les lignes brutes sur toute la largeur, avec Date, Navire, Désignation, Prix unitaire HT, Quantité et Prix Total HT. Le bandeau inférieur regroupe les sous-totaux sélectionnés et le total du mois, en conservant les montants distincts de chaque devise.

Depuis `3.71.3`, lorsque **Inclure les loyers** et **Inclure les prestations BBTM** sont toutes deux décochées, le tableau **Loyers d'Affrètement** est entièrement masqué, y compris son titre, ses en-têtes et son éventuelle ligne vide. Si les prestations BBTM restent incluses, les opérations DPR restent visibles sans montants de loyer lorsque les loyers sont exclus. Les frais, lignes brutes et totaux sélectionnés conservent leur affichage.

Depuis `3.71.2`, **Frais imputables** est présenté en arborescence : la valeur de la spécialité au premier niveau, puis les noms des sociétés en retrait au deuxième niveau, puis leurs factures avec Date facture, N° facture et Montant HT. Les deux premiers niveaux affichent uniquement leur valeur, sans les libellés « Spécialité » ou « Société ». Les factures d’une même société et d’une même spécialité sont réunies sous un seul nom.

Les groupes suivent l’ordre alphabétique français, puis les sociétés à l’intérieur de chaque spécialité. Les libellés exacts sont conservés, y compris les spécialités multiples ; des valeurs différentes ne sont pas fusionnées. Ce classement ne modifie ni la saisie ni l’ordre des données sauvegardées ou des calculs de totaux.

Le document tient sur une page A4 paysage. Le générateur mesure tous les textes et cellules avant de dessiner ; il ajuste ensemble les espacements et la typographie au volume de données. Les commentaires, noms, catégories, spécialités et références de facture passent à la ligne sans être raccourcis. Un export très dense emploie donc des caractères plus petits, et reste sélectionnable et agrandissable dans un lecteur PDF.

Le bloc Justificatifs, les mentions explicatives de pied de page, les marques de démonstration et le libellé **01 - TABLEAU SYNTHÉTIQUE** ne sont pas affichés. Les justificatifs joints aux formats PDF fusionné et ZIP restent inclus selon les sélections existantes ; ces pièces peuvent naturellement ajouter leurs propres pages au PDF fusionné.

Les sélections d’inclusion, les calculs et les règles d’accès existants sont conservés. Aucun changement de données, dépendance, migration ou variable d’environnement.

## Vérification

Les tests d’export contrôlent le format A4, la page unique, la conservation des champs et des montants, les devises, les inclusions et le navire conditionnel. Les cas couvrent notamment un mois de 31 jours avec 95 lignes brutes, des frais et prestations BBTM, ainsi que des noms très longs. Les quatre combinaisons d’inclusion loyers/BBTM vérifient la présence du tableau DPR ou son exclusion complète, avec et sans opérations.

Le PDF réel est également rendu en images et inspecté : position des sections, alignement des colonnes, retours à la ligne, intégralité des textes et absence de débordement.
