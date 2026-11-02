import { Building2, Check, ChevronDown, Layers3, Ship, Warehouse } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AppContextMenu, type AppContextMenuPosition } from '../../components/AppContextMenu';
import { compareFleetAssets, fleetIllustration, type FleetAssetKind } from '../fleet/fleetDisplay';
import './ProcessScopeSelect.css';

export interface ProcessScopeEntity {
  id: number;
  name: string;
  assetKind: FleetAssetKind;
  lengthOverall?: string | number | null;
}

export interface ProcessScopeSelectProps {
  entities: ProcessScopeEntity[];
  value: string;
  onChange: (value: string) => void;
  aggregateLabel: string;
}

function isTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.closest('[hidden],[inert],[aria-hidden="true"],[role="menu"]')
    || element.getAttribute('aria-disabled') === 'true' || (element instanceof HTMLInputElement && element.type === 'hidden')) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function EntityIllustration({ entity }: { entity?: ProcessScopeEntity }) {
  const [failedUrl, setFailedUrl] = useState('');
  const url = entity ? fleetIllustration(entity) : '';
  const Icon = !entity ? Layers3 : entity.assetKind === 'office' ? Building2 : entity.assetKind === 'quay' ? Warehouse : Ship;
  return <span className="process-scope-select__illustration" aria-hidden="true">
    {url && failedUrl !== url
      ? <img alt="" decoding="async" height={37} onError={() => setFailedUrl(url)} src={url} width={55} />
      : <Icon size={21} />}
  </span>;
}

/** Presentation only: the caller supplies the entities already authorized by the server. */
export function ProcessScopeSelect({ entities, value, onChange, aggregateLabel }: ProcessScopeSelectProps) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<AppContextMenuPosition | null>(null);
  const seen = new Set<number>();
  const options = entities.filter((entity) => {
    if (!Number.isSafeInteger(entity.id) || entity.id <= 0 || seen.has(entity.id)) return false;
    seen.add(entity.id);
    return true;
  }).sort(compareFleetAssets);
  const selected = options.find((entity) => String(entity.id) === value);
  const selectedName = value === 'all' ? aggregateLabel : selected?.name || 'Périmètre indisponible';

  const close = useCallback(() => {
    setPosition(null);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!position) return;
    const onScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.app-context-menu')) return;
      close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [position, close]);

  function open() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function choose(nextValue: string) {
    close();
    if (nextValue !== value) onChange(nextValue);
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !position) return;
    // Menu options use arrows; Tab returns to the surrounding form/navigation.
    if (event.shiftKey) { event.preventDefault(); close(); return; }
    const focusable = Array.from(document.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter(isTabStop);
    const index = trigger.current ? focusable.indexOf(trigger.current) : -1;
    const next = index >= 0 ? focusable[index + 1] : undefined;
    setPosition(null);
    if (next) { event.preventDefault(); next.focus(); }
  }

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
  }

  return <div className="process-scope-select" onKeyDownCapture={onMenuKey}>
    <button aria-controls={position ? menuId : undefined} aria-expanded={Boolean(position)} aria-haspopup="menu"
      aria-label={`Périmètre du radar : ${selectedName}`} className="sp-button sp-button--secondary process-scope-select__trigger"
      onClick={() => position ? close() : open()} onKeyDown={onTriggerKey} onMouseDown={(event) => { if (position) event.stopPropagation(); }} ref={trigger} type="button">
      <EntityIllustration entity={selected} />
      <span className="process-scope-select__copy"><span>Périmètre</span><strong>{selectedName}</strong></span>
      <ChevronDown aria-hidden="true" className="process-scope-select__chevron" size={16} />
    </button>
    {position ? <div id={menuId}>
      <AppContextMenu label="Périmètres du radar" onClose={close} position={position}>
        <button aria-current={value === 'all' ? 'true' : undefined} className={value === 'all' ? 'is-selected' : ''}
          onClick={() => choose('all')} role="menuitem" type="button">
          <EntityIllustration /><span className="process-scope-select__option-label">{aggregateLabel}</span>
          {value === 'all' ? <Check aria-hidden="true" size={16} /> : null}
        </button>
        {options.map((entity) => {
          const isSelected = value === String(entity.id);
          return <button aria-current={isSelected ? 'true' : undefined} className={isSelected ? 'is-selected' : ''} key={entity.id}
            onClick={() => choose(String(entity.id))} role="menuitem" type="button">
            <EntityIllustration entity={entity} /><span className="process-scope-select__option-label">{entity.name}</span>
            {isSelected ? <Check aria-hidden="true" size={16} /> : null}
          </button>;
        })}
        {!options.length ? <p className="process-scope-select__empty">Aucun autre lieu accessible.</p> : null}
      </AppContextMenu>
    </div> : null}
  </div>;
}
