import { FilePlus2, Trash2 } from 'lucide-react';
import { useRef } from 'react';

export interface ExpenseAttachment {
  id: string;
  name: string;
  /** Missing only for the existing generated demonstration documents. */
  blob?: Blob;
}

let nextAttachmentId = 0;
export function createExpenseAttachments(files: File[]): ExpenseAttachment[] {
  return files.map((file) => ({ id: `local-${Date.now()}-${++nextAttachmentId}`, name: file.name, blob: file }));
}

export const EXPENSE_ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx';

export default function BillingExpenseAttachments({ value, onChange }: {
  value: ExpenseAttachment[];
  onChange: (attachments: ExpenseAttachment[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <section className="pp-expense-attachments">
    <label className="pp-field">Pièces jointes
      <input ref={input} type="file" multiple accept={EXPENSE_ATTACHMENT_ACCEPT} onChange={(event) => {
        const added = createExpenseAttachments(Array.from(event.target.files ?? []));
        if (added.length) onChange([...value, ...added]);
        event.currentTarget.value = '';
      }} />
    </label>
    <p className="pp-muted"><FilePlus2 size={16} aria-hidden="true" />Sélectionnez un ou plusieurs fichiers. Vous pouvez en ajouter à nouveau.</p>
    {value.length ? <ul aria-label="Pièces jointes du frais" className="pp-attachment-list">{value.map((attachment) => <li key={attachment.id}>
      <span>{attachment.name}</span>
      <button className="pp-button icon" type="button" aria-label={`Retirer ${attachment.name}`} title={`Retirer ${attachment.name}`} onClick={() => { input.current?.focus(); onChange(value.filter((item) => item.id !== attachment.id)); }}><Trash2 size={16} /></button>
    </li>)}</ul> : <p className="pp-muted">Aucune pièce jointe.</p>}
  </section>;
}
