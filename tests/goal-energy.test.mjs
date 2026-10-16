import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_WORKOUT_SETTINGS,energyNeeds,calculateGoals,workoutSuggestion,createInitialState,validateState} from '../core.js';

const date='2026-10-16';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const profile=(changes={})=>({
  ...DEFAULT_PROFILE,birthDate:'1996-01-01',sex:'male',height:180,
  weight:90,startWeight:90,goalWeight:70,activity:1.2,
  calorieMode:'calculated',calories:2400,deficit:10,proteinFactor:1.8,fatPercent:30,
  ...changes,
});

test('energy references distinguish actual and goal weights with known Mifflin values',()=>{
  const references=energyNeeds(profile(),date);
  assert.deepEqual(references,{rmr:1880,tdee:2256,goalRmr:1680,goalTdee:2016,age:30});
  const goals=calculateGoals(profile(),date);
  for(const key of Object.keys(references))assert.equal(goals[key],references[key],key);
  assert.equal(goals.calculatedCalories,1825);
  assert.equal(goals.kcal,1825);
  near(goals.rawCalculatedCalories,1814.4);
  assert.equal(goals.calculatedMacroFloorCalories,950);
  assert.equal(goals.calculatedMacroFloorApplied,false);
});

test('changing goal weight changes automatic calories and goal references while actual maintenance stays fixed',()=>{
  const baseline=calculateGoals(profile(),date);
  const changed=calculateGoals(profile({goalWeight:80}),date);
  assert.equal(changed.goalRmr,1780);
  assert.equal(changed.goalTdee,2136);
  assert.equal(changed.calculatedCalories,1925);
  assert.equal(changed.kcal,1925);
  assert.equal(changed.rmr,baseline.rmr);
  assert.equal(changed.tdee,baseline.tdee);
  assert.equal(changed.protein,baseline.protein);
});

test('changing current weight affects actual maintenance and protein without moving the automatic budget',()=>{
  const baseline=calculateGoals(profile(),date);
  const changed=calculateGoals(profile({weight:100}),date);
  assert.equal(changed.rmr,1980);
  assert.equal(changed.tdee,2376);
  assert.equal(changed.protein,180);
  assert.equal(baseline.protein,162);
  assert.equal(changed.goalRmr,baseline.goalRmr);
  assert.equal(changed.goalTdee,baseline.goalTdee);
  assert.equal(changed.calculatedCalories,baseline.calculatedCalories);
  assert.equal(changed.kcal,baseline.kcal);
  assert.ok(changed.carbs<baseline.carbs);
});

test('a dated weight override changes only actual references and accepts the supported weight boundaries',()=>{
  const source=profile();
  const baseline=energyNeeds(source,date);
  const historical=energyNeeds(source,date,60);
  assert.deepEqual(historical,{rmr:1580,tdee:1896,goalRmr:1680,goalTdee:2016,age:30});
  assert.equal(energyNeeds(source,date,30).rmr,1280);
  assert.equal(energyNeeds(source,date,250).rmr,3480);
  assert.deepEqual(energyNeeds(source,date,null),baseline);
  assert.deepEqual(energyNeeds(source,date,undefined),baseline);
  assert.equal(source.weight,90);
});

test('weight overrides and dates reject values that cannot produce valid energy references',()=>{
  for(const weight of [29.99,250.01,-1,NaN,Infinity,-Infinity,'not a weight',{},[]]) {
    assert.throws(()=>energyNeeds(profile(),date,weight),`${String(weight)} must be rejected`);
  }
  assert.throws(()=>energyNeeds(profile(),'2026-02-30'));
  assert.throws(()=>energyNeeds(profile({sex:'invalid'}),date));
  assert.throws(()=>energyNeeds(profile({activity:1.1}),date));
  assert.throws(()=>energyNeeds(profile({calories:900}),date));
});

test('sex, height and activity affect both references using the same formula assumptions',()=>{
  const female=energyNeeds(profile({sex:'female'}),date);
  near(female.rmr,1714);
  near(female.tdee,2056.8);
  near(female.goalRmr,1514);
  near(female.goalTdee,1816.8);
  const tall=energyNeeds(profile({height:190}),date);
  near(tall.rmr,1942.5);
  near(tall.goalRmr,1742.5);
  near(tall.tdee,2331);
  near(tall.goalTdee,2091);
  const active=energyNeeds(profile({activity:1.55}),date);
  assert.equal(active.rmr,1880);
  assert.equal(active.goalRmr,1680);
  near(active.tdee,2914);
  near(active.goalTdee,2604);
});

test('both energy references use age on the requested date, including a birthday and historical dates',()=>{
  const source=profile({birthDate:'1996-10-16'});
  assert.deepEqual(energyNeeds(source,'2026-10-15'),{rmr:1885,tdee:2262,goalRmr:1685,goalTdee:2022,age:29});
  assert.deepEqual(energyNeeds(source,date),{rmr:1880,tdee:2256,goalRmr:1680,goalTdee:2016,age:30});
  assert.deepEqual(energyNeeds(source,'2020-10-15'),{rmr:1915,tdee:2298,goalRmr:1715,goalTdee:2058,age:23});
  assert.equal(calculateGoals(source,'2020-10-15').age,23);
});

test('manual calories remain the selected budget while automatic calorie references follow goal weight',()=>{
  const baseline=calculateGoals(profile({calorieMode:'manual'}),date);
  const changed=calculateGoals(profile({calorieMode:'manual',goalWeight:80}),date);
  assert.equal(baseline.kcal,2400);
  assert.equal(changed.kcal,2400);
  assert.equal(baseline.calculatedCalories,1825);
  assert.equal(changed.calculatedCalories,1925);
  assert.equal(changed.rmr,baseline.rmr);
  assert.equal(changed.tdee,baseline.tdee);
  assert.equal(changed.protein,baseline.protein);
  assert.equal(changed.carbs,baseline.carbs);
  assert.equal(changed.fat,baseline.fat);
});

test('an explicit calorie override remains authoritative in both calorie modes',()=>{
  for(const calorieMode of ['manual','calculated']) {
    const goals=calculateGoals(profile({calorieMode,goalWeight:80}),date,2000);
    assert.equal(goals.kcal,2000);
    assert.equal(goals.calculatedCalories,1925);
    assert.equal(goals.goalTdee,2136);
    assert.equal(goals.tdee,2256);
    assert.equal(goals.protein,162);
  }
  assert.throws(()=>calculateGoals(profile(),date,1199));
  assert.throws(()=>calculateGoals(profile(),date,4001));
});

test('macro and additional nutrient targets follow chosen calories while protein follows actual weight',()=>{
  const choices=[
    calculateGoals(profile(),date),
    calculateGoals(profile({calorieMode:'manual'}),date),
    calculateGoals(profile(),date,2000),
  ];
  assert.deepEqual(choices.map(goals=>goals.kcal),[1825,2400,2000]);
  for(const goals of choices) {
    assert.equal(goals.protein,162);
    near(goals.fat,goals.kcal*0.3/9);
    near(goals.protein*4+goals.carbs*4+goals.fat*9,goals.kcal);
    near(goals.fiber,goals.kcal*14/1000);
    near(goals.saturatedFat,goals.kcal*0.1/9);
    near(goals.addedSugar,goals.kcal*0.1/4);
    assert.equal(goals.sodium,2300);
    assert.equal(goals.sugar,null);
  }
  near(choices[0].carbs,157.375);
  near(choices[0].fiber,25.55);
  near(choices[0].saturatedFat,182.5/9);
  near(choices[0].addedSugar,45.625);
});

test('automatic calorie rounding uses the nearest 25 and rounds a midpoint upward',()=>{
  const base=profile({activity:1.25,deficit:0});
  assert.equal(calculateGoals({...base,goalWeight:70.99},date).calculatedCalories,2100);
  assert.equal(calculateGoals({...base,goalWeight:71},date).goalTdee,2112.5);
  assert.equal(calculateGoals({...base,goalWeight:71},date).calculatedCalories,2125);
  assert.equal(calculateGoals({...base,goalWeight:71.01},date).calculatedCalories,2125);
});

test('sex-specific calorie floors apply to the goal-weight calculation even when actual maintenance is higher',()=>{
  for(const [sex,floor] of [['female',1200],['male',1500]]) {
    const source=profile({sex,height:160,weight:80,goalWeight:50,deficit:20});
    const goals=calculateGoals(source,date);
    assert.ok(goals.goalTdee*0.8<floor);
    assert.ok(goals.tdee*0.8>floor);
    assert.equal(goals.calculatedCalories,floor);
    assert.equal(goals.kcal,floor);
    assert.equal(goals.calculatedFloorApplied,true);
  }
  assert.equal(calculateGoals(profile(),date).calculatedFloorApplied,false);
});

test('energy references do not require calorie and protein targets to fit together',()=>{
  const source=profile({weight:250,calorieMode:'manual',calories:1200,proteinFactor:2.2,fatPercent:35});
  assert.throws(()=>calculateGoals(source,date),/protein and fat targets/);
  assert.deepEqual(energyNeeds(source,date),{rmr:3480,tdee:4176,goalRmr:1680,goalTdee:2016,age:30});
  assert.deepEqual(energyNeeds(source,date,90),{rmr:1880,tdee:2256,goalRmr:1680,goalTdee:2016,age:30});
  assert.deepEqual(energyNeeds({...source,calories:4000,deficit:0,proteinFactor:1.4,fatPercent:20,insulinResistance:true},date),energyNeeds(source,date));
});

test('automatic budgets raise a rounded goal-weight estimate only enough to accommodate current protein and fat targets',()=>{
  const source=profile({sex:'female',height:170,weight:150,goalWeight:65});
  const goals=calculateGoals(source,date);
  near(goals.goalTdee,1681.8);
  near(goals.rawCalculatedCalories,1513.62);
  assert.equal(Math.round(goals.rawCalculatedCalories/25)*25,1525);
  assert.equal(goals.calculatedMacroFloorCalories,1550);
  assert.equal(goals.calculatedMacroFloorApplied,true);
  assert.equal(goals.calculatedFloorApplied,false);
  assert.equal(goals.calculatedCalories,1550);
  assert.equal(goals.kcal,1550);
  assert.equal(goals.protein,270);
  near(goals.carbs,1.25);
  assert.ok(goals.carbs>=0);
  assert.ok((goals.calculatedMacroFloorCalories-25)*(1-source.fatPercent/100)<goals.protein*4);
});

test('macro compatibility preserves existing automatic profiles through backup validation',()=>{
  const state=createInitialState();
  state.profileReady=true;
  state.profile=profile({sex:'female',height:170,weight:150,goalWeight:65});
  const before=structuredClone(state);
  const restored=validateState(JSON.parse(JSON.stringify(state)),date);
  assert.deepEqual(state,before);
  assert.equal(restored.profile.calorieMode,'calculated');
  assert.equal(restored.profile.weight,150);
  assert.equal(calculateGoals(restored.profile,date).kcal,1550);
  assert.equal(calculateGoals(restored.profile,date).calculatedMacroFloorApplied,true);
});

test('exact automatic macro boundaries allow zero carbs despite floating point rounding',()=>{
  for(const [weight,kcal] of [[144,1600],[157.5,1750],[216,2400]]) {
    const source=profile({sex:'female',height:170,weight,goalWeight:65,proteinFactor:2,fatPercent:28});
    const goals=calculateGoals(source,date);
    assert.equal(goals.kcal,kcal);
    assert.equal(goals.carbs,0);
    near(goals.protein*4+goals.fat*9,goals.kcal);
    assert.equal(calculateGoals({...source,calorieMode:'manual',calories:kcal},date).carbs,0);
    assert.equal(calculateGoals(source,date,kcal).carbs,0);
    assert.throws(()=>calculateGoals(source,date,kcal-25),/protein and fat targets/);
    const state=createInitialState();
    state.profile=source;
    assert.doesNotThrow(()=>validateState(state,date));
  }
});

test('high goal-weight estimates stay within the persisted calorie range without capping energy references',()=>{
  const source=profile({sex:'male',height:180,weight:70,goalWeight:150,activity:1.9});
  const goals=calculateGoals(source,date);
  assert.ok(goals.goalTdee>4000);
  assert.equal(Math.round(goals.rawCalculatedCalories/25)*25,4250);
  assert.equal(goals.calculatedCalories,4000);
  assert.equal(goals.kcal,4000);
  assert.equal(goals.calculatedCeilingApplied,true);
  assert.equal(goals.calculatedMacroFloorApplied,false);
  assert.equal(goals.goalTdee,energyNeeds(source,date).goalTdee);
  assert.equal(calculateGoals({...source,calorieMode:'manual',calories:1800},date).kcal,1800);
  assert.equal(calculateGoals(source,date,2000).kcal,2000);
  const state=createInitialState();
  state.profile=source;
  state.days[date]={entries:[],goals,note:'High goal reference'};
  const restored=validateState(JSON.parse(JSON.stringify(state)),date);
  assert.equal(restored.days[date].goals.kcal,4000);
  assert.equal(calculateGoals(restored.profile,date).calculatedCeilingApplied,true);
});

test('infeasible manual and override budgets still require correction instead of receiving an automatic macro floor',()=>{
  const source=profile({sex:'female',height:170,weight:150,goalWeight:65});
  assert.throws(()=>calculateGoals({...source,calorieMode:'manual',calories:1525},date),/protein and fat targets/);
  assert.throws(()=>calculateGoals(source,date,1525),/protein and fat targets/);
  const manual=calculateGoals({...source,calorieMode:'manual',calories:1600},date);
  assert.equal(manual.kcal,1600);
  assert.equal(manual.calculatedCalories,1550);
  assert.equal(calculateGoals(source,date,1600).kcal,1600);
});

test('energy and goal calculations are repeatable without mutating the supplied profile',()=>{
  const source=Object.freeze(profile());
  const before=structuredClone(source);
  const references=energyNeeds(source,date,60);
  const goals=calculateGoals(source,date);
  assert.deepEqual(energyNeeds(source,date,60),references);
  assert.deepEqual(calculateGoals(source,date),goals);
  assert.deepEqual(source,before);
});

test('workout volume continues comparing the selected budget with actual-weight maintenance',()=>{
  const source=profile({calorieMode:'manual',calories:1900});
  const settings={...DEFAULT_WORKOUT_SETTINGS,goal:'preserve',experience:'regular',equipment:'dumbbells'};
  const suggestion=workoutSuggestion(source,settings,'goblet-squat',date);
  assert.equal(suggestion.energy.tdee,2256);
  assert.equal(suggestion.energy.goalTdee,2016);
  assert.ok(suggestion.energy.kcal/suggestion.energy.tdee<0.9);
  assert.ok(suggestion.energy.kcal/suggestion.energy.goalTdee>0.9);
  assert.equal(suggestion.reducedVolume,true);
  assert.equal(suggestion.sets,2);
});
