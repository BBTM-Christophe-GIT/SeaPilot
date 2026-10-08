import { Search } from 'lucide-react';
import { accessoryLabel } from './liftingSearch';
import type { LiftingItem } from './liftingModel';

export function LiftingFilters({ items, query, type, onQuery, onType, count, context }: {
  items: LiftingItem[]; query: string; type: string; onQuery: (value: string) => void; onType: (value: string) => void; count: number; context: 'inventaire' | 'contrôle';
}) {
  const types = [...new Set(items.map(accessoryLabel))].sort((a, b) => a.localeCompare(b, 'fr'));
  return <div className="lifting-filter lifting-register-filters" role="search" aria-label={`Filtres — ${context}`}>
    <label>Type d’accessoire<select aria-label={`Type d’accessoire — ${context}`} value={type} onChange={(e) => onType(e.target.value)}>
      <option value="">Tous les types</option>{types.map((label) => <option key={label}>{label}</option>)}
    </select></label>
    <label className="lifting-search"><Search size={17} /><input aria-label={context === 'inventaire' ? 'Rechercher un matériel' : 'Rechercher dans le contrôle'} placeholder="Mot-clé, identifiant, numéro de série…" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /></label>
    <span className="lifting-filter-count" role="status">{count} / {items.length} matériels affichés</span>
    {(query || type) && <button type="button" className="secondary-button" onClick={() => { onQuery(''); onType(''); }}>Réinitialiser les filtres</button>}
  </div>;
}
