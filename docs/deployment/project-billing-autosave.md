# Facturation mensuelle automatique — 3.69.1

La première prévisualisation, l’export, la sélection du contenu PDF ou l’enregistrement d’un frais ou d’une prestation crée automatiquement la fiche du mois lorsqu’elle manque. Le préalable « Enregistrer les paramètres » est supprimé. Les lecteurs ne créent aucune fiche ; l’enregistrement explicite de la facture dans « Suivi » reste disponible.

Une fiche existante est réutilisée sans réécrire son numéro de facture, ses dates, son montant, ses commentaires ou ses sélections. La création utilise la contrainte existante société/projet/mois et ignore les insertions concurrentes avant de relire la fiche gagnante. Les brouillons de facture et de prestations restent présents après cette première création.

La référence client s’enregistre à la sortie du champ via le mécanisme actuel des références par projet et combinaison de contenu PDF. Les écritures sont sérialisées ; une réponse tardive ne rétablit ni un ancien mois ni un ancien projet. Les références étant communes aux mois du projet, leur cache est actualisé même après un changement de mois. Un échec reste affiché et peut être retenté depuis le champ ou le bouton d’enregistrement de la référence.

## Déploiement et vérification

Aucune migration ni nouvelle variable d’environnement n’est requise. Les droits RLS et la sauvegarde manuelle de la fiche restent ceux de l’application actuelle.

Les tests `ProjectBillingAutosave.test.tsx` couvrent les premières actions, les fiches déjà facturées, les refus et nouvelles tentatives, les lecteurs, les brouillons et les réponses tardives. `projectBilling.test.ts` vérifie la création concurrente avec le client Supabase réel et un transport contrôlé. Les tests P144 existants doivent continuer de passer, y compris la quantité Spread Antipollution et les périodes d’export partielles.

La recette rendue utilise le vrai panneau et le générateur PDF avec des données isolées : nouveau mois, prestations en brouillon, références par contenu, changement de mois pendant une sauvegarde et facture existante inchangée. Vérifier également le lint, les tests automatisés, le build de production, les validations GitHub et le déploiement du commit publié.
