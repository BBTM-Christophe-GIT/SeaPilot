import type { AuditQuestion, AuditTemplate } from './internalAuditModel';

export const BBTM_AUDIT_SOURCE = {
  filename: "Grille d'audit BBTM.xlsx",
  sheet: "Grille d'audit",
  sourceScoredRows: 59,
  sourcePoints: 177,
  confirmedMissingBaremes: ['10.4', '11.2.3'],
  confirmedMaxPoints: 3,
  confirmedOn: '2026-09-30',
} as const;

/** Reference criteria and verification prompts, independent of the workbook's broken formulas. */
export const BBTM_AUDIT_QUESTIONS: AuditQuestion[] = [
  {
    "id": "bbtm-row-15",
    "section": "1. Généralités",
    "reference": "1.2.2.1",
    "question": "Offrir des pratiques d'exploitation et un environnement sans danger",
    "maxPoints": 3,
    "guidance": "Comment s'assure-t-on que les risques pour la santé et l'environnement  sont maîtrisés lors des différentes opérations à bord."
  },
  {
    "id": "bbtm-row-16",
    "section": "1. Généralités",
    "reference": "1.2.2.2",
    "question": "Evaluer les risques identifiés pour ses navires, son personnel et l'environnement et établir des mesures de sécurité appropriées",
    "maxPoints": 3,
    "guidance": "Présenter le DUP à jour"
  },
  {
    "id": "bbtm-row-17",
    "section": "1. Généralités",
    "reference": "1.2.2.3",
    "question": "Améliorer constamment les compétences du personnel à terre et à bord des navires en matière de gestion de la sécurité, et notamment préparer ce personnel aux situations d'urgence, tant sur le plan de la sécurité que de la protection du milieu marin.",
    "maxPoints": 3,
    "guidance": "Présenter les exercices sécurité de la bordée"
  },
  {
    "id": "bbtm-row-18",
    "section": "1. Généralités",
    "reference": "1.2.3.1",
    "question": "Le système de gestion devrait garantir :\nQue les règles et règlements obligatoires sont observés",
    "maxPoints": 3,
    "guidance": "Présenter les dernières mises à jour réglementaires à bord"
  },
  {
    "id": "bbtm-row-19",
    "section": "1. Généralités",
    "reference": "1.2.3.2",
    "question": "Le système de gestion devrait garantir :\nQue les recueils de règles, codes, directives et normes applicables recommandés par l'Organisation, les Administrations, les sociétés de classification et les organismes du secteur maritime sont pris en considération.",
    "maxPoints": 3,
    "guidance": "Présenter la bibliothèque règlementaire à bord (Division 160, 221, MODU, SOLAS, STCW)"
  },
  {
    "id": "bbtm-row-21",
    "section": "1. Généralités",
    "reference": "1.4.1",
    "question": "Politique en matière de sécurité et de protection de l'environnement",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-22",
    "section": "1. Généralités",
    "reference": "1.4.2",
    "question": "Instructions et procédures propres à garantir la sécurité de l'exploitation des navires et la protection de l'environnement conforme à la réglementation internationale et à la législation de l'Etat du pavillon pertinentes",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-23",
    "section": "1. Généralités",
    "reference": "1.4.3",
    "question": "une hiérarchie des moyens de communications permettant aux membres du personnel à bord de communiquer entre eux et avec les membres du personnel à terre",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-24",
    "section": "1. Généralités",
    "reference": "1.4.4",
    "question": "des procédures de notification des accidents et du non-respect des dispositions du présent Code",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-25",
    "section": "1. Généralités",
    "reference": "1.4.5",
    "question": "des procédures de préparation et d'intervention pour faire face aux situations d'urgence",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-26",
    "section": "1. Généralités",
    "reference": "1.4.6",
    "question": "des procédures d'audit interne et de contrôle de la gestion",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-28",
    "section": "2. Politique en matière de sécurité et de protection de l'environnement",
    "reference": "2.1",
    "question": "La compagnie devrait établir une politique en matière de sécurité et de protection de l'environnement qui décrive comment les objectifs énoncés au paragraphe 1.2 seront réalisés",
    "maxPoints": 3,
    "guidance": "Présenter la Politique de la CML"
  },
  {
    "id": "bbtm-row-29",
    "section": "2. Politique en matière de sécurité et de protection de l'environnement",
    "reference": "2.2",
    "question": "La compagnie devrait veiller à ce que cette politique soit appliquée à tous les niveaux de l'organisation, tant à bord des navires qu'à terre",
    "maxPoints": 3,
    "guidance": "Présenter le suivi des objectifs de la compagnie"
  },
  {
    "id": "bbtm-row-31",
    "section": "3. Responsabilités et autorité de la compagnie",
    "reference": "3.2",
    "question": "La compagnie devrait définir et établir par écrit les responsabilités, les pouvoirs et les relations réciproques de l'ensemble du personnel chargé de la gestion, de l'exécution et de la vérification des activités liées à la sécurité et à la prévention de la pollution ou ayant une incidence sur celles-ci",
    "maxPoints": 3,
    "guidance": "Présenter l'organigramme et les fiches de fonction à jour."
  },
  {
    "id": "bbtm-row-32",
    "section": "3. Responsabilités et autorité de la compagnie",
    "reference": "3.3",
    "question": "La compagnie devrait veiller à ce que des ressources adéquates et un soutien approprié à terre soient fournis pour que la ou les personnes désignées puissent s'acquitter de leurs tâches.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-35",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.1.1",
    "question": "mettre en œuvre la politique de la compagnie en matière de sécurité et de protection de l'environnement",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-36",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.1.2",
    "question": "encourager les membres de l'équipage à appliquer cette politique",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-37",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.1.3",
    "question": "donner les ordres et les consignes appropriés d'une manière claire et simple",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-38",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.1.4",
    "question": "vérifier qu'il est satisfait aux spécifications",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-39",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.1.5",
    "question": "passer en revue périodiquement le système de gestion de la sécurité",
    "maxPoints": 3,
    "guidance": "Présenter la dernière \"FOR-SMS 06 A - Revue Annuelle du SMS\""
  },
  {
    "id": "bbtm-row-40",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "5.2",
    "question": "La compagnie devrait veiller à ce que le système de gestion de la sécurité à bord du navire mette expressément l'accent sur l'autorité du capitaine.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-41",
    "section": "5. Responsabilités et autorité du capitaine",
    "reference": "",
    "question": "La compagnie devrait préciser, dans le système dans le système de gestion de la sécurité, que l'autorité supérieure appartient au capitaine et qu'il a la responsabilité de prendre des décisions concernant la sécurité et la prévention de la pollution et de demander l'assistance de la compagnie si cela s'avère nécessaire.",
    "maxPoints": 3,
    "guidance": "Présenter le \"GEN-ORG 03 B - Responsabilité et Autorité du Capitaine\". Cette déclaration est-elle applicable ? Appliquée ?"
  },
  {
    "id": "bbtm-row-44",
    "section": "6. Ressources et personnel",
    "reference": "6.1.1",
    "question": "a les qualifications requises pour commander le navire",
    "maxPoints": 3,
    "guidance": "Brevets du Capitaine à jour ?"
  },
  {
    "id": "bbtm-row-45",
    "section": "6. Ressources et personnel",
    "reference": "6.1.2",
    "question": "connaît parfaitement le système de gestion de la sécurité de la compagnie",
    "maxPoints": 3,
    "guidance": "Le capitaine a-t-il reçu une formation sur l'architecture du système ISM ? Enregistrements ?"
  },
  {
    "id": "bbtm-row-46",
    "section": "6. Ressources et personnel",
    "reference": "6.1.3",
    "question": "bénéficie de tout l'appui nécessaire pour s'acquitter en toute sécurité de ses tâches",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-48",
    "section": "6. Ressources et personnel",
    "reference": "6.2.1",
    "question": "doté d'un personnel navigant ayant les qualifications, les brevets et certificats et l'aptitude physique qu'exigent les prescriptions nationales et internationales",
    "maxPoints": 3,
    "guidance": "Présenter l'état des brevets et des visites médicales de l'équipage"
  },
  {
    "id": "bbtm-row-49",
    "section": "6. Ressources et personnel",
    "reference": "6.2.2",
    "question": "doté d'effectifs appropriés afin de couvrir tous les aspects liés au maintien de la sécurité des opérations à bord",
    "maxPoints": 3,
    "guidance": "Le personnel à bord est-il correctement formé pour garantir la sécurité des opérations ? Proposition/Demande de formation ?"
  },
  {
    "id": "bbtm-row-50",
    "section": "6. Ressources et personnel",
    "reference": "6.3",
    "question": "La compagnie devrait établir des procédures pour garantir que le nouveau personnel et le personnel affecté à de nouvelles fonctions liées à la sécurité et à la protection de l'environnement reçoivent la formation nécessaire à l'exécution de leurs tâche",
    "maxPoints": 3,
    "guidance": "Présenter la familiarisation à la sécurité de la bordée.\nFOR-SEC 03.3 - Fiche Familiarisation Equipage"
  },
  {
    "id": "bbtm-row-51",
    "section": "6. Ressources et personnel",
    "reference": "",
    "question": "Les consignes qu'il est essentiel de donner avant l'appareillage devraient être identifiées, établies par écrit et transmises.",
    "maxPoints": 3,
    "guidance": "Présenter le classeur contenant l'archivage des \"FOR-GO-NOGO 02 B - Appareillage Port\""
  },
  {
    "id": "bbtm-row-52",
    "section": "6. Ressources et personnel",
    "reference": "6.4",
    "question": "La compagnie devrait veiller à ce que l'ensemble du personnel intervenant dans le système de gestion de la sécurité de la compagnie comprenne de manière satisfaisante les règles, règlements, recueils de règles, codes et directives pertinents.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-53",
    "section": "6. Ressources et personnel",
    "reference": "6.5",
    "question": "La compagnie devrait établir et maintenir des procédures permettant d'identifier la formation éventuellement nécessaire pour la mise en œuvre du système de gestion de la sécurité et veiller à ce qu'une telle formation soit dispensée à l'ensemble du personnel concerné",
    "maxPoints": 3,
    "guidance": "Formation de l'équipage à l'utilisation du Système ISM à bord ?"
  },
  {
    "id": "bbtm-row-54",
    "section": "6. Ressources et personnel",
    "reference": "6.6",
    "question": "La compagnie devrait élaborer des procédures garantissant que le personnel du navire reçoive les renseignements appropriés sur le système de gestion de la sécurité dans une ou plusieurs langue(s) de travail qu'il comprenne",
    "maxPoints": 3,
    "guidance": "Les procédures et checklists sont elles comprises par la bordée ?"
  },
  {
    "id": "bbtm-row-55",
    "section": "6. Ressources et personnel",
    "reference": "6.7",
    "question": "La compagnie devrait veiller à ce que les membres du personnel du navire soient capables de communiquer efficacement entre eux dans le cadre de leurs fonctions liées au système de gestion de la sécurité",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-57",
    "section": "7. Opérations à bord",
    "reference": "",
    "question": "La compagnie devrait établir des procédures, plans et consignes, y compris des listes de contrôle, s'il y a lieu, pour les principales opérations à bord qui concernent la sécurité du personnel et du navire et la protection de l'environnement.",
    "maxPoints": 3,
    "guidance": "Vérifier le classeur archivant les \"FOR-SMS 02.1 - Demande d'Amélioration\". Les fiches sont-elles soldées / Prises en compte par l'armement et les équipages."
  },
  {
    "id": "bbtm-row-58",
    "section": "7. Opérations à bord",
    "reference": "",
    "question": "Les diverses tâches en jeu devraient être définies et être assignées à un personnel qualifié.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-60",
    "section": "8. Préparation aux situations d'urgence",
    "reference": "8.1",
    "question": "La compagnie devrait établir les procédures pour identifier et décrire les situations d’urgence susceptibles de survenir à bord ainsi que les mesures à prendre pour y faire face",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-61",
    "section": "8. Préparation aux situations d'urgence",
    "reference": "8.2",
    "question": "La compagnie devrait mettre au point des programmes d’exercices préparant aux mesures à prendre en cas d’urgence",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-62",
    "section": "8. Préparation aux situations d'urgence",
    "reference": "8.3",
    "question": "Le système de gestion doit prévoir des mesures propres à garantir que l’organisation de la compagnie est à tout moment en mesure de faire face aux dangers, accidents et situations d’urgence pouvant mettre en cause ses navires",
    "maxPoints": 3,
    "guidance": "Présenter le suivi des exercices d'urgence à bord."
  },
  {
    "id": "bbtm-row-64",
    "section": "9. Notification et analyse des irrégularités, des accidents et des incidents potentiellement dangereux",
    "reference": "9.1",
    "question": "Le système de gestion de la sécurité devrait prévoir des procédures garantissant que les irrégularités, les accidents potentiellement dangereux sont signalés à la compagnie et qu'ils font l'objet d'une enquête et d'une analyse, l'objectif étant de renforcer la sécurité et la prévention de la pollution.",
    "maxPoints": 3,
    "guidance": "Vérifier le classeur archivant les \"FOR-SMS 02.2 - Fiche d'Accident - Presqu'Accident - Situation Dangereuse\". Les fiches sont-elles soldées / Prises en compte par l'armement et les équipages."
  },
  {
    "id": "bbtm-row-65",
    "section": "9. Notification et analyse des irrégularités, des accidents et des incidents potentiellement dangereux",
    "reference": "9.2",
    "question": "La compagnie devrait établir des procédures pour l'application de mesures correctives, y compris de mesures propres à éviter que le même problème ne se reproduise.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-67",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.1",
    "question": "La compagnie devrait mettre en place des procédures permettant de vérifier que le navire est maintenu dans un état conforme aux dispositions des règles et des règlements pertinents ainsi qu'aux prescriptions supplémentaires qui pourraient être établies par la compagnie.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-69",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.2.1",
    "question": "Des inspections soient effectuées à intervalles appropriés",
    "maxPoints": 3,
    "guidance": "Suivi des \"FOR-TEC- 27 - Essais Hebdomadaires Machine\""
  },
  {
    "id": "bbtm-row-70",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.2.2",
    "question": "toute irrégularité soit signalée, avec indication de la cause éventuelle, si celle-ci est connue",
    "maxPoints": 3,
    "guidance": "Suivi des \"Waranty Claim\" / \"Fiches de travaux\" / \"Demandes d'Amélioration\""
  },
  {
    "id": "bbtm-row-71",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.2.3",
    "question": "les mesures correctives appropriées soient prises",
    "maxPoints": 3,
    "guidance": "Comment le Chef Mécanicien traite-t-il les avaries ? Les avaries entrainent elle la modification du plan de maintenance ?"
  },
  {
    "id": "bbtm-row-72",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.2.4",
    "question": "ces activités soient consignées dans un registre",
    "maxPoints": 3,
    "guidance": "Présenter le journal Machine (prise en compte des remarques des autres chefs mécaniciens)"
  },
  {
    "id": "bbtm-row-73",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.3",
    "question": "La compagnie devrait identifier le matériel et les systèmes techniques dont la panne soudaine pourrait entrainer des situations dangereuses.",
    "maxPoints": 3,
    "guidance": "Donner la définition d'un équipement Critique, Redondant et en Marche discontinue\nPrésenter la procédure d'identification des Equipements Critiques, redondants et en marche discontinue.\nPrésenter la liste des Equipements C-R-MD"
  },
  {
    "id": "bbtm-row-74",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "",
    "question": "Le système de gestion de la sécurité devrait prévoir des mesures spécifiques pour renforcer la fiabilité de ce matériel et de ces systèmes.",
    "maxPoints": 3,
    "guidance": "Quelle sont les mesures mises en œuvre pour renforcer la fiabilité de ces équipements"
  },
  {
    "id": "bbtm-row-75",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "",
    "question": "Ces mesures devraient inclure la mise à l'essai à intervalles régulier de ces dispositifs et du matériel de secours ainsi que des systèmes techniques qui ne sont pas utilisés en permanence.",
    "maxPoints": 3,
    "guidance": "Présenter le plan de maintenance avec le suivi des Equipements Critiques, Redondants et en Marche Discontinue."
  },
  {
    "id": "bbtm-row-76",
    "section": "10. Maintien en état du navire et de son armement",
    "reference": "10.4",
    "question": "Les inspections mentionnées au paragraphe 10.2 ci-dessus ainsi que les mesures visées au paragraphe 10.3 devraient être intégrées dans le programme d'entretien courant",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-78",
    "section": "11. Documents",
    "reference": "11.1",
    "question": "La compagnie devrait élaborer et maintenir des procédures permettant de contrôler tous les documents et renseignements se rapportant au système de gestion de la sécurité",
    "maxPoints": 3,
    "guidance": "Comment le capitaine gère-t-il le SMS ?\nVersion périmées ? Mises à jour ?"
  },
  {
    "id": "bbtm-row-79",
    "section": "11. Documents",
    "reference": "11.2",
    "question": "la compagnie devrait s'assurer que :",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-80",
    "section": "11. Documents",
    "reference": "11.2.1",
    "question": "des documents en cours de validité sont disponibles à tous les endroits pertinents",
    "maxPoints": 3,
    "guidance": "Préciser les différents lieux de stockage du SMS.\nVérifier que les différentes version du SMS soient à jour."
  },
  {
    "id": "bbtm-row-81",
    "section": "11. Documents",
    "reference": "11.2.2",
    "question": "Les modifications apportées à ces documents sont examinées et approuvées par le personnel compétent",
    "maxPoints": 3,
    "guidance": "Gestion des mises à jour documentaires à bord"
  },
  {
    "id": "bbtm-row-82",
    "section": "11. Documents",
    "reference": "11.2.3",
    "question": "Les documents périmés sont rapidement retirés",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-83",
    "section": "11. Documents",
    "reference": "11.3",
    "question": "Les documents utilisés pour décrire et mettre en œuvre le système de gestion peuvent faire l’objet du « manuel de gestion de la sécurité ». Ces documents doivent être conservés sous la forme jugée la plus appropriée par la compagnie. Chaque navire doit avoir à bord tous les documents le concernant.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-85",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.1",
    "question": "La compagnie devrait effectuer des audits internes à bord et à terre, à des intervalles ne dépassant pas 12 mois, pour vérifier que les activités liées à la sécurité et à la prévention de la pollution sont conformes au système de gestion de la sécurité. Dans des circonstances exceptionnelles, cet intervalle peut être prolongé de trois mois au plus.",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-86",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.2",
    "question": "La compagnie devrait vérifier périodiquement que tous ceux qui exécutent des tâches liées au Code ISM agissent en conformité avec les responsabilités qui incombent à la compagnie en vertu du code",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-87",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.3",
    "question": "La compagnie devrait évaluer périodiquement l'efficacité du système conformément aux procédures qu'elle a établies",
    "maxPoints": 3,
    "guidance": ""
  },
  {
    "id": "bbtm-row-88",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.4",
    "question": "Les audits ainsi que les éventuelles mesures correctives devraient être exécutées conformément aux procédures établies.",
    "maxPoints": 3,
    "guidance": "Vérifier la logique de traitement des actions correctives"
  },
  {
    "id": "bbtm-row-89",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.6",
    "question": "Les résultats des audits et révisions devraient être portés à l'attention de l'ensemble du personnel ayant des responsabilités dans le secteur en cause",
    "maxPoints": 3,
    "guidance": "Les résultats du dernier audits ont-il été mis à l'affichage ?"
  },
  {
    "id": "bbtm-row-90",
    "section": "12. Vérification, examen et évaluation effectués par la compagnie",
    "reference": "12.7",
    "question": "Le personnel d'encadrement responsable du secteur concerné devrait prendre sans retard les mesures correctives nécessaires pour remédier aux défectuosités constatées.",
    "maxPoints": 3,
    "guidance": "Vérifier que les écarts constatés lors du dernier audit sont traités et ou soldés."
  }
];

export function createDefaultAuditTemplate(companyId: number, id: string = crypto.randomUUID()): AuditTemplate {
  return {
    id, companyId, siteId: null, name: 'Grille BBTM — Audit ISM Interne', version: 1, active: true,
    rows: BBTM_AUDIT_QUESTIONS.map((row) => ({ ...row })),
  };
}

export const createBbtmAuditTemplate = createDefaultAuditTemplate;
