export type ProjectContractSource = 'Projet' | 'Client' | 'Navire' | 'Contrat';

export interface BimcoP144FieldDefinition {
  key: string;
  label: string;
  page: 1 | 2 | 3 | 4;
  source: ProjectContractSource;
}

export interface BimcoP144GroupDefinition {
  id: 'boxes-01-12' | 'boxes-13-21' | 'boxes-22-34' | 'signatures' | 'annexes';
  label: string;
  page: 1 | 2 | 3 | 4;
  fields: BimcoP144FieldDefinition[];
}

export const BIMCO_P144_GROUPS: BimcoP144GroupDefinition[] = [
  {
    id: 'boxes-01-12',
    label: 'Cases 1–12',
    page: 1,
    fields: [
      { key: 'p144_box01_place_date', label: '1. Place and date of contract', page: 1, source: 'Projet' },
      { key: 'p144_box02_owners', label: '2. Owners / Place of business', page: 1, source: 'Contrat' },
      { key: 'p144_box03_charterers', label: '3. Charterers / Place of business', page: 1, source: 'Client' },
      { key: 'p144_box04_vessel_imo', label: '4. Vessel’s name and IMO number', page: 1, source: 'Navire' },
      { key: 'p144_box05_delivery_date', label: '5. Date of delivery', page: 1, source: 'Projet' },
      { key: 'p144_box06_cancelling_date', label: '6. Cancelling date and time', page: 1, source: 'Projet' },
      { key: 'p144_box07_delivery_place', label: '7. Port or place of delivery', page: 1, source: 'Projet' },
      { key: 'p144_box08_redelivery', label: '8. Port or place of redelivery / notice', page: 1, source: 'Projet' },
      { key: 'p144_box09_hire_period', label: '9. Period of hire', page: 1, source: 'Projet' },
      { key: 'p144_box10_extensions', label: '10. Extension of period of hire', page: 1, source: 'Contrat' },
      { key: 'p144_box11_automatic_extension', label: '11. Automatic extension period', page: 1, source: 'Contrat' },
      { key: 'p144_box12_mobilisation', label: '12. Mobilisation fee', page: 1, source: 'Contrat' },
    ],
  },
  {
    id: 'boxes-13-21',
    label: '13–21',
    page: 2,
    fields: [
      { key: 'p144_box13_early_termination', label: '13. Early termination of charter', page: 2, source: 'Contrat' },
      { key: 'p144_box14_termination_notice', label: '14. Number of days’ notice', page: 2, source: 'Contrat' },
      { key: 'p144_box15_demobilisation', label: '15. Demobilisation fee', page: 2, source: 'Contrat' },
      { key: 'p144_box16_operation_area', label: '16. Area of operation', page: 2, source: 'Projet' },
      { key: 'p144_box17_employment', label: '17. Employment of vessel restricted to', page: 2, source: 'Projet' },
      { key: 'p144_box18_specialist_operations', label: '18. Specialist operations', page: 2, source: 'Projet' },
      { key: 'p144_box19_fuel', label: '19. Fuel', page: 2, source: 'Contrat' },
      { key: 'p144_box20_charter_hire', label: '20. Charter hire', page: 2, source: 'Contrat' },
      { key: 'p144_box21_extension_hire', label: '21. Extension hire', page: 2, source: 'Contrat' },
    ],
  },
  {
    id: 'boxes-22-34',
    label: '22–34',
    page: 3,
    fields: [
      { key: 'p144_box22_invoicing', label: '22. Invoicing for hire and other payments', page: 3, source: 'Contrat' },
      { key: 'p144_box23_payments', label: '23. Payments and bank account', page: 3, source: 'Contrat' },
      { key: 'p144_box24_payment_deadline', label: '24. Payment deadline', page: 3, source: 'Contrat' },
      { key: 'p144_box25_interest', label: '25. Interest rate payable', page: 3, source: 'Contrat' },
      { key: 'p144_box26_audit_period', label: '26. Maximum audit period', page: 3, source: 'Contrat' },
      { key: 'p144_box27_meals', label: '27. Meals', page: 3, source: 'Contrat' },
      { key: 'p144_box28_accommodation', label: '28. Accommodation', page: 3, source: 'Contrat' },
      { key: 'p144_box29_sublet', label: '29. Sublet', page: 3, source: 'Contrat' },
      { key: 'p144_box30_war_cancellation', label: '30. War cancellation', page: 3, source: 'Contrat' },
      { key: 'p144_box31_taxes', label: '31. Taxes payable by Owners', page: 3, source: 'Contrat' },
      { key: 'p144_box32_off_hire', label: '32. Off-hire period', page: 3, source: 'Contrat' },
      { key: 'p144_box33_dispute_resolution', label: '33. Dispute resolution', page: 3, source: 'Contrat' },
      { key: 'p144_box34_additional_clauses', label: '34. Additional clauses', page: 3, source: 'Contrat' },
    ],
  },
  {
    id: 'signatures',
    label: 'Signatures',
    page: 4,
    fields: [
      { key: 'p144_signature_owners', label: 'Signature (Owners)', page: 4, source: 'Contrat' },
      { key: 'p144_signature_charterers', label: 'Signature (Charterers)', page: 4, source: 'Client' },
    ],
  },
  {
    id: 'annexes',
    label: 'Annexes',
    page: 4,
    fields: [
      { key: 'p144_annexes', label: 'Annexes contractuelles à joindre', page: 4, source: 'Contrat' },
    ],
  },
];

export const BIMCO_P144_FIELDS = BIMCO_P144_GROUPS.flatMap((group) => group.fields);

export const BIMCO_P144_FIELD_COUNT = 34;

export const TOWAGE_REQUIRED_FIELD_KEYS = [
  'contractDate',
  'charterer',
  'owner',
  'towedVessel',
  'tug',
  'towedConditions',
  'pickupPlace',
  'departureWindow',
  'destinationPlace',
  'arrivalWindow',
  'connectionTime',
  'disconnectionTime',
  'fixedPrice',
  'optionalCosts',
  'paymentTerms',
  'additionalCharges',
  'specialConditions',
  'chartererSignatory',
  'ownerSignatory',
] as const;
