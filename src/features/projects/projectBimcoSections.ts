import { BIMCO_PROJECT_SECTIONS, BIMCO_P144_BUSINESS_GROUPS } from './projectContractModels';
import { buildSupplytimePreview } from './projectReadModel';
import type { ProjectContractRecord, ProjectRecord } from './projectQueries';

/** Keep legacy SUPPLYTIME values and explicit P144 overrides under the same business headings. */
export function buildProjectBimcoSections(project: ProjectRecord, contract?: ProjectContractRecord) {
  const legacyGroups = buildSupplytimePreview(project, contract);
  const legacy = Object.fromEntries(legacyGroups.flatMap((group) => group.fields).map((field) => [field.key, field.value]));
  const saved = contract?.supplytimeData || {};
  const hasP144Values = Object.entries(saved).some(([key, value]) => key.startsWith('p144_') && value.trim());

  if (hasP144Values) {
    // Only map fields with equivalent meanings. Box numbers differ between schemas.
    const fallback: Record<string, string> = {
      p144_box02_owners: legacy.box01_owners,
      p144_box03_charterers: legacy.box02_charterers,
      p144_box04_vessel_imo: legacy.box03_vessel,
      p144_box05_delivery_date: legacy.box04_delivery_date,
      p144_box06_cancelling_date: legacy.box05_cancelling_date,
      p144_box07_delivery_place: legacy.box06_port_delivery,
      p144_box08_redelivery: legacy.box07_delivery_range,
      p144_box09_hire_period: legacy.box09_period,
      p144_box10_extensions: legacy.box10_extension,
      p144_box11_automatic_extension: legacy.box11_continuation,
      p144_box12_mobilisation: legacy.box12_mobilisation,
      p144_box13_early_termination: legacy.box13_early_termination,
      p144_box15_demobilisation: legacy.box15_declaration,
      p144_box16_operation_area: legacy.box16_area_operation,
      p144_box17_employment: contract?.vesselAssignmentLimit || '',
      p144_box18_specialist_operations: `Support ROV : ${project.isRovSupport ? 'Oui' : 'Non'}\nSupport plongée : ${project.isDivingSupport ? 'Oui' : 'Non'}`,
      p144_box19_fuel: legacy.box19_special_fuel,
      p144_box20_charter_hire: legacy.box20_charter_hire,
      p144_box21_extension_hire: legacy.box21_extension_hire,
      p144_box22_invoicing: legacy.box22_invoice_remittance,
      p144_box23_payments: legacy.box23_payment,
      p144_box26_audit_period: contract?.maxAuditPeriod || '',
      p144_box31_taxes: legacy.box31_taxes,
      p144_box33_dispute_resolution: legacy.box33_dispute_resolution,
      p144_box34_additional_clauses: legacy.box34_additional_clauses,
      p144_signature_owners: legacy.signature_owners,
      p144_signature_charterers: legacy.signature_charterers,
    };
    // These legacy fields have no equivalent meaning in the P144 form. Keep
    // populated historical values visible instead of matching by box number.
    const historicalKeys: Record<string, string[]> = {
      'bimco-period': ['box08_notice_delivery'],
      'bimco-operations': ['box14_bunker_delivery', 'box18_delivery_hour'],
      'bimco-pricing': ['box24_account_group', 'box25_internal_price', 'box29_notice_money'],
      'bimco-clauses': ['box27_war_risk', 'box28_terror', 'box30_cancellation_clause', 'box32_other_law'],
    };
    return BIMCO_P144_BUSINESS_GROUPS.map((section) => ({
      id: section.id,
      label: section.label,
      fields: [...section.fields.map((field) => ({
        key: field.key,
        label: field.label.replace(/^\d+\.\s*/, ''),
        value: saved[field.key] || fallback[field.key] || '',
      })), ...legacyGroups.flatMap((group) => group.fields)
        .filter((field) => historicalKeys[section.id]?.includes(field.key) && saved[field.key]?.trim())
        .map((field) => ({ key: field.key, label: `${field.label.replace(/^\d+\.\s*/, '')} (historique)`, value: saved[field.key] }))],
    }));
  }

  const extraKeys: Record<string, string[]> = {
    'bimco-period': ['box13_early_termination'],
    'bimco-operations': ['box14_bunker_delivery'],
    'bimco-pricing': ['box12_mobilisation', 'box15_declaration'],
  };
  return BIMCO_PROJECT_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    fields: legacyGroups.flatMap((group) => group.fields.filter((field) => (
      (section.legacyGroups as readonly string[]).includes(group.id)
      || extraKeys[section.id]?.includes(field.key)
    ))).map((field) => ({ ...field, label: field.label.replace(/^\d+\.\s*/, '') })),
  }));
}
