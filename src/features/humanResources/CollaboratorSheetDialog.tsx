import { FileDown } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppDialog } from '../../components/AppDialog';
import {
  buildCollaboratorSheetPdf,
  buildCollaboratorSheetSections,
  type CollaboratorSheetSection,
  type CollaboratorSheetSelection,
} from './collaboratorSheet';
import { formatPersonName, type HrDocumentRecord, type PersonRecord } from './peopleQueries';
import './collaboratorSheet.css';

function sectionOptions(section: CollaboratorSheetSection) {
  return [...section.fields, ...(section.table?.columns || [])];
}

function initialSelection(sections: CollaboratorSheetSection[]): CollaboratorSheetSelection {
  return Object.fromEntries(sections.map((section) => [section.key, sectionOptions(section).map((field) => field.key)]));
}

export function CollaboratorSheetDialog({ person, documents, visibleSectionKeys, onClose }: {
  person: PersonRecord;
  documents: HrDocumentRecord[];
  visibleSectionKeys: ReadonlySet<string>;
  onClose: () => void;
}) {
  const sections = useMemo(() => buildCollaboratorSheetSections(person, documents, visibleSectionKeys), [person, documents, visibleSectionKeys]);
  const [selection, setSelection] = useState<CollaboratorSheetSelection>(() => initialSelection(sections));
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const selectedCount = sections.reduce((total, section) => total + sectionOptions(section).filter((field) => selection[section.key]?.includes(field.key)).length, 0);

  function toggleField(sectionKey: string, fieldKey: string) {
    setFeedback(null);
    setSelection((current) => {
      const keys = current[sectionKey] || [];
      return { ...current, [sectionKey]: keys.includes(fieldKey) ? keys.filter((key) => key !== fieldKey) : [...keys, fieldKey] };
    });
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedCount || generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setFeedback(null);
    try {
      const { blob, fileName } = await buildCollaboratorSheetPdf(person, sections, selection);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      setFeedback({ text: 'La fiche collaborateur PDF a été générée.', error: false });
    } catch {
      setFeedback({ text: 'Impossible de générer la fiche collaborateur. Réessayez.', error: true });
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  return createPortal(
    <div className="hr-sheet-dialog">
    <AppDialog
      description="Sélectionnez les informations à inclure dans le PDF. La signature est exclue."
      eyebrow={formatPersonName(person)}
      footer={(
        <div className="app-dialog__actions">
          <button className="sp-button sp-button--secondary" disabled={isGenerating} onClick={onClose} type="button">Fermer</button>
          <button className="sp-button sp-button--primary" disabled={!selectedCount || isGenerating} type="submit">
            <FileDown aria-hidden="true" size={18} />
            {isGenerating ? 'Génération…' : 'Générer le PDF'}
          </button>
        </div>
      )}
      icon={<FileDown aria-hidden="true" size={20} />}
      isBusy={isGenerating}
      onClose={onClose}
      onSubmit={generate}
      size="xl"
      title="Fiche Collaborateur"
    >
      <div className="hr-sheet-toolbar">
        <p>{selectedCount} information{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''}</p>
        <div>
          <button className="sp-button sp-button--secondary" disabled={isGenerating} onClick={() => { setSelection(initialSelection(sections)); setFeedback(null); }} type="button">Tout sélectionner</button>
          <button className="sp-button sp-button--secondary" disabled={isGenerating} onClick={() => { setSelection({}); setFeedback(null); }} type="button">Tout désélectionner</button>
        </div>
      </div>
      {!selectedCount ? <p role="status">Sélectionnez au moins une information pour générer la fiche.</p> : null}
      {feedback ? <p className="hr-sheet-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p> : null}
      <div className="hr-sheet-sections">
        {sections.map((section) => {
          const options = sectionOptions(section);
          const count = options.filter((field) => selection[section.key]?.includes(field.key)).length;
          const columns = section.table?.columns.filter((column) => selection[section.key]?.includes(column.key)) || [];
          return (
            <fieldset className="hr-sheet-section" disabled={isGenerating} key={section.key}>
              <legend>
                <label>
                  <input
                    aria-label={`Inclure la section ${section.label}`}
                    checked={count > 0 && count === options.length}
                    disabled={isGenerating}
                    onChange={(event) => {
                      setSelection((current) => ({ ...current, [section.key]: event.target.checked ? options.map((field) => field.key) : [] }));
                      setFeedback(null);
                    }}
                    ref={(input) => { if (input) input.indeterminate = count > 0 && count < options.length; }}
                    type="checkbox"
                  />
                  {section.label}
                </label>
              </legend>
              <div className="hr-sheet-fields">
                {section.fields.map((field) => (
                  <label key={field.key}>
                    <input aria-label={`${section.label} : ${field.label}`} checked={selection[section.key]?.includes(field.key) || false} onChange={() => toggleField(section.key, field.key)} type="checkbox" />
                    <span><strong>{field.label}</strong><small>{field.value || 'Non renseigné'}</small></span>
                  </label>
                ))}
              </div>
              {section.table ? (
                <div className="hr-sheet-documents">
                  <h3>{section.key === 'health' ? 'Visites médicales' : section.label}</h3>
                  <div aria-label={`Informations de la liste ${section.label}`} className="hr-sheet-columns">
                    {section.table.columns.map((column) => (
                      <label key={column.key}>
                        <input aria-label={`${section.label} : ${column.label}`} checked={selection[section.key]?.includes(column.key) || false} onChange={() => toggleField(section.key, column.key)} type="checkbox" />
                        {column.label}
                      </label>
                    ))}
                  </div>
                  {section.table.rows.length && columns.length ? (
                    <div className="hr-sheet-table-scroll" role="region" aria-label={`Aperçu ${section.label}`} tabIndex={0}>
                      <table>
                        <caption>{section.key === 'health' ? 'Liste des visites médicales' : `Liste ${section.label}`}</caption>
                        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
                        <tbody>{section.table.rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{row[column.key] || 'Non renseigné'}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="hr-sheet-empty">{section.table.rows.length ? 'Sélectionnez les informations de la liste à inclure.' : section.table.emptyLabel}</p>}
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </AppDialog>
    </div>,
    document.body,
  );
}
