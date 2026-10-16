import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,newEntry,closedIntakeThrough,closeIntakeDays,validateState} from '../core.js';
import {validateCloudJournal} from '../sync-journal.js';
import {mergeJournals,rebaseJournal} from '../journal-merge.js';

const today='2026-10-16';
const fixture=()=>createInitialState();
function log(state,date,id=date) {
  state.days[date]={entries:[newEntry(state.foods[0],1,'portion','Lunch',id)],note:''};
  return state;
}

test('fresh journals keep an explicit open marker through backup validation',()=>{
  const state=log(fixture(),today);
  assert.equal(state.intakeClosedThrough,null);
  assert.equal(closedIntakeThrough(state,today),null);
  assert.equal(validateState(JSON.parse(JSON.stringify(state)),today).intakeClosedThrough,null);
});

test('legacy journals infer completion only from the newest nonfuture food log',()=>{
  const state=log(log(log(fixture(),'2026-10-12'),'2026-10-15'),'2026-10-19');
  state.days['2026-10-16']={entries:[],note:'A day note does not record food.'};
  delete state.intakeClosedThrough;
  assert.equal(closedIntakeThrough(state,today),'2026-10-14');
  assert.equal(validateState(state,today).intakeClosedThrough,'2026-10-14');
  delete state.days['2026-10-15'];delete state.days['2026-10-12'];
  assert.equal(closedIntakeThrough(state,today),null);
  assert.equal(validateState(state,today).intakeClosedThrough,null);
});

test('recording today closes earlier days once and earlier backfills cannot move completion backward',()=>{
  const state=fixture();
  assert.equal(closeIntakeDays(state,'2026-10-14',today),'2026-10-13');
  assert.equal(closeIntakeDays(state,today,today),'2026-10-15');
  assert.equal(closeIntakeDays(state,'2026-10-12',today),'2026-10-15');
  assert.equal(state.intakeClosedThrough,'2026-10-15');
  assert.equal(closeIntakeDays(state,today,today),'2026-10-15');
});

test('planning food in a future day does not close today or materialize legacy inference',()=>{
  const state=fixture();
  assert.equal(closeIntakeDays(state,'2026-10-18',today),null);
  assert.equal(state.intakeClosedThrough,null);
  delete state.intakeClosedThrough;
  assert.equal(closeIntakeDays(state,'2026-10-18',today),null);
  assert.equal(Object.hasOwn(state,'intakeClosedThrough'),false);
});

test('removing every food log leaves the saved completion event intact',()=>{
  const state=log(fixture(),today);
  closeIntakeDays(state,today,today);
  state.days={};
  assert.equal(validateState(state,today).intakeClosedThrough,'2026-10-15');
  assert.equal(closedIntakeThrough(state,today),'2026-10-15');
});

test('future completion markers are clamped through yesterday and malformed markers are rejected',()=>{
  const state=fixture();state.intakeClosedThrough='2026-10-20';
  assert.equal(closedIntakeThrough(state,today),'2026-10-15');
  assert.equal(validateState(state,today).intakeClosedThrough,'2026-10-15');
  for(const marker of ['',undefined,0,false,{},'2026-02-30','tomorrow']) {
    state.intakeClosedThrough=marker;
    assert.throws(()=>closedIntakeThrough(state,today),/completion date/);
    assert.throws(()=>validateState(state,today),/completion date/);
  }
  assert.throws(()=>closeIntakeDays(fixture(),'2026-02-30',today),/food date/);
  assert.throws(()=>closedIntakeThrough(fixture(),'2026-02-30'),/current intake date/);
});

test('legacy sync omissions retain completion even after every old food log is removed',()=>{
  const saved=fixture();saved.intakeClosedThrough='2026-10-14';
  const older=structuredClone(saved);delete older.intakeClosedThrough;older.days={};
  const before=structuredClone(older);
  assert.equal(validateCloudJournal(older,saved,today).intakeClosedThrough,'2026-10-14');
  assert.deepEqual(older,before);
});

test('legacy sync can advance completion from a new real log while ignoring future plans',()=>{
  const saved=fixture();saved.intakeClosedThrough='2026-10-12';
  const older=log(log(structuredClone(saved),today),'2026-10-20');delete older.intakeClosedThrough;
  assert.equal(validateCloudJournal(older,saved,today).intakeClosedThrough,'2026-10-15');
  delete older.days[today];
  assert.equal(validateCloudJournal(older,saved,today).intakeClosedThrough,'2026-10-12');
});

test('an explicit null in a restored current journal remains distinct from legacy omission',()=>{
  const saved=fixture();saved.intakeClosedThrough='2026-10-15';
  const restored=log(fixture(),today);
  assert.equal(validateCloudJournal(restored,saved,today).intakeClosedThrough,null);
  restored.intakeClosedThrough='invalid';
  assert.throws(()=>validateCloudJournal(restored,saved,today),/completion date/);
});

test('concurrent devices merge the latest completion watermark alongside independent log edits',()=>{
  const base=fixture(),local=log(structuredClone(base),'2026-10-14'),remote=log(structuredClone(base),today);
  closeIntakeDays(local,'2026-10-14',today);closeIntakeDays(remote,today,today);
  for(const merge of [mergeJournals,rebaseJournal]) {
    const result=merge(base,local,remote,{today});
    assert.equal(result.intakeClosedThrough,'2026-10-15');
    assert.equal(result.days['2026-10-14'].entries.length,1);
    assert.equal(result.days[today].entries.length,1);
  }
});

test('merge completion is monotonic even when both branches match after deleting their logs',()=>{
  const base=log(fixture(),today);base.intakeClosedThrough='2026-10-15';
  const local=fixture(),remote=fixture();
  for(const merge of [mergeJournals,rebaseJournal])assert.equal(merge(base,local,remote,{today}).intakeClosedThrough,'2026-10-15');
});

test('rebasing a stale legacy tab retains a newer device completion marker',()=>{
  const base=fixture();base.intakeClosedThrough='2026-10-12';
  const local=log(structuredClone(base),'2026-10-14'),remote=structuredClone(base);
  delete local.intakeClosedThrough;remote.intakeClosedThrough='2026-10-15';
  const result=rebaseJournal(base,local,remote,{today});
  assert.equal(result.intakeClosedThrough,'2026-10-15');
  assert.equal(result.days['2026-10-14'].entries.length,1);
});
