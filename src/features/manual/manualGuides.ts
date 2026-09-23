import type { AppModule, ModuleKey } from '../permissions/moduleAccess';

export interface ManualGuide {
  purpose: string;
  access: string;
  steps: { title: string; detail: string }[];
  reminders: string[];
}

// Notices du profil Marin. Les noms, l’ordre et les accès viennent de la navigation.
export const MANUAL_GUIDES: Partial<Record<ModuleKey, ManualGuide>> = {
  emergencyExercises: {
    purpose: 'Consulter les exercices d’urgence issus des Daily Progress Reports et télécharger le carnet annuel individuel.',
    access: 'Administration, Direction et Armement voient tous les marins, avec En poste sélectionné par défaut. Un Capitaine voit sa bordée ; un Marin consulte uniquement ses propres données.',
    steps: [
      { title: 'Choisir le périmètre', detail: 'Dans Registres, ouvrez Registre des Exercices. La vue Flotte est sélectionnée par défaut. Cliquez sur l’icône d’un navire pour restreindre le graphique et le tableau à ce navire, puis choisissez l’année.' },
      { title: 'Choisir le marin', detail: 'Sélectionnez le collaborateur dont vous souhaitez consulter le carnet. Administration, Direction et Armement peuvent aussi afficher les anciens marins ou tous les marins. Pour le profil Marin, le collaborateur est automatiquement votre propre fiche.' },
      { title: 'Exporter le carnet', detail: 'Après sélection d’un marin, cliquez sur Exporter le PDF. Le document reprend le graphique, le tableau mensuel, l’année et le périmètre navire sélectionnés. Pour le carnet complet, sélectionnez Flotte. Le nom reste Exercices-Urgence-Prénom-NOM-Année.pdf.' },
    ],
    reminders: ['Seuls les DPR soumis ou validés, non supprimés, sont comptabilisés.', 'La vue collective compte chaque exercice une fois par DPR, sans additionner les participations de chaque marin.', 'Si votre fiche personnelle n’est pas liée à votre compte, contactez l’armement.'],
  },
  chemicals: {
    purpose: 'Tenir l’inventaire des produits chimiques par navire et retrouver leurs fiches de données de sécurité.',
    access: 'Tous les profils, y compris Marin et Capitaine, peuvent consulter, ajouter, modifier et supprimer les produits de leur société, joindre leurs documents et exporter un inventaire.',
    steps: [
      { title: 'Choisir le navire', detail: 'Dans Registres, ouvrez Produits Chimiques. Cliquez sur l’illustration d’un navire pour filtrer son inventaire ou sur Flotte pour consulter tous les navires. La recherche retrouve un produit, une variante ou un usage.' },
      { title: 'Renseigner un produit', detail: 'Cliquez sur Ajouter un produit ou sur le crayon d’une ligne. Indiquez le navire, la marque, le type, la variante, le stock en litres et les conditions de stockage. Sélectionnez les pictogrammes de la FDS et complétez les dangers, les conseils de prudence et les EPI, puis enregistrez.' },
      { title: 'Consulter et joindre une FDS', detail: 'Cliquez sur le nom du produit pour lire toutes ses consignes. Dans FDS et pièces jointes, choisissez le type de document et ajoutez vos fichiers, jusqu’à 20 Mo chacun. Les fichiers sont classés dans Google Drive, sous SeaPilot / Produits Chimiques / navire / produit. Cliquez sur un nom de fichier pour le télécharger.' },
      { title: 'Exporter le PDF BBTM', detail: 'Choisissez Exporter en PDF, sélectionnez le navire et cochez Inclure les pièces jointes si nécessaire. L’export comprend tout l’inventaire de ce navire même lorsqu’une recherche est active. Les PDF et images sont ajoutés en annexe ; les autres fichiers sont inclus dans le panneau des pièces jointes du lecteur PDF.' },
      { title: 'Retirer un élément', detail: 'Utilisez la corbeille et confirmez la suppression du produit ou de sa pièce jointe. Le produit supprimé disparaît de l’inventaire et des exports. Les fichiers originaux restent sur Google Drive.' },
    ],
    reminders: ['L’ajout, le téléchargement et les exports avec pièces jointes nécessitent un PC Windows avec Google Drive synchronisé et le lanceur SeaPilot 2.2. Installez-le depuis Administration → Documents et Google Drive ; la racine existante est conservée.', 'Si un document a changé sur Drive, ajoutez sa nouvelle version dans SeaPilot.', 'Un stock vide signifie « À renseigner » ; saisissez 0 lorsque le stock est réellement nul.', 'Les informations du registre doivent correspondre à la FDS et à l’étiquette du produit.', 'Si un autre utilisateur a modifié le produit entre-temps, actualisez avant de reprendre votre correction.'],
  },
  usefulLinks: {
    purpose: 'Retrouver les portails, les outils et les réunions utiles à votre activité dans le répertoire partagé de votre société.',
    access: 'L’accès est activé par profil dans Administration. Marin, Capitaine et Armement consultent le répertoire ; Administration et Direction peuvent gérer les liens et les catégories.',
    steps: [
      { title: 'Ouvrir le répertoire', detail: 'Dans le menu Accueil, choisissez Liens utiles. Les sites sont présentés par titre et par catégorie avec leur icône.' },
      { title: 'Retrouver un lien', detail: 'Saisissez un titre ou une catégorie dans la recherche, ou choisissez une catégorie. Tous les liens permet de retirer le filtre de catégorie.' },
      { title: 'Ouvrir le site', detail: 'Cliquez sur la carte du lien. Le portail s’ouvre dans un nouvel onglet ; identifiez-vous sur ce site s’il le demande.' },
      { title: 'Faire mettre à jour le répertoire', detail: 'Demandez à Administration ou Direction d’ajouter, de renommer ou de supprimer un lien. Les responsables utilisent Ajouter un lien, les boutons de modification des cartes et Catégories. Supprimer une catégorie conserve ses liens dans Sans catégorie.' },
    ],
    reminders: ['L’accès à Liens utiles ne donne pas automatiquement les droits de connexion aux sites externes.', 'Si un lien ne fonctionne plus, signalez-le à un responsable du répertoire.'],
  },
  home: {
    purpose: 'Retrouver vos informations utiles et les actions à traiter dès votre connexion.',
    access: 'Les informations affichées dépendent de votre profil et de votre périmètre personnel.',
    steps: [
      { title: 'Prendre connaissance de votre accueil', detail: 'Consultez les informations et les échéances proposées. Ouvrez les éléments disponibles pour accéder à leur module.' },
      { title: 'Consulter la cloche', detail: 'En haut à droite, la cloche regroupe notamment les notes de service à signer, les échéances de vos documents RH et les notifications qui vous concernent.' },
      { title: 'Ouvrir un module', detail: 'Utilisez le menu de gauche. Sur téléphone, ouvrez-le avec le bouton de navigation. Le point d’interrogation vous ramène à ce manuel.' },
    ],
    reminders: ['Un menu absent peut dépendre des droits de votre compte. Contactez l’administrateur si un accès nécessaire manque.', 'Une notification ouvre l’élément concerné ; consultez la notice du module pour savoir comment le traiter.'],
  },
  kpi: {
    purpose: 'Consulter les indicateurs et les rapports QHSE pour suivre l’activité et la sécurité.',
    access: 'Les résultats sont calculés sur les données auxquelles votre compte a accès.',
    steps: [
      { title: 'Choisir le périmètre', detail: 'Sélectionnez les années, les navires et les projets disponibles dans les filtres.' },
      { title: 'Lire les indicateurs', detail: 'Consultez les valeurs et les graphiques. Ouvrez les définitions proposées pour comprendre ce qui est mesuré.' },
      { title: 'Consulter les rapports', detail: 'Ouvrez le rapport souhaité dans le catalogue, puis vérifiez son périmètre et sa période avant de l’utiliser.' },
    ],
    reminders: ['Un résultat vide peut provenir des filtres ou de l’absence de données accessibles.', 'Actualisez après une mise à jour des données sources.'],
  },
  certificates: {
    purpose: 'Retrouver les certificats des navires et suivre leurs dates de validité.',
    access: 'Le Marin consulte les documents disponibles. La gestion des certificats est réservée aux profils habilités.',
    steps: [
      { title: 'Rechercher un certificat', detail: 'Utilisez la recherche et le filtre de statut, puis développez le navire et la catégorie dans la bibliothèque.' },
      { title: 'Lire la fiche', detail: 'Sélectionnez le document pour consulter ses informations, son échéance et l’aperçu du fichier lorsqu’il est disponible.' },
      { title: 'Consulter les visites et télécharger', detail: 'Consultez les visites associées au périmètre sélectionné. Utilisez Télécharger le document pour récupérer le fichier disponible.' },
    ],
    reminders: ['Vérifiez le navire, la date d’expiration et la version du document.', 'Signalez un certificat manquant ou périmé à la personne chargée de son renouvellement.'],
  },
  procedures: {
    purpose: 'Lire les procédures QHSE approuvées et publiées pour préparer votre intervention.',
    access: 'Le Marin consulte uniquement les versions PDF approuvées et publiées. Les fichiers de travail restent réservés aux responsables.',
    steps: [
      { title: 'Trouver la procédure', detail: 'Recherchez par nom, numéro ou thème. Vous pouvez aussi filtrer par projet et par navire. Le filtre Navire inclut les procédures de ce navire et celles sans navire, communes à la flotte.' },
      { title: 'Parcourir la bibliothèque', detail: 'Développez le chapitre de classement, puis sélectionnez la procédure souhaitée.' },
      { title: 'Lire la version publiée', detail: 'Ouvrez le PDF disponible et vérifiez son titre ainsi que sa version avant d’appliquer les consignes.' },
      { title: 'Générer une liste', detail: 'Cliquez sur Générer une liste des documents, choisissez le navire et le statut, puis cochez les procédures à inclure. Tous les statuts est sélectionné par défaut. Tout sélectionner et Tout désélectionner portent sur les documents affichés. Le PDF A4 portrait regroupe les documents par chapitre ISM, sans statut ni navire. La mise en page vise une seule page selon la longueur de la sélection.' },
    ],
    reminders: ['Si la procédure attendue n’apparaît pas, vérifiez les filtres puis contactez le responsable QHSE.', 'Une ancienne copie conservée sur votre poste peut avoir été remplacée par une nouvelle publication.'],
  },
  serviceNotes: {
    purpose: 'Lire les notes de service qui vous sont adressées et confirmer leur lecture par votre signature.',
    access: 'Vous signez les notes dont vous êtes destinataire avec la signature active de votre profil RH.',
    steps: [
      { title: 'Ouvrir la note', detail: 'Sélectionnez une note dans le module ou utilisez le raccourci de la cloche.' },
      { title: 'Lire le contenu et les pièces jointes', detail: 'Parcourez la note et ses annexes. Les options de téléchargement permettent de conserver les documents proposés.' },
      { title: 'Confirmer puis signer', detail: 'Cochez « J’ai lu la note et ses pièces jointes. », puis cliquez sur Signer la note. Si aucune signature active n’est disponible, ouvrez votre profil RH pour la renseigner.' },
      { title: 'Vérifier la confirmation', detail: 'Le message Lecture confirmée indique que votre signature figure sur le registre commun.' },
    ],
    reminders: ['La signature confirme votre lecture : lisez aussi les pièces jointes avant de signer.', 'La création et la diffusion des notes sont réservées aux responsables habilités.'],
  },
  actionPlan: {
    purpose: 'Déclarer une situation, suivre les actions qui vous concernent et renseigner leur traitement.',
    access: 'Les fiches visibles et les boutons de traitement dépendent de votre affectation et des règles de confidentialité.',
    steps: [
      { title: 'Retrouver une fiche', detail: 'Utilisez les filtres de la liste ou ouvrez la fiche depuis une notification.' },
      { title: 'Créer un signalement', detail: 'Utilisez l’action de création, choisissez le type de fiche et renseignez les champs obligatoires, le contexte et les pièces utiles avant d’enregistrer.' },
      { title: 'Traiter une action affectée', detail: 'Ouvrez la fiche, lisez les mesures attendues, puis renseignez le traitement et les justificatifs demandés lorsque le bouton correspondant est disponible.' },
      { title: 'Suivre la clôture', detail: 'Demandez la clôture lorsque le traitement est terminé, puis consultez le statut et les éventuels retours de contre-validation.' },
    ],
    reminders: ['Une demande de clôture peut nécessiter une contre-validation.', 'Les rapports confidentiels ont un périmètre restreint. Les fonctions de gestion globale ne sont pas ouvertes au Marin.'],
  },
  qhse: {
    purpose: 'Consulter la bibliothèque documentaire QHSE historique lorsqu’elle est accessible à votre compte.',
    access: 'Cet écran peut être accessible par un lien direct sans apparaître dans le menu principal.',
    steps: [
      { title: 'Rechercher un document', detail: 'Utilisez les filtres disponibles pour retrouver le document dans la bibliothèque.' },
      { title: 'Vérifier les informations', detail: 'Contrôlez le titre, le classement et les dates renseignées avant d’ouvrir le fichier proposé.' },
    ],
    reminders: ['Pour les procédures approuvées et diffusées, utilisez en priorité Procédures QHSE.'],
  },
  dpr: {
    purpose: 'Rédiger votre Daily Progress Report et retrouver vos propres rapports dans Mes DPR.',
    access: 'Le Marin consulte ses propres DPR. La modification d’un brouillon ou d’un rapport rouvert et sa validation sont limitées aux 3 jours suivant sa création.',
    steps: [
      { title: 'Commencer un rapport', detail: 'Cliquez sur Saisir un DPR, puis vérifiez la date, le navire, le projet et les personnes proposés à partir du planning.' },
      { title: 'Compléter les rubriques', detail: 'Parcourez les étapes du formulaire : informations projet, informations journalières, indicateurs QHSE, escale, photos et pièces jointes. Complétez les champs requis.' },
      { title: 'Enregistrer votre travail', detail: 'Utilisez Enregistrer le brouillon pour conserver la saisie. Le message Modifications non enregistrées signale les changements restant à sauvegarder.' },
      { title: 'Valider et consulter', detail: 'Vérifiez le rapport complet avant de le valider. Il reste ensuite consultable dans Mes DPR. Le bouton Consulter remplace Modifier quand la modification n’est plus autorisée.' },
    ],
    reminders: ['Le délai de 3 jours part de la création du rapport.', 'Le profil Marin ne dispose pas de la production PDF, de l’aperçu PDF ni des exports ZIP.', 'Si le rapport est verrouillé ou hors délai, contactez votre responsable pour une correction.'],
  },
  fleet: {
    purpose: 'Consulter les caractéristiques des navires et les autres actifs de la flotte.',
    access: 'Le Marin consulte les fiches. L’ajout, la modification et le retrait d’actifs sont réservés à l’administration.',
    steps: [
      { title: 'Choisir un actif', detail: 'Sélectionnez la catégorie Navires, Bureaux ou Quais, puis recherchez l’actif souhaité.' },
      { title: 'Consulter la fiche', detail: 'Sélectionnez une ligne pour afficher la photo, les caractéristiques et les informations disponibles.' },
      { title: 'Consulter les informations du navire', detail: 'Pour un navire, consultez sa décision d’effectif et utilisez Éditer brochure si vous avez besoin de la brochure PDF.' },
    ],
    reminders: ['Éditer brochure génère un document ; ce bouton ne modifie pas la fiche du navire.', 'Signalez les informations incorrectes à l’administrateur.'],
  },
  purchaseRequests: {
    purpose: 'Suivre le traitement des achats et confirmer la réception des commandes à bord.',
    access: 'Le Marin peut traiter les étapes opérationnelles disponibles sur les demandes accessibles. Il ne crée pas de demande et ne décide pas de son approbation.',
    steps: [
      { title: 'Retrouver la demande', detail: 'Parcourez les onglets du circuit d’achat et sélectionnez la demande concernée. Vérifiez le navire, le matériel et les quantités.' },
      { title: 'Prendre en charge une demande approuvée', detail: 'Quand Prendre en charge est proposé, utilisez-le pour démarrer le traitement de la commande.' },
      { title: 'Planifier la livraison', detail: 'Dans En commande, utilisez Planifier la livraison et renseignez les informations demandées.' },
      { title: 'Confirmer la réception', detail: 'Dans À réception, vérifiez la livraison physique puis utilisez Reçu à bord.' },
    ],
    reminders: ['Les boutons dépendent du statut de la demande : une étape doit être terminée avant la suivante.', 'Ne confirmez la réception qu’après le contrôle de la livraison.'],
  },
  planning: {
    purpose: 'Consulter vos affectations et transmettre vos demandes d’absence.',
    access: 'Le Marin peut consulter la dernière version diffusée du planning de toute la flotte de sa société. Il peut faire ses propres demandes de congés, mais ne modifie pas les affectations et ne valide pas les demandes.',
    steps: [
      { title: 'Choisir le navire et la période', detail: 'Votre navire d’affectation du jour est sélectionné à l’ouverture. Utilisez le filtre pour choisir un autre navire ou Tous les navires, puis les commandes de date pour consulter la période souhaitée.' },
      { title: 'Consulter une affectation', detail: 'Ouvrez les informations proposées sur une période pour vérifier le navire, le projet et les dates.' },
      { title: 'Demander des congés', detail: 'Cliquez sur Demander des congés. Vérifiez votre nom, renseignez le type, les dates de début et de fin et le motif, puis cliquez sur Envoyer la demande.' },
      { title: 'Suivre la décision', detail: 'Consultez le statut de votre demande. Une demande en attente n’est pas encore une absence approuvée.' },
      { title: 'Générer une crew list', detail: 'Utilisez Générer une crew list, choisissez le navire et la date demandés, puis vérifiez les personnes proposées avant de générer le document.' },
    ],
    reminders: ['Pour corriger une affectation, contactez l’Armement.', 'Vérifiez les dates de début et de fin avant d’envoyer une demande.'],
  },
  humanResources: {
    purpose: 'Consulter votre fiche RH, mettre à jour vos informations personnelles et retrouver vos brevets.',
    access: 'Le Marin accède à sa propre fiche. Il peut modifier les informations personnelles autorisées ; la gestion des documents et des autres collaborateurs reste réservée aux profils habilités.',
    steps: [
      { title: 'Consulter votre fiche', detail: 'Parcourez les onglets de votre profil pour vérifier vos coordonnées, vos informations professionnelles et vos documents.' },
      { title: 'Mettre à jour vos informations', detail: 'Cliquez sur Modifier la fiche RH, corrigez les champs disponibles, puis cliquez sur Enregistrer la fiche.' },
      { title: 'Vérifier vos brevets et visites médicales', detail: 'Consultez les documents et leurs échéances. Transmettez les nouveaux justificatifs au service chargé de les enregistrer.' },
      { title: 'Renseigner votre signature', detail: 'Utilisez la rubrique de signature de votre profil pour disposer d’une signature active, nécessaire notamment pour signer les notes de service.' },
    ],
    reminders: ['Une alerte dans la cloche peut annoncer une échéance documentaire dans les 40 prochains jours.', 'Si aucune fiche n’est associée à votre compte, demandez à l’administrateur de vérifier le rattachement.'],
  },
  workingTime: {
    purpose: 'Renseigner votre temps de travail, consulter les périodes de repos et suivre les validations.',
    access: 'Le Marin travaille sur son registre personnel. Les journées validées et les périodes dont la saisie est fermée ne sont plus modifiables librement.',
    steps: [
      { title: 'Choisir votre journée', detail: 'Sélectionnez la période et la journée dans votre registre. Vérifiez le navire et les informations issues du planning.' },
      { title: 'Saisir les périodes de travail', detail: 'Dans la frise, sélectionnez les plages horaires travaillées. Vous pouvez préparer plusieurs périodes avant de les enregistrer.' },
      { title: 'Contrôler la saisie', detail: 'Vérifiez les horaires, les totaux et les alertes de repos. Utilisez Enregistrer le brouillon quand cette option est proposée.' },
      { title: 'Signer et transmettre pour validation', detail: 'Une fois la saisie complète, utilisez la commande de signature de la journée avec votre signature active. Le capitaine affecté la valide ; en l’absence de capitaine, elle est transmise aux responsables habilités. Suivez ensuite son statut.' },
    ],
    reminders: ['Les alertes aident à repérer les écarts : vérifiez la réalité des horaires saisis.', 'Une journée transmise ou validée suit un circuit de validation. Contactez le responsable si une correction est nécessaire.'],
  },
  expenseNotes: {
    purpose: 'Émettre une note de frais, déclarer vos déplacements et retrouver vos justificatifs.',
    access: 'Le Marin consulte ses propres notes. Son carnet de véhicules est personnel et limité à sa société active.',
    steps: [
      { title: 'Choisir le type de note', detail: 'Ouvrez le formulaire de dépense ou d’indemnités kilométriques. Vérifiez l’émetteur et le navire proposés dans la section Informations.' },
      { title: 'Renseigner les frais', detail: 'Pour une dépense, complétez le montant et le paiement. Pour un trajet, choisissez votre véhicule et renseignez les déplacements. Développez chaque section pour vérifier les informations.' },
      { title: 'Joindre les justificatifs', detail: 'Ajoutez la description et les pièces nécessaires dans Compléments, puis contrôlez le total avant d’émettre la note.' },
      { title: 'Émettre et suivre', detail: 'L’émission enregistre la note et déclenche son envoi. Vérifiez le message de confirmation et le statut dans l’historique. Si seul l’envoi échoue, utilisez la commande de renvoi sur la note existante pour éviter un doublon.' },
      { title: 'Gérer vos véhicules', detail: 'Mes véhicules permet d’ajouter ou de modifier un véhicule et de choisir Utiliser par défaut. Cette préférence préremplit vos prochaines notes kilométriques.' },
    ],
    reminders: ['Une note émise et un envoi réussi sont deux étapes distinctes : contrôlez leur confirmation.', 'Modifier un véhicule ne change pas les notes déjà émises.'],
  },
  marad: {
    purpose: 'Identifier l’espace prévu pour la maintenance Marad.',
    access: 'Cet écran est actuellement en attente de migration. Il ne propose pas encore de saisie ou de suivi de maintenance dans l’application.',
    steps: [
      { title: 'Ouvrir le module', detail: 'Dans Maintenance, choisissez Marad. Un message indique que le module est prêt pour migration.' },
      { title: 'Poursuivre le suivi habituel', detail: 'Pour une intervention ou un signalement de maintenance, contactez votre responsable et utilisez le circuit habituel de votre navire.' },
    ],
    reminders: ['Aucune opération de maintenance ne peut être enregistrée depuis cet écran pour le moment.'],
  },
  technicalDocuments: {
    purpose: 'Identifier l’espace prévu pour les documents techniques.',
    access: 'Cet écran est actuellement en attente de migration. Aucune bibliothèque technique n’y est encore disponible.',
    steps: [
      { title: 'Ouvrir le module', detail: 'Dans Maintenance, choisissez Documents Techniques. Le message affiché indique l’état de préparation du module.' },
      { title: 'Obtenir un document', detail: 'Demandez le document à votre responsable technique. Pour les certificats des navires et les procédures publiées, utilisez les modules correspondants.' },
    ],
    reminders: ['Aucun ajout, aperçu ou téléchargement de document technique n’est disponible sur cet écran pour le moment.'],
  },
  lifting: {
    purpose: 'Consulter le registre des équipements de levage et les rapports de contrôle.',
    access: 'Le Marin consulte les équipements et les rapports accessibles. La gestion du registre et la finalisation des contrôles sont réservées aux profils habilités.',
    steps: [
      { title: 'Choisir le registre et le navire', detail: 'Dans le menu Levage, ouvrez Registre des Apparaux de Levage ou Registre des Remorques, puis sélectionnez le navire. Examen à fond - Grue donne accès aux certificats existants.' },
      { title: 'Consulter le registre', detail: 'Vérifiez l’identification de l’équipement, ses caractéristiques et les informations de contrôle disponibles.' },
      { title: 'Ouvrir un rapport', detail: 'Dans la liste des rapports, filtrez par année si nécessaire, puis ouvrez le contrôle souhaité ou téléchargez son PDF.' },
    ],
    reminders: ['Un PDF brouillon n’est pas un rapport finalisé : vérifiez son statut et sa date d’échéance.', 'Signalez toute anomalie constatée à votre responsable.'],
  },
};

export function getManualModules(visibleModules: AppModule[]): AppModule[] {
  return visibleModules.filter((module) => MANUAL_GUIDES[module.key]);
}

export function normalizeManualSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim();
}
