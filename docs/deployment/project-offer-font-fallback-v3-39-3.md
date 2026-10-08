# Projets — repli de police des offres commerciales v3.39.3

## Correctif

La génération des offres commerciales contenant des descriptions enrichies ne dépend plus de l'installation
locale de Microsoft Aptos. Le navigateur tente toujours de charger Aptos pour conserver la présentation prévue,
mais utilise `Segoe UI`, Arial ou une police sans sérif disponible lorsque la police manque ou lorsque l'API de
chargement des polices échoue.

Ce repli corrige notamment le `NetworkError: A network error occurred.` renvoyé par Firefox sur les postes sans
Aptos. Les offres françaises et anglaises suivent le même comportement.

## Vérification

- génération navigateur de P276 en français et en anglais ;
- génération navigateur de P277 en français et en anglais ;
- test automatisé du rejet `FontFaceSet.load` avec le message Firefox ;
- tests du générateur de documents Projet et build de production.

Aucune migration Supabase ni nouvelle variable d'environnement n'est requise.
