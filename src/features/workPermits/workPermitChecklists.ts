export type WorkPermitChecklistId =
  | 'espace-clos' | 'palan' | 'pression' | 'point-chaud'
  | 'electrique' | 'hauteur' | 'grue' | 'chariot';

export interface WorkPermitChecklistSection {
  title: string;
  phase: 'opening' | 'closing';
  items: readonly string[];
}

export interface WorkPermitChecklist {
  id: WorkPermitChecklistId;
  title: string;
  source: string;
  sections: readonly WorkPermitChecklistSection[];
  intro?: string;
  notice?: string;
  communication?: boolean;
  measurements?: readonly string[];
  measurementsNote?: string;
}

// Control wording comes from the eight supplied permit templates.
export const workPermitChecklists: readonly WorkPermitChecklist[] = [
  {
    "id": "espace-clos",
    "title": "Espace clos",
    "source": "Permis de Travail - Espace clos.docx",
    "sections": [
      {
        "title": "Espace clos",
        "phase": "opening",
        "items": [
          "A-t-il été drainé, dépressurisé si nécessaire et est-il suffisamment ventilé ?",
          "Les vannes du circuit concerné ont-elles été fermées, bloquées et marquées afin d’éviter toute manœuvre accidentelle ?",
          "Si nécessaire, une ventilation forcée a-t-elle été mise en place ?",
          "Une analyse de l’air a-t-elle été effectuée et les valeurs enregistrées ci-dessous ?",
          "L’espace est-il suffisamment éclairé ? Si ce n’est pas le cas, a-t-on mis en place un éclairage supplémentaire ?"
        ]
      },
      {
        "title": "Mesure de prévention",
        "phase": "opening",
        "items": [
          "Une veille visuelle et auditive est-elle prévue à l’entrée de l’espace clos ?",
          "Le personnel effectuant l’opération porte-il les EPI conformément à la matrice du système de management de la sécurité ?",
          "A-t-on prévu un système de ligne de vie pour récupérer la personne en charge du travail ?",
          "A-t-on disposé un appareil respiratoire à l’entrée de l’espace clos ?",
          "Le personnel exécutant l’opération sait-il qu’il doit informer le capitaine à chaque entrée et sortie de l’espace clos ?"
        ]
      },
      {
        "title": "Communication",
        "phase": "opening",
        "items": [
          "Des UHF sont-elles nécessaires ?\n☐ - Non\n☐ - Oui - Un canal de travail a été défini - Canal utilisé :"
        ]
      },
      {
        "title": "Zone de travail au départ de la charge",
        "phase": "opening",
        "items": [
          "La zone de travail est propre et dégagée de tout objet inutile ou encombrant."
        ]
      },
      {
        "title": "EPI",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Tout travail sous une charge en suspension est interdit.",
          "Un TBT a été réalisé avant l’opération",
          "La bordée et toute personne à bord a été avertie du début des travaux",
          "Les conditions météo sont compatibles avec les travaux"
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "La zone de travail a été rangée",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage"
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUT TRAVAIL DANS UN ESPACE CLOS",
    "communication": true,
    "measurementsNote": "UNE ANALYSE D’AIR DOIT ÊTRE EFFECTUÉE AVANT TOUTE ENTRÉE DANS L’ESPACE CLOS",
    "measurements": [
      "Taux d’oxygène (% O2)",
      "Limite inférieure d’explosivité (% LIE)",
      "Taux de monoxyde de carbone (% CO)",
      "Taux de Sulfure d’Hydrogène (% H2S)"
    ]
  },
  {
    "id": "palan",
    "title": "Levage au palan",
    "source": "Permis de Travail - Opération de levage - Palan.docx",
    "sections": [
      {
        "title": "Coactivité / Instruction",
        "phase": "opening",
        "items": [
          "La Capitaine s’est assuré que les travaux sont compatible avec les opérations ou tout autre travaux en cours au moment de mettre en œuvre le présent Permit de Travail.",
          "Le personnel effectuant la tâche possède-t-il les qualifications nécessaires et connaît-il les procédures d’urgence bord ?"
        ]
      },
      {
        "title": "Equipement ou objet à lever",
        "phase": "opening",
        "items": [
          "Les points d’élingage ont été identifiés et sont conformes."
        ]
      },
      {
        "title": "Accessoires de levage",
        "phase": "opening",
        "items": [
          "Les élingues, crochets, manilles et chaines ont été vérifiés et sont en bon état.",
          "Si l’équipement nécessite un accessoire particulier (palonnier ou autre), celui-ci est en bon état, sa mise en œuvre est conforme au manuel d’utilisation.",
          "Le palan utilisé est en bon état de marche, sa date de visite est valide",
          "La CMU de tous les équipements utilisés sont conformes et en adéquation avec la charge.",
          "Le point de fixation du palan est en bon état, la CMU est conforme et en adéquation avec la charge."
        ]
      },
      {
        "title": "Zone de travail",
        "phase": "opening",
        "items": [
          "Une zone d'exclusion a été définie autour de l’opération de levage.",
          "La zone de travail est propre et dégagée de tout objet inutile ou encombrant.",
          "La zone a été balisée de manière à empêcher toute personne de se trouver dans la zone à risque."
        ]
      },
      {
        "title": "Equipage / Prestataire",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Tout travail sous une charge en suspension est interdit.\nAu besoin de se positionner sous une charge, celle-ci sera soutenue par le dispositif requis comme décrit dans le manuel d’utilisation ou d’entretien, l’opération sera réalisée par un personnel compétent et formé. La procédure sera détaillée et approuvée par le capitaine.",
          "Un TBT a été réalisé avant l’opération",
          "La bordée et toute personne à bord a été avertie du début des travaux.",
          "Les conditions météo sont compatibles avec les travaux."
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "Aucune charge n’est suspendue",
          "La charge précédemment suspendue a été posée et stabilisée comme recommandé dans le manuel d’utilisation.",
          "Le palan a été retiré et rangé",
          "Les accessoires de levages ont été retirés, inspectés et rangés",
          "Le balisage de la zone de travail a été retiré"
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUTE OPERATION DE LEVAGE EFFECTUEE A L’AIDE D’UN PALAN"
  },
  {
    "id": "pression",
    "title": "Équipement sous pression",
    "source": "Permis de Travail - Equipement sous pression.docx",
    "sections": [
      {
        "title": "Coactivité / Instruction",
        "phase": "opening",
        "items": [
          "La Capitaine s’est assuré que les travaux sont compatible avec les opérations ou tout autre travaux en cours au moment de mettre en œuvre le présent Permit de Travail.",
          "Le personnel effectuant la tâche possède les qualifications nécessaires et connaît les procédures d’urgence bord."
        ]
      },
      {
        "title": "Outils",
        "phase": "opening",
        "items": [
          "L’équipe d’intervention dispose de toutes les brides d’obturation et de la visserie nécessaire à l’isolation du circuit lors du démontage des éléments.",
          "Soudure à l’arc : Le poste de soudage, le câble d’alimentation et de masse ainsi que le porte-électrode sont-ils en bon état et correctement assemblés ?"
        ]
      },
      {
        "title": "Zone de travail",
        "phase": "opening",
        "items": [
          "La zone de travail est dégagée et prête pour accueillir les travaux.",
          "La personne responsable de l’isolation du circuit sous pression de la zone de travail est clairement définie et est la seule autorisée à effectuer ces opérations.",
          "Le bouton d’arrêt d’urgence de l’équipement connecté au circuit a été percuté. Il est marqué d’un tag : « Travail en cours. Interdiction de démarrer l’équipement ».",
          "Le circuit est disposé de manière à ce que la zone d’intervention soit isolée. Un marquage de type « Tag out » sur les vannes ont été mis en place.",
          "La pression du circuit au niveau de la section de travail a été mesurée avec un minimess et elle est inférieure à 1 bar. Relevé de la mesure : ………. Bar."
        ]
      },
      {
        "title": "Prévention de la pollution",
        "phase": "opening",
        "items": [
          "L’équipement SOPEP est disponible, en quantité suffisante et prêt à être utilisé, il est composé :\nDe papier absorbant\nD’un conteneur d’une capacité suffisante pour recueillir la quantité de fluide de la section\nDe tout autre équipement nécessaire pour l’opération."
        ]
      },
      {
        "title": "EPI / Matériel de sécurité",
        "phase": "opening",
        "items": [
          "☒ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Un TBT a été réalisé avant l’opération.",
          "La bordée et toute personne à bord a été avertie du début des travaux.",
          "Les conditions météo sont compatibles avec les travaux."
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "La zone de travail et les outils ont été rangés",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage.",
          "Les kit SOPEP sont rangés et les conteneurs vidés.",
          "Les boutons d’arrêt d’urgence ont été réarmés et les tags retirés."
        ]
      }
    ],
    "intro": "CETTE FORME DOIT ETRE MISE EN ŒUVRE AFIN DE NE JAMAIS EXPOSER UNE EQUIPE DE TRAVAIL A UN RISQUE DE PROJECTION D’UN FLUIDE SOUS PRESSION."
  },
  {
    "id": "point-chaud",
    "title": "Point chaud",
    "source": "Permis de Travail - Point chaud.docx",
    "sections": [
      {
        "title": "Coactivité / Instruction",
        "phase": "opening",
        "items": [
          "La Capitaine s’est assuré que les travaux sont compatibles avec les opérations ou tout autres travaux en cours au moment de mettre en œuvre le présent Permit de Travail.",
          "Le personnel effectuant la tâche possède-t-il les qualifications nécessaires et connaît-il les procédures d’urgence bord ?"
        ]
      },
      {
        "title": "Outils",
        "phase": "opening",
        "items": [
          "Meuleuse : La meuleuse, son câble d’alimentation, le carter de protection ainsi que le disque utilisé ont-ils été vérifié et trouvé en bon état de fonctionnement.",
          "Soudure à l’arc : Le poste de soudage, le câble d’alimentation et de masse ainsi que le porte-électrode sont-ils en bon état et correctement assemblés ?"
        ]
      },
      {
        "title": "Zone de travail",
        "phase": "opening",
        "items": [
          "La zone de travail est dégagée et prête pour accueillir les travaux."
        ]
      },
      {
        "title": "Ventilation",
        "phase": "opening",
        "items": [
          "L’espace de travail est correctement ventilé."
        ]
      },
      {
        "title": "Prévention Incendie",
        "phase": "opening",
        "items": [
          "Présence de matériaux combustibles ou équipements sensibles à proximité ou dans les locaux adjacents à la zone de travail :\nMatériaux solides ou liquides (fut d’huile, calorifugeage, palettes, câblage sur cloison, etc.)\nRésidus inflammables (fuite huile/Gasoil, etc.)\nCapacités Gasoil / Caisse huile",
          "Toute opération de transfert de gasoil, d’huile ou autre combustible a-t-elle été interrompue ou est déjà terminée"
        ]
      },
      {
        "title": "EPI / Matériel de sécurité",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants de cuir\nTablier de cuir\nMasque de sécurité\nTenue de travail\nCasque anti-bruit"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Travaux à Chaud - Structure de coque (Coque, Pont, Capacité)\nLe travail à chaud entrainant la modification de la structure de la coque a fait l’objet d’une validation par la société de Classification. Présenter le plan validé par la société de classification au capitaine pour approbation avant tout travaux.",
          "Un TBT a été réalisé avant l’opération.",
          "La bordée et toute personne à bord a été avertie du début des travaux.",
          "Les conditions météo sont compatibles avec les travaux."
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "La zone de travail et les outils ont été rangés",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage."
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUT TRAVAUX PAR POINT CHAUD"
  },
  {
    "id": "electrique",
    "title": "Travaux électriques",
    "source": "Permis de Travail - Electrique.docx",
    "sections": [
      {
        "title": "Coactivité / Mesures de sécurité",
        "phase": "opening",
        "items": [
          "La Capitaine s’est assuré que les travaux sont compatible avec les opérations ou tout autre travaux en cours au moment de mettre en œuvre le présent Permit de Travail.",
          "Le personnel exécutant est qualifié et connaît les distances de sécurité à respecter sur la zone de travail en fonction des tensions nominales du circuit concerné."
        ]
      },
      {
        "title": "Zone de travail",
        "phase": "opening",
        "items": [
          "L’affichage de mise en garde contre les risques de chocs électrique est mis en place.",
          "La zone de travail est dégagée et prête pour accueillir les travaux."
        ]
      },
      {
        "title": "Outils",
        "phase": "opening",
        "items": [
          "Les outils spécifiques pour les travaux électriques sont disponibles et les seuls à être utilisés.",
          "Vérification de fonctionnement de l’appareil de mesure de hautes tensions effectué."
        ]
      },
      {
        "title": "Consignation",
        "phase": "opening",
        "items": [
          "La personne responsable de l’isolation/remise sous tension de la zone de travail est clairement définie et est la seule autorisée à effectuer ces opérations.",
          "Circuit isolé, manette(s) du(es) disjoncteur(s) bloqué(es) en position ouverte par cadenas, avec marquage type « tag Out » en place.",
          "S’il y a des clés de contact pour la mise en route d’un équipement connecté au circuit isolé, elle sont retirées et remises à la personne responsable de l’isolation/remise sous tension."
        ]
      },
      {
        "title": "Vérifications de sécurité",
        "phase": "opening",
        "items": [
          "Mesure de tension nulle effectuée sur la ligne isolée.",
          "Mesure de tension nulle effectuée sur le circuit concerné par les travaux.",
          "Vérification et connexion des câbles de masse nécessaires à l’opération."
        ]
      },
      {
        "title": "EPI / Matériel de sécurité",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nTapis isolants\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)",
          "Une perche de secours en place et prêt pour utilisation.",
          "L’équipement de lutte incendie approprié (extincteur CO2) est disponible et prêt à être utilisé."
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Un TBT a été réalisé avant l’opération.",
          "La bordée et toute personne à bord a été avertie du début des travaux.",
          "Les conditions météo sont compatibles avec les travaux."
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "Les câbles de masse précédemment mis en place ont été retirés.",
          "Les portes et panneaux ont été remis en place et sont fermés et verrouillés.",
          "Les disjoncteurs ont été déverrouillés et fermés. Les clés de contact remises en place.",
          "Le matériel est rangé et le capitaine informé du redémarrage imminent de l’installation.",
          "Le balisage/affichage sur la zone de travail a été retiré.",
          "La remise sous tension est effectuée par le responsable.",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage."
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUT TRAVAUX ELECTRIQUES"
  },
  {
    "id": "hauteur",
    "title": "Travail en hauteur",
    "source": "Permis de Travail - Travail en Hauteur.docx",
    "sections": [
      {
        "title": "Outils",
        "phase": "opening",
        "items": [
          "Les outils utilisés sont-ils en bon état et adaptés pour le travail à effectuer ?",
          "Les outils utilisés sont-ils sécurisés par une sangle, un cordon, un sac ?",
          "Un système de va-et-vient a-t-il été mis en place si d’autres outils sont nécessaires par la suite ?",
          "Le câble, et le crochet sont en bon état."
        ]
      },
      {
        "title": "EPI / HARNAIS",
        "phase": "opening",
        "items": [
          "La personne en charge du travail porte-t-elle le harnais/les EPI nécessaires à l’opération ?",
          "La personne en charge du travail en hauteur est accompagnée d’une personne pouvant donner l’alerte en cas d’urgence ?",
          "Un contrôle de toute absence de défauts ou d’usures sur le harnais et accessoires a-t-il été effectué ?"
        ]
      },
      {
        "title": "Communication",
        "phase": "opening",
        "items": [
          "Des UHF sont-elles nécessaires pour la manœuvre ?\n☐ - Non\n☐ - Oui - Un canal de travail a été défini - Canal utilisé :"
        ]
      },
      {
        "title": "EPI",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Un TBT a été réalisé avant l’opération",
          "Tous les permis de travail en cours sont compatibles avec ce permis."
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "Le balisage de la zone de travail a été retiré",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage"
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUT TRAVAIL EN HAUTEUR",
    "communication": true
  },
  {
    "id": "grue",
    "title": "Levage à la grue",
    "source": "Permis de Travail - Opération de levage - Grue.docx",
    "sections": [
      {
        "title": "Grue",
        "phase": "opening",
        "items": [
          "La grue est en bon état, à jour de sa visite, les éventuelles prescriptions ont été soldées",
          "La grue est adaptée à l’opération à réaliser",
          "Les commandes sont fonctionnelles y compris l’arrêt d’urgence",
          "Le câble, et le crochet sont en bon état."
        ]
      },
      {
        "title": "Equipement ou objet à lever",
        "phase": "opening",
        "items": [
          "Les points d’élingage ont été identifiés et sont conformes.",
          "Le levage est effectué à l’aide de paniers conformes/réglementaire avec points de levage identifiés et en bon état.\n(levage d’une palette interdit)",
          "Au besoin, l’équipage a disposé un filet de protection sur le panier afin d’empêcher que son contenu ne s’envole.",
          "Les objets sont déposés dans le panier et n’en dépassent pas."
        ]
      },
      {
        "title": "Accessoires de levage",
        "phase": "opening",
        "items": [
          "Les élingues, crochets, manilles et chaines ont été vérifiés et sont en bon état.",
          "La CMU de tous les équipements utilisés sont conformes et en adéquation avec la charge.",
          "Une corde de guidage est utilisée afin de manœuvrer la charge.\n(La charge n’est jamais guidée directement avec les mains)"
        ]
      },
      {
        "title": "Communication",
        "phase": "opening",
        "items": [
          "Les postes suivants ont été définis avant la manœuvre :\nOpérateur de la grue – Manœuvre la grue\nChef de manœuvre/élingueur – met en œuvre l’élingage et guide l’opérateur de la grue.",
          "Des UHF sont-elles nécessaires pour la manœuvre ?\n☐ - Non\n☐ - Oui - Un canal de travail a été défini - Canal utilisé :"
        ]
      },
      {
        "title": "Au départ de la charge",
        "phase": "opening",
        "items": [
          "Une zone d’exclusion a été définie autour du lieu du levage",
          "La zone de travail est propre et dégagée de tout objet inutile ou encombrant.",
          "La zone a été balisée de manière à empêcher toute personne de se trouver dans la zone à risque.",
          "Le chef de manœuvre est positionné de manière à :\nNe jamais se retrouver sous la charge\nAvoir systématiquement la vue sur la charge\nÊtre toujours en communication visuelle ou UHF avec l’opérateur de la grue"
        ]
      },
      {
        "title": "Trajet de la charge",
        "phase": "opening",
        "items": [
          "Aucun risque identifié sur le trajet de la charge",
          "Si des personnes étrangères à la manœuvre se trouvent sur le trajet de la charge, un balisage est disposé",
          "Le chef de manœuvre s’assure que personne ne se retrouve sous la charge durant son trajet."
        ]
      },
      {
        "title": "A l’arrivée de la charge",
        "phase": "opening",
        "items": [
          "La zone est identifiée et dégagée"
        ]
      },
      {
        "title": "EPI",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Tout travail sous une charge en suspension est interdit.",
          "Un TBT a été réalisé avant l’opération",
          "Aucun autre permis de travail n’a été ouvert sur le lieu de départ, de trajet ni à l’arrivée de la charge.",
          "La bordée et toute personne à bord a été avertie du début de l’opération de levage",
          "Les conditions météo sont compatibles avec l’opération de levage"
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "Aucune charge n’est suspendue",
          "La charge précédemment suspendue a été posée et stabilisée comme recommandé dans le manuel d’utilisation.",
          "La grue a été repliée toute anomalie de fonctionnement a été consignée en vue d’être inspecté",
          "Les accessoires de levages ont été retirés, inspectés et rangés",
          "Le balisage de la zone de travail a été retiré",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage"
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUTE OPERATION DE LEVAGE EFFECTUEE A L’AIDE D’UNE GRUE",
    "communication": true
  },
  {
    "id": "chariot",
    "title": "Stockage au chariot élévateur",
    "source": "Permis de Travail - Stockage au chariot élévateur.docx",
    "sections": [
      {
        "title": "Grue",
        "phase": "opening",
        "items": [
          "La grue est en bon état, à jour de sa visite, les éventuelles prescriptions ont été soldées",
          "La grue est adaptée à l’opération à réaliser",
          "Les commandes sont fonctionnelles y compris l’arrêt d’urgence",
          "Le câble, et le crochet sont en bon état."
        ]
      },
      {
        "title": "Equipement ou objet à lever",
        "phase": "opening",
        "items": [
          "Les points d’élingage ont été identifiés et sont conformes.",
          "Le levage est effectué à l’aide de paniers conformes/réglementaire avec points de levage identifiés et en bon état.\n(levage d’une palette interdit)",
          "Au besoin, l’équipage a disposé un filet de protection sur le panier afin d’empêcher que son contenu ne s’envole.",
          "Les objets sont déposés dans le panier et n’en dépassent pas."
        ]
      },
      {
        "title": "Accessoires de levage",
        "phase": "opening",
        "items": [
          "Les élingues, crochets, manilles et chaines ont été vérifiés et sont en bon état.",
          "La CMU de tous les équipements utilisés sont conformes et en adéquation avec la charge.",
          "Une corde de guidage est utilisée afin de manœuvrer la charge.\n(La charge n’est jamais guidée directement avec les mains)"
        ]
      },
      {
        "title": "Communication",
        "phase": "opening",
        "items": [
          "Les postes suivants ont été définis avant la manœuvre :\nOpérateur de la grue – Manœuvre la grue\nChef de manœuvre/élingueur – met en œuvre l’élingage et guide l’opérateur de la grue.",
          "Des UHF sont-elles nécessaires pour la manœuvre ?\n☐ - Non\n☐ - Oui - Un canal de travail a été défini - Canal utilisé :"
        ]
      },
      {
        "title": "Au départ de la charge",
        "phase": "opening",
        "items": [
          "Une zone d’exclusion a été définie autour du lieu du levage",
          "La zone de travail est propre et dégagée de tout objet inutile ou encombrant.",
          "La zone a été balisée de manière à empêcher toute personne de se trouver dans la zone à risque.",
          "Le chef de manœuvre est positionné de manière à :\nNe jamais se retrouver sous la charge\nAvoir systématiquement la vue sur la charge\nÊtre toujours en communication visuelle ou UHF avec l’opérateur de la grue"
        ]
      },
      {
        "title": "Trajet de la charge",
        "phase": "opening",
        "items": [
          "Aucun risque identifié sur le trajet de la charge",
          "Si des personnes étrangères à la manœuvre se trouvent sur le trajet de la charge, un balisage est disposé",
          "Le chef de manœuvre s’assure que personne ne se retrouve sous la charge durant son trajet."
        ]
      },
      {
        "title": "A l’arrivée de la charge",
        "phase": "opening",
        "items": [
          "La zone est identifiée et dégagée"
        ]
      },
      {
        "title": "EPI",
        "phase": "opening",
        "items": [
          "☐ Obligatoire\nCasque de travail avec jugulaire\nChaussures de sécurité\nGants\nLunettes de sécurité\nTenue de travail\nEn fonction du risque identifié\n☐ - Casque anti-bruit au besoin\n☐ - VFI (travail à moins de 2 m de l’eau sans protection collective)"
        ]
      },
      {
        "title": "Opérations",
        "phase": "opening",
        "items": [
          "Tout travail sous une charge en suspension est interdit.",
          "Un TBT a été réalisé avant l’opération",
          "Aucun autre permis de travail n’a été ouvert sur le lieu de départ, de trajet ni à l’arrivée de la charge.",
          "La bordée et toute personne à bord a été avertie du début de l’opération de levage",
          "Les conditions météo sont compatibles avec l’opération de levage"
        ]
      },
      {
        "title": "Retrait de la consignation",
        "phase": "closing",
        "items": [
          "Aucune charge n’est suspendue",
          "La charge précédemment suspendue a été posée et stabilisée comme recommandé dans le manuel d’utilisation.",
          "La grue a été repliée toute anomalie de fonctionnement a été consignée en vue d’être inspecté",
          "Les accessoires de levages ont été retirés, inspectés et rangés",
          "Le balisage de la zone de travail a été retiré",
          "La bordée et toute personne à bord a été avertie de la fin de l’opération de levage"
        ]
      }
    ],
    "intro": "CE FORMULAIRE DOIT ETRE COMPLETE AVANT ET APRES TOUTE OPERATION DE STOCKAGE REALISEE AVEC LE CHARIOT ELEVATEUR",
    "notice": "Modèle source à valider. Le document reprend les contrôles du permis de levage à la grue, y compris les mentions de la grue.",
    "communication": true
  }
];

export const workPermitChecklistById: Readonly<Record<string, WorkPermitChecklist | undefined>> =
  Object.fromEntries(workPermitChecklists.map((checklist) => [checklist.id, checklist]));
