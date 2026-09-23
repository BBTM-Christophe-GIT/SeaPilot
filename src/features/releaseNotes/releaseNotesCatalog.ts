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
    id: '3.51.0-lifting-sections',
    version: '3.51.0',
    publishedOn: '2026-09-23',
    title: 'Vos registres accessibles directement dans Levage',
    changes: [
      'Le menu Levage propose maintenant trois accès directs : Registre des Apparaux de Levage, Registre des Remorques et Examen à fond - Grue.',
      'Les inventaires, contrôles, rapports, fiches papier, certificats et filtres restent disponibles dans leur rubrique respective.',
      'Les notes de mise à jour vous présentent les nouveautés à la première ouverture. Choisissez Ok pour les marquer comme lues ou Lire plus tard pour les retrouver en cliquant sur la version de SeaPilot.',
      'Une pastille rouge près de la version indique le nombre de notes non lues. Si plusieurs notes vous attendent, elles sont présentées de la plus ancienne à la plus récente.',
    ],
  },
];

export function chronologicalNotes(notes: readonly ReleaseNote[]): ReleaseNote[] {
  return [...notes].sort((a, b) => a.publishedOn.localeCompare(b.publishedOn)
    || a.version.localeCompare(b.version, 'en', { numeric: true }) || a.id.localeCompare(b.id));
}
