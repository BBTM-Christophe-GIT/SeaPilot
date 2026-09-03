begin;

select plan(3);

select ok(
  public.is_valid_supplytime_data(
    '{
      "commercial_reserve_availability":"true",
      "commercial_charter_hire_service_description":"Mise à disposition du navire et de son équipage",
      "commercial_mobilisation_service_description":"Préparation et transit vers le port de livraison",
      "commercial_demobilisation_service_description":"Transit retour et remise en configuration",
      "towed_conditions":"Bonne condition de partance",
      "bareboat_contract_place":"Cherbourg-En-Cotentin",
      "p144_box34_additional_clauses":"Clause particulière",
      "p144_annexes":"Attestation Expert/BV"
    }'::jsonb
  ),
  'supported offer and contract editor fields are accepted'
);

select ok(
  not public.is_valid_supplytime_data('{"unexpected_contract_field":"value"}'::jsonb),
  'unknown project contract fields remain rejected'
);

select ok(
  not public.is_valid_supplytime_data('{"bareboat_contract_place":{"nested":true}}'::jsonb),
  'nested project contract values remain rejected'
);

select * from finish();

rollback;
