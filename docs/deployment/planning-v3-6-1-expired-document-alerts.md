# Planning v3.6.1 — échéances documentaires informatives

## Comportement livré

- Le Planning ne propose plus de création, de révocation ou de classement par dérogation.
- Une échéance de brevet, visite médicale ou autre document RH ne bloque plus la création ou la modification d’une affectation.
- Dans la vue Flotte, chaque case d’affectation postérieure à la date d’échéance affiche une icône de document échu.
- Le libellé accessible et l’infobulle listent le ou les documents concernés et leur date d’échéance.
- Une inaptitude médicale explicitement enregistrée reste bloquante. Les absences, indisponibilités et contrôles administratifs restent également actifs.

Un document dont la date d’échéance est le jour affiché est considéré valide pour cette journée. L’icône apparaît à partir du lendemain. Lorsqu’aucune date n’est renseignée, un statut documentaire `expired` suffit à afficher l’alerte.

## Migration Supabase

La migration `202607170003_planning_expired_documents_advisory.sql` :

1. désactive les règles bloquantes d’échéance documentaire ;
2. retire toute prise en compte d’une dérogation dans les triggers d’affectation et d’absence ;
3. conserve uniquement le blocage d’une inaptitude médicale explicite ;
4. rend les anciennes dérogations non modifiables en supprimant leur politique d’écriture ;
5. interdit le statut et le lien de dérogation dans la RPC de traitement des conflits.

Les tables et valeurs historiques ne sont pas supprimées afin de préserver les instantanés publiés et la piste d’audit.

## Vérifications attendues

1. Affecter un marin dont un document est échu : l’enregistrement doit réussir.
2. Ouvrir la vue Flotte : les cases postérieures à l’échéance doivent afficher l’icône documentaire.
3. Survoler une case : le titre doit indiquer le document et sa date d’échéance.
4. Vérifier que les menus, formulaires et statuts ne proposent plus de dérogation.
5. Vérifier qu’une inaptitude médicale explicite ou une absence bloquante empêche toujours l’affectation.

## Retour arrière

Le retour arrière nécessite une nouvelle migration restaurant explicitement les anciennes fonctions et politiques. Ne pas supprimer les lignes historiques de `planning_derogations`.
