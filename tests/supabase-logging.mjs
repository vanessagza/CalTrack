import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();
const script=await readFile(process.cwd()+'/supabase/reduce-logging.sql','utf8');
await db.exec(`
  create role authenticator;
  create role authenticated;
  create role service_role;
  create table private_journal(journal jsonb);
  insert into private_journal values ('{"version":1,"test":"synthetic journal"}');
  alter role postgres set log_statement = 'all';
  alter role postgres set log_duration = 'on';
  alter role postgres set log_min_duration_statement = '5s';
  alter role postgres set log_min_messages = 'error';
  alter role authenticator set log_statement = 'all';
  alter role authenticator set log_duration = 'on';
  alter role authenticator set log_min_duration_statement = '-1';
  alter role authenticator set log_min_messages = 'log';
  alter role authenticated set log_statement = 'all';
  alter role authenticated set log_duration = 'on';
  alter role authenticated set log_min_duration_statement = '250ms';
  alter role authenticated set log_min_messages = 'DEBUG1';
  alter role service_role set log_statement = 'all';
  alter role service_role set log_min_duration_statement = '0';
`);
const configurations=async()=>Object.fromEntries((await db.query(`
  select rolname,rolconfig from pg_roles
  where rolname in ('postgres','authenticator','authenticated','service_role')
`)).rows.map(row=>[row.rolname,Object.fromEntries(row.rolconfig.map(value=>value.split('=')))]));
const before=await configurations(),journal=await db.query('select journal from private_journal');
await db.exec(script);
const after=await configurations();
for(const role of ['postgres','authenticator','authenticated']) {
  assert.equal(after[role].log_statement,'none');
  assert.equal(after[role].log_duration,'off');
}
assert.equal(after.authenticator.log_min_duration_statement,before.authenticator.log_min_duration_statement);
assert.equal(after.authenticator.log_min_messages,'log');
assert.equal(after.postgres.log_min_duration_statement,before.postgres.log_min_duration_statement);
assert.equal(after.postgres.log_min_messages,'error');
assert.equal(after.authenticated.log_min_duration_statement,'2s');
assert.equal(after.authenticated.log_min_messages,'warning');
assert.deepEqual(after.service_role,before.service_role);
assert.deepEqual((await db.query('select journal from private_journal')).rows,journal.rows);
await db.exec(script);
assert.deepEqual(await configurations(),after);

// A lower threshold expressed as a bare number is raised as well.
await db.exec("alter role authenticated set log_min_duration_statement = '0';");
await db.exec(script);
assert.equal((await configurations()).authenticated.log_min_duration_statement,'2s');
await db.exec('alter role authenticator reset log_min_duration_statement;');
await db.exec(script);
assert.equal((await configurations()).authenticator.log_min_duration_statement,undefined);
await db.close();
console.log('PASS: quieter role logging preserves disabled and higher thresholds, strict severities, unrelated roles and journal records; repeat runs are stable');
