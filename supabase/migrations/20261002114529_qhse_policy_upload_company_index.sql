-- Cover the tenant FK and administrative staging queries without exposing tokens.
create index qhse_policy_uploads_company_idx on qhse_policy_private.uploads(company_id);
