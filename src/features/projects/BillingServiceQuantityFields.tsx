import './BillingServiceQuantityFields.css';
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppContextMenu, AppContextMenuItem, type AppContextMenuPosition } from '../../components/AppContextMenu';
import { DPR_PORT_CALL_CATEGORIES } from '../dpr/dprFormModel';
import { resolveBillingDprOperation, type BillingServiceQuantityMode } from './projectBilling';

export const BILLING_SERVICE_QUANTITY_MODE_LABELS: Record<BillingServiceQuantityMode, string> = {
  manual: 'Manuel',
  period: 'Jours de la période sélectionnée',
  month: 'Jours du mois sélectionné',
  operations: 'Types d’opérations sélectionnés',
};

const DEFAULT_OPERATION_TYPES = [
  resolveBillingDprOperation('', []),
  resolveBillingDprOperation('', ['crew-change']),
  resolveBillingDprOperation('', ['weather-standby']),
  ...DPR_PORT_CALL_CATEGORIES.map((category) => category.label),
];

function operationIdentity(operation: string): string {
  return operation.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
}

function adjacentControl(trigger: HTMLButtonElement, popup: HTMLElement | null, backwards: boolean): HTMLElement {
  const scope = trigger.closest<HTMLElement>('.app-dialog') || document.body;
  const controls = Array.from(scope.querySelectorAll<HTMLElement>(
    'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"]',
  )).filter((element) => {
    if (popup?.contains(element) || element.matches(':disabled') || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    if (element.tabIndex < 0 && (element.hasAttribute('tabindex') || element.getAttribute('contenteditable') !== 'true')) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (ancestor === scope) break;
    }
    return true;
  });
  // Positive tab indices precede ordinary controls, as in native Tab navigation.
  controls.sort((left, right) => (left.tabIndex > 0 ? left.tabIndex : Infinity) - (right.tabIndex > 0 ? right.tabIndex : Infinity));
  const index = controls.indexOf(trigger);
  return controls[(index + (backwards ? -1 : 1) + controls.length) % controls.length] || trigger;
}

interface BillingServiceQuantityFieldsProps {
  quantityMode?: BillingServiceQuantityMode;
  quantityOperationTypes?: string[];
  operationTypes?: readonly string[];
  disabled?: boolean;
  label?: string;
  legacyLabel?: string;
  onChange: (changes: { quantityMode: BillingServiceQuantityMode; quantityOperationTypes: string[] }) => void;
}

export function BillingServiceQuantityFields({
  quantityMode,
  quantityOperationTypes = [],
  operationTypes = [],
  disabled = false,
  label = 'Calcul quantité',
  legacyLabel,
  onChange,
}: BillingServiceQuantityFieldsProps) {
  const fieldId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const menuOpenRef = useRef(false);
  const previousModeRef = useRef(quantityMode);
  const requestedModeRef = useRef<BillingServiceQuantityMode | null>(null);
  const [menu, setMenu] = useState<{ position: AppContextMenuPosition; host: HTMLElement } | null>(null);
  const menuOpen = menu !== null;
  const selectedTypes = new Set(quantityOperationTypes.map(operationIdentity));
  const choices = new Map<string, string>();
  for (const operation of [...DEFAULT_OPERATION_TYPES, ...operationTypes, ...quantityOperationTypes]) {
    const identity = operationIdentity(operation);
    if (identity && !choices.has(identity)) choices.set(identity, operation.trim().replace(/\s+/g, ' '));
  }
  const hasLegacyChoice = quantityMode === undefined && Boolean(legacyLabel);
  const currentModeLabel = quantityMode ? BILLING_SERVICE_QUANTITY_MODE_LABELS[quantityMode] : hasLegacyChoice ? legacyLabel : BILLING_SERVICE_QUANTITY_MODE_LABELS.manual;
  const summary = `${currentModeLabel}${quantityMode === 'operations' ? ` · ${[...choices].filter(([identity]) => selectedTypes.has(identity)).map(([, operation]) => operation).join(', ') || 'Aucun type sélectionné'}` : ''}`;

  const closeMenu = useCallback(() => {
    if (!menuOpenRef.current) return;
    menuOpenRef.current = false;
    setMenu(null);
    if (!triggerRef.current?.disabled) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const modeChanged = previousModeRef.current !== quantityMode;
    previousModeRef.current = quantityMode;
    if (disabled || (modeChanged && requestedModeRef.current !== quantityMode)) closeMenu();
    requestedModeRef.current = null;
  }, [disabled, quantityMode, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const dismissOnScroll = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      closeMenu();
    };
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', dismissOnScroll, true);
    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', dismissOnScroll, true);
    };
  }, [menuOpen, closeMenu]);

  function openMenu() {
    if (disabled) return;
    if (menuOpenRef.current) { closeMenu(); return; }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    menuOpenRef.current = true;
    setMenu({ position: { x: rect.left, y: rect.bottom + 4 }, host: trigger.closest<HTMLElement>('.app-dialog') || document.body });
  }

  function selectMode(mode: BillingServiceQuantityMode) {
    if (disabled) return;
    if (mode !== quantityMode) {
      requestedModeRef.current = mode;
      onChange({ quantityMode: mode, quantityOperationTypes: [...quantityOperationTypes] });
    }
    if (mode === 'operations') {
      // The type choices add height: let the shared menu clamp its new bounds.
      setMenu((current) => current ? { ...current, position: { ...current.position } } : current);
    } else closeMenu();
  }

  return <div className="billing-service-quantity-fields">
    <button aria-describedby={`${fieldId}-summary`} aria-expanded={Boolean(menu)} aria-haspopup="menu" className="sp-button sp-button--secondary billing-service-quantity-trigger" disabled={disabled}
      onClick={openMenu} onMouseDown={(event) => { if (menuOpenRef.current) event.stopPropagation(); }} ref={triggerRef} title={summary} type="button">
      <span>{label}</span><ChevronDown aria-hidden="true" size={15} />
    </button>
    <span className="sr-only" id={`${fieldId}-summary`}>{summary}</span>
    {menu ? createPortal(<div className="billing-service-quantity-popup" onKeyDown={(event) => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        const target = triggerRef.current ? adjacentControl(triggerRef.current, popupRef.current, event.shiftKey) : null;
        closeMenu();
        target?.focus();
      }
    }} ref={popupRef}>
      <AppContextMenu label={label} onClose={closeMenu} position={menu.position}>
        {hasLegacyChoice ? <div className="app-context-menu__label">{legacyLabel} · actuel</div> : null}
        {Object.entries(BILLING_SERVICE_QUANTITY_MODE_LABELS).map(([mode, title]) => <AppContextMenuItem disabled={disabled} key={mode} onSelect={() => selectMode(mode as BillingServiceQuantityMode)}>
          <span>{title}</span>{quantityMode === mode || (!hasLegacyChoice && quantityMode === undefined && mode === 'manual') ? <><Check aria-hidden="true" size={16} /><span className="sr-only">, mode sélectionné</span></> : null}
        </AppContextMenuItem>)}
        {quantityMode === 'operations' ? <>
          <div className="app-context-menu__separator" role="separator" />
          <div className="app-context-menu__label">Types d’opérations à compter</div>
          {[...choices].map(([identity, operation]) => <AppContextMenuItem disabled={disabled} key={identity} onSelect={() => {
            if (disabled) return;
            onChange({ quantityMode: 'operations', quantityOperationTypes: selectedTypes.has(identity)
              ? quantityOperationTypes.filter((type) => operationIdentity(type) !== identity)
              : [...quantityOperationTypes, operation] });
          }}>
            <span>{operation}</span>{selectedTypes.has(identity) ? <><Check aria-hidden="true" size={16} /><span className="sr-only">, sélectionné</span></> : null}
          </AppContextMenuItem>)}
          <div className="app-context-menu__separator" role="separator" />
          <AppContextMenuItem onSelect={closeMenu}>Terminer</AppContextMenuItem>
        </> : null}
      </AppContextMenu>
    </div>, menu.host) : null}
  </div>;
}
