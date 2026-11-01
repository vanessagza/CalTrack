import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,newEntry,shiftDate,validateProfile,validateWorkoutEntry} from '../core.js';
import {workoutDayEnergy} from '../exercise-energy.js';
import {goalForecast,forecastScenario} from '../goal-forecast.js';

const today='2026-11-01';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function fixture(changes={}) {
  const state=createInitialState();
  state.profile=validateProfile({...state.profile,weight:78,startWeight:80,goalWeight:75,activity:1.3,calories:1800,...changes});
  state.weights=[{date:'2026-10-04',weight:80},{date:'2026-10-18',weight:79},{date:today,weight:78}];
  return state;
}
function composition(changes={}) {
  const state=fixture({goalMode:'composition',weight:80,startWeight:80,bodyFatPercent:27.5,startBodyFatPercent:30,goalBodyFatPercent:25,muscleMass:32,startMuscleMass:30,goalMuscleMass:34,...changes});
  state.weights=[{date:'2026-10-04',weight:80,bodyFatPercent:30,muscleMass:30},{date:'2026-10-18',weight:80,bodyFatPercent:28.75,muscleMass:31},{date:today,weight:80,bodyFatPercent:27.5,muscleMass:32}];
  return state;
}
const metric=(forecast,key)=>forecast.metrics.find(item=>item.key===key);

test('recent unique measurement regression gives whole days and a date without mutating the journal',()=>{
  const state=fixture(),before=JSON.stringify(state),forecast=goalForecast(state,today);
  assert.equal(forecast.history.status,'estimated');
  assert.equal(forecast.history.days,42);
  assert.equal(forecast.history.date,'2026-12-13');
  near(forecast.history.metrics[0].ratePerWeek,-0.5);
  assert.equal(JSON.stringify(state),before);
  assert.ok(forecast.scenario.days>0);
});

test('composition estimates both actual goals at unchanged scale weight',()=>{
  const state=composition(),forecast=goalForecast(state,today);
  assert.equal(state.profile.weight,state.profile.goalWeight);
  assert.equal(forecast.history.days,28);
  assert.equal(forecast.history.metrics.length,2);
  near(metric(forecast.history,'bodyFatPercent').ratePerWeek,-0.625);
  near(metric(forecast.history,'muscleMass').ratePerWeek,0.5);
  assert.equal(metric(forecast.history,'bodyFatPercent').days,28);
  assert.equal(metric(forecast.history,'muscleMass').days,28);
  assert.notEqual(forecast.history.status,'reached');
});

test('each metric needs its own span and freshness, with future and duplicate dates excluded',()=>{
  const state=composition();
  delete state.weights[1].muscleMass;
  state.weights.push({date:'2026-11-02',weight:60,bodyFatPercent:20,muscleMass:34});
  state.weights.unshift({date:'2026-07-01',weight:90,bodyFatPercent:35,muscleMass:28});
  state.weights.push({...state.weights[2]});
  const history=goalForecast(state,today).history;
  assert.equal(metric(history,'bodyFatPercent').points,3);
  assert.equal(metric(history,'bodyFatPercent').status,'estimated');
  assert.equal(metric(history,'muscleMass').points,2);
  assert.equal(metric(history,'muscleMass').status,'insufficient');
  assert.equal(history.days,null);
  const stale=fixture({weight:80});
  stale.weights=[{date:'2026-08-30',weight:82},{date:'2026-09-13',weight:81},{date:'2026-10-01',weight:80}];
  assert.equal(goalForecast(stale,today).history.status,'stale');
  const short=fixture();short.weights=[{date:'2026-10-25',weight:80},{date:'2026-10-28',weight:79},{date:today,weight:78}];
  assert.equal(goalForecast(short,today).history.status,'insufficient');
});

test('flat, wrong-direction and inconsistent history never invent a countdown',()=>{
  const flat=fixture();flat.weights=flat.weights.map(record=>({...record,weight:78}));
  assert.equal(goalForecast(flat,today).history.status,'stalled');
  const away=fixture();away.weights=away.weights.map((record,index)=>({...record,weight:76+index}));
  assert.equal(goalForecast(away,today).history.status,'away');
  const inconsistent=fixture({weight:77});
  const metric=goalForecast(inconsistent,today).history.metrics[0];
  assert.equal(metric.status,'insufficient');assert.match(metric.reason,/differs/);
  for(const state of [flat,away,inconsistent])assert.equal(goalForecast(state,today).history.days,null);
});

test('overshot directional targets and preserved muscle/fat maintenance goals count reached',()=>{
  const weight=fixture({weight:74});weight.weights.at(-1).weight=74;
  assert.equal(goalForecast(weight,today).history.status,'reached');
  const comp=composition({bodyFatPercent:24,muscleMass:35});
  Object.assign(comp.weights.at(-1),{bodyFatPercent:24,muscleMass:35});
  assert.equal(goalForecast(comp,today).history.days,0);
  const maintenance=composition({bodyFatPercent:29,startBodyFatPercent:30,goalBodyFatPercent:30,muscleMass:32,startMuscleMass:30,goalMuscleMass:30});
  Object.assign(maintenance.weights.at(-1),{bodyFatPercent:29,muscleMass:32});
  assert.equal(goalForecast(maintenance,today).history.status,'reached');
});

test('intake uses at least seven closed food days in the preceding28 calendar days only',()=>{
  const state=fixture();state.intakeClosedThrough=shiftDate(today,-1);
  const food=state.foods.find(item=>item.id==='sourdough');
  for(const offset of [28,27,26,25,24,23,22])state.days[shiftDate(today,-offset)]={entries:[newEntry(food,720,'g','Other','food-'+offset)]};
  for(const offset of [29,0,-1])state.days[shiftDate(today,-offset)]={entries:[newEntry(food,100,'g','Other','excluded-'+offset)]};
  let result=goalForecast(state,today);
  assert.equal(result.intake.source,'history');assert.equal(result.intake.days,7);near(result.intake.kcal,1800);
  assert.equal(result.intake.firstDate,shiftDate(today,-28));
  delete state.days[shiftDate(today,-28)];result=goalForecast(state,today);
  assert.equal(result.intake.source,'settings');assert.equal(result.intake.days,6);assert.equal(result.intake.kcal,1800);
  state.intakeClosedThrough=shiftDate(today,-24);
  assert.ok(goalForecast(state,today).intake.days<7);
});

test('exercise average divides recorded net work by28 calendar days and selected1.20 alone applies it',()=>{
  const state=fixture({activity:1.3});
  const entry=validateWorkoutEntry({id:'walk',exerciseId:'walking',sets:1,reps:30,completed:true,load:null});
  for(const offset of [28,29,0,-1])state.workouts.days[shiftDate(today,-offset)]=[{...entry,id:'walk-'+offset}];
  const raw=workoutDayEnergy(state,shiftDate(today,-28)).creditedKcal;
  const forecast=goalForecast(state,today);near(forecast.defaults.exerciseKcalPerDay,raw/28);
  assert.equal(forecast.scenario.exerciseKcalPerDay,0);
  const seated=forecastScenario(state,{activity:1.2},today),active=forecastScenario(state,{activity:1.3},today);
  near(seated.exerciseKcalPerDay,raw/28);assert.equal(active.exerciseKcalPerDay,0);
  const noExercise=forecastScenario(state,{activity:1.2,exerciseKcalPerDay:0},today);
  near(seated.currentTdee-noExercise.currentTdee,raw/28);
});

test('formula scenarios recompute expenditure, plateau, handle gain, and leave saved values unchanged',()=>{
  const state=fixture(),before=JSON.stringify(state);
  const low=forecastScenario(state,{calories:1600},today),high=forecastScenario(state,{calories:1900},today);
  assert.equal(low.status,'estimated');assert.equal(high.status,'estimated');assert.ok(low.days<high.days);
  const initialLinearDays=Math.ceil((state.profile.weight-state.profile.goalWeight)*7700/low.dailyBalanceKcal);
  assert.ok(low.days>=initialLinearDays);
  const plateau=forecastScenario(state,{calories:2000,activity:1.2,exerciseKcalPerDay:0},today);
  assert.equal(plateau.days,null);
  assert.ok(['away','stalled','beyond_horizon'].includes(plateau.status));
  const gain=fixture({weight:70,startWeight:65,goalWeight:75,calories:2400});
  assert.equal(forecastScenario(gain,{},today).status,'estimated');
  assert.equal(JSON.stringify(state),before);
});

test('composition muscle growth is independent, missing rate blocks combined ETA, and bounds cannot fabricate success',()=>{
  const state=composition();
  const missing=forecastScenario(state,{calories:1700,muscleRatePerWeek:null},today);
  assert.equal(missing.status,'insufficient');assert.equal(missing.days,null);
  assert.equal(metric(missing,'bodyFatPercent').status,'estimated');
  assert.match(missing.reason,/cannot be inferred/);
  const modeled=forecastScenario(state,{calories:1800,muscleRatePerWeek:0.5},today);
  assert.equal(modeled.status,'estimated');assert.ok(modeled.days>=28);
  const final=modeled.trajectory.at(-1);assert.equal(final.muscleMass,34);assert.ok(final.bodyFatPercent<=25);
  const impossible=forecastScenario(state,{calories:1200,muscleRatePerWeek:0.005},today);
  assert.equal(impossible.days,null);assert.match(impossible.reason,/bounds/);
  const declining=forecastScenario(state,{calories:1800,muscleRatePerWeek:-0.1},today);
  assert.equal(declining.days,null);assert.equal(metric(declining,'muscleMass').status,'away');
});

test('muscle-only and fat gain/decreasing-muscle scenarios obey actual directional thresholds',()=>{
  const state=composition({bodyFatPercent:24,muscleMass:32});
  const result=forecastScenario(state,{calories:2050,muscleRatePerWeek:0.5},today);
  assert.equal(result.status,'estimated');assert.equal(result.days,28);
  const reverse=composition({bodyFatPercent:30,startBodyFatPercent:25,goalBodyFatPercent:35,muscleMass:30,startMuscleMass:32,goalMuscleMass:28});
  const projected=forecastScenario(reverse,{calories:2500,muscleRatePerWeek:-0.5},today);
  assert.equal(projected.status,'estimated');assert.ok(projected.trajectory.at(-1).bodyFatPercent>=35);
  assert.equal(projected.trajectory.at(-1).muscleMass,28);
});

test('invalid or unsafe scenario inputs return an explicit unavailable estimate',()=>{
  const state=fixture();
  for(const options of [{calories:null},{calories:''},{calories:500},{calories:4500},{activity:null},{activity:2},{activity:1.2,exerciseKcalPerDay:null},{activity:1.2,exerciseKcalPerDay:''},{activity:1.2,exerciseKcalPerDay:1001}]) {
    const result=forecastScenario(state,options,today);assert.equal(result.status,'invalid',JSON.stringify(options));assert.equal(result.days,null);
  }
  assert.notEqual(forecastScenario(state,{activity:1.3,exerciseKcalPerDay:null},today).status,'invalid');
  assert.equal(forecastScenario(composition(),{muscleRatePerWeek:1},today).status,'invalid');
  const male=fixture({sex:'male'});assert.equal(forecastScenario(male,{calories:1400},today).status,'invalid');
});

test('combined observed ETA rejects a reached metric reversing beyond goal before the slower goal',()=>{
  const state=composition({bodyFatPercent:24,muscleMass:30});
  state.weights=[{date:'2026-10-04',weight:80,bodyFatPercent:22,muscleMass:29},{date:'2026-10-18',weight:80,bodyFatPercent:23,muscleMass:29.5},{date:today,weight:80,bodyFatPercent:24,muscleMass:30}];
  const result=goalForecast(state,today);
  assert.equal(metric(result.history,'bodyFatPercent').status,'reached');
  assert.equal(metric(result.history,'muscleMass').days,112);
  assert.equal(result.history.days,null);assert.equal(result.history.status,'away');
  assert.match(result.history.reason,/same projected day/);
  const reachedMuscle=composition({muscleMass:35});
  reachedMuscle.weights.at(-1).muscleMass=35;
  assert.equal(goalForecast(reachedMuscle,today).defaults.muscleRatePerWeek,0);
});
