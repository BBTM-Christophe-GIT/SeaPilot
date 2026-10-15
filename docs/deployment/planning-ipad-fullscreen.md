# Planning — plein écran iPad

Version `3.75.5`, build `2026-10-15.010`.

Le bouton de plein écran utilisait uniquement `requestFullscreen` et
`fullscreenchange`. Il affichait une erreur quand cette API était absente ou
refusée. La barre `.planning-command-layout` restait visible en plein écran et
occupait la hauteur du ruban de commandes et du panneau de diffusion.

## Comportement livré

Le bouton utilise l'API standard disponible, puis les variantes WebKit quand
nécessaire. Si l'entrée native est indisponible ou refusée, le Planning occupe
le viewport visible à l'intérieur de la fenêtre Safari. Ce repli ne prétend pas
masquer les contrôles du navigateur ou du système iPadOS.

Dans tous les modes de plein écran, le ruban de commandes et le panneau de
diffusion sont masqués ensemble. Les vues Flotte, Projet et Équipages, les
filtres, le zoom, le mois et le bouton de sortie restent disponibles selon les
droits du compte. La sortie restaure le bandeau sans recharger le Planning.

Le repli suit les dimensions et les décalages de `visualViewport`, ses
changements de taille et l'orientation. Il neutralise le confinement CSS des
ancêtres et masque le shell de l'application. Le défilement de la page et ses
styles antérieurs sont restaurés à la sortie ou au départ du module.

La touche Échap quitte le repli lorsque aucun formulaire ou menu n'en a besoin.
Les sorties natives sont synchronisées, y compris après le chargement initial
du module. Une réponse native tardive ne réactive pas un plein écran annulé.
Le Planning ne ferme pas le plein écran d'un autre composant.

Le formulaire des droits congés utilise le workspace comme cible de portail
lorsqu'il est ouvert en plein écran. Cette cible reste stable pendant la vie
du formulaire, afin de conserver les saisies si l'utilisateur quitte le plein
écran avant de fermer la fenêtre.

## Validation

Les 104 tests du composant Planning et les 29 tests du hook et du formulaire des
droits congés passent. ESLint ciblé, vérification du diff et compilation de
production réussissent.

Les tests couvrent les API standard et préfixées, leur absence ou leur refus,
l'entrée et la sortie, le chargement différé du workspace, les réponses tardives,
le nettoyage des styles et des écouteurs, le redimensionnement et les dialogues.
Les intégrations Marin et Capitaine utilisent leurs propres fixtures et la
lecture du Planning publié, sans vue de profil simulée depuis un administrateur.

La recette navigateur utilise le véritable `AuthProvider`, `AppShell` et
`PlanningPage`, avec des données de test hors production. Le Browser plugin
local n'étant pas disponible, elle utilise le Playwright fourni et Chromium
avec un viewport tactile de tablette. Les API absentes/refusées y sont simulées.
Cette validation ne remplace pas une vérification sur un iPad physique.

À 1024 × 768 et 768 × 1024, les trois comptes distincts Administrateur, Marin
et Capitaine conservent un calendrier ajusté au viewport, le bouton de sortie
visible et le bandeau masqué. Le mode normal retrouve le bandeau et le
défilement initial. Les vues Flotte, Équipages et Projet, l'ouverture puis
l'annulation d'une affectation, le repli après refus de l'API et la sortie par
Échap sont vérifiés. Les lectures Marin/Capitaine passent par le snapshot
publié, avec les commandes d'écriture toujours absentes.

À 1440 × 900, l'entrée native réelle sous Chromium, la hauteur de la vue Projet,
la disparition du bandeau et la sortie native externe sont également vérifiées.
Les captures ont été revues, sans erreur console ni écran d'erreur du framework.

Aucune migration, nouvelle variable d'environnement ou dépendance ajoutée.

## Références primaires

- [WebKit : API plein écran standard sur iPadOS 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [WHATWG Fullscreen : activation et événements](https://fullscreen.spec.whatwg.org/)
- [CSSOM View : dimensions et décalages du viewport visible](https://drafts.csswg.org/cssom-view/#the-visualviewport-interface)
- [CSS Conditional : comportement de container-type](https://drafts.csswg.org/css-conditional-5/#container-type)
