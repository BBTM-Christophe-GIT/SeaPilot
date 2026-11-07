export const SEA_OPERATION_PDF_SECTIONS = [
  { id: 'armament', label: 'Armement' },
  { id: 'documents', label: 'Documents' },
  { id: 'checks', label: 'Contrôle avant appareillage' },
  { id: 'passage', label: 'Passage Plan' },
  { id: 'decision', label: 'Décision du Capitaine' },
] as const;

export type SeaOperationPdfSection = typeof SEA_OPERATION_PDF_SECTIONS[number]['id'];
