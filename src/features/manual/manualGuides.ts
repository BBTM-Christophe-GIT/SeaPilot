import type { AppModule, ModuleKey } from '../permissions/moduleAccess';

export interface ManualGuide {
  purpose: string;
  access: string;
  steps: { title: string; detail: string }[];
  reminders: string[];
}

function documentaryAuditGuide(label: string): ManualGuide {
  return {
    purpose: `Conserver le dossier annuel ${label} de chaque navire et suivre les écarts avec leurs preuves.`,
    access: 'Administration, Direction et Armement créent les dossiers et affectent les écarts. Marin et Capitaine accèdent aux dossiers contenant les écarts qui leur sont affectés, à titre personnel ou par une fonction réellement exercée sur un embarquement confirmé et en cours. Ils peuvent documenter leur traitement ; le responsable habilité vérifie et clôture.',
    steps: [
      { title: 'Choisir le dossier annuel', detail: `Dans Audits, ouvrez ${label}, puis choisissez l’année et le navire. Les quatre audits documentaires utilisent la même interface. Les responsables créent un dossier annuel par navire et par type d’audit ; le titre, la date de l’audit et l’auditeur peuvent être précisés.` },
      { title: 'Constituer le dossier', detail: 'Dans Documents, ajoutez un ou plusieurs fichiers : PDF, Word, Excel, PowerPoint, texte, CSV ou photos. Les fichiers enregistrés sont conservés. Vous pouvez ajouter une nouvelle version en complément et télécharger les pièces autorisées.' },
      { title: 'Émettre et affecter les écarts', detail: 'Dans Écarts, ajoutez un constat de type Findings, Non Conformité Majeure, Non Conformité Mineure ou Remarque. Désignez une personne ou une fonction sur un navire. Une majeure propose une semaine, une mineure un mois ; une remarque n’a pas de délai et sa clôture reste facultative. Un Findings peut recevoir un délai facultatif. Joignez les photos ou documents du constat.' },
      { title: 'Documenter le traitement', detail: 'Ouvrez Suivre le traitement pour décrire l’action et joindre des photos ou fichiers. Le responsable affecté peut proposer Traité, à vérifier ; le gestionnaire valide ensuite la clôture. Les auteurs, dates, notes et pièces restent dans l’historique. Une remarque peut être clôturée directement par un gestionnaire. Réouvrez un écart clôturé pour le modifier.' },
      { title: 'Exporter le suivi', detail: 'Exporter le PDF produit la liste des écarts du dossier, leur traitement, les photos et les pièces jointes. Exporter cet écart permet de produire le rapport d’un seul écart. Les photos sont visibles dans le rapport, les PDF joints sont repris en annexe et les autres documents restent attachés au PDF dans leur format original.' },
    ],
    reminders: ['La sélection conserve le classement annuel et les navires suivent l’ordre de la flotte.', 'Une photo est limitée à 10 Mo et un document à 25 Mo ; ajoutez jusqu’à 10 fichiers à la fois.', 'Les pièces jointes et les traitements enregistrés sont conservés. Une pièce indisponible bloque le rapport complet pour éviter un export incomplet.'],
  };
}

const REGULATORY_LIBRARY_ACCESS = 'Marin et Capitaine consultent les textes, les dernières revues et leur historique. Administration, Direction et Armement peuvent ajouter ou modifier les liens et enregistrer les revues de leur société. La bibliothèque et chaque rubrique doivent être autorisées pour votre compte.';

// Notices du profil Marin. Les noms, l’ordre et les accès viennent de la navigation.
export const MANUAL_GUIDES: Partial<Record<ModuleKey, ManualGuide>> = {
  regulatoryLibrary: {
    purpose: 'Retrouver les textes de référence et suivre la revue mensuelle de leurs mises à jour dans le carnet de veille partagé de votre société.',
    access: REGULATORY_LIBRARY_ACCESS,
    steps: [
      { title: 'Ouvrir la bibliothèque', detail: 'Cliquez sur Bibliothèque Réglementaire dans le menu principal pour afficher la vue d’ensemble. Les cartes Sécurité Maritime et Code des Transports ouvrent les rubriques. La flèche à côté du menu replie ou déplie les sous-menus sans quitter la page.' },
      { title: 'Lire le carnet de veille', detail: 'Le tableau présente chaque texte, la date de sa dernière revue, son auteur, les mises à jour constatées et son état. Recherchez un titre ou utilisez Revues à réaliser pour afficher les textes sans revue ou dont la revue doit être renouvelée.' },
      { title: 'Effectuer la revue mensuelle', detail: 'Administration, Direction et Armement utilisent Faire la revue après consultation de la source officielle. Choisissez Aucune mise à jour constatée ou Des mises à jour ont été constatées ; dans ce dernier cas, décrivez les évolutions et les articles concernés. Valider la revue enregistre automatiquement la date et l’auteur. L’échéance suivante intervient un mois calendaire après la revue.' },
      { title: 'Consulter l’historique', detail: 'Ouvrez Historique sur la ligne d’un texte pour retrouver toutes les revues enregistrées, leurs auteurs, leurs dates et les mises à jour relevées. Les revues précédentes sont conservées, avec le titre et le lien consultés au moment de chaque vérification.' },
      { title: 'Ajouter une référence', detail: 'Administration, Direction et Armement utilisent Ajouter un lien. Renseignez le Titre du texte, une Adresse du lien HTTPS sans identifiant ni mot de passe, puis la Rubrique Sécurité Maritime ou Code des Transports. Enregistrer le lien l’ajoute au carnet de veille. Le crayon permet de modifier une référence ajoutée ; changer son adresse impose une nouvelle revue.' },
    ],
    reminders: ['Un texte sans revue enregistrée affiche À revoir. Après un mois calendaire sans nouvelle revue, il affiche En retard.', 'La date d’une version du document officiel ne remplace pas la date de revue dans SeaPilot. Les mises à jour sont renseignées après vérification de la source ; elles ne sont pas détectées automatiquement.', 'Marin et Capitaine disposent de la consultation ; demandez à un responsable habilité de compléter une revue ou un lien.'],
  },
  regulatorySafety: {
    purpose: 'Consulter les références officielles de sécurité maritime et les divisions applicables, puis retrouver leur suivi de revue.',
    access: REGULATORY_LIBRARY_ACCESS,
    steps: [
      { title: 'Ouvrir Sécurité Maritime', detail: 'Dans Bibliothèque Réglementaire, choisissez Sécurité Maritime. Les Liens directs sont affichés au-dessus de l’accès au Pôle réglementation de la sécurité maritime sur mer.gouv.fr.' },
      { title: 'Choisir une division', detail: 'Les références initiales sont Division 160 - Gestion de la Sécurité, Division 213 - Prévention de la Pollution, Division 214 - Protection des travailleurs et appareils de levage et Division 222 - Conception et Exploitation des navires de charge de jauge brute inférieure à 500.' },
      { title: 'Lire un PDF ou ouvrir la source officielle', detail: 'Le titre d’une division ouvre son PDF dans un nouvel onglet. Lire le PDF dans SeaPilot affiche le lecteur intégré. Si le lecteur reste vide, utilisez Ouvrir le PDF. Ouvrir le site officiel donne accès au Pôle réglementation ; le site du ministère bloque son affichage intégré et se consulte dans un nouvel onglet.' },
      { title: 'Consulter le suivi de la rubrique', detail: 'Le Carnet de veille reprend les dernières revues et les mises à jour constatées pour chaque texte. Historique conserve les vérifications précédentes. Administration, Direction et Armement réalisent les revues et peuvent ajouter d’autres références avec un titre, une adresse HTTPS et la rubrique Sécurité Maritime.' },
    ],
    reminders: ['Les quatre PDF sont les références enregistrées dans la bibliothèque ; vérifiez les versions disponibles sur la source officielle avant de valider une revue.', 'Une alerte apparaît après un mois calendaire sans revue ; consulter un PDF ne valide pas la revue.', 'Les accès externes dépendent de la disponibilité du site officiel.'],
  },
  regulatoryTransport: {
    purpose: 'Ouvrir la référence Code des Transports sur Légifrance et consulter les revues et les mises à jour relevées.',
    access: REGULATORY_LIBRARY_ACCESS,
    steps: [
      { title: 'Ouvrir Code des Transports', detail: 'Dans Bibliothèque Réglementaire, choisissez Code des Transports. Le bouton Ouvrir le site officiel ouvre la référence Légifrance dans un nouvel onglet.' },
      { title: 'Consulter Légifrance', detail: 'Légifrance bloque son affichage intégré. Consultez le texte sur le site officiel et suivez sa vérification d’accès si elle apparaît. Le carnet de veille SeaPilot reste disponible pour suivre les vérifications du texte.' },
      { title: 'Lire les revues et les mises à jour', detail: 'Dans le Carnet de veille, consultez la Dernière revue, les Mises à jour et l’État du texte. Historique reprend les revues conservées. Administration, Direction et Armement utilisent Faire la revue après consultation de Légifrance, décrivent les évolutions constatées si nécessaire, puis choisissent Valider la revue.' },
      { title: 'Compléter les références', detail: 'Administration, Direction et Armement peuvent utiliser Ajouter un lien pour enregistrer un autre texte. Renseignez son titre, une adresse HTTPS sans identifiant ni mot de passe et la rubrique Code des Transports. Chaque référence dispose ensuite de son propre suivi mensuel.' },
    ],
    reminders: ['L’ouverture de Légifrance ne valide pas automatiquement une revue.', 'Un texte sans revue est À revoir ; après un mois calendaire sans nouvelle revue, l’alerte En retard apparaît.', 'Marin et Capitaine consultent les références et l’historique ; la saisie des liens et des revues est réservée aux responsables habilités.'],
  },
  ovid: documentaryAuditGuide('OVID'),
  ecmid: documentaryAuditGuide('eCMID'),
  externalIsmAudits: documentaryAuditGuide('Audit ISM Externe'),
  internalAudits: {
    purpose: 'Planifier les audits ISM internes annuels, conserver leurs réponses notées et suivre le traitement des non conformités et des remarques.',
    access: 'Administration, Direction et Armement peuvent planifier les audits, adapter les grilles, saisir les réponses et émettre les écarts. Marin et Capitaine consultent les audits de leur périmètre et peuvent traiter les écarts affectés à leur personne ou à une fonction qu’ils exercent sur le navire désigné. La clôture est réservée aux responsables habilités après vérification du traitement.',
    steps: [
      { title: 'Ouvrir le module et choisir un audit', detail: 'Dans le menu Audits, choisissez Audit ISM Interne. Les onglets Planning, Grilles, Grille d’audit, Synthèse et Graphique donnent accès aux étapes du suivi. Dans les trois derniers onglets, choisissez le site, le navire et l’année avec Audit sélectionné.' },
      { title: 'Planifier la campagne annuelle', detail: 'Les responsables utilisent Planning pour Armement - CHERBOURG, Yard - LE HAVRE, GOURY, LE ROZEL, LANDEMER, SUROIT, KROKDUR et HIRONDELLE DE LA MANCHE. Choisissez l’année, définissez la date anniversaire de référence et cliquez sur Planifier. La périodicité est de 1 an, avec une fenêtre de ± 3 mois calendaires autour de la date anniversaire. Choisissez la grille de référence, la date planifiée dans cette fenêtre et l’auditeur. Un seul audit est prévu par site et par année. La date planifiée peut être ajustée tant que l’audit reste planifié ; ce déplacement ne change pas la référence annuelle.' },
      { title: 'Adapter une grille au navire', detail: 'Dans Grilles, la grille BBTM issue du fichier de référence comporte 61 questions, avec un barème initial de 3 points par question. Les responsables peuvent créer une grille personnalisée, par exemple Grille LE ROZEL, en copiant une grille existante et en choisissant le navire. Ajoutez, modifiez ou supprimez des lignes ; renseignez le chapitre, la référence, la question, le barème maximum et les éléments à vérifier, puis cliquez sur Enregistrer la grille. Chaque nouvel audit reçoit une copie de la grille et de sa version.' },
      { title: 'Renseigner et enregistrer les réponses', detail: 'Dans Grille d’audit, chaque question, réponse, observation et action tient sur une ligne du tableau compact. Les éléments à vérifier restent toujours visibles. Les responsables répondent à chaque question : Conforme attribue le maximum du barème, Incomplet sa moitié, Non Conforme 0 point. N/A retire entièrement le barème de cette question du calcul. Complétez les observations et les preuves, puis cliquez sur Enregistrer les réponses. Pendant la préparation, les questions de cette copie peuvent aussi être adaptées avec Modifier la question et de nouvelles lignes ajoutées. Une ligne liée à un écart doit être conservée. Enregistrez ou annulez vos modifications avant de changer d’audit, de grille ou d’onglet.' },
      { title: 'Émettre et affecter un écart', detail: 'Depuis une ligne, les responsables utilisent Émettre un écart. Choisissez Non conformité majeure, Non conformité mineure ou Remarque, décrivez le constat et désignez le responsable de traitement. Le délai de traitement proposé est de 1 semaine pour une majeure et de 1 mois calendaire pour une mineure ; il est modifiable en jours, semaines ou mois. L’échéance est calculée depuis la date de création de l’écart. Une remarque n’a pas de délai et sa clôture est facultative. Vous pouvez joindre des photos du constat, au format JPEG, PNG ou WebP, jusqu’à 10 Mo par photo. L’affectation peut viser une personne ou une fonction sur un navire, par exemple Capitaines LE ROZEL, Chefs Mécaniciens LE ROZEL ou Équipage LE ROZEL. Plusieurs écarts peuvent être émis pour la même ligne. La réponse Non Conforme et l’émission d’un écart sont deux actions distinctes : utilisez ce bouton pour créer le suivi.' },
      { title: 'Suivre le traitement dans la synthèse', detail: 'Synthèse compile toutes les non conformités majeures, mineures et remarques de l’audit sélectionné, avec le responsable, l’échéance éventuelle, le statut et les photos du constat. Les responsables habilités et la personne ou la fonction affectée ouvrent Suivre le traitement, décrivent l’action menée et ses preuves, puis enregistrent le traitement. Des photos peuvent être jointes au traitement et à la clôture. L’écart peut passer de Ouvert à En traitement, puis Traité · à valider. Le responsable habilité vérifie le traitement avant de le passer à Clôturé. Aucune date de clôture n’est demandée : l’action est horodatée automatiquement. Chaque enregistrement reste dans l’historique avec son auteur et sa date, ainsi que ses photos. Les remarques peuvent rester ouvertes sans retard ni obligation de clôture.' },
      { title: 'Finaliser et conserver l’audit', detail: 'La date de réalisation est renseignée automatiquement à la date du jour lors du démarrage de l’audit. Les responsables renseignent l’auditeur, répondent à toutes les questions, puis utilisent Finaliser l’audit et Confirmer la réalisation. Les questions, barèmes, réponses et observations sont alors figés et conservés dans la grille d’audit. Le traitement des écarts reste disponible dans Synthèse après la réalisation ; des écarts peuvent encore être émis depuis les lignes conservées.' },
      { title: 'Comparer les scores avec l’année précédente', detail: 'Après la réalisation, Graphique présente un radar des scores par chapitre avec l’audit réalisé du même site ou navire en année N−1, accompagné des scores et de leur évolution en points de pourcentage. Les N/A restent exclus du calcul de chaque audit. Si aucun audit réalisé n’existe pour cette année précédente, le graphique le signale et laisse le score précédent absent.' },
      { title: 'Imprimer la grille', detail: 'Enregistrez les modifications puis choisissez Imprimer la grille pour ouvrir le PDF de la grille seule. Il conserve toutes les questions, les éléments à vérifier, les réponses, les observations et les points, sans la synthèse ni les photos des écarts. Utilisez la commande d’impression du lecteur PDF.' },
      { title: 'Exporter le rapport', detail: 'Enregistrez vos modifications, puis utilisez Exporter le rapport pour l’audit sélectionné. Le PDF comprend Grille d’audit, Synthèse et Graphique. Le classeur Excel contient ces trois onglets, les réponses conservées, les écarts, leur historique, les photos du constat et de la clôture et un graphique annuel. Un audit non finalisé porte la mention Brouillon. Une photo indisponible bloque l’export complet et invite à réessayer.' },
    ],
    reminders: ['La date anniversaire annuelle reste la référence de la fenêtre, même si la date planifiée change.', 'Modifier une grille de référence ne remplace pas les questions et les réponses déjà copiées dans un audit.', 'Un barème personnalisé remplace les 3 points initiaux de la ligne concernée. Si toutes les questions sont N/A, aucun pourcentage de conformité n’est calculé.', 'Un écart doit toujours avoir un responsable de traitement. Vérifiez les non conformités en retard dans Synthèse ; les remarques n’ont aucune échéance.', 'La finalisation fige la grille ; elle ne clôture pas automatiquement les écarts.'],
  },
  clientAudits: documentaryAuditGuide('Audit Client'),
  lsa: {
    purpose: 'Retrouver les équipements de sauvetage et leurs documents dans le Registre LSA.',
    access: 'Marin et Capitaine consultent les données de leur périmètre autorisé. Administration, Direction et Armement peuvent ajouter et modifier les fiches de leur société.',
    steps: [
      { title: 'Choisir un navire', detail: 'Dans Registres → Registre LSA, sélectionnez la carte du navire comme dans le Registre des Remorques.' },
      { title: 'Filtrer l’inventaire', detail: 'Choisissez Gilets de Sauvetage, GMDSS, Navigation, Pyrotechnie ou Survie. La recherche porte aussi sur la marque, le modèle et le numéro de série.' },
      { title: 'Consulter les documents', detail: 'Ouvrez Documents de contrôle, puis filtrez par année. Téléchargez les fichiers avec la flèche. Détails et historique conserve les notes et les événements de renouvellement de chaque fiche.' },
    ],
    reminders: ['Les quatre catégories ont quitté Certificats flotte après vérification de leur copie.', 'Les désignations sont classées par type et par ordre alphabétique. Le numéro est automatique pour chaque désignation et chaque navire.', 'Les administrateurs peuvent adapter l’arborescence depuis Gérer les désignations. Les éléments archivés restent conservés sur les fiches.', 'L’alarme se déclenche à J−90 de la date d’échéance. Les documents en attente de validation gardent leur statut. Une échéance absente reste à renseigner.'],
  },
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
      { title: 'Demander des congés ou des RTT', detail: 'Cliquez sur Demander des congés. Vérifiez votre nom et votre solde, choisissez le type Congés ou RTT, renseignez les dates de début et de fin et un motif si nécessaire, puis cliquez sur Envoyer la demande.' },
      { title: 'Suivre la décision', detail: 'Consultez le statut de votre demande. Une demande en attente n’est pas encore une absence approuvée.' },
      { title: 'Générer une crew list', detail: 'Utilisez Générer une crew list, choisissez le navire et la date demandés, puis vérifiez les personnes proposées avant de générer le document.' },
    ],
    reminders: ['Pour corriger une affectation, contactez l’Armement.', 'Vérifiez les dates de début et de fin avant d’envoyer une demande.', 'Pour Christophe MINASSIAN et Sophie HAMEL, les compteurs Congés et RTT affichent les droits de la période moins les jours validés. Les demandes en attente restent séparées. Administration, Direction et Armement peuvent saisir les droits et les dates de période dans le formulaire.'],
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
      { title: 'Choisir le registre et le navire', detail: 'Dans le menu Registres, ouvrez Registre des Apparaux de levage ou Registre des Remorques, puis sélectionnez le navire. Examen à Fond - Grue donne accès aux certificats existants.' },
      { title: 'Consulter le registre', detail: 'Vérifiez l’identification de l’équipement, ses caractéristiques et les informations de contrôle disponibles.' },
      { title: 'Ouvrir un rapport', detail: 'Dans la liste des rapports, filtrez par année si nécessaire, puis ouvrez le contrôle souhaité ou téléchargez son PDF.' },
    ],
    reminders: ['Un PDF brouillon n’est pas un rapport finalisé : vérifiez son statut et sa date d’échéance.', 'Signalez toute anomalie constatée à votre responsable.'],
  },
};

export function getManualModules(visibleModules: AppModule[]): AppModule[] {
  const canOpenRegulatoryLibrary = visibleModules.some((module) => module.key === 'regulatoryLibrary');
  return visibleModules.filter((module) => MANUAL_GUIDES[module.key]
    && (module.family !== 'Bibliothèque Réglementaire' || canOpenRegulatoryLibrary));
}

export function normalizeManualSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim();
}
