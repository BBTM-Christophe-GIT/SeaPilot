-- Cover the entire tenant-aware reference foreign key, rather than its first column alone.
drop index public.regulatory_reviews_text_idx;
create index regulatory_reviews_text_company_idx on public.regulatory_reviews(text_id,company_id);
