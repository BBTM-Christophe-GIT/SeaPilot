import { TriangleAlert } from 'lucide-react';
import { assessSeaOperationUkc } from './seaOperationUkc';
import './seaOperationUkc.css';

export function SeaOperationUkcIndicator({ value, draftMeters, approximate = false }: { value: string; draftMeters?: number | null; approximate?: boolean }) {
  const assessment = assessSeaOperationUkc(value, draftMeters);
  if (!assessment) return <span className="so-ukc-unclassified" title={value.trim() ? 'Indicateur indisponible : renseignez une UKC numérique en mètres et le tirant d’eau du navire.' : undefined}>{value.trim() || 'À renseigner'}</span>;
  const displayedValue = approximate ? `≈ ${assessment.valueMeters.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : assessment.formattedValue;
  const title = approximate ? `Estimation statique du modèle, incertitude totale non quantifiée. ${assessment.tooltip}` : assessment.tooltip;
  return <span role="img" className={`so-ukc-pill is-${assessment.level}`} title={title} aria-label={`${displayedValue} — ${assessment.label}`}>
    {assessment.level !== 'success' && <TriangleAlert size={13} aria-hidden="true" />}
    <span>{displayedValue}</span>
  </span>;
}
