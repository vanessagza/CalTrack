import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState,newEntry,validateWorkoutEntry,validateExercise,starterWeek } from '../core.js';
import { rebaseJournal,sameJournal } from '../journal-merge.js';
import { validateCloudJournal } from '../sync-journal.js';

test('adding food from a stale device preserves the newest colors, sizes and photo',()=>{
  const base=createInitialState(),local=structuredClone(base),remote=structuredClone(base);
  local.days['2026-10-12']={entries:[newEntry(base.foods[0],1,'portion','Lunch','my-food')],note:''};
  remote.preferences.theme='dark';remote.preferences.palettes.dark.background='#030509';
  remote.preferences.palettes.dark.subtext='#ffc4dc';remote.preferences.typography.body=20;
  remote.preferences.avatar='data:image/jpeg;base64,aGVsbG8=';
  const result=rebaseJournal(base,local,remote);
  assert.deepEqual(result.preferences,remote.preferences);
  assert.equal(result.days['2026-10-12'].entries[0].id,'my-food');
});
test('the next committed operation changes only its edited fields on the latest copy',()=>{
  const base=createInitialState(),local=structuredClone(base),remote=structuredClone(base);
  local.profile.name='Later commit';remote.profile.name='Earlier commit';remote.profile.height=180;
  local.preferences.palettes.dark.subtext='#ffc4dc';remote.preferences.palettes.dark.background='#030509';
  const result=rebaseJournal(base,local,remote);
  assert.equal(result.profile.name,'Later commit');assert.equal(result.profile.height,180);
  assert.equal(result.preferences.palettes.dark.background,'#030509');
  assert.equal(result.preferences.palettes.dark.subtext,'#ffc4dc');
});
test('simultaneous completion and weight changes to the same exercise survive',()=>{
  const base=createInitialState();
  base.workouts.days['2026-10-12']=[validateWorkoutEntry({id:'exercise',exerciseId:'squat',sets:2,reps:10})];
  const local=structuredClone(base),remote=structuredClone(base);
  local.workouts.days['2026-10-12'][0].completed=true;remote.workouts.days['2026-10-12'][0].load=7;
  const result=rebaseJournal(base,local,remote).workouts.days['2026-10-12'][0];
  assert.equal(result.completed,true);assert.equal(result.load,7);
});
test('no-op and already-acknowledged operations remain no-ops including rest days',()=>{
  const base=createInitialState();
  Object.assign(base.workouts,starterWeek({goal:'preserve',experience:'beginner',equipment:'dumbbells'},'2026-10-12',{},'2026-10-12'));
  assert.ok(sameJournal(rebaseJournal(base,base,base),base));
  const local=structuredClone(base);local.preferences.typography.body=18;
  assert.ok(sameJournal(rebaseJournal(base,local,local),local));
});
test('legacy clients omitting appearance and new workout fields do not reset them',()=>{
  const previous=createInitialState();previous.preferences.palettes.dark.background='#030509';previous.preferences.typography.body=20;
  previous.workouts.notes['2026-10-12']={title:'Legs',goal:'Practice',note:'Go slowly'};
  const older=structuredClone(previous);delete older.preferences;delete older.workouts.notes;delete older.workouts.template;
  delete older.workouts.libraryVersion;
  older.days['2026-10-12']={entries:[newEntry(previous.foods[0],1,'portion','Lunch','older-food')],note:''};
  const result=validateCloudJournal(older,previous);
  assert.deepEqual(result.preferences,previous.preferences);assert.deepEqual(result.workouts.notes,previous.workouts.notes);
  assert.equal(result.days['2026-10-12'].entries.length,1);
  // An explicitly saved reset is still respected.
  assert.deepEqual(validateCloudJournal(createInitialState(),previous).preferences,createInitialState().preferences);
  assert.throws(()=>validateCloudJournal({...older,preferences:null},previous));
});

test('racing custom target and unit edits stay valid and retain unrelated instructions',()=>{
  const base=createInitialState();
  base.workouts.exercises=[validateExercise({id:'custom-exercise-timer',name:'Practice',group:'Mobility',equipment:'bodyweight',unit:'minutes',reps:120})];
  const local=structuredClone(base),remote=structuredClone(base);
  local.workouts.exercises[0].unit='reps';local.workouts.exercises[0].reps=10;
  remote.workouts.exercises[0].reps=240;remote.workouts.exercises[0].instructions='Keep your movement controlled.';
  const result=rebaseJournal(base,local,remote).workouts.exercises[0];
  assert.equal(result.unit,'reps');assert.equal(result.reps,10);
  assert.equal(result.instructions,'Keep your movement controlled.');
});

test('old clients stripping appearance intent cannot reset custom settings, while explicit resets work',()=>{
  const saved=createInitialState();saved.preferences.changeId='saved-color-edit';saved.preferences.theme='dark';saved.preferences.palettes.dark.background='#030509';
  const older=createInitialState();older.preferences.theme='dark';delete older.preferences.changeId;
  assert.deepEqual(validateCloudJournal(older,saved).preferences,saved.preferences);
  older.preferences.changeId='explicit-new-reset';
  assert.equal(validateCloudJournal(older,saved).preferences.palettes.dark.background,'#111827');
  assert.equal(validateCloudJournal(older,saved).preferences.changeId,'explicit-new-reset');
});
