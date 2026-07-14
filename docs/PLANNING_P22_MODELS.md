# SeaPilot Planning P2.2 — modèles, règles et limites

Dernière mise à jour : 14 juillet 2026
Version applicative : `3.0.0`

## Principe de décision

P2.2 ne contient aucun modèle d’apprentissage automatique. Les résultats sont des calculs déterministes appliqués au Planning visible par l’utilisateur courant. Une source absente ou trop pauvre bloque la fonction qui en dépend ; elle n’est jamais remplacée par une valeur inventée.

Chaque simulation expose séparément :

- les **faits**, directement lus dans les sources RLS autorisées ;
- les **règles**, calculs et contrôles déterministes appliqués ;
- les **estimations**, comparaisons ou candidats dont la validité dépend de la complétude des données ;
- les données utilisées, hypothèses, limites, conflits et niveau de confiance ;
- l’obligation de validation humaine.

Le moteur est pur : il n’appelle aucune mutation Supabase et ne modifie pas les objets reçus. Une simulation ne peut ni affecter un marin, ni déplacer une opération, ni publier un Planning, ni enregistrer une dérogation.

## Périmètre temporel

Les dates Planning restent des dates civiles ISO `YYYY-MM-DD`. Les chevauchements sont inclusifs. Les calculs dédupliquent les jours calendaires et bornent une analyse à 400 jours, même si la plage transmise est plus longue. Les instants UTC des affectations et absences continuent d’être gérés par le socle P0/P1 ; P2.2 ne les reconvertit pas.

## Charge par navire

Pour chaque navire actif :

1. retenir les projets dont le navire est principal ou secondaire et qui chevauchent la période ;
2. compter les jours calendaires uniques par type (`operation`, `transit`, `maintenance`, `unavailability`) ;
3. compter séparément les jours uniques comportant au moins une affectation non annulée ;
4. calculer `charge planifiée (%) = jours uniques avec événement / jours de la période × 100`.

Deux événements le même jour ne comptent donc qu’une fois dans la charge totale. La mesure décrit l’occupation du calendrier ; elle ne représente ni des heures machine, ni une capacité, ni une charge financière.

## Charge par marin

Pour chaque marin actif ayant une activité visible :

1. compter les jours uniques d’affectation non annulée ;
2. compter les jours uniques d’absence approuvée ;
3. compter les jours distincts présents dans `planning_days` ;
4. calculer `charge planifiée (%) = jours uniques affectés / jours de la période × 100` ;
5. compter chaque paire d’affectations qui se chevauche.

Cette charge ne constitue pas un contrôle réglementaire de repos. Celui-ci dépend des politiques administrées et métriques détaillées P1.3, qui ne sont pas déduites par P2.2.

## Score de tension

Pour chaque jour de la période :

```text
score = opérations ou transits × 3
      + navires distincts en maintenance ou indisponibles × 3
      + débuts ou fins d’affectation × 2
      + conflits P1.2 connus × 2
```

Le seuil est `max(6, 75e percentile des scores non nuls observés)`. Les jours consécutifs au-dessus du seuil sont regroupés en fenêtres ; au plus douze fenêtres, classées par pic décroissant, sont affichées.

Les coefficients sont une règle de tri explicite, pas des probabilités. Le score ne tient pas compte d’une opération, absence ou panne non encore enregistrée. La confiance est moyenne seulement à partir de 30 projets visibles ; elle reste faible en dessous.

## Simulation d’une absence

Le moteur ajoute en mémoire une absence approuvée synthétique sur le marin et la période choisis, puis réexécute le détecteur P1.2. Il compare le nombre total et bloquant de conflits à la référence, mesure les affectations impactées et recherche jusqu’à trois candidats sans blocage connu par poste vacant.

Deux plans restent proposés à la décision humaine : examiner un remplacement manuel, ou étudier un décalage des affectations. La confiance est moyenne seulement lorsqu’au moins une matrice et des documents RH sont présents ; sinon elle est faible. Le nombre de candidats est une estimation, car une donnée documentaire manquante peut masquer une incompatibilité.

## Simulation d’une immobilisation navire

Le moteur ajoute en mémoire un projet de maintenance synthétique, réexécute les conflits P1.2 et compte les projets et affectations qui chevauchent la période. Les navires alternatifs sont seulement classés par charge planifiée croissante.

Deux plans restent proposés : étudier une substitution de navire, ou replanifier manuellement. Une charge faible ne démontre aucune compatibilité technique, contractuelle ou d’équipement. La confiance est moyenne à partir de douze projets visibles, faible en dessous.

## Portes de qualité

| Fonction | Données minimales | Décision actuelle |
| --- | --- | --- |
| Charge navire | Navires actifs et projets valides | Disponible ou limitée selon le volume de la période |
| Charge marin | Marins actifs et affectations valides | Disponible ou limitée ; 30 affectations requises pour le niveau « prêt » |
| Tension | Au moins un projet dans la période | Limitée, car le score reste descriptif |
| Simulation d’absence | Au moins une affectation dans la période | Limitée et locale |
| Simulation navire | Au moins un projet ou une affectation | Limitée et locale |
| Sous-effectif | Matrice active avec exigences | Bloquée dans l’état distant observé |
| Fatigue future | Politique administrée et métriques travail/repos | Bloquée dans l’état distant observé |
| Intégrations externes | Contrat API, identifiants externes, webhook, propriété et règles de synchronisation | Bloquée |
| Hors connexion persistant | Politique de cache, chiffrement local et résolution de conflits | Bloquée |

## Ce qui n’est pas développé

- aucune probabilité de sous-effectif, d’absence, de panne ou de fatigue ;
- aucun modèle entraîné, saisonnalité ou extrapolation ;
- aucune synchronisation entrante ou bidirectionnelle calendrier, RH ou maintenance ;
- aucun cache persistant de données personnelles hors connexion ;
- aucune application automatique d’un scénario.

L’export ICS sortant P1.3, les documents RH internes et les projets de maintenance internes restent disponibles. Ils ne constituent pas des intégrations externes P2.2.
