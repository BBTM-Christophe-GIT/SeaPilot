# Affichage Capitaine et Marin

Les dispositions suivent désormais la largeur disponible dans le contenu, après
déduction du menu latéral. Le menu passe en tiroir jusqu'à 1 100 px. Les panneaux
du registre des heures et des DPR s'empilent lorsque l'espace devient insuffisant ;
les commandes du Planning et les actions RH peuvent revenir à la ligne.

## Demandes d'achat

Les largeurs minimales de la liste et du détail dépassaient l'espace disponible
sur certains ordinateurs portables. Elles pouvaient masquer les champs et les
actions. Les deux panneaux s'empilent désormais sous 1 200 px de largeur de
contenu. Les filtres, les étapes de traitement et le formulaire s'adaptent aux
petits écrans ; les six étapes de création gardent leurs libellés.

Le bouton **Suivant** de l'étape Demandeur ne requiert plus la désignation, qui
n'est saisissable qu'à l'étape Besoin. La désignation reste obligatoire pour
poursuivre après cette étape et créer la demande.

## Vérification et recette

La vérification utilise le code et les fixtures propres aux profils Capitaine et
Marin, sans utiliser les vues de simulation de la session administrateur.
Les contrôles de rôles côté application et les politiques RPC/RLS ont été relus.
Les parcours navigateur utilisent des données synthétiques isolées : ils ne
modifient aucune demande ni aucun registre de production.

Largeurs de contrôle : 320, 390, 768, 1 024, 1 101, 1 366 et 1 920 px.
Les parcours interactifs couvrent notamment :

- Demandes d'achat : filtres, recherche, sélection, action de prise en charge
  autorisée et six étapes de création pour le Capitaine ; absence de création
  pour le Marin sans fonction supplémentaire.
- Heures : changement Jour/Mois, onglets, ouverture et fermeture du formulaire.
- Planning et DPR : navigation de période et ouverture des formulaires.
- Navigation : ouverture et fermeture du tiroir sur écran étroit.

Le test de régression du formulaire vérifie aussi qu'une désignation effacée
bloque toujours la création. Les tests automatisés de permissions et des modules
concernés complètent la recette navigateur sur Edge/Chromium. Cette recette ne
constitue pas une validation sur des appareils physiques ni sur Safari.

## Déploiement

Correctif exclusivement frontend : aucune migration, variable d'environnement
ou modification des droits n'est nécessaire. Le retour arrière consiste à
redéployer le client précédent.
