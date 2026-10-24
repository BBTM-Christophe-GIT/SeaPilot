import { TriangleAlert } from 'lucide-react';
import { assessSeaOperationUkc } from './seaOperationUkc';
import './seaOperationUkc.css';

export function SeaOperationUkcIndicator({ value, draftMeters }: { value: string; draftMeters?: number | null }) {
  const assessment = assessSeaOperationUkc(value, draftMeters);
  if (!assessment) return <span className="so-ukc-unclassified" title={value.trim() ? 'Indicateur indisponible : renseignez une UKC numérique en mètres et le tirant d’eau du navire.' : undefined}>{value.trim() || 'À renseigner'}</span>;
  return <span role="img" className={`so-ukc-pill is-${assessment.level}`} title={assessment.tooltip} aria-label={`${assessment.formattedValue} — ${assessment.label}`}>
    {assessment.level !== 'success' && <TriangleAlert size={13} aria-hidden="true" />}
    <span>{assessment.formattedValue}</span>
  </span>;
}
