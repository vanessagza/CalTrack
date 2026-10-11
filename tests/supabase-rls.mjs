import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
await db.exec(`
 create role anon;
 create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
 $$;
 grant usage on schema auth to anon, authenticated;
 grant execute on function auth.uid() to anon, authenticated;
 insert into auth.users values ('${alice}'), ('${bob}');
`);
const sql = await readFile(process.cwd() + '/supabase/setup.sql','utf8');
await db.exec(sql); await db.exec(sql);
async function asUser(id) {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
 await db.exec('set role authenticated');
}
async function expectError(command, values, code) {
 try { await db.query(command, values); assert.fail('Expected SQL rejection'); }
 catch(e) { assert.equal(e.code, code); }
}
const journal = {version:1, test:'synthetic SQL validation record'};
await asUser(alice);
let r = await db.query('select (public.save_daily_balance_journal($1::jsonb,0)).revision',[JSON.stringify(journal)]);
assert.equal(Number(r.rows[0].revision),1);
r = await db.query('select (public.save_daily_balance_journal($1::jsonb,1)).revision',[JSON.stringify({...journal,test:'newer record'})]);
assert.equal(Number(r.rows[0].revision),2);
await expectError('select public.save_daily_balance_journal($1::jsonb,1)',[JSON.stringify(journal)],'40001');
await expectError('select public.save_daily_balance_journal($1::jsonb,0)',[JSON.stringify(journal)],'40001');
await expectError('select public.save_daily_balance_journal($1::jsonb,2)',[JSON.stringify({version:2})],'23514');
await asUser(bob);
assert.equal((await db.query('select * from public.daily_balance_journals')).rows.length,0);
assert.equal((await db.query('update public.daily_balance_journals set revision=100 where user_id=$1 returning *',[alice])).rows.length,0);
await expectError('insert into public.daily_balance_journals(user_id,journal) values ($1,$2::jsonb)',[alice,JSON.stringify(journal)],'42501');
await db.query('select public.save_daily_balance_journal($1::jsonb,0)',[JSON.stringify(journal)]);
assert.equal((await db.query('select * from public.daily_balance_journals')).rows.length,1);
await db.exec('reset role; set role anon');
await expectError('select * from public.daily_balance_journals',[],'42501');
await expectError('select public.save_daily_balance_journal($1::jsonb,0)',[JSON.stringify(journal)],'42501');
await db.exec('reset role');
await db.exec(sql);
assert.equal((await db.query('select * from public.daily_balance_journals')).rows.length,2);
await db.close();
console.log('PASS: repeatable migration, authenticated saves, revision conflicts, journal version validation, cross-account read/write isolation, anonymous read/save denial, rerun preserves journals');
