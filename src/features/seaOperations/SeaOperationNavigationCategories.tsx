import { useEffect, useMemo, useState } from 'react';
import { projectNavigationCategoryLines, type PreparedNavigationCategoryLines } from './seaOperationNavigationCategoryGeometry';
import type { SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';
import './seaOperationNavigationCategories.css';

export type NavigationCategory = 2 | 3;
const SOURCE_URL = 'https://limitesmaritimes.gouv.fr/thematiques/circulation-et-navigation';
const REGULATION_URL = 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000054265707/';

export function useNavigationCategoryOverlay(enabled: boolean, geometry: SeaOperationRouteMapGeometry) {
  const [data, setData] = useState<PreparedNavigationCategoryLines | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || data) return;
    let cancelled = false;
    void import('./seaOperationNavigationCategoryData').then(module => {
      if (!cancelled) { setData(module.navigationCategoryLines); setFailed(false); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [enabled, data, attempt]);
  const projected = useMemo(() => enabled && data ? projectNavigationCategoryLines(data, geometry) : null, [enabled, data, geometry]);
  return { projected, failed, loading: enabled && !data && !failed, retry: () => { setFailed(false); setAttempt(value => value + 1); } };
}

/** Published boundaries only. They are open lines, never inferred eligibility polygons. */
export function SeaOperationNavigationCategoryLayer({ projected, selected }: {
  projected: ReturnType<typeof projectNavigationCategoryLines> | null;
  selected: ReadonlySet<NavigationCategory>;
}) {
  if (!projected) return null;
  return <g className="so-navigation-category-layer" aria-hidden="true" pointerEvents="none">
    {projected.categories.filter(category => selected.has(category.category) && category.path).map(category => <path key={category.category}
      data-navigation-category={category.category} className={`so-navigation-category-${category.category}`} d={category.path}
      fill="none" vectorEffect="non-scaling-stroke" />)}
  </g>;
}

export function SeaOperationNavigationCategoryLegend({ selected, onToggle, projected, loading, failed, onRetry }: {
  selected: ReadonlySet<NavigationCategory>;
  onToggle: (category: NavigationCategory) => void;
  projected: ReturnType<typeof projectNavigationCategoryLines> | null;
  loading: boolean; failed: boolean; onRetry: () => void;
}) {
  const visibleCount = projected?.categories.filter(category => selected.has(category.category)).reduce((sum, category) => sum + category.visibleCount, 0) ?? 0;
  return <section className="so-navigation-category-legend" aria-label="Catégories de navigation professionnelles">
    <div className="so-navigation-category-choices">
      <span className="so-navigation-category-first"><strong>1re catégorie</strong> · sans limite géographique propre</span>
      {([2, 3] as const).map(category => <label key={category} className={`so-navigation-category-choice is-category-${category}`}>
        <input type="checkbox" checked={selected.has(category)} onChange={() => onToggle(category)} />
        <i className={`so-navigation-category-swatch so-navigation-category-${category}`} aria-hidden="true" />
        <span className="so-navigation-category-label"><strong>{category}e catégorie</strong> · {category === 2 ? 'limite SHOM · 200 NM' : 'limite SHOM · 20 NM'}</span>
      </label>)}
    </div>
    <p role="status">{loading ? 'Chargement du calque vectoriel…' : failed ? <>Calque indisponible. <button type="button" className="sp-button sp-button--secondary" onClick={onRetry}>Réessayer</button></> : !selected.size ? 'Sélectionnez une limite à afficher.' : visibleCount === 0 ? 'Aucune limite SHOM sélectionnée dans ce cadre. Dézoomez pour les voir ; cela ne détermine pas la catégorie de la position.' : 'Limites vectorielles SHOM · France métropolitaine et Corse.'}</p>
    <details><summary>Définitions et source du calque</summary>
      <dl>
        <div><dt>1re catégorie</dt><dd>Navigation ne relevant pas des catégories suivantes ; aucune limite géographique propre à tracer.</dd></div>
        <div><dt>2e catégorie</dt><dd>À 200 NM au plus d’un port ou lieu de mise en sécurité. La distance entre le dernier port d’escale du pays de départ et le port final de destination ne doit pas dépasser 600 NM.</dd></div>
        <div><dt>3e catégorie</dt><dd>À 20 NM au plus de la terre la plus proche.</dd></div>
      </dl>
      <p>Limites publiées sans recalcul à partir du fond de carte. Le permis du navire et ses restrictions restent à vérifier. Aucune catégorie n’est attribuée automatiquement aux points. Les 4e bis, 4e et 5e catégories ne sont pas représentées.</p>
      <p>Source : <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">SHOM / DGAMPA — catégories de navigation</a>, jeu publié en 2016, extrait le 28/10/2026 · <a href={REGULATION_URL} target="_blank" rel="noopener noreferrer">Article 110.11</a> · <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener noreferrer">Licence Ouverte 2.0</a>. Ne pas utiliser pour la navigation.</p>
    </details>
  </section>;
}
