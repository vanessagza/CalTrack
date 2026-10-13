import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,EXERCISE_PRESETS,validateWorkoutEntry,validateExercise,validateState,newEntry,calculateGoals,copyWorkoutWeek} from '../core.js';
import {exerciseEnergy,exerciseWeightForDate,workoutDayEnergy,dailyCalorieBalance} from '../exercise-energy.js';
import {rebaseJournal} from '../journal-merge.js';

const date='2026-10-13';
const preset=id=>EXERCISE_PRESETS.find(e=>e.id===id);
const entry=(id='goblet-squat',changes={})=>validateWorkoutEntry({id:'exercise-one',exerciseId:id,sets:2,reps:10,load:null,completed:false,...changes});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const fixture=()=>{const state=createInitialState();state.profileReady=true;state.days[date]={entries:[],goals:calculateGoals(state.profile,date),note:''};state.workouts.days[date]=[entry()];return state;};

test('each preset has finite positive energy assumptions and different activities use their own intensity',()=>{
  for(const exercise of EXERCISE_PRESETS) {
    const energy=exerciseEnergy(entry(exercise.id),exercise,70);
    assert.ok(Number.isFinite(energy.kcal)&&energy.kcal>0,exercise.id);
    assert.equal(energy.typeBased,false);
  }
  assert.ok(exerciseEnergy(entry('push-up'),preset('push-up'),70).kcal>exerciseEnergy(entry('wall-push-up'),preset('wall-push-up'),70).kcal);
});
test('net calories scale with manually edited sets, reps and body weight, without crediting rest or arbitrary lifting load',()=>{
  const exercise=preset('goblet-squat'),base=exerciseEnergy(entry(),exercise,70);
  close(base.activeMinutes,80/60);close(base.kcal,(5-1)*3.5*70/200*(80/60));
  close(exerciseEnergy(entry('goblet-squat',{sets:4}),exercise,70).kcal,base.kcal*2);
  close(exerciseEnergy(entry('goblet-squat',{reps:20}),exercise,70).kcal,base.kcal*2);
  close(exerciseEnergy(entry(),exercise,140).kcal,base.kcal*2);
  close(exerciseEnergy(entry('goblet-squat',{restSeconds:600,load:100}),exercise,70).kcal,base.kcal);
});
test('seconds, minutes, both sides and range midpoints use the correct active duration',()=>{
  close(exerciseEnergy(entry('plank',{sets:2,reps:30}),preset('plank'),70).activeMinutes,1);
  close(exerciseEnergy(entry('walking',{sets:1,reps:20}),preset('walking'),70).activeMinutes,20);
  close(exerciseEnergy(entry('modified-side-plank',{sets:2,reps:30}),preset('modified-side-plank'),70).activeMinutes,2);
  close(exerciseEnergy(entry('reverse-lunge',{sets:2,reps:10}),preset('reverse-lunge'),70).activeMinutes,160/60);
  const energy=exerciseEnergy(entry('goblet-squat',{sets:2,setsMax:4,reps:8,repsMax:12}),preset('goblet-squat'),70);
  close(energy.activeMinutes,3*10*4/60);assert.equal(energy.usesRange,true);
});
test('only completed exercises credit their own day and repeated calculation never mutates the base budget',()=>{
  const state=fixture(),base=state.days[date].goals.kcal;
  state.days[date].entries=[newEntry(state.foods.find(f=>f.id==='egg'),1,'portion','Lunch','food-one')];
  close(dailyCalorieBalance(state,date).remainingKcal,base-72);
  state.workouts.days[date][0].completed=true;
  const before=JSON.stringify(state),balance=dailyCalorieBalance(state,date);
  close(balance.remainingKcal,base+balance.exercise.creditedKcal-72);
  assert.deepEqual(dailyCalorieBalance(state,date),balance);assert.equal(JSON.stringify(state),before);
  close(dailyCalorieBalance(state,'2026-10-14').exercise.creditedKcal,0);
  state.workouts.days[date][0].completed=false;close(dailyCalorieBalance(state,date).remainingKcal,base-72);
});
test('editing, deleting and copying completed exercises recalculate credits; backups preserve them without storing a second calorie total',()=>{
  const state=fixture();state.workouts.days[date][0].completed=true;
  const initial=workoutDayEnergy(state,date).creditedKcal;
  state.workouts.days[date][0]=entry('goblet-squat',{sets:4,completed:true});
  close(workoutDayEnergy(state,date).creditedKcal,initial*2);
  const restored=validateState(JSON.parse(JSON.stringify(state)));
  close(dailyCalorieBalance(restored,date).exercise.creditedKcal,initial*2);
  state.workouts.days={...state.workouts.days,...copyWorkoutWeek(state.workouts.days,date)};
  close(workoutDayEnergy(state,'2026-10-20').creditedKcal,0);
  delete state.workouts.days[date];close(workoutDayEnergy(state,date).creditedKcal,0);
});
test('dated body weights keep earlier days independent of later weight measurements',()=>{
  const state=fixture();state.profile.weight=80;state.profile.startWeight=68;
  state.weights=[{date:'2026-10-12',weight:70},{date:'2026-10-14',weight:80}];
  assert.equal(exerciseWeightForDate(state,date),70);
  assert.equal(exerciseWeightForDate(state,'2026-10-14'),80);
  assert.equal(exerciseWeightForDate(state,'2026-10-11'),68);
  state.weights=[];assert.equal(exerciseWeightForDate(state,date),80);
});
test('custom exercise types and saved snapshots estimate energy from their group and target unit',()=>{
  const state=fixture();
  const custom=validateExercise({id:'custom-exercise-sample',name:'Gentle step practice',group:'Cardio',equipment:'bodyweight',unit:'minutes',sets:1,reps:10});
  state.workouts.exercises=[custom];state.workouts.days[date]=[validateWorkoutEntry({id:'custom-entry',exerciseId:custom.id,sets:1,reps:10,completed:true},[custom])];
  const energy=workoutDayEnergy(state,date);close(energy.entries[0].estimate.activeMinutes,10);assert.equal(energy.entries[0].estimate.typeBased,true);
  state.workouts.exercises=[];close(workoutDayEnergy(state,date).creditedKcal,energy.creditedKcal);
});
test('completion and target edits from different devices merge into one credit with food and appearance kept',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
  local.workouts.days[date][0].sets=3;local.workouts.days[date][0].setsMax=3;local.workouts.days[date][0].reps=12;local.workouts.days[date][0].repsMax=12;
  remote.workouts.days[date][0].completed=true;remote.preferences.typography.body=20;
  remote.days[date].entries=[newEntry(remote.foods.find(f=>f.id==='egg'),1,'portion','Lunch','food-one')];
  const merged=rebaseJournal(base,local,remote),balance=dailyCalorieBalance(merged,date);
  close(balance.exercise.creditedKcal,exerciseEnergy(entry('goblet-squat',{sets:3,reps:12}),preset('goblet-squat'),70).kcal);
  close(balance.remainingKcal,1600+balance.exercise.creditedKcal-72);assert.equal(merged.preferences.typography.body,20);
});
test('invalid dates, weights and targets cannot create negative or non-finite calorie credit',()=>{
  assert.throws(()=>exerciseEnergy(entry(),preset('goblet-squat'),NaN));
  assert.throws(()=>exerciseEnergy({...entry(),sets:0},preset('goblet-squat'),70));
  assert.throws(()=>exerciseEnergy({...entry(),repsMax:2},preset('goblet-squat'),70));
  assert.throws(()=>workoutDayEnergy(fixture(),'2026-02-30'));
});
