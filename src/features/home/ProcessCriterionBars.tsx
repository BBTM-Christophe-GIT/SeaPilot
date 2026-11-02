import type { ProcessPerformance } from './processPerformance';

const tone = (score: number | null) => score === null ? 'unknown' : score < 40 ? 'danger' : score < 75 ? 'warning' : 'success';

export function ProcessCriterionBars({ process }: { process: ProcessPerformance }) {
  return <div className="process-criterion-bars" role="group" aria-label={`Composition du score ${process.label}`}>
    {process.criteria.map((criterion) => <article className={`process-criterion-bar is-${tone(criterion.score)}`} key={criterion.id}>
      <div className="process-criterion-bar-heading"><strong>{criterion.label}</strong><span>{criterion.score === null ? 'Non noté' : `${criterion.score} %`}</span></div>
      {criterion.score === null ? <div className="process-criterion-bar-empty">Non applicable ou données manquantes</div>
        : <progress aria-label={criterion.label} max={100} value={criterion.score} />}
      <small>{criterion.score === null ? 'Hors moyenne des critères notés' : `Poids : ${criterion.weight} %`}</small>
      <p>{criterion.score === null && process.unavailableSources.length ? 'Les sources nécessaires au calcul sont indisponibles.' : criterion.detail}</p>
    </article>)}
  </div>;
}
