export interface ReleaseNote {
  id: string;
  version: string;
  publishedOn: string;
  title: string;
  changes: readonly string[];
}

// Add a note only when the user requests one. Published IDs and notes remain stable.
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '3.54.1-temporary-captain-rights',
    version: '3.54.1',
    publishedOn: '2026-09-23',
    title: 'Les fonctions temporaires de Capitaine sont prises en compte',
    changes: [
      'Une affectation confirmée comme Capitaine dans le Planning donne accès aux actions de Capitaine sur le navire et les journées concernés, y compris lorsque la fonction RH reste 2nd Capitaine.',
      'Le DPR reprend la fonction exercée dans le Planning. Le Capitaine temporaire peut gérer les DPR de son navire pendant son affectation.',
      'Le Capitaine temporaire peut saisir et valider ses heures et celles de sa bordée, avec les mêmes signatures et contrôles de conformité qu’un Capitaine titulaire.',
      'Les fonctions définies à la journée sont prises en compte. Les droits suivent les dates de l’affectation et ne modifient ni la fiche RH ni le profil permanent.',
    ],
  },
  {
    id: '3.53.0-lsa-register',
    version: '3.53.0',
    publishedOn: '2026-09-23',
    title: 'Vos équipements de sauvetage dans le Registre LSA',
    changes: [
      'Le menu Registres accueille le Registre LSA, avec la présentation et les filtres du Registre des Remorques : sélection du navire, type d’équipement, recherche et année des documents.',
      'Les fiches Life Jacket, GMDSS, Pyrotechnie et Bouée, Feux à retournement et MOB ont été transférées depuis Certificats flotte. Les dates, notes, documents et historiques sont conservés.',
      'La copie a été vérifiée avant le retrait des fiches des Certificats flotte. Les autres catégories restent à leur emplacement habituel.',
      'Administration, Direction et Armement peuvent ajouter et modifier les fiches LSA. Marin et Capitaine consultent les équipements et les documents dans leur périmètre autorisé.',
    ],
  },
  {
    id: '3.51.0-lifting-sections',
    version: '3.51.0',
    publishedOn: '2026-09-23',
    title: 'Vos registres de levage réunis dans Registres',
    changes: [
      'Le menu Registres propose trois accès directs : Registre des Apparaux de levage, Registre des Remorques et Examen à Fond - Grue. Le menu Levage a été supprimé.',
      'Les inventaires, contrôles, rapports, fiches papier, certificats et filtres restent disponibles dans leur rubrique respective.',
      'Les notes de mise à jour vous présentent les nouveautés à la première ouverture. Choisissez Ok pour les marquer comme lues ou Lire plus tard pour les retrouver en cliquant sur la version de SeaPilot.',
      'Une pastille rouge près de la version indique le nombre de notes non lues. Si plusieurs notes vous attendent, elles sont présentées de la plus ancienne à la plus récente.',
    ],
  },
  {
    id: '3.55.0-expense-notes-launch',
    version: '3.55.0',
    publishedOn: '2026-09-24',
    title: 'Le module « Notes de Frais » est disponible dans SeaPilot',
    changes: [
      'Le module « Notes de Frais » vous permet de retrouver et de suivre les notes de frais émises, directement dans SeaPilot.',
      'Il remplace l’ancienne application de notes de frais, qui sera arrêtée à la fin du mois de septembre 2026.',
      'Utilisez dès maintenant le module « Notes de Frais » de SeaPilot pour le suivi de vos notes de frais.',
    ],
  },
];

export function chronologicalNotes(notes: readonly ReleaseNote[]): ReleaseNote[] {
  return [...notes].sort((a, b) => a.publishedOn.localeCompare(b.publishedOn)
    || a.version.localeCompare(b.version, 'en', { numeric: true }) || a.id.localeCompare(b.id));
}
