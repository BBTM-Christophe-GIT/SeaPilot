# Mode de déclaration DAPAQ S-WING

Version 3.80.10 — 28 octobre 2026.

La rubrique Armement d’Opération en Mer propose **S-WING** parmi les cases du
mode de déclaration DAPAQ. Comme NOMADE et Mail à la Capitainerie, cette case
sélectionne un seul mode ; un second clic permet de l’effacer.

La valeur `dapaq.method = "s_wing"` est conservée dans le brouillon et les fiches
signées, reconnue par la validation serveur et affichée dans l’aperçu et le PDF.
La restriction du responsable NOMADE reste propre à ce mode ; le responsable et,
si nécessaire, les coordonnées de l’agent restent obligatoires à la signature.

La migration `20261028125307_sea_operation_dapaq_s_wing.sql` étend uniquement la
liste des modes autorisés de la fonction de validation existante. Appliquée à
SeaPilot, elle a été vérifiée par 14 assertions SQL sans modification de données
métier : brouillon et GO S-WING, responsables et agent, compatibilité NOMADE/Mail,
rejets des valeurs invalides et maintien de l’attestation du Capitaine. Les droits,
l’immutabilité et le chemin de recherche restent ceux de la fonction initiale ;
la comparaison des conseillers de sécurité ne relève aucune nouvelle alerte.
