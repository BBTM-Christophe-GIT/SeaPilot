import './BillingServiceQuantityFields.css';
import { useId } from 'react';
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
  label = 'Mode de quantité',
  legacyLabel,
  onChange,
}: BillingServiceQuantityFieldsProps) {
  const fieldId = useId();
  const selectedTypes = new Set(quantityOperationTypes.map(operationIdentity));
  const choices = new Map<string, string>();
  for (const operation of [...DEFAULT_OPERATION_TYPES, ...operationTypes, ...quantityOperationTypes]) {
    const identity = operationIdentity(operation);
    if (identity && !choices.has(identity)) choices.set(identity, operation.trim().replace(/\s+/g, ' '));
  }
  const hasLegacyChoice = quantityMode === undefined && Boolean(legacyLabel);

  return <div className="billing-service-quantity-fields">
    <label className="billing-service-quantity-mode" htmlFor={`${fieldId}-mode`}>
      <span>{label}</span>
      <select
        disabled={disabled}
        id={`${fieldId}-mode`}
        onChange={(event) => {
          const mode = event.currentTarget.value as BillingServiceQuantityMode | '';
          if (mode) onChange({ quantityMode: mode, quantityOperationTypes: [...quantityOperationTypes] });
        }}
        value={quantityMode ?? (hasLegacyChoice ? '' : 'manual')}
      >
        {hasLegacyChoice ? <option value="">{legacyLabel}</option> : null}
        {Object.entries(BILLING_SERVICE_QUANTITY_MODE_LABELS).map(([mode, title]) => <option key={mode} value={mode}>{title}</option>)}
      </select>
    </label>
    {quantityMode === 'operations' ? <fieldset className="billing-service-quantity-operations" disabled={disabled}>
      <legend>Types d’opérations à compter</legend>
      <div className="billing-service-quantity-operation-options">
        {[...choices].map(([identity, operation]) => <label className="billing-service-quantity-operation" key={identity}>
          <input checked={selectedTypes.has(identity)} onChange={(event) => onChange({
            quantityMode: 'operations',
            quantityOperationTypes: event.currentTarget.checked
              ? [...quantityOperationTypes, operation]
              : quantityOperationTypes.filter((type) => operationIdentity(type) !== identity),
          })} type="checkbox" />
          <span>{operation}</span>
        </label>)}
      </div>
    </fieldset> : null}
  </div>;
}
