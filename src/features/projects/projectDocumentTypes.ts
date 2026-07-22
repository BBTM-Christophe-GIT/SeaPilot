export type ProjectGeneratedDocumentKind =
  | 'offer'
  | 'bimco_supplytime'
  | 'towage_contract'
  | 'bareboat_charter'
  | 'intellectual_service';

export interface ProjectDocumentTypeDefinition {
  available: boolean;
  description: string;
  extension: 'pdf' | 'docx';
  kind: ProjectGeneratedDocumentKind;
  label: string;
}

export const PROJECT_DOCUMENT_TYPES: ProjectDocumentTypeDefinition[] = [
  { kind: 'offer', label: 'Offre commerciale', description: 'Synthèse commerciale issue du projet et du contrat.', extension: 'pdf', available: true },
  { kind: 'bimco_supplytime', label: 'BIMCO · SUPPLYTIME 2017', description: 'Part I renseignée et clauses générales Part II.', extension: 'pdf', available: true },
  { kind: 'towage_contract', label: 'Contrat de remorquage BBTM', description: '19 clauses particulières et clauses générales BBTM.', extension: 'docx', available: true },
  { kind: 'bareboat_charter', label: 'Affrètement · Coque nue', description: 'Emplacement prêt ; modèle contractuel attendu.', extension: 'docx', available: false },
  { kind: 'intellectual_service', label: 'Prestation intellectuelle', description: 'Emplacement prêt ; modèle contractuel attendu.', extension: 'docx', available: false },
];
