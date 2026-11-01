import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,validateProfile,validateState} from '../core.js';
import {validateCloudJournal} from '../sync-journal.js';
import {rebaseJournal} from '../journal-merge.js';

const today='2026-11-01';
const compositionFields=['goalMode','bodyFatPercent','startBodyFatPercent','goalBodyFatPercent','muscleMass','startMuscleMass','goalMuscleMass'];
function fixture() {
  const state=createInitialState();
  state.profile=validateProfile({...state.profile,goalMode:'composition',weight:80,startWeight:80,
    bodyFatPercent:30,startBodyFatPercent:30,goalBodyFatPercent:25,
    muscleMass:25,startMuscleMass:25,goalMuscleMass:29});
  state.weights=[{date:'2026-10-31',weight:80,bodyFatPercent:30,muscleMass:25}];
  return validateState(state,today);
}
function legacy(state) {
  const older=structuredClone(state);
  for(const key of compositionFields)delete older.profile[key];
  for(const measurement of older.weights) {
    delete measurement.bodyFatPercent;delete measurement.muscleMass;
  }
  return older;
}

test('legacy sync preserves composition goals and unchanged measurements without modifying input',()=>{
  const saved=fixture(),older=legacy(saved);
  older.profile.name='Older browser';
  const before=structuredClone(older),result=validateCloudJournal(older,saved,today);
  for(const key of compositionFields)assert.equal(result.profile[key],saved.profile[key]);
  assert.equal(result.profile.goalWeight,saved.profile.goalWeight);
  assert.equal(result.profile.name,'Older browser');
  assert.deepEqual(result.weights,saved.weights);
  assert.deepEqual(older,before);
});

test('composition profile and measurements round-trip through JSON backup and current sync',()=>{
  const saved=fixture(),restored=validateState(JSON.parse(JSON.stringify(saved)),today);
  assert.deepEqual(restored,saved);
  assert.deepEqual(validateCloudJournal(restored,saved,today),saved);
  assert.deepEqual(validateCloudJournal(restored,null,today),saved);
});

test('explicit null clears optional composition when switching back to a weight goal',()=>{
  const saved=fixture(),current=structuredClone(saved);
  current.profile.goalMode='weight';
  for(const key of compositionFields.filter(key=>key!=='goalMode'))current.profile[key]=null;
  current.weights[0].bodyFatPercent=null;current.weights[0].muscleMass=null;
  const result=validateCloudJournal(current,saved,today);
  assert.equal(result.profile.goalMode,'weight');
  for(const key of compositionFields.filter(key=>key!=='goalMode'))assert.equal(result.profile[key],null);
  assert.deepEqual(result.weights,[{date:'2026-10-31',weight:80}]);
});

test('clearing a required composition target is rejected rather than restored',()=>{
  const saved=fixture(),current=structuredClone(saved);
  current.profile.goalBodyFatPercent=null;
  assert.throws(()=>validateCloudJournal(current,saved,today),/Goal body fat percentage is required/);
  current.profile.goalBodyFatPercent=25;current.weights[0].bodyFatPercent=90;
  assert.throws(()=>validateCloudJournal(current,saved,today),/Recorded body fat percentage/);
});

test('partial measurement edits preserve omitted fields and honor explicit clears',()=>{
  const saved=fixture(),current=legacy(saved);
  current.weights[0].bodyFatPercent=29;
  let result=validateCloudJournal(current,saved,today);
  assert.deepEqual(result.weights,[{date:'2026-10-31',weight:80,bodyFatPercent:29,muscleMass:25}]);
  current.weights[0].muscleMass=null;
  result=validateCloudJournal(current,saved,today);
  assert.deepEqual(result.weights,[{date:'2026-10-31',weight:80,bodyFatPercent:29}]);
});

test('changed weight or new date does not inherit old composition readings',()=>{
  const saved=fixture(),older=legacy(saved);
  older.weights[0].weight=79;
  older.weights.push({date:today,weight:80});
  const result=validateCloudJournal(older,saved,today);
  assert.deepEqual(result.weights,[{date:'2026-10-31',weight:79},{date:today,weight:80}]);
});

test('normalized current clients clear composition readings without sync or rebase restoring them',()=>{
  const saved=fixture(),current=structuredClone(saved);
  current.weights[0]={date:'2026-10-31',weight:80,bodyFatPercent:null,muscleMass:null};
  const normalized=JSON.parse(JSON.stringify(validateState(current,today)));
  const cleared=[{date:'2026-10-31',weight:80}];
  assert.deepEqual(normalized.weights,cleared);
  assert.equal(Object.hasOwn(normalized.profile,'goalMode'),true);
  assert.deepEqual(validateCloudJournal(normalized,saved,today).weights,cleared);

  const remote=structuredClone(saved);
  remote.profile.goalBodyFatPercent=24;
  const rebased=rebaseJournal(saved,normalized,remote,{today});
  assert.deepEqual(rebased.weights,cleared);
  assert.equal(rebased.profile.goalBodyFatPercent,24);
  assert.deepEqual(validateCloudJournal(JSON.parse(JSON.stringify(rebased)),saved,today).weights,cleared);
});

test('legacy food-device edits rebase alongside newer composition goals and measurements',()=>{
  const base=fixture(),local=legacy(base),remote=structuredClone(base);
  local.profile.name='From older device';
  remote.profile.goalBodyFatPercent=24;
  remote.weights.push({date:today,weight:80,bodyFatPercent:29,muscleMass:25.8});
  const result=rebaseJournal(base,local,remote,{today});
  assert.equal(result.profile.name,'From older device');
  assert.equal(result.profile.goalMode,'composition');
  assert.equal(result.profile.goalBodyFatPercent,24);
  assert.deepEqual(result.weights,remote.weights);
});
