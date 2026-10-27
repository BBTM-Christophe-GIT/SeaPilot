# Coordonnées client lisibles

Version 3.80.6 — 27 octobre 2026.

Le formulaire Projet affiche les coordonnées du client sélectionné sous forme
d’un bloc postal : contact, adresse avec code postal/ville/pays, téléphone et
e-mail sur des lignes distinctes. Le catalogue client utilise le même composant.
Un client créé depuis le formulaire conserve aussi ces champs pour l’affichage
immédiat, sans requête ou écriture supplémentaire. Les coordonnées manquantes
ne créent pas de lignes vides.

Dans Opération en Mer, le champ « Coordonnées du client » est multiligne. Le
formateur d’affichage remplace uniquement le séparateur connu ` · ` entre les
champs transmis par le serveur. Il préserve les lignes d’adresse existantes,
les virgules, tirets et textes libres. Le même affichage est utilisé dans
l’aperçu et le PDF ; les modèles contractuels Projet et le chrome Word restent
inchangés.

Ouvrir, consulter ou enregistrer sans modifier les coordonnées conserve la
chaîne source exacte. Seule une édition du champ écrit le texte modifié dans
le brouillon. Aucun effet de montage, de focus ou de sortie du champ ne
normalise l’enregistrement. Les fiches historiques ne sont pas recalculées
depuis le catalogue actuel et leurs données signées restent intactes.

La mention « Client défini par le projet sélectionné. » est retirée. Les règles
de sélection/verrouillage du client, les droits des vrais comptes et le
caractère modifiable du contact opérationnel sont conservés. Aucune migration,
RPC, règle RLS, permission ou donnée métier n’est modifiée.

Validation : formateur idempotent et texte libre, bloc postal complet/partiel,
client nouvellement créé, catalogue, sélection de mission et client verrouillé,
sauvegarde sans édition, aperçu/PDF sans mutation de la source, contrôles
visuels ordinateur/mobile, ESLint et build de production.
