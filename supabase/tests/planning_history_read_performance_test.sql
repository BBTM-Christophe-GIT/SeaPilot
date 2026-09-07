begin;

select plan(2);

select has_index(
  'public',
  'planning_change_log',
  'planning_change_log_changed_at_read_idx',
  'recent Planning history has a global chronological read index'
);

select matches(
  (
    select indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'planning_change_log'
      and indexname = 'planning_change_log_changed_at_read_idx'
  ),
  '\(changed_at DESC\)',
  'the Planning history read index follows the client sort order'
);

select * from finish();
rollback;
