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
  { kind: 'bimco_supplytime', label: 'BIMCO', description: 'Partie particulière P144 renseignée et clauses générales.', extension: 'pdf', available: true },
  { kind: 'towage_contract', label: 'Contrat de remorquage BBTM', description: '19 clauses particulières et clauses générales BBTM.', extension: 'pdf', available: true },
  { kind: 'bareboat_charter', label: "Contrat d'affrètement", description: 'Affrètement coque nue, 20 cases particulières et clauses BBTM.', extension: 'pdf', available: true },
  { kind: 'intellectual_service', label: 'Prestation intellectuelle', description: 'Emplacement prêt ; modèle contractuel attendu.', extension: 'docx', available: false },
];
