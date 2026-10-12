-- Run in Supabase SQL Editor to check the existing setup and storage usage.
-- These queries only read metadata. They do not change schema or journal data.
-- Run each SELECT separately to view both result sets.

with app as (
  select to_regclass('public.daily_balance_journals') as table_id
)
select
  table_id is not null as journal_table_exists,
  to_regprocedure('public.save_daily_balance_journal(jsonb,bigint)') is not null
    as save_function_exists,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  case when table_id is null then 'Missing'
    else pg_size_pretty(pg_total_relation_size(table_id))
  end as journal_table_size_including_indexes_and_old_versions
from app;

-- Estimated row counts and recent cleanup activity, without reading journals.
select
  n_live_tup as estimated_current_rows,
  n_dead_tup as estimated_old_row_versions,
  last_autovacuum,
  last_vacuum
from pg_stat_user_tables
where schemaname = 'public' and relname = 'daily_balance_journals';
