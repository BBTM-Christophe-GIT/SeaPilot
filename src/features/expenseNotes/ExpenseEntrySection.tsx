import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ExpenseEntrySection({ section, title, summary, icon, open, onToggle, children }: {
  section: string; title: string; summary?: ReactNode; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const id = useId();
  return <section className="expense-entry-section" data-expense-section={section}>
    <h3><button type="button" aria-label={title} aria-expanded={open} aria-controls={id} onClick={onToggle}>
      {icon}<span><strong>{title}</strong>{!open && summary ? <small>{summary}</small> : null}</span><ChevronDown className="expense-entry-section__chevron" size={21} />
    </button></h3>
    <div id={id} hidden={!open} className="expense-entry-section__body">{children}</div>
  </section>;
}
