import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateGoals,createInitialState,newEntry,shiftDate,totals,validateWorkoutEntry} from '../core.js';
import {weeklyIntake,closeIntakeDays,inferredIntakeClosedThrough} from '../weekly-intake.js';

const monday='2026-10-12',today='2026-10-16';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const food=(overrides={})=>({
  id:'weekly-label',name:'Weekly test label',category:'Extras',portionGrams:100,portionUnit:'serving',
  kcal:200,protein:10,carbs:20,fat:8,fiber:2,saturatedFat:1,sugar:3,addedSugar:1,sodium:100,
  ...overrides,
});
const fixture=()=>{
  const state=createInitialState();
  state.profileReady=true;
  // At age 30, this profile has an RMR of 1,750 and sedentary maintenance of 2,100 kcal.
  Object.assign(state.profile,{birthDate:'1996-01-01',sex:'male',height:180,weight:77,startWeight:77,goalWeight:70});
  return state;
};
const log=(state,date,kcal=2000,label=food())=>{
  state.days[date]={entries:[newEntry(label,kcal/2,'g','Other',`food-${date}`)],note:''};
  return state.days[date];
};
const walk=(id,completed=true,minutes=30)=>validateWorkoutEntry({id,exerciseId:'walking',sets:1,reps:minutes,completed});
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)) {
    Object.freeze(value);
    for(const nested of Object.values(value))freeze(nested);
  }
  return value;
};

test('an empty week has no intake projection or balance classification',()=>{
  const result=weeklyIntake(fixture(),today,today);
  assert.equal(result.weekStart,monday);
  assert.equal(result.weekEnd,'2026-10-18');
  assert.equal(result.closedThrough,null);
  assert.equal(result.days.length,7);
  assert.equal(result.completedDays,0);
  assert.deepEqual(result.totals,totals());
  for(const key of ['averageDailyKcal','averageDailyMaintenanceKcal','observedBalanceKcal','projectedWeeklyIntakeKcal','projectedWeeklyMaintenanceKcal','projectedWeeklyBalanceKcal'])assert.equal(result[key],null,key);
  assert.equal(result.status,'insufficient');
  assert.equal(result.partial,true);
  assert.equal(result.isEstimate,true);
  assert.equal(result.maintenanceTolerance,0.05);
  assert.equal(result.exercisePolicy,'sedentary-only');
  assert.ok(result.days.every(day=>!day.hasEntries&&!day.included&&day.maintenanceKcal===null));
});

test('weeks remain Monday to Sunday across year and leap-day boundaries',()=>{
  const state=fixture();
  const year=weeklyIntake(state,'2027-01-01','2027-01-04');
  assert.equal(year.weekStart,'2026-12-28');
  assert.equal(year.weekEnd,'2027-01-03');
  assert.deepEqual(year.days.map(day=>day.date),Array.from({length:7},(_,i)=>shiftDate('2026-12-28',i)));
  const leap=weeklyIntake(state,'2028-02-29','2028-03-06');
  assert.equal(leap.weekStart,'2028-02-28');
  assert.equal(leap.weekEnd,'2028-03-05');
  assert.throws(()=>weeklyIntake(state,'2026-02-30',today));
  assert.throws(()=>weeklyIntake(state,monday,'2026-02-30'));
});

test('legacy completion comes from the latest nonfuture food log and ignores empty days',()=>{
  const state=fixture();
  delete state.intakeClosedThrough;
  log(state,monday,1800);
  log(state,'2026-10-14',2200);
  state.days['2026-10-16']={entries:[],note:'Not a food log'};
  log(state,'2026-10-18',4000);
  assert.equal(inferredIntakeClosedThrough(state,today),'2026-10-13');
  const result=weeklyIntake(state,monday,today);
  assert.equal(result.closedThrough,'2026-10-13');
  assert.equal(result.completedDays,1);
  assert.equal(result.totals.kcal,1800);
  assert.equal(result.days[2].reason,'open');
  log(state,today,1900);
  assert.equal(inferredIntakeClosedThrough(state,today),'2026-10-15');
});

test('an explicit null completion marker does not infer closure from existing logs',()=>{
  const state=fixture();
  log(state,monday,1800);
  log(state,today,1900);
  assert.equal(inferredIntakeClosedThrough(state,today),null);
  const result=weeklyIntake(state,monday,today);
  assert.equal(result.completedDays,0);
  assert.equal(result.status,'insufficient');
  assert.equal(result.days[0].reason,'open');
  assert.equal(result.days[0].totals.kcal,1800);
});

test('completion advances monotonically, persists after deletion, and ignores future logging',()=>{
  const state=fixture();
  log(state,monday);
  assert.equal(closeIntakeDays(state,'2026-10-15',today),'2026-10-14');
  assert.equal(closeIntakeDays(state,monday,today),'2026-10-14');
  const before=structuredClone(state);
  assert.equal(closeIntakeDays(state,'2026-10-18',today),'2026-10-14');
  assert.deepEqual(state,before);
  delete state.days[monday];
  assert.equal(inferredIntakeClosedThrough(state,today),'2026-10-14');
  assert.equal(closeIntakeDays(state,today,today),'2026-10-15');
  assert.equal(weeklyIntake(state,monday,today).completedDays,0);
});

test('a marker beyond today cannot include current or future intake',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-20';
  log(state,'2026-10-15',1800);
  log(state,today,3000);
  log(state,'2026-10-17',4000);
  const before=structuredClone(state),result=weeklyIntake(state,monday,today);
  assert.deepEqual(state,before);
  assert.equal(result.closedThrough,'2026-10-15');
  assert.equal(result.completedDays,1);
  assert.equal(result.totals.kcal,1800);
  assert.equal(result.days[4].closed,false);
  assert.equal(result.days[4].reason,'open');
  assert.equal(result.days[5].closed,false);
  assert.equal(result.days[5].reason,'future');
});

test('partial weeks average only closed nonempty days and compare matched maintenance',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-14';
  log(state,monday,1800);
  state.days['2026-10-13']={entries:[],note:'No food recorded'};
  log(state,'2026-10-14',2200);
  log(state,'2026-10-15',5000);
  log(state,today,3000);
  log(state,'2026-10-17',4000);
  const result=weeklyIntake(state,today,today);
  assert.equal(result.completedDays,2);
  assert.equal(result.totals.kcal,4000);
  assert.equal(result.averageDailyKcal,2000);
  assert.equal(result.averageDailyMaintenanceKcal,2100);
  assert.equal(result.observedBalanceKcal,-200);
  assert.equal(result.projectedWeeklyIntakeKcal,14000);
  assert.equal(result.projectedWeeklyMaintenanceKcal,14700);
  assert.equal(result.projectedWeeklyBalanceKcal,-700);
  assert.equal(result.status,'maintenance');
  assert.equal(result.partial,true);
  assert.deepEqual(result.days.map(day=>day.included),[true,false,true,false,false,false,false]);
  assert.equal(result.days[1].reason,'missing');
  assert.equal(result.days[3].reason,'open');
  assert.equal(result.days[3].totals.kcal,5000);
  assert.equal(result.days[5].reason,'future');
  for(const day of result.days.filter(day=>!day.included)) {
    assert.equal(day.maintenanceKcal,null);
    assert.equal(day.baseMaintenanceKcal,null);
    assert.equal(day.exerciseKcal,null);
  }
});

test('a full week uses all seven days and observed totals equal projections',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-18';
  for(let i=0;i<7;i++)log(state,shiftDate(monday,i),1800+i*100);
  const result=weeklyIntake(state,'2026-10-18','2026-10-19');
  assert.equal(result.completedDays,7);
  assert.equal(result.partial,false);
  assert.equal(result.totals.kcal,14700);
  assert.equal(result.averageDailyKcal,2100);
  assert.equal(result.projectedWeeklyIntakeKcal,result.totals.kcal);
  assert.equal(result.projectedWeeklyMaintenanceKcal,14700);
  assert.equal(result.observedBalanceKcal,0);
  assert.equal(result.projectedWeeklyBalanceKcal,0);
  assert.equal(result.status,'maintenance');
  assert.ok(result.days.every(day=>day.closed&&day.hasEntries&&day.included&&day.reason==='included'));
});

test('maintenance includes both five-percent boundaries and classifies larger differences',()=>{
  for(const [kcal,status] of [[1890,'deficit'],[1995,'maintenance'],[2100,'maintenance'],[2205,'maintenance'],[2310,'surplus']]) {
    const state=fixture();
    state.intakeClosedThrough=monday;
    log(state,monday,kcal);
    const result=weeklyIntake(state,monday,today);
    assert.equal(result.status,status,`${kcal} kcal`);
    near(result.observedBalanceKcal,kcal-2100);
    near(result.projectedWeeklyBalanceKcal,(kcal-2100)*7);
  }
});

test('manual calorie budgets, saved macro goals and deficit preferences do not define maintenance',()=>{
  const state=fixture();
  state.intakeClosedThrough=monday;
  log(state,monday,1800).goals={kcal:4000,protein:100,carbs:675,fat:100};
  const baseline=weeklyIntake(state,monday,today);
  Object.assign(state.profile,{calorieMode:'calculated',calories:4000,deficit:20,proteinFactor:2.2,fatPercent:35,insulinResistance:true});
  state.days[monday].goals={kcal:1200,protein:200,carbs:25,fat:33.3333333333333};
  const changed=weeklyIntake(state,monday,today);
  assert.equal(baseline.averageDailyMaintenanceKcal,2100);
  assert.equal(changed.averageDailyMaintenanceKcal,2100);
  assert.equal(changed.status,baseline.status);
  assert.equal(changed.observedBalanceKcal,baseline.observedBalanceKcal);
});

test('dated weight is used without requiring historical protein targets to fit a calorie budget',()=>{
  const state=fixture();
  Object.assign(state.profile,{calories:1200,proteinFactor:2.2,fatPercent:35});
  state.weights=[{date:monday,weight:250}];
  state.intakeClosedThrough=monday;
  log(state,monday,1800);
  assert.throws(()=>calculateGoals({...state.profile,weight:250},monday),/protein and fat targets/);
  const result=weeklyIntake(state,monday,today);
  near(result.days[0].baseMaintenanceKcal,4176);
  near(result.averageDailyMaintenanceKcal,4176);
  assert.equal(result.status,'deficit');
});

test('each included day uses its last recorded weight with starting weight before the first record',()=>{
  const state=fixture();
  Object.assign(state.profile,{weight:90,startWeight:60});
  state.weights=[{date:'2026-10-15',weight:80},{date:'2026-10-13',weight:70}];
  state.intakeClosedThrough='2026-10-15';
  for(let i=0;i<4;i++)log(state,shiftDate(monday,i));
  const result=weeklyIntake(state,monday,today);
  const expected=[1896,2016,2016,2136];
  result.days.slice(0,4).forEach((day,i)=>near(day.baseMaintenanceKcal,expected[i]));
  near(result.averageDailyMaintenanceKcal,2016);
  state.profile.weight=200;
  state.weights.push({date:'2026-10-20',weight:250});
  assert.deepEqual(weeklyIntake(state,monday,today),result);
});

test('with no measurements current weight is the fallback, while future-only measurements use starting weight',()=>{
  const state=fixture();
  state.intakeClosedThrough=monday;
  log(state,monday);
  state.profile.weight=87;
  near(weeklyIntake(state,monday,today).averageDailyMaintenanceKcal,2220);
  state.profile.startWeight=65;
  state.weights=[{date:'2026-10-20',weight:90}];
  near(weeklyIntake(state,monday,today).averageDailyMaintenanceKcal,1956);
});

test('maintenance follows age on each log date and the profile sex and height formula settings',()=>{
  const state=fixture();
  state.profile.birthDate='1996-10-13';
  state.intakeClosedThrough='2026-10-13';
  log(state,monday);
  log(state,'2026-10-13');
  const male=weeklyIntake(state,monday,today);
  near(male.days[0].baseMaintenanceKcal,2106);
  near(male.days[1].baseMaintenanceKcal,2100);
  state.profile.sex='female';
  const female=weeklyIntake(state,monday,today);
  near(female.days[0].baseMaintenanceKcal,1906.8);
  near(female.days[1].baseMaintenanceKcal,1900.8);
  state.profile.height=190;
  near(weeklyIntake(state,monday,today).averageDailyMaintenanceKcal,female.averageDailyMaintenanceKcal+75);
});

test('sedentary maintenance adds only completed exercise on included food days',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-13';
  log(state,monday,2000);
  state.workouts.days[monday]=[walk('done'),walk('planned',false,60)];
  state.workouts.days['2026-10-13']=[walk('no-food')];
  state.workouts.days[today]=[walk('open')];
  const result=weeklyIntake(state,monday,today);
  const extra=(2.8-1)*3.5*77/200*30;
  near(result.days[0].baseMaintenanceKcal,2100);
  near(result.days[0].exerciseKcal,extra);
  near(result.days[0].maintenanceKcal,2100+extra);
  near(result.averageDailyMaintenanceKcal,2100+extra);
  assert.equal(result.completedDays,1);
  assert.equal(result.days[1].maintenanceKcal,null);
  state.workouts.days[monday][0].completed=false;
  near(weeklyIntake(state,monday,today).averageDailyMaintenanceKcal,2100);
});

test('higher activity multipliers already account for exercise and do not add it again',()=>{
  const state=fixture();
  state.profile.activity=1.55;
  state.intakeClosedThrough=monday;
  log(state,monday,2000);
  state.workouts.days[monday]=[walk('done')];
  const result=weeklyIntake(state,monday,today);
  near(result.days[0].baseMaintenanceKcal,2712.5);
  assert.equal(result.days[0].exerciseKcal,0);
  near(result.days[0].maintenanceKcal,2712.5);
  near(result.averageDailyMaintenanceKcal,2712.5);
});

test('saved food snapshots determine totals and repeated calculations never mutate the journal',()=>{
  const state=fixture();
  state.intakeClosedThrough=monday;
  const day=log(state,monday,1800);
  day.entries.push(newEntry(food({id:'another-label',kcal:400}),50,'g','Lunch','second-entry'));
  state.foods=[food({kcal:900,fiber:10})];
  const expected=totals(day.entries),before=structuredClone(state);
  freeze(state);
  const first=weeklyIntake(state,monday,today),second=weeklyIntake(state,monday,today);
  assert.deepEqual(first.totals,expected);
  assert.equal(first.totals.kcal,2000);
  assert.deepEqual(first,second);
  assert.deepEqual(state,before);
  const withoutCatalog=structuredClone(before);
  withoutCatalog.foods=[];
  assert.deepEqual(weeklyIntake(withoutCatalog,monday,today),first);
});

test('corrections and deletions recalculate intake while the completion marker remains closed',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-14';
  log(state,monday,1800);
  log(state,'2026-10-14',2000);
  assert.equal(weeklyIntake(state,monday,today).totals.kcal,3800);
  state.days['2026-10-14'].entries[0].amount/=2;
  assert.equal(weeklyIntake(state,monday,today).totals.kcal,2800);
  delete state.days['2026-10-14'];
  const result=weeklyIntake(state,monday,today);
  assert.equal(result.closedThrough,'2026-10-14');
  assert.equal(state.intakeClosedThrough,'2026-10-14');
  assert.equal(result.completedDays,1);
  assert.equal(result.totals.kcal,1800);
  assert.equal(result.days[2].reason,'missing');
});

test('weekly nutrient totals retain unknown values and aggregate coverage only from included entries',()=>{
  const state=fixture();
  state.intakeClosedThrough='2026-10-14';
  const unknown=food({id:'unknown-label',fiber:null,saturatedFat:null,sugar:null,addedSugar:null,sodium:null});
  const known=newEntry(food(),100,'g','Other','known');
  const firstUnknown=newEntry(unknown,50,'g','Other','unknown-one');
  const secondUnknown=newEntry(unknown,100,'g','Other','unknown-two');
  state.days[monday]={entries:[known,firstUnknown],note:''};
  state.days['2026-10-14']={entries:[secondUnknown],note:''};
  log(state,today,5000);
  const result=weeklyIntake(state,monday,today);
  assert.deepEqual(result.totals,totals([known,firstUnknown,secondUnknown]));
  assert.equal(result.totals.fiber,2);
  assert.deepEqual(result.totals.coverage.fiber,{known:1,total:3,complete:false});
  assert.equal(result.days[2].totals.fiber,null);
  assert.deepEqual(result.days[2].totals.coverage.fiber,{known:0,total:1,complete:false});
  state.days[monday].entries=[firstUnknown];
  assert.equal(weeklyIntake(state,monday,today).totals.fiber,null);
});

test('a genuine zero-calorie food log is an included day instead of a missing record',()=>{
  const state=fixture();
  state.intakeClosedThrough=monday;
  state.days[monday]={entries:[newEntry(food({kcal:0,protein:0,carbs:0,fat:0,fiber:0,saturatedFat:0,sugar:0,addedSugar:0,sodium:0}),100,'g','Other','zero')],note:''};
  const result=weeklyIntake(state,monday,today);
  assert.equal(result.completedDays,1);
  assert.equal(result.days[0].reason,'included');
  assert.equal(result.averageDailyKcal,0);
  assert.equal(result.projectedWeeklyIntakeKcal,0);
  assert.equal(result.status,'deficit');
});
