import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,calculateGoals,newEntry,validateState} from '../core.js';
import {validateCloudJournal} from '../sync-journal.js';
import {rebaseJournal} from '../journal-merge.js';

const date='2026-10-13';
const nutrients=['fiber','saturatedFat','sugar','addedSugar','sodium'];
const nutritionFields=[...nutrients,'nutrientNote','nutrientSource'];
const food=()=>({...createInitialState().foods[0],id:'custom-food',name:'My labeled bread',
  fiber:6.4,saturatedFat:1.2,sugar:4,addedSugar:2,sodium:321,
  nutrientNote:'From my package label, per 100 g.',nutrientSource:'https://example.com/nutrition'});
function fixture() {
  const state=createInitialState();
  state.profile.insulinResistance=true;
  state.foods=[food()];
  state.days[date]={entries:[newEntry(state.foods[0],1,'portion','Lunch','saved-food')],goals:calculateGoals(state.profile,date),note:''};
  return validateState(state);
}
function legacy(state) {
  const older=structuredClone(state);
  delete older.profile.insulinResistance;
  for(const item of older.foods)for(const key of nutritionFields)delete item[key];
  for(const day of Object.values(older.days)) {
    for(const entry of day.entries)for(const key of nutritionFields)delete entry.food[key];
    if(day.goals)for(const key of [...nutrients,'nutrientTargets'])delete day.goals[key];
  }
  return older;
}
const assertNutrition=(actual,expected)=>assert.deepEqual(Object.fromEntries(nutritionFields.map(key=>[key,actual[key]])),Object.fromEntries(nutritionFields.map(key=>[key,expected[key]])));

test('older journals preserve new profile, catalog, snapshot and saved goal fields without mutating their input',()=>{
  const saved=fixture(),older=legacy(saved),before=structuredClone(older);
  older.profile.name='An older tab';before.profile.name='An older tab';
  const result=validateCloudJournal(older,saved);
  assert.equal(result.profile.insulinResistance,true);
  assert.equal(result.profile.name,'An older tab');
  assertNutrition(result.foods[0],saved.foods[0]);
  assertNutrition(result.days[date].entries[0].food,saved.days[date].entries[0].food);
  assert.deepEqual(result.days[date].goals,saved.days[date].goals);
  assert.deepEqual(older,before);
});

test('current clients can explicitly clear nutrient values and uncheck insulin resistance',()=>{
  const saved=fixture(),current=structuredClone(saved);
  current.profile.insulinResistance=false;
  for(const item of [current.foods[0],current.days[date].entries[0].food]) {
    for(const key of nutrients)item[key]=null;
    item.nutrientNote='';item.nutrientSource='';
  }
  const result=validateCloudJournal(current,saved);
  assert.equal(result.profile.insulinResistance,false);
  for(const item of [result.foods[0],result.days[date].entries[0].food]) {
    for(const key of nutrients)assert.equal(item[key],null);
    assert.equal(item.nutrientNote,'');assert.equal(item.nutrientSource,'');
  }
});

test('partial old-client updates preserve only omitted nutrients and honor zero',()=>{
  const saved=fixture(),older=legacy(saved);
  older.foods[0].fiber=0;
  older.foods[0].sodium=null;
  older.days[date].entries[0].food.addedSugar=0;
  const result=validateCloudJournal(older,saved);
  assert.equal(result.foods[0].fiber,0);
  assert.equal(result.foods[0].sodium,null);
  assert.equal(result.foods[0].saturatedFat,saved.foods[0].saturatedFat);
  assert.equal(result.days[date].entries[0].food.addedSugar,0);
  assert.equal(result.days[date].entries[0].food.sodium,saved.days[date].entries[0].food.sodium);
});

test('historical log nutrients use the original food snapshot after catalog edits',()=>{
  const saved=fixture(),original=structuredClone(saved.days[date].entries[0].food);
  saved.foods[0]={...saved.foods[0],kcal:260,fiber:9,saturatedFat:0.7,sodium:400};
  const result=validateCloudJournal(legacy(saved),saved);
  assertNutrition(result.days[date].entries[0].food,original);
  assertNutrition(result.foods[0],saved.foods[0]);
});

test('new logs from an older tab inherit researched nutrients only from the same recipe',()=>{
  const saved=fixture(),older=legacy(saved);
  const snapshot=structuredClone(older.foods[0]);
  older.days[date].entries.push({id:'new-old-tab-log',foodId:snapshot.id,food:snapshot,amount:2,unit:'portion',meal:'Dinner'});
  const result=validateCloudJournal(older,saved);
  assertNutrition(result.days[date].entries[1].food,saved.foods[0]);
  assert.equal(result.days[date].entries[1].amount,2);
});

test('changing serving grams keeps per-100-g values while changing a recipe leaves them unknown',()=>{
  const saved=fixture(),older=legacy(saved);
  older.foods[0].portionGrams=65;older.foods[0].portionUnit='thick slice';
  let result=validateCloudJournal(older,saved);
  assertNutrition(result.foods[0],saved.foods[0]);
  assert.equal(result.foods[0].portionGrams,65);
  older.foods[0].kcal=270;
  older.days[date].entries[0].food.kcal=270;
  result=validateCloudJournal(older,saved);
  for(const item of [result.foods[0],result.days[date].entries[0].food])for(const key of nutrients)assert.equal(item[key],null);
});

test('a renamed replacement recipe cannot inherit omitted nutrition just because its macros match',()=>{
  const saved=fixture(),older=legacy(saved);
  older.foods[0].name='A different bread';
  older.days[date].entries[0].food.name='A different bread';
  const result=validateCloudJournal(older,saved);
  for(const item of [result.foods[0],result.days[date].entries[0].food]) {
    for(const key of nutrients)assert.equal(item[key],null);
    assert.equal(item.nutrientNote,'');assert.equal(item.nutrientSource,'');
  }
});

test('an older client changing its calorie budget gets new nutrient goals for that budget',()=>{
  const saved=fixture(),older=legacy(saved),newGoals=calculateGoals(saved.profile,date,1800);
  older.days[date].goals={kcal:newGoals.kcal,protein:newGoals.protein,carbs:newGoals.carbs,fat:newGoals.fat};
  const result=validateCloudJournal(older,saved);
  for(const key of [...nutrients,'nutrientTargets'])assert.deepEqual(result.days[date].goals[key],newGoals[key]);
});

test('rebasing a legacy food log preserves a newer device profile and nutrient edits',()=>{
  const base=fixture(),local=legacy(base),remote=structuredClone(base);
  const snapshot=structuredClone(local.foods[0]);
  local.days[date].entries.push({id:'new-old-tab-log',foodId:snapshot.id,food:snapshot,amount:1,unit:'portion',meal:'Dinner'});
  remote.profile.insulinResistance=false;
  remote.foods[0].fiber=7.2;
  const result=rebaseJournal(base,local,remote);
  assert.equal(result.profile.insulinResistance,false);
  assert.equal(result.foods[0].fiber,7.2);
  assert.equal(result.days[date].entries.length,2);
  assert.equal(result.days[date].entries[1].food.fiber,6.4);
});

test('invalid incoming nutrition is validated instead of being replaced with saved data',()=>{
  const saved=fixture(),current=structuredClone(saved);
  current.profile.insulinResistance='yes';
  assert.throws(()=>validateCloudJournal(current,saved));
  current.profile.insulinResistance=true;current.foods[0].fiber=-1;
  assert.throws(()=>validateCloudJournal(current,saved));
  current.foods[0].fiber=6.4;current.foods[0].sodium='unknown';
  assert.throws(()=>validateCloudJournal(current,saved));
});
