# Accueil : filtre flotte/navire et pastilles

Le bandeau **Navires** propose toute la flotte accessible, chaque navire connu des
sources autorisées et **Sans navire** lorsque des éléments n'ont pas d'affectation.
Le choix filtre la file, le calendrier, les prochaines dates clés et les totaux.
Les filtres de catégorie peuvent être combinés au choix du navire.

Les pastilles des navires comptent les éléments à traiter pour la date et la
catégorie sélectionnées. Les pastilles des catégories comptent les éléments de la
date pour le navire sélectionné. Les totaux du bandeau supérieur couvrent toutes
les échéances chargées du navire, comme avant pour la flotte. Les alertes et
l'horizon de 90 jours conservent leurs règles existantes.

Les achats et certificats utilisent leur identifiant de navire. Les procédures
sont rapprochées par nom normalisé uniquement si le nom désigne un navire unique.
Les documents RH, contrats et alertes de temps de travail sont rattachés aux
affectations Planning actives à la date du jour, hors annulations. Un élément lié
à plusieurs navires apparaît pour chacun mais compte une seule fois dans le total
flotte. Les éléments sans rattachement restent disponibles dans **Sans navire**.
Une panne de lecture du Planning est signalée ; les profils de bureau gardent
leurs autres données, avec les éléments personnels sans rattachement.

## Accès

- Capitaine : navires affectés et personnel de sa bordée, sous réserve des RLS.
- Marin : navires affectés ; documents RH et temps de travail personnels.
- Sans fiche RH liée, sans affectation active ou si les affectations sont
  indisponibles : aucun élément ni navire pour Capitaine/Marin.
- Les profils de bureau conservent leurs autorisations existantes.
- Les options et compteurs sont construits après application du périmètre.
  Changer de profil masque immédiatement les données du profil précédent.

Aucune migration ni modification de droits n'est nécessaire. Les lectures restent
effectuées avec le client Supabase de la session. Les politiques de `people`,
`hr_documents`, `planning_assignments`, `fleet_certificates`, `purchase_requests`
et `working_time_calculation_windows`, ainsi que les fonctions de périmètre
Planning, Capitaine et temps de travail ont été inspectées dans la base liée.

## Vérification

`corepack pnpm test src/features/home` vérifie les échéances existantes, les liens
par navire, les noms ambigus, les compteurs croisés, le calendrier, les résultats
vides, les données partielles et le changement de profil. Les fixtures dédiées
Capitaine/Marin exercent le chargeur et les requêtes réels sans le client de
simulation administrateur. Elles ne remplacent pas une recette connectée avec
ces comptes. `corepack pnpm build` vérifie le build de production.
