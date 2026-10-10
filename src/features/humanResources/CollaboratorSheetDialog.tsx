import { FileDown } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppDialog } from '../../components/AppDialog';
import {
  buildCollaboratorSheetPdf,
  buildCollaboratorSheetSections,
  buildCollaboratorSheetsExport,
  type CollaboratorSheetSection,
  type CollaboratorSheetSelection,
  type CollaboratorSheetsExportMode,
} from './collaboratorSheet';
import { formatPersonName, type HrDocumentRecord, type PersonRecord } from './peopleQueries';
import './collaboratorSheet.css';

function sectionOptions(section: CollaboratorSheetSection) {
  return [...section.fields, ...(section.table?.columns || [])];
}

function initialSelection(sections: CollaboratorSheetSection[]): CollaboratorSheetSelection {
  return Object.fromEntries(sections.map((section) => [section.key, sectionOptions(section).map((field) => field.key)]));
}

export function CollaboratorSheetDialog({ person, people, documents, visibleSectionKeys, onClose }: {
  person: PersonRecord;
  people?: PersonRecord[];
  documents: HrDocumentRecord[];
  visibleSectionKeys: ReadonlySet<string>;
  onClose: () => void;
}) {
  const isBulk = people !== undefined;
  const [selectedPersonIds, setSelectedPersonIds] = useState<ReadonlySet<number>>(() => new Set());
  const [previewPersonId, setPreviewPersonId] = useState<number | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [exportMode, setExportMode] = useState<CollaboratorSheetsExportMode>('separate');
  const [includePhoto, setIncludePhoto] = useState(true);
  const exportModeName = useId();
  const selectedPeople = useMemo(() => people?.filter((candidate) => selectedPersonIds.has(candidate.id)) || [], [people, selectedPersonIds]);
  const previewPerson = isBulk
    ? selectedPeople.find((candidate) => candidate.id === previewPersonId) || selectedPeople[0]
    : person;
  const sections = useMemo(() => buildCollaboratorSheetSections(previewPerson || people?.[0] || person, documents, visibleSectionKeys), [previewPerson, people, person, documents, visibleSectionKeys]);
  const searchedPeople = useMemo(() => {
    const query = peopleSearch.trim().toLocaleLowerCase('fr-FR');
    return (people || []).filter((candidate) => `${formatPersonName(candidate)} ${candidate.employeeNumber}`.toLocaleLowerCase('fr-FR').includes(query));
  }, [people, peopleSearch]);
  const [selection, setSelection] = useState<CollaboratorSheetSelection>(() => initialSelection(sections));
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const selectedCount = sections.reduce((total, section) => total + sectionOptions(section).filter((field) => selection[section.key]?.includes(field.key)).length, 0);

  function togglePerson(personId: number) {
    if (generatingRef.current) return;
    setFeedback(null);
    setSelectedPersonIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function toggleField(sectionKey: string, fieldKey: string) {
    if (generatingRef.current) return;
    setFeedback(null);
    setSelection((current) => {
      const keys = current[sectionKey] || [];
      return { ...current, [sectionKey]: keys.includes(fieldKey) ? keys.filter((key) => key !== fieldKey) : [...keys, fieldKey] };
    });
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedCount || (isBulk && !selectedPeople.length) || generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setFeedback(null);
    try {
      const { blob, fileName } = isBulk
        ? await buildCollaboratorSheetsExport(selectedPeople, documents, visibleSectionKeys, selection, exportMode, undefined, { includePhoto })
        : await buildCollaboratorSheetPdf(person, sections, selection, undefined, { includePhoto });
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
      setFeedback({ text: isBulk ? 'Les fiches collaborateurs ont été exportées.' : 'La fiche collaborateur PDF a été générée.', error: false });
    } catch {
      setFeedback({ text: isBulk ? 'Impossible d’exporter les fiches collaborateurs. Réessayez.' : 'Impossible de générer la fiche collaborateur. Réessayez.', error: true });
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  return createPortal(
    <div className={`hr-sheet-dialog${isBulk ? ' hr-sheet-dialog--bulk' : ''}`}>
    <AppDialog
      description={isBulk ? 'Sélectionnez les collaborateurs et le format d’export. Les informations choisies s’appliquent à chaque fiche. La signature est exclue.' : 'Sélectionnez les informations à inclure dans le PDF. La signature est exclue.'}
      eyebrow={isBulk ? 'Ressources humaines' : formatPersonName(person)}
      footer={(
        <div className="app-dialog__actions">
          <button className="sp-button sp-button--secondary" disabled={isGenerating} onClick={onClose} type="button">Fermer</button>
          <button className="sp-button sp-button--primary" disabled={!selectedCount || (isBulk && !selectedPeople.length) || isGenerating} type="submit">
            <FileDown aria-hidden="true" size={18} />
            {isGenerating ? 'Génération…' : isBulk ? 'Exporter les fiches' : 'Générer le PDF'}
          </button>
        </div>
      )}
      icon={<FileDown aria-hidden="true" size={20} />}
      isBusy={isGenerating}
      onClose={onClose}
      onSubmit={generate}
      size="xl"
      title={isBulk ? 'Fiches collaborateurs' : 'Fiche Collaborateur'}
    >
      {isBulk ? (
        <div className="hr-sheet-bulk">
          <fieldset className="hr-sheet-section hr-sheet-people" disabled={isGenerating}>
            <legend>Collaborateurs</legend>
            <div className="hr-sheet-toolbar">
              <p>{selectedPeople.length} collaborateur{selectedPeople.length > 1 ? 's' : ''} sélectionné{selectedPeople.length > 1 ? 's' : ''} sur {people.length}</p>
              <div>
                <button className="sp-button sp-button--secondary" disabled={isGenerating || !people.length} onClick={() => { if (generatingRef.current) return; setSelectedPersonIds(new Set(people.map((candidate) => candidate.id))); setFeedback(null); }} type="button">Sélectionner tous les collaborateurs</button>
                <button className="sp-button sp-button--secondary" disabled={isGenerating || !selectedPeople.length} onClick={() => { if (generatingRef.current) return; setSelectedPersonIds(new Set()); setFeedback(null); }} type="button">Désélectionner les collaborateurs</button>
              </div>
            </div>
            <label className="hr-sheet-search"><span>Rechercher un collaborateur</span><input onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Nom ou matricule" type="search" value={peopleSearch} /></label>
            <div className="hr-sheet-people-list">
              {searchedPeople.map((candidate) => (
                <label key={candidate.id}>
                  <input aria-label={`Sélectionner ${formatPersonName(candidate)} (n° ${candidate.id})`} checked={selectedPersonIds.has(candidate.id)} onChange={() => togglePerson(candidate.id)} type="checkbox" />
                  <span><strong>{formatPersonName(candidate)}</strong><small>{[candidate.employeeNumber, candidate.functionLabel].filter(Boolean).join(' · ') || 'Matricule non renseigné'}</small></span>
                </label>
              ))}
            </div>
            {!searchedPeople.length ? <p className="hr-sheet-empty">{people.length ? 'Aucun collaborateur ne correspond à la recherche.' : 'Aucun collaborateur disponible.'}</p> : null}
            {!selectedPeople.length ? <p role="status">Sélectionnez au moins un collaborateur pour exporter les fiches.</p> : null}
          </fieldset>
          <fieldset className="hr-sheet-section hr-sheet-export-mode" disabled={isGenerating}>
            <legend>Format d’export</legend>
            <label><input aria-label="Fiches séparées (ZIP)" checked={exportMode === 'separate'} name={exportModeName} onChange={() => { if (generatingRef.current) return; setExportMode('separate'); setFeedback(null); }} type="radio" value="separate" /><span><strong>Fiches séparées (ZIP)</strong><small>Une archive contenant un PDF distinct par collaborateur.</small></span></label>
            <label><input aria-label="Fiches regroupées (PDF)" checked={exportMode === 'combined'} name={exportModeName} onChange={() => { if (generatingRef.current) return; setExportMode('combined'); setFeedback(null); }} type="radio" value="combined" /><span><strong>Fiches regroupées (PDF)</strong><small>Un PDF réunissant les fiches, chacune sur ses propres pages.</small></span></label>
          </fieldset>
          {previewPerson ? <label className="hr-sheet-preview"><span>Aperçu du collaborateur</span><select disabled={isGenerating} onChange={(event) => setPreviewPersonId(Number(event.target.value))} value={previewPerson.id}>{selectedPeople.map((candidate) => <option key={candidate.id} value={candidate.id}>{formatPersonName(candidate)}</option>)}</select></label> : null}
        </div>
      ) : null}
      <fieldset className="hr-sheet-section hr-sheet-photo" disabled={isGenerating}>
        <legend>Photo</legend>
        <label><input aria-label="Inclure la photo" checked={includePhoto} onChange={(event) => { if (generatingRef.current) return; setIncludePhoto(event.target.checked); setFeedback(null); }} type="checkbox" /><span><strong>Inclure la photo</strong><small>À gauche du titre et du nom, lorsqu’une photo est disponible.</small></span></label>
      </fieldset>
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
                    <span><strong>{field.label}</strong>{previewPerson ? <small>{field.value || 'Non renseigné'}</small> : null}</span>
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
                  {previewPerson && section.table.rows.length && columns.length ? (
                    <div className="hr-sheet-table-scroll" role="region" aria-label={`Aperçu ${section.label}`} tabIndex={0}>
                      <table>
                        <caption>{section.key === 'health' ? 'Liste des visites médicales' : `Liste ${section.label}`}</caption>
                        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
                        <tbody>{section.table.rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{row[column.key] || 'Non renseigné'}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="hr-sheet-empty">{!previewPerson ? 'Sélectionnez un collaborateur pour afficher un aperçu.' : section.table.rows.length ? 'Sélectionnez les informations de la liste à inclure.' : section.table.emptyLabel}</p>}
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
