# Suivi du temps — enregistrer une journée redevenue brouillon

Une journée peut conserver une ligne dans `working_time_day_approvals` tout en ayant le statut `draft`, notamment après une correction autorisée qui réinitialise son approbation. La présence de cette ligne ne signifie pas que la journée est soumise ou clôturée.

L’interface traite désormais de la même façon l’absence d’approbation et une approbation `draft` pour les commandes de brouillon, de validation ou de nouvelle soumission et leurs indications de signature. La saisie reste conditionnée à la permission effective renvoyée par le contexte serveur de la journée et du registre sélectionnés. Le message « Journée validée et clôturée » apparaît uniquement lorsque la journée validée est réellement verrouillée pour le compte courant.

La sauvegarde d’un brouillon reste distincte de la signature et de la validation. Les signatures exigées pour soumettre ou approuver une journée restent obligatoires. Les journées soumises ou validées et les comptes hors périmètre conservent leurs contrôles existants ; l’interface ne déduit aucun droit d’édition du seul rôle affiché.

Ce correctif est exclusivement dans le client web. Les règles SQL acceptent déjà une approbation `draft` existante ; aucune migration, modification de permission ou modification d’heures enregistrées n’est nécessaire au déploiement. L’historique et les preuves d’approbation restent gérés par le serveur existant.

La régression couvre une journée sans intervalle avec une approbation brouillon persistante, une correction autorisée suivie du retour à l’état brouillon, la sauvegarde après rechargement, les signatures requises, les erreurs d’enregistrement et le refus d’édition renvoyé par le serveur pour chaque profil réel. La recette utilise uniquement des données synthétiques sur ordinateur et mobile.
