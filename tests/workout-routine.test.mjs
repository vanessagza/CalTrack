import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  createInitialState, validateState, validateWorkouts, validateExercise,
  validateWorkoutEntry, exerciseCatalog, scheduledExercise, starterWeek,
  suggestWorkoutWeek, copyWorkoutWeek, clearWorkoutSchedule, workoutConfigKey,
  WARMUP_TEXT, EXERCISE_PRESETS, matchesStarterRoutine,
} from '../core.js';
import { prescription, guideHTML } from '../workout-view.js';

const settings={goal:'preserve',experience:'beginner',equipment:'dumbbells',autoRepeat:true,view:'grid'};
const monday='2026-10-12';
const custom=()=>validateExercise({id:'custom-exercise-step-up',name:'Step-up',group:'Lower body',equipment:'bodyweight',unit:'reps',sets:2,reps:8,restSeconds:45,unilateral:true,instructions:'Step onto a stable low platform.',avoid:'Pushing off the back leg.',image:'data:image/png;base64,aGVsbG8='});
const makeRoutine=()=>starterWeek(settings,monday,{},monday);

test('provided preservation routine has exact targets, rest and recovery across all seven days',()=>{
  assert.equal(matchesStarterRoutine(settings),true);
  assert.equal(matchesStarterRoutine({...settings,goal:'build'}),false);
  const {days,notes}=makeRoutine();
  const expected=[
    [['goblet-squat',2,2,8,10,90],['dumbbell-rdl',2,2,8,12,90],['glute-bridge',2,2,12,15,60],['hip-abduction',2,2,12,12,45],['dead-bug',2,2,6,8,45]],
    [['walking',1,1,15,20,0],['mobility',1,1,5,5,0]],
    [['wall-push-up',2,2,6,10,90],['dumbbell-press',2,2,8,12,90],['bent-over-row',2,2,10,12,90],['shoulder-press',1,2,8,10,90],['modified-side-plank',2,2,15,20,45]],
    [['walking',1,1,20,25,0]],
    [['reverse-lunge',2,2,6,8,90],['dumbbell-rdl',2,2,8,12,90],['glute-bridge',2,2,12,15,60],['dumbbell-press',2,2,8,12,90],['wall-push-up',1,2,6,10,90],['bent-over-row',2,2,10,12,90],['dead-bug',2,2,6,8,45]],
    [['walking',1,1,20,30,0],['mobility',1,1,5,5,0]],[],
  ];
  assert.deepEqual(Object.values(days).map(list=>list.map(e=>[e.exerciseId,e.sets,e.setsMax,e.reps,e.repsMax,e.restSeconds])),expected);
  assert.equal(Object.values(days).flat().length,22);
  assert.equal(new Set(Object.values(days).flat().map(e=>e.id)).size,22);
  assert.ok(Object.values(days).flat().every(e=>!e.completed&&e.load===null));
  assert.match(notes['2026-10-18'].note,/No structured workout/);
  assert.match(notes['2026-10-16'].note,/one set/);
  assert.match(notes['2026-10-13'].note,/cleared medically/);
  assert.match(notes['2026-10-17'].note,/150 minutes/);
  assert.equal(WARMUP_TEXT,'All resistance sessions should begin with five minutes of gentle warm-up: easy marching, shoulder circles, hip hinges without weights, and several unloaded squats.');
  const lowCalories=suggestWorkoutWeek(createInitialState().profile,settings,monday,{'2026-10-12':{goals:{kcal:1200}}},{},monday);
  assert.deepEqual(Object.values(lowCalories).map(list=>list.map(({id,...e})=>e)),Object.values(days).map(list=>list.map(({id,...e})=>e)));
});

test('all built-in exercises include a usable guide and bundled illustration',()=>{
  assert.equal(EXERCISE_PRESETS.length,28);
  for(const exercise of EXERCISE_PRESETS){
    assert.ok(exercise.instructions.length>40,exercise.name);
    assert.ok(existsSync(new URL('../'+exercise.image,import.meta.url)),exercise.name);
    assert.match(guideHTML(exercise),/<img/);
  }
  const days=makeRoutine().days;
  assert.match(prescription(days[monday][0],EXERCISE_PRESETS.find(e=>e.id==='goblet-squat')),/2 sets × 8–10 reps/);
  assert.match(prescription(days['2026-10-14'][3],EXERCISE_PRESETS.find(e=>e.id==='shoulder-press')),/1–2 sets × 8–10 reps/);
  assert.match(prescription(days['2026-10-14'][4],EXERCISE_PRESETS.find(e=>e.id==='modified-side-plank')),/15–20 sec \/ side/);
  assert.equal(prescription(days['2026-10-13'][0],EXERCISE_PRESETS.find(e=>e.id==='walking')),'15–20 min');
});

test('custom exercise library, snapshots, instructions and uploaded images survive backup and copying',()=>{
  const state=createInitialState(),exercise=custom();
  state.workouts.exercises=[exercise];
  const entry=validateWorkoutEntry({id:'step-one',exerciseId:exercise.id,sets:2,setsMax:3,reps:8,repsMax:10,restSeconds:45,completed:true},exerciseCatalog(state.workouts));
  state.workouts.days[monday]=[entry];
  const restored=validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored,state);
  assert.ok(!('image' in entry.exercise));
  assert.equal(scheduledExercise(entry,restored.workouts).image,exercise.image);
  // The compact snapshot preserves old scheduled records even if a library is absent.
  assert.equal(validateWorkoutEntry(entry).exercise.name,'Step-up');
  const copy=copyWorkoutWeek(restored.workouts.days,monday,monday,exerciseCatalog(restored.workouts));
  assert.equal(copy['2026-10-19'][0].repsMax,10);
  assert.equal(copy['2026-10-19'][0].setsMax,3);
  assert.equal(copy['2026-10-19'][0].completed,false);
  assert.notEqual(copy['2026-10-19'][0].id,entry.id);
  restored.workouts.exercises[0].archived=true;
  assert.equal(scheduledExercise(entry,restored.workouts).instructions,exercise.instructions);
});

test('a saved personal routine repeats edited targets with fresh unchecked entries',()=>{
  const state=createInitialState(),routine=makeRoutine();
  state.workouts={...state.workouts,settings,...routine};
  state.workouts.days[monday][0].load=7;
  state.workouts.days[monday][0].completed=true;
  const template={config:workoutConfigKey(settings),days:Object.values(routine.days),notes:Object.values(routine.notes)};
  state.workouts.template=template;
  const normalized=validateWorkouts(state.workouts);
  assert.equal(normalized.template.days[0][0].completed,false);
  const repeated=starterWeek(settings,'2026-10-19',{},'2026-10-19',normalized.template);
  assert.equal(repeated.days['2026-10-19'][0].load,7);
  assert.equal(repeated.days['2026-10-19'][0].completed,false);
  assert.notEqual(repeated.days['2026-10-19'][0].id,normalized.template.days[0][0].id);
  assert.deepEqual(repeated.notes['2026-10-25'],routine.notes['2026-10-18']);
  assert.deepEqual(starterWeek({...settings,goal:'build'},'2026-10-19',{},'2026-10-19',normalized.template),{days:{},notes:{}});
});

test('default filling respects existing sessions and never silently schedules past dates',()=>{
  const existing=makeRoutine().days;
  const result=starterWeek(settings,monday,{[monday]:existing[monday]},'2026-10-14');
  assert.deepEqual(Object.keys(result.days),['2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
  assert.equal(existing[monday][0].exerciseId,'goblet-squat');
});

test('day, week and all clearing preserve libraries and persist repeat suppression in backups',()=>{
  const state=createInitialState(),routine=makeRoutine();
  const w={...state.workouts,settings,...routine,exercises:[custom()]};
  w.days['2026-10-19']=copyWorkoutWeek(w.days,monday,monday)['2026-10-19'];
  const day=clearWorkoutSchedule(w,'day',monday);
  assert.ok(!day.days[monday]&&!day.notes[monday]);
  assert.equal(day.days['2026-10-14'].length,5);
  assert.deepEqual(day.skippedWeeks,[monday]);
  const week=clearWorkoutSchedule(w,'week','2026-10-14');
  assert.deepEqual(Object.keys(week.days),['2026-10-19']);
  assert.deepEqual(week.notes,{});
  const all=clearWorkoutSchedule(w,'all',monday);
  assert.deepEqual(all.days,{});
  assert.deepEqual(all.notes,{});
  assert.equal(all.settings.autoRepeat,false);
  assert.equal(all.exercises[0].id,custom().id);
  assert.deepEqual(validateState({...state,workouts:week}).workouts,week);
  assert.equal(w.days[monday].length,5);
});

test('invalid ranges, unsafe custom images, duplicate library IDs and malformed templates are rejected',()=>{
  const target=makeRoutine().days[monday][0];
  for(const changes of [{setsMax:1},{repsMax:7},{restSeconds:601},{repsMax:101},{setsMax:2.5}])assert.throws(()=>validateWorkoutEntry({...target,...changes}));
  assert.throws(()=>validateExercise({...custom(),image:'javascript:alert(1)'}));
  assert.throws(()=>validateExercise({...custom(),image:'data:image/svg+xml;base64,aGVsbG8='}));
  const state=createInitialState();
  assert.throws(()=>validateWorkouts({...state.workouts,exercises:[custom(),custom()]}));
  assert.throws(()=>validateWorkouts({...state.workouts,template:{config:workoutConfigKey(settings),days:[],notes:[]}}));
  assert.throws(()=>validateWorkouts({...state.workouts,skippedWeeks:['2026-10-13']}));
  const timed=validateExercise({...custom(),unit:'minutes',reps:240});
  assert.equal(validateWorkoutEntry({id:'timer',exerciseId:timed.id,sets:1,reps:240},[timed]).reps,240);
  assert.throws(()=>validateWorkoutEntry({id:'timer',exerciseId:timed.id,sets:1,reps:241},[timed]));
});
