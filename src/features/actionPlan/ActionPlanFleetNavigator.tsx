import { useState } from 'react';
import { ArrowUpRight, Building2, ClipboardCheck, FileSearch, MapPin, Rows3, ShieldAlert, Ship, Warehouse } from 'lucide-react';
import { ACTION_CATEGORIES, actionCategory, type ActionAssetGroup, type ActionCategory } from './actionPlanNavigation';
import type { ActionTypeCatalogRecord } from './actionPlanQueries';

export function ActionCategoryIcon({ category, size = 18 }: { category: ActionCategory; size?: number }) {
  const Icon = { audit: ClipboardCheck, action: ArrowUpRight, visit: FileSearch, event: ShieldAlert }[category];
  return <Icon aria-hidden="true" size={size} />;
}

function AssetImage({ asset }: { asset: ActionAssetGroup }) {
  const [failed, setFailed] = useState('');
  const Icon = asset.key === 'unassigned' ? MapPin : asset.assetKind === 'office' ? Building2 : asset.assetKind === 'quay' ? Warehouse : Ship;
  return asset.image && failed !== asset.image
    ? <img alt="" decoding="async" height={74} onError={() => setFailed(asset.image)} src={asset.image} width={110} />
    : <Icon aria-hidden="true" size={42} />;
}

export function ActionPlanFleetNavigator({ assets, types, selectedAsset, selectedCategory, onSelect, onShowAll }: {
  assets: ActionAssetGroup[]; types: ActionTypeCatalogRecord[]; selectedAsset: string; selectedCategory: string;
  onSelect(asset: string, category: string): void; onShowAll(): void;
}) {
  const total = assets.reduce((sum, asset) => sum + asset.actions.length, 0);
  return <nav className="action-fleet-nav" aria-label="Navires et lieux du plan d’action">
    <header><button aria-pressed={!selectedAsset && !selectedCategory} className="action-fleet-all" onClick={onShowAll} type="button"><Rows3 size={19} />Tout afficher <span>· {total}</span></button><p>Flotte, quai et bureaux</p></header>
    <div className="action-fleet-assets">{assets.map((asset) => <section className={`action-fleet-asset${selectedAsset === asset.key ? ' is-selected' : ''}`} key={asset.key}>
      <button aria-label={`Afficher ${asset.name} · ${asset.actions.length} élément${asset.actions.length > 1 ? 's' : ''}`} aria-pressed={selectedAsset === asset.key && !selectedCategory} className="action-fleet-select" onClick={() => onSelect(asset.key, '')} type="button">
        <span className="action-fleet-image"><AssetImage asset={asset} /></span><strong>{asset.name}</strong><span className="action-fleet-count">{asset.actions.length}</span>
      </button>
      <div className="action-fleet-categories">{ACTION_CATEGORIES.map((category) => {
        const count = asset.actions.filter((action) => actionCategory(action, types) === category.key).length;
        return count > 0 ? <button aria-label={`${asset.name} · ${category.label} · ${count} élément${count > 1 ? 's' : ''}`} aria-pressed={selectedAsset === asset.key && selectedCategory === category.key} className={`action-category is-${category.key}`} key={category.key} onClick={() => onSelect(asset.key, category.key)} type="button"><ActionCategoryIcon category={category.key} /><span>{category.label}</span><span className="action-category-count">{count}</span></button> : null;
      })}</div>
    </section>)}</div>
    {!assets.length && <p className="action-control-empty">Aucun élément accessible.</p>}
  </nav>;
}
