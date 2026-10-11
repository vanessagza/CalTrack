-- Run this once in Supabase's SQL Editor. It is safe to rerun.
-- No journal data or credentials belong in this file.
begin;

create table if not exists public.daily_balance_journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  journal jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint daily_balance_journal_shape check (
    jsonb_typeof(journal) = 'object'
    and journal @> '{"version": 1}'::jsonb
    and octet_length(journal::text) <= 10485760
  )
);

alter table public.daily_balance_journals enable row level security;
revoke all on public.daily_balance_journals from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.daily_balance_journals to authenticated;

drop policy if exists daily_balance_read_own on public.daily_balance_journals;
create policy daily_balance_read_own on public.daily_balance_journals
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists daily_balance_insert_own on public.daily_balance_journals;
create policy daily_balance_insert_own on public.daily_balance_journals
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists daily_balance_update_own on public.daily_balance_journals;
create policy daily_balance_update_own on public.daily_balance_journals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Compare revisions atomically: an older device cannot replace a newer save.
-- SECURITY INVOKER keeps the table's ownership policies in force.
create or replace function public.save_daily_balance_journal(
  p_journal jsonb,
  p_expected_revision bigint
)
returns public.daily_balance_journals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.daily_balance_journals;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Sign in before syncing your journal.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid journal revision.' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.daily_balance_journals (user_id, journal)
    values (owner_id, p_journal)
    on conflict (user_id) do nothing
    returning * into saved;
  else
    update public.daily_balance_journals
    set journal = p_journal, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_expected_revision
    returning * into saved;
  end if;

  if saved.user_id is null then
    raise exception 'Your journal changed on another device. Review the latest copy before saving.'
      using errcode = '40001';
  end if;
  return saved;
end;
$$;

revoke all on function public.save_daily_balance_journal(jsonb, bigint) from public, anon;
grant execute on function public.save_daily_balance_journal(jsonb, bigint) to authenticated;

commit;
