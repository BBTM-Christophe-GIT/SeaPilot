import { ChevronDown, Eye, FileDown, Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import type { SeaOperationProjectDocument } from './seaOperationDocumentQueries';
import { SEA_OPERATION_PDF_SECTIONS, type SeaOperationPdfSection } from './seaOperationPdfSections';
import { SeaOperationPrint } from './SeaOperationPrint';
import type { SeaOperationRecord } from './seaOperationQueries';
import './seaOperationPreview.css';

interface Props {
  record: SeaOperationRecord;
  documents?: readonly SeaOperationProjectDocument[];
  disabled: boolean;
  onOpen?: (record: SeaOperationRecord) => void;
  onModify?: (record: SeaOperationRecord) => void;
  onDownload?: (record: SeaOperationRecord, sections: readonly SeaOperationPdfSection[]) => void;
}

export function SeaOperationRegisterSheet({ record, documents, disabled, onOpen, onModify, onDownload }: Props) {
  const sectionsId = useId();
  const [showSections, setShowSections] = useState(false);
  const [sections, setSections] = useState<SeaOperationPdfSection[]>(SEA_OPERATION_PDF_SECTIONS.map(section => section.id));
  const canModify = record.status === 'draft' ? record.canEdit : record.canRevise;
  return <section className="sp-panel so-register-sheet" aria-label="Fiche de l’opération">
    <div className="so-register-sheet-actions">
      {onOpen && <button type="button" className="sp-button sp-button--secondary so-secondary" aria-label="Ouvrir la fiche" disabled={disabled} onClick={() => onOpen(record)}>
        <Eye size={16} aria-hidden="true" />Ouvrir
      </button>}
      {onModify && canModify && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={disabled} onClick={() => onModify(record)}>
        <Pencil size={16} aria-hidden="true" />Modifier
      </button>}
      {onDownload && <div className="so-register-sheet-download">
        <button type="button" className="sp-button sp-button--secondary so-secondary" aria-expanded={showSections} aria-controls={sectionsId}
          disabled={disabled} onClick={() => setShowSections(value => !value)}>
          Sections PDF <span className="so-register-sheet-count">{sections.length}/{SEA_OPERATION_PDF_SECTIONS.length}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button type="button" className="sp-button sp-button--primary" aria-label="Télécharger la fiche"
          disabled={disabled || !sections.length} onClick={() => onDownload(record, sections)}>
          <FileDown size={16} aria-hidden="true" />Télécharger
        </button>
      </div>}
    </div>
    {onDownload && <fieldset id={sectionsId} className="so-register-sheet-export" disabled={disabled} hidden={!showSections}>
      <legend>Sections à télécharger</legend>
      <div className="so-register-sheet-checks">
        {SEA_OPERATION_PDF_SECTIONS.map(({ id, label }) => <label key={id}>
          <input type="checkbox" checked={sections.includes(id)} onChange={event => {
            const checked = event.target.checked;
            setSections(previous => checked ? [...previous, id] : previous.filter(section => section !== id));
          }} />{label}
        </label>)}
      </div>
    </fieldset>}
    <div className="so-register-sheet-scroller" tabIndex={0} aria-label="Aperçu de la fiche">
      <div className="so-document-preview"><SeaOperationPrint record={record} documents={documents} /></div>
    </div>
  </section>;
}
