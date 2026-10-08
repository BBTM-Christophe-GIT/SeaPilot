# Demandes d'achat — suivi et commentaires horodatés

Le détail d'une demande affiche son suivi, avec les événements métier et les
commentaires, leur auteur et leur date et heure affichées dans le fuseau
Europe/Paris, du plus récent au plus ancien. Les retours à la ligne des
commentaires sont conservés. Un commentaire ajouté reste dans l'historique après
le rechargement de la demande.

Les profils Administrateur, Direction, Armement, Capitaine et Marin peuvent
commenter les demandes auxquelles ils ont réellement accès. L'autorisation est
vérifiée sur l'entreprise de la demande, le rôle et l'adhésion active du compte,
indépendamment de l'entreprise actuellement sélectionnée. Les comptes Marin et
Capitaine sont couverts par des fixtures SQL utilisant leurs propres identités.

## Contrat serveur

L'appel `purchase_request_add_comment(p_request_id bigint, p_comment text)`
renvoie la ligne créée dans `purchase_request_events` :

- `event_type` : `comment_added` ;
- `status_label` : `Commentaire de suivi` ;
- `actor_user_id` et `actor_name` : identité et nom issus du compte connecté ;
- `comment` : texte sans espaces ni sauts de ligne superflus aux extrémités ;
- `created_at` : instant fourni par le serveur (`timestamptz`) ;
- `effective_on` : `null`.

Le commentaire est obligatoire et limité à 4 000 caractères après nettoyage.
L'appel n'accepte ni auteur ni horodatage du client et ne modifie ni le statut,
ni l'approbation, ni les dates de livraison, ni `updated_at` de la demande.
L'ajout reste possible à chaque étape du workflow, y compris après un refus ou
une réception. Les rôles du navigateur ont uniquement accès à la lecture des
événements : l'ajout passe par le RPC et l'historique ne peut être ni modifié ni
supprimé depuis le client.

Le RPC public utilise les droits du compte pour contrôler la visibilité réelle
de la demande. Son écriture est déléguée à une fonction du schéma non exposé
`purchase_request_private`, qui contrôle à nouveau le compte et son rôle. La RLS
des événements contrôle aussi que leur demande appartient à la même entreprise
et est visible par le compte.

## Déploiement et vérification

Appliquer `20261008083542_purchase_request_followup_comments.sql` avant de
déployer le client. Aucun paramètre ni variable d'environnement supplémentaire
n'est nécessaire ; conserver `purchase_request_private` hors de la liste des
schémas exposés par la Data API.

Les tests SQL sont dans `supabase/tests/purchase_request_followup_test.sql`.
Sur une base locale à jour, les exécuter avec :

```powershell
supabase test db supabase/tests/purchase_request_followup_test.sql --local
```

Ils couvrent les cinq profils autorisés, la séparation des entreprises, les
adhésions inactives, les demandes absentes ou invisibles, la validation du
texte, l'identité et l'horodatage serveur, ainsi que la conservation du workflow
et l'interdiction de falsifier ou modifier l'historique.

Vérifier le suivi et l'ajout avec de vrais profils ou leurs fixtures. Les vues
Marin et Capitaine simulées depuis une autre session ne sont pas une preuve
d'accès. Vérifier aussi une erreur d'ajout, puis une nouvelle tentative et la
persistance du commentaire après rechargement.

## Retour arrière

Retirer le formulaire du client et révoquer l'exécution de
`public.purchase_request_add_comment(bigint, text)` et de
`purchase_request_private.add_comment(bigint, text)` si nécessaire. Conserver
les événements déjà enregistrés et la valeur `comment_added` dans la contrainte
du type d'événement pour préserver l'historique.
