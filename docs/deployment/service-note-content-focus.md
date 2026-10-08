# Notes de service : focus du champ Contenu

Le clic dans le champ `Contenu` conserve désormais le curseur dans le texte, dans
l'éditeur de brouillon et dans le mode de correction des informations.

L'éditeur et sa barre d'outils étaient enveloppés dans un `label` HTML implicite :
le navigateur transférait le focus au premier contrôle associé, le menu `Style de
paragraphe`. Un conteneur neutre conserve la présentation et le nom accessible
`Contenu` déjà porté par l'éditeur, sans rediriger les clics.

Aucune migration ni configuration supplémentaire n'est nécessaire. Le test de
régression clique dans l'éditeur d'un brouillon, contrôle le focus et saisit une
phrase complète. Il échoue avant la correction et réussit après celle-ci.
