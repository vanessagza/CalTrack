import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,EXERCISE_PRESETS,validateExercise,validateExerciseEnergy,validateWorkoutEntry,
  validateState,exerciseCatalog,scheduledExercise,workoutSuggestion,copyWorkoutWeek,
} from '../core.js';
import {exerciseActiveMinutes,exerciseEnergy,workoutDayEnergy,dailyCalorieBalance} from '../exercise-energy.js';
import {mergeJournals,rebaseJournal,JournalConflict} from '../journal-merge.js';
import {validateCloudJournal} from '../sync-journal.js';

const date='2026-10-13';
const preset=id=>EXERCISE_PRESETS.find(exercise=>exercise.id===id);
const custom=(changes={})=>validateExercise({id:'custom-exercise-step',name:'Step practice',group:'Lower body',equipment:'bodyweight',unit:'reps',sets:2,reps:10,restSeconds:60,unilateral:true,
  energy:{kcal:200,weightKg:70,activeMinutes:160/60},...changes});
const scheduled=(exercise,changes={})=>validateWorkoutEntry({id:'saved-step',exerciseId:exercise.id,sets:exercise.sets,reps:exercise.reps,completed:true,...changes},[exercise]);
const fixture=exercise=>{const state=createInitialState();state.workouts.exercises=[exercise];state.workouts.days[date]=[scheduled(exercise)];return state;};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('manual calorie calibration uses default active work, scales ranges and dated body weight, and credits completion only',()=>{
  const exercise=custom(),state=fixture(exercise),entry=state.workouts.days[date][0];
  close(exerciseActiveMinutes(entry,exercise),160/60);
  close(exerciseEnergy(entry,exercise,70).kcal,200);
  close(exerciseEnergy({...entry,sets:4,setsMax:4},exercise,70).kcal,400);
  close(exerciseEnergy({...entry,reps:20,repsMax:20},exercise,70).kcal,400);
  close(exerciseEnergy({...entry,setsMax:4,repsMax:20},exercise,70).kcal,450);
  close(exerciseEnergy({...entry,restSeconds:600,load:500},exercise,70).kcal,200);
  assert.equal(exerciseEnergy(entry,exercise,70).custom,true);
  state.weights=[{date:'2026-10-12',weight:65},{date:'2026-10-14',weight:80}];
  close(workoutDayEnergy(state,date).creditedKcal,200*65/70);
  close(dailyCalorieBalance(state,date).adjustedKcal,1600+200*65/70);
  entry.completed=false;
  close(workoutDayEnergy(state,date).plannedKcal,200*65/70);
  close(workoutDayEnergy(state,date).creditedKcal,0);
});

test('seconds and minutes calibrations retain side and duration scaling',()=>{
  const timer=custom({unit:'seconds',sets:2,reps:30,energy:{kcal:40,weightKg:70,activeMinutes:2}});
  close(exerciseActiveMinutes(scheduled(timer),timer),2);
  close(exerciseEnergy(scheduled(timer,{reps:60,repsMax:60}),timer,70).kcal,80);
  const walk=custom({group:'Cardio',unit:'minutes',sets:1,reps:20,unilateral:false,energy:{kcal:100,weightKg:70,activeMinutes:20}});
  close(exerciseEnergy(scheduled(walk,{reps:30,repsMax:30}),walk,70).kcal,150);
});

test('zero overrides are explicit, and unsafe or incomplete calibration values are rejected',()=>{
  const zero=custom({energy:{kcal:0,weightKg:70,activeMinutes:160/60}});
  assert.equal(exerciseEnergy(scheduled(zero),zero,70).kcal,0);
  assert.equal(exerciseEnergy(scheduled(zero),zero,70).met,1);
  assert.equal(validateExercise({...zero,energy:null}).energy,null);
  assert.equal(validateExercise({...zero,energy:undefined}).energy,null);
  for(const energy of [[],true,'200',{},
    {kcal:-1,weightKg:70,activeMinutes:1},{kcal:10001,weightKg:70,activeMinutes:1},
    {kcal:NaN,weightKg:70,activeMinutes:1},{kcal:Infinity,weightKg:70,activeMinutes:1},
    {kcal:200,weightKg:29,activeMinutes:1},{kcal:200,weightKg:251,activeMinutes:1},
    {kcal:200,weightKg:70,activeMinutes:0},{kcal:200,weightKg:70,activeMinutes:4801},
    {kcal:false,weightKg:70,activeMinutes:1},{kcal:'',weightKg:70,activeMinutes:1}])assert.throws(()=>validateExercise({...zero,energy}));
  assert.deepEqual(validateExerciseEnergy({kcal:'0',weightKg:'70',activeMinutes:'1'}),{kcal:0,weightKg:70,activeMinutes:1});
});

test('built-in definitions overlay once, honor saved defaults, and preserve guides and uploaded or removed images',()=>{
  const original=preset('squat'),override=validateExercise({...original,name:'My squat',sets:4,reps:15,restSeconds:90,
    cue:'Slowly down',feel:'Legs working',easier:'Use a chair',energy:{kcal:120,weightKg:70,activeMinutes:4}});
  const state=createInitialState();state.workouts.exercises=[override];
  const catalog=exerciseCatalog(state.workouts),edited=catalog.find(exercise=>exercise.id===original.id);
  assert.equal(catalog.length,EXERCISE_PRESETS.length);
  assert.equal(edited.customized,true);assert.equal(edited.cue,'Slowly down');
  assert.equal(edited.image,original.image);assert.equal(edited.compound,true);
  assert.ok(!Object.hasOwn(override,'customized'));
  const suggestion=workoutSuggestion(state.profile,state.workouts.settings,original.id,date,null,catalog);
  assert.equal(suggestion.sets,4);assert.equal(suggestion.reps,15);assert.equal(suggestion.restSeconds,90);
  assert.equal(workoutSuggestion(state.profile,state.workouts.settings,'squat',date).sets,3);
  const uploaded=validateExercise({...override,image:'data:image/webp;base64,aGVsbG8='});
  assert.equal(uploaded.image,'data:image/webp;base64,aGVsbG8=');
  assert.equal(validateExercise({...override,image:''}).image,'');
  assert.throws(()=>validateExercise({...override,image:'./assets/exercises/plank.svg'}));
  assert.throws(()=>validateExercise({...override,image:'./assets/exercises/../squat.svg'}));
  assert.throws(()=>validateExercise({...override,image:'https://example.test/squat.png'}));
  assert.throws(()=>validateExercise({...custom(),image:original.image}));
  assert.throws(()=>validateExercise({...override,id:'unrecognized-preset'}));
});

test('reset tombstones restore original preset guides, images and adaptive suggestions through sync',()=>{
  const state=fixture(validateExercise({...preset('squat'),name:'Changed squat',sets:7,reps:20,image:'',energy:{kcal:80,weightKg:70,activeMinutes:1}}));
  const reset=structuredClone(state);
  reset.workouts.exercises[0]=validateExercise({...preset('squat'),reset:true,energy:null,archived:false});
  const merged=rebaseJournal(state,reset,state),catalog=exerciseCatalog(merged.workouts);
  assert.deepEqual(catalog.find(exercise=>exercise.id==='squat'),preset('squat'));
  assert.equal(merged.workouts.exercises[0].reset,true);
  assert.equal(workoutSuggestion(merged.profile,merged.workouts.settings,'squat',date,null,catalog).sets,3);
  close(workoutDayEnergy(merged,date).creditedKcal,exerciseEnergy(merged.workouts.days[date][0],preset('squat'),70).kcal);
  const legacy=structuredClone(merged);legacy.workouts.exercises=[];delete legacy.workouts.libraryVersion;
  assert.deepEqual(exerciseCatalog(validateCloudJournal(legacy,merged).workouts).find(exercise=>exercise.id==='squat'),preset('squat'));
  const edited=validateExercise({...preset('squat'),reset:false,name:'Changed again'});
  assert.equal(exerciseCatalog({exercises:[edited]}).find(exercise=>exercise.id==='squat').name,'Changed again');
});

test('the saved library allows 200 custom definitions together with all preset overrides',()=>{
  const state=createInitialState();
  state.workouts.exercises=[...Array.from({length:200},(_,index)=>custom({id:`custom-exercise-${index}`})),
    ...EXERCISE_PRESETS.map(exercise=>validateExercise({...exercise}))];
  assert.equal(validateState(state).workouts.exercises.length,228);
  state.workouts.exercises=state.workouts.exercises.filter(exercise=>exercise.id.startsWith('custom-exercise-'));
  state.workouts.exercises.push(custom({id:'custom-exercise-one-too-many'}));
  assert.throws(()=>validateState(state),/at most 200 custom/);
});

test('definition edits update completed calories and descriptions while preserving saved target dimensions',()=>{
  const exercise=custom(),state=fixture(exercise),entry=state.workouts.days[date][0];
  state.workouts.exercises[0]=validateExercise({...exercise,name:'Updated step',instructions:'Use a stable step.',unit:'minutes',reps:20,unilateral:false,
    energy:{kcal:300,weightKg:70,activeMinutes:160/60}});
  const resolved=scheduledExercise(entry,state.workouts);
  assert.equal(resolved.name,'Updated step');assert.equal(resolved.instructions,'Use a stable step.');
  assert.equal(resolved.unit,'reps');assert.equal(resolved.unilateral,true);
  close(workoutDayEnergy(state,date).creditedKcal,300);
  const restored=validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.workouts.days[date][0].exercise.unit,'reps');
  close(workoutDayEnergy(restored,date).creditedKcal,300);
  state.workouts.exercises[0].energy=null;
  assert.equal(workoutDayEnergy(state,date).entries[0].estimate.custom,false);
});

test('preset edits and legacy migration preserve units for scheduled records and saved routines',()=>{
  const state=createInitialState(),plank=preset('plank');
  const saved=validateWorkoutEntry({id:'old-plank',exerciseId:'plank',sets:2,reps:120,completed:true});
  const legacy={...saved};delete legacy.exercise;
  state.workouts.exercises=[validateExercise({...plank,unit:'reps',sets:2,reps:10,unilateral:true,energy:{kcal:80,weightKg:70,activeMinutes:4}})];
  state.workouts.days[date]=[legacy];
  state.workouts.template={config:'preserve:beginner:bodyweight',days:[[legacy],[],[],[],[],[],[]],notes:Array.from({length:7},()=>({title:'',goal:'',note:''}))};
  const restored=validateState(state),current=exerciseCatalog(restored.workouts).find(exercise=>exercise.id==='plank');
  assert.equal(restored.workouts.days[date][0].exercise.unit,'seconds');
  assert.equal(restored.workouts.days[date][0].exercise.unilateral,false);
  assert.equal(restored.workouts.template.days[0][0].exercise.unit,'seconds');
  close(workoutDayEnergy(restored,date).creditedKcal,80);
  const newEntry=scheduled(current,{id:'new-plank'});
  assert.equal(newEntry.exercise.unit,'reps');
  assert.ok(exerciseActiveMinutes(newEntry,current)>0);
});

test('archived definitions, calibration snapshots and copied weeks survive backups and preserve history',()=>{
  const exercise=custom({image:'data:image/png;base64,aGVsbG8='}),state=fixture(exercise);
  state.workouts.exercises[0].archived=true;
  const restored=validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored,state);assert.equal(exerciseCatalog(restored.workouts).find(item=>item.id===exercise.id).archived,true);
  close(workoutDayEnergy(restored,date).creditedKcal,200);
  assert.equal(scheduledExercise(restored.workouts.days[date][0],restored.workouts).image,exercise.image);
  const copy=copyWorkoutWeek(restored.workouts.days,date,date,exerciseCatalog(restored.workouts));
  assert.deepEqual(copy['2026-10-20'][0].exercise.energy,exercise.energy);
  assert.equal(copy['2026-10-20'][0].completed,false);
  assert.ok(!Object.hasOwn(copy['2026-10-20'][0].exercise,'image'));
  restored.workouts.exercises=[];
  close(workoutDayEnergy(validateState(restored),date).creditedKcal,200);
});

test('independent calorie, guide, photo and completion edits survive sync for presets and custom definitions',()=>{
  for(const exercise of [custom(),validateExercise({...preset('squat'),sets:2,reps:10,energy:{kcal:80,weightKg:70,activeMinutes:80/60}})]) {
    const base=fixture(exercise),local=structuredClone(base),remote=structuredClone(base);
    local.workouts.exercises[0].energy.kcal=240;
    remote.workouts.exercises[0].instructions='Stay in control.';remote.workouts.exercises[0].image='data:image/jpeg;base64,aGVsbG8=';
    remote.workouts.days[date][0].completed=false;
    const merged=mergeJournals(base,local,remote);
    assert.equal(merged.workouts.exercises[0].energy.kcal,240);
    assert.equal(merged.workouts.exercises[0].instructions,'Stay in control.');
    assert.equal(merged.workouts.exercises[0].image,'data:image/jpeg;base64,aGVsbG8=');
    assert.equal(merged.workouts.days[date][0].completed,false);
    close(workoutDayEnergy(merged,date).plannedKcal,240);close(workoutDayEnergy(merged,date).creditedKcal,0);
  }
});

test('racing calibration and default-unit changes stay coherent while keeping independent description edits',()=>{
  const base=fixture(custom()),local=structuredClone(base),remote=structuredClone(base);
  Object.assign(local.workouts.exercises[0],{unit:'minutes',unilateral:false,sets:1,reps:20,energy:{kcal:150,weightKg:70,activeMinutes:20}});
  Object.assign(remote.workouts.exercises[0],{reps:15,energy:{kcal:300,weightKg:70,activeMinutes:4},instructions:'Keep control.'});
  const merged=rebaseJournal(base,local,remote).workouts.exercises[0];
  assert.equal(merged.unit,'minutes');assert.equal(merged.sets,1);assert.equal(merged.reps,20);assert.equal(merged.unilateral,false);
  assert.deepEqual(merged.energy,local.workouts.exercises[0].energy);assert.equal(merged.instructions,'Keep control.');
  assert.throws(()=>mergeJournals(base,local,remote),JournalConflict);
});

test('equal manual calibrations keep concurrent default volume and side edits together',()=>{
  const exercise=custom({unilateral:false,energy:{kcal:100,weightKg:70,activeMinutes:80/60}}),base=fixture(exercise);
  const local=structuredClone(base),remote=structuredClone(base);
  Object.assign(local.workouts.exercises[0],{sets:1,unilateral:true});
  Object.assign(remote.workouts.exercises[0],{sets:1,reps:20,instructions:'Keep control.',image:'data:image/png;base64,aGVsbG8='});
  for(const state of [local,remote])close(exerciseEnergy(scheduled(state.workouts.exercises[0]),state.workouts.exercises[0],70).kcal,100);
  const merged=rebaseJournal(base,local,remote).workouts.exercises[0];
  assert.equal(merged.sets,1);assert.equal(merged.reps,10);assert.equal(merged.unilateral,true);
  assert.equal(merged.instructions,'Keep control.');assert.equal(merged.image,'data:image/png;base64,aGVsbG8=');
  close(exerciseEnergy(scheduled(merged),merged,70).kcal,100);
  assert.throws(()=>mergeJournals(base,local,remote),JournalConflict);
});

test('current normalized backup restore replaces definitions while legacy omission preserves newer ones',()=>{
  const backup=createInitialState(),saved=fixture(custom());
  saved.workouts.exercises.push(validateExercise({...preset('squat'),name:'Custom squat',sets:3,reps:12,energy:{kcal:60,weightKg:70,activeMinutes:2}}));
  const restored=validateCloudJournal(validateState(JSON.parse(JSON.stringify(backup))),saved);
  assert.equal(restored.workouts.libraryVersion,1);assert.deepEqual(restored.workouts.exercises,[]);
  assert.deepEqual(rebaseJournal(saved,backup,saved).workouts.exercises,[]);
  const legacy=JSON.parse(JSON.stringify(backup));delete legacy.workouts.libraryVersion;
  assert.deepEqual(validateCloudJournal(legacy,saved).workouts.exercises,saved.workouts.exercises);
  assert.equal(validateState(legacy).workouts.libraryVersion,1);
  for(const libraryVersion of [0,2,'1',null])assert.throws(()=>validateState({...backup,workouts:{...backup.workouts,libraryVersion}}),/library version is unsupported/);
});

test('legacy clients cannot erase calories, preset overrides, new guide fields or snapshot dimensions',()=>{
  const exercise=custom({cue:'Step slowly',feel:'Legs',easier:'Lower step'}),saved=fixture(exercise);
  saved.workouts.exercises.push(validateExercise({...preset('squat'),sets:3,reps:10,archived:true,energy:{kcal:60,weightKg:70,activeMinutes:2}}));
  const older=structuredClone(saved);
  delete older.workouts.libraryVersion;
  older.workouts.exercises=older.workouts.exercises.filter(item=>item.id.startsWith('custom-exercise-'));
  for(const key of ['energy','cue','feel','easier'])delete older.workouts.exercises[0][key];
  delete older.workouts.days[date][0].exercise.energy;
  older.workouts.exercises[0].instructions='Edited on the older device.';
  const restored=validateCloudJournal(older,saved);
  assert.deepEqual(restored.workouts.exercises[0].energy,exercise.energy);
  assert.equal(restored.workouts.exercises[0].cue,exercise.cue);
  assert.equal(restored.workouts.exercises[0].feel,exercise.feel);
  assert.equal(restored.workouts.exercises[0].easier,exercise.easier);
  assert.equal(restored.workouts.exercises[0].instructions,'Edited on the older device.');
  assert.equal(restored.workouts.exercises[1].id,'squat');assert.equal(restored.workouts.exercises[1].archived,true);
  assert.deepEqual(restored.workouts.days[date][0].exercise.energy,exercise.energy);
  delete older.workouts.days[date][0].exercise;
  assert.deepEqual(validateCloudJournal(older,saved).workouts.days[date][0].exercise,saved.workouts.days[date][0].exercise);
  const remote=structuredClone(saved);remote.workouts.exercises[0].energy.kcal=250;
  const rebased=rebaseJournal(saved,older,remote);
  assert.equal(rebased.workouts.exercises[0].energy.kcal,250);
  assert.equal(rebased.workouts.exercises[0].instructions,'Edited on the older device.');
  older.workouts.exercises[0].energy=null;
  assert.equal(validateCloudJournal(older,saved).workouts.exercises[0].energy,null);
  assert.throws(()=>validateCloudJournal({...older,workouts:{...older.workouts,exercises:null}},saved));
});
