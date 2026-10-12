-- Paste this whole script into Supabase SQL Editor -> New query and click Run.
-- Changes logging for the app's Data API and SQL editor roles only.
-- Keeps errors, warnings and slow-query diagnostics. It never enables a
-- disabled duration logger or lowers an existing threshold of 2 seconds or more.
-- Uses Supabase's documented ALTER ROLE controls; no journal data or permissions
-- are changed. Run using the SQL editor's default postgres administrator role.
begin;

do $$
declare
  target record;
  duration_value text;
  duration_ms numeric;
  message_level text;
begin
  for target in select rolname, rolconfig from pg_roles
    where rolname in ('postgres', 'authenticator', 'authenticated')
  loop
    execute format('alter role %I set log_statement = %L', target.rolname, 'none');
    execute format('alter role %I set log_duration = %L', target.rolname, 'off');

    select coalesce(
      (select split_part(value, '=', 2) from unnest(target.rolconfig) as value
        where value like 'log_min_duration_statement=%'),
      (select case when source in ('default', 'configuration file', 'command line', 'environment variable')
        then setting else boot_val end from pg_settings where name = 'log_min_duration_statement')
    ) into duration_value;
    duration_ms := case when duration_value ~ '^-?[0-9]+$' then duration_value::numeric
      else extract(epoch from duration_value::interval) * 1000 end;
    if duration_ms >= 0 and duration_ms < 2000 then
      execute format('alter role %I set log_min_duration_statement = %L', target.rolname, '2s');
    end if;

    select coalesce(
      (select split_part(value, '=', 2) from unnest(target.rolconfig) as value
        where value like 'log_min_messages=%'),
      (select case when source in ('default', 'configuration file', 'command line', 'environment variable')
        then setting else boot_val end from pg_settings where name = 'log_min_messages')
    ) into message_level;
    if lower(message_level) in ('debug5', 'debug4', 'debug3', 'debug2', 'debug1', 'info', 'notice') then
      execute format('alter role %I set log_min_messages = %L', target.rolname, 'warning');
    end if;
  end loop;
end
$$;

-- Apply Data API role settings to future requests without a project restart.
notify pgrst, 'reload config';
commit;

-- Report only log settings, without other role configuration or personal data.
select rolname, value as log_setting
from pg_roles cross join lateral unnest(rolconfig) as value
where rolname in ('postgres', 'authenticator', 'authenticated')
  and value like 'log_%'
order by rolname, value;
