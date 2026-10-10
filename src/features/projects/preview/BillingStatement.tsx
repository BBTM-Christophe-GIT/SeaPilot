import { CalendarDays, Download, FileText, Save } from 'lucide-react';
import { useId } from 'react';
import type { BillingExportFormat } from '../projectBilling';
import './BillingStatement.css';

export type BillingSectionField = 'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'includeRawInPdf';

export interface BillingStatementSection {
  field: BillingSectionField;
  label: string;
  amount: string;
  included: boolean;
}

export interface BillingStatementProps {
  month: string;
  sections: BillingStatementSection[];
  total: string;
  clientReference: string;
  referenceDescription: string;
  format: BillingExportFormat;
  busy: boolean;
  editable: boolean;
  onInclusionChange: (field: BillingSectionField, included: boolean) => void;
  onReferenceChange: (value: string) => void;
  onReferenceSave: () => void;
  onFormatChange: (format: BillingExportFormat) => void;
  onPreview: () => void;
  onExport: () => void;
}

function monthLabel(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  return Number.isNaN(value.getTime()) ? month : value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export default function BillingStatement({
  month, sections, total, clientReference, referenceDescription, format, busy, editable,
  onInclusionChange, onReferenceChange, onReferenceSave, onFormatChange, onPreview, onExport,
}: BillingStatementProps) {
  const id = useId();
  const exportDescriptionId = `${id}-export-description`;
  const referenceDescriptionId = `${id}-reference-description`;

  return <aside className="pp-billing-statement" aria-label="Relevé du mois" aria-busy={busy}>
    <header className="pp-statement-header">
      <CalendarDays size={26} aria-hidden="true" />
      <div><h3>Relevé du mois</h3><p>{monthLabel(month)}</p></div>
    </header>
    <div className="pp-statement-body">
      <dl className="pp-statement-summary">
        {sections.map((section) => <div key={section.field}>
          <dt>{section.label}</dt><dd>{section.amount}</dd>
        </div>)}
      </dl>
      <div className="pp-statement-total" aria-live="polite" aria-atomic="true">
        <span>Total sélectionné HT</span><strong data-testid="billing-total">{total}</strong>
      </div>
      <fieldset className="pp-statement-selection" aria-describedby={exportDescriptionId}>
        <legend>Contenu du PDF</legend>
        {sections.map((section) => <label className="pp-statement-choice" key={section.field}>
          <input type="checkbox" checked={section.included} disabled={busy || !editable}
            aria-label={`Inclure ${section.label} dans le PDF`}
            onChange={(event) => onInclusionChange(section.field, event.target.checked)} />
          <span>{section.label}</span>
        </label>)}
        <p id={exportDescriptionId} className="pp-statement-help">Ces choix définissent uniquement le contenu du PDF.</p>
      </fieldset>
      <section className="pp-statement-reference" aria-label="Référence client du relevé">
        <label className="pp-field">Référence client
          <input value={clientReference} maxLength={200} disabled={busy || !editable} aria-describedby={referenceDescriptionId}
            onChange={(event) => onReferenceChange(event.target.value)} onBlur={onReferenceSave} />
        </label>
        <p id={referenceDescriptionId} className="pp-statement-help">{referenceDescription}</p>
        <button type="button" className="pp-button" disabled={busy || !editable || !clientReference.trim()} onClick={onReferenceSave}>
          <Save size={17} aria-hidden="true" />Enregistrer la référence
        </button>
        <p className="pp-statement-help">La référence historique du mois est proposée tant qu’aucune référence n’est enregistrée pour ce contenu.</p>
      </section>
      <label className="pp-field pp-statement-file">Fichier
        <select value={format} disabled={busy} onChange={(event) => onFormatChange(event.target.value as BillingExportFormat)}>
          <option value="pdf">PDF standard</option>
          <option value="merged-pdf">PDF + annexes PDF</option>
          <option value="zip">ZIP + toutes les pièces</option>
        </select>
      </label>
      <div className="pp-statement-actions" aria-label="Actions du relevé">
        <button type="button" className="pp-button" disabled={busy} aria-label="Prévisualiser le PDF" onClick={onPreview}>
          <FileText size={17} aria-hidden="true" />Aperçu PDF
        </button>
        <button type="button" className="pp-button primary" disabled={busy}
          aria-label={format === 'zip' ? 'Exporter le ZIP' : 'Exporter le PDF'} onClick={onExport}>
          <Download size={17} aria-hidden="true" />{format === 'zip' ? 'Exporter ZIP' : 'Exporter PDF'}
        </button>
      </div>
    </div>
  </aside>;
}
