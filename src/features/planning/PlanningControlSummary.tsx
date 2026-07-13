import type { PlanningControlLevel, PlanningControlResult } from './planningModel';

const CONTROL_LEVEL_LABELS: Record<PlanningControlLevel, string> = {
  blocking: 'Blocage',
  warning: 'Avertissement',
  information: 'Information',
};

interface PlanningControlSummaryProps {
  results: PlanningControlResult[];
  title?: string;
}

export function PlanningControlSummary({ results, title = 'Contrôles avant enregistrement' }: PlanningControlSummaryProps) {
  if (!results.length) return null;

  return (
    <section aria-label={title} className="planning-control-summary">
      <header>
        <strong>{title}</strong>
        <span>{results.length} contrôle{results.length > 1 ? 's' : ''}</span>
      </header>
      <ul>
        {results.map((result) => (
          <li className={`is-${result.level}`} key={result.id}>
            <span className="planning-control-level">{CONTROL_LEVEL_LABELS[result.level]}</span>
            <span>
              <strong>{result.title}</strong>
              <small>{result.detail}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
