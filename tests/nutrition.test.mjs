import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FOODS, DEFAULT_PROFILE, NUTRIENTS, EXTRA_NUTRIENTS, ALL_NUTRIENTS,
  validateFood, portionNutrition, newEntry, totals, nutrientGoals,
  validateProfile, calculateGoals, createInitialState, validateState,
} from '../core.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const starter = id => structuredClone(DEFAULT_FOODS.find(food => food.id === id));
const legacyFood = food => Object.fromEntries(Object.entries(food)
  .filter(([key]) => ![...EXTRA_NUTRIENTS, 'nutrientNote', 'nutrientSource'].includes(key)));
const custom = overrides => ({
  id:'custom-label', name:'My packaged food', category:'Snacks',
  portionGrams:40, portionUnit:'bar', kcal:200, protein:5, carbs:30, fat:7,
  fiber:8, saturatedFat:2, sugar:6, addedSugar:3, sodium:120,
  note:'Package label', source:'https://example.com/product', ...overrides,
});

test('all starter estimates are valid and preserve existing calorie and macro definitions', () => {
  assert.deepEqual(NUTRIENTS, ['kcal','protein','carbs','fat']);
  assert.equal(ALL_NUTRIENTS.length, 9);
  for (const food of DEFAULT_FOODS) {
    const checked = validateFood(food);
    for (const key of NUTRIENTS) assert.equal(checked[key], food[key]);
    for (const key of EXTRA_NUTRIENTS) {
      assert.ok(checked[key] === null || Number.isFinite(checked[key]), `${food.id}: ${key}`);
    }
    assert.ok(!checked.nutrientSource || checked.nutrientSource.startsWith('https://'));
  }
  assert.ok(starter('oats').fiber > 0);
  assert.ok(starter('olive-oil').saturatedFat > 0);
  assert.equal(starter('banana').addedSugar, 0);
});

test('old starter foods gain researched fields without changing custom portions or primary values', () => {
  const old = { ...legacyFood(starter('oats')), portionGrams:75, portionUnit:'bowl', note:'My breakfast portion', favorite:false };
  const snapshot = structuredClone(old);
  const checked = validateFood(old);
  assert.deepEqual(old, snapshot);
  for (const key of EXTRA_NUTRIENTS) assert.equal(checked[key], starter('oats')[key]);
  assert.equal(checked.portionGrams, 75);
  assert.equal(checked.note, 'My breakfast portion');
  assert.equal(checked.favorite, false);
  for (const key of NUTRIENTS) assert.equal(checked[key], old[key]);
});

test('edits to a starter identity, source or nutrition prevent unrelated estimate migration', () => {
  for (const changed of [
    {id:'custom-oats'}, {name:'My special oats'}, {category:'Extras'},
    {kcal:380}, {protein:14}, {carbs:66}, {fat:6}, {source:'https://example.com/oats'},
  ]) {
    const food = validateFood({ ...legacyFood(starter('oats')), ...changed });
    for (const key of EXTRA_NUTRIENTS) assert.equal(food[key], null, `${JSON.stringify(changed)}: ${key}`);
    assert.equal(food.nutrientSource, '');
  }
});

test('explicit zero and unknown values survive starter enrichment', () => {
  const food = validateFood({ ...legacyFood(starter('oats')), fiber:0, sodium:null, sugar:'', nutrientSource:null, nutrientNote:'' });
  assert.equal(food.fiber, 0);
  assert.equal(food.sodium, null);
  assert.equal(food.sugar, null);
  assert.equal(food.saturatedFat, starter('oats').saturatedFat);
  assert.equal(food.nutrientSource, '');
  assert.equal(food.nutrientNote, '');
});

test('every additional nutrient scales with grams, portions and oil volume units', () => {
  const food = custom();
  const perGram = portionNutrition(food, 25, 'g');
  const twoPortions = portionNutrition(food, 2, 'portion');
  for (const key of ALL_NUTRIENTS) {
    close(perGram[key], food[key] / 4);
    close(twoPortions[key], food[key] * 0.8);
  }
  assert.equal(perGram.grams, 25);
  assert.equal(twoPortions.grams, 80);
  const oil = starter('olive-oil');
  close(portionNutrition(oil, 2, 'tsp').saturatedFat, oil.saturatedFat * 9 / 100);
  close(portionNutrition(oil, 10, 'mL').saturatedFat, oil.saturatedFat * 9 / 100);
  assert.equal(portionNutrition(custom({fiber:null}), 2, 'portion').fiber, null);
});

test('daily totals distinguish complete, partial and unknown nutrient coverage', () => {
  const known = newEntry(custom(), 50, 'g', 'Lunch', 'known');
  const unknown = newEntry(legacyFood(custom()), 1, 'portion', 'Lunch', 'unknown');
  const partial = totals([known, unknown]);
  assert.equal(partial.kcal, 180);
  assert.equal(partial.carbs, 27);
  assert.equal(partial.fiber, 4);
  assert.equal(partial.sodium, 60);
  assert.deepEqual(partial.coverage.fiber, {known:1,total:2,complete:false});
  const allUnknown = totals([unknown]);
  assert.equal(allUnknown.fiber, null);
  assert.deepEqual(allUnknown.coverage.fiber, {known:0,total:1,complete:false});
  const complete = totals([known]);
  assert.deepEqual(complete.coverage.fiber, {known:1,total:1,complete:true});
  const zero = totals([newEntry(custom({fiber:0}), 1, 'portion', 'Lunch', 'zero')]);
  assert.equal(zero.fiber, 0);
  assert.equal(zero.coverage.fiber.complete, true);
  const empty = totals();
  assert.equal(empty.fiber, 0);
  assert.deepEqual(empty.coverage.fiber, {known:0,total:0,complete:true});
});

test('guidelines distinguish fiber goals, intake limits and total sugar without a target', () => {
  const goals = nutrientGoals(2000);
  assert.equal(goals.fiber, 28);
  close(goals.saturatedFat, 200 / 9);
  assert.equal(goals.addedSugar, 50);
  assert.equal(goals.sodium, 2300);
  assert.equal(goals.sugar, null);
  assert.deepEqual(goals.nutrientTargets, {
    fiber:'minimum', saturatedFat:'maximum', sugar:'none', addedSugar:'maximum', sodium:'maximum',
  });
  const overridden = calculateGoals(DEFAULT_PROFILE, '2026-10-16', 2400);
  close(overridden.fiber, 33.6);
  close(overridden.saturatedFat, 240 / 9);
  assert.equal(overridden.addedSugar, 60);
  assert.equal(overridden.sodium, 2300);
});

test('weight, height and sex affect calorie-based targets through the energy calculation', () => {
  const profile = {...DEFAULT_PROFILE, calorieMode:'calculated'};
  const base = calculateGoals(profile, '2026-10-16');
  for (const change of [{weight:85}, {height:180}, {sex:'male'}]) {
    const changed = calculateGoals({...profile,...change}, '2026-10-16');
    assert.ok(changed.kcal > base.kcal);
    assert.ok(changed.fiber > base.fiber);
    assert.ok(changed.saturatedFat > base.saturatedFat);
    assert.ok(changed.addedSugar > base.addedSugar);
    assert.equal(changed.sodium, base.sodium);
  }
  const manual = calculateGoals({...DEFAULT_PROFILE,weight:85,height:180,sex:'male'}, '2026-10-16');
  assert.equal(manual.fiber, calculateGoals(DEFAULT_PROFILE, '2026-10-16').fiber);
  assert.doesNotThrow(() => calculateGoals({...profile,weight:250,height:230,goalWeight:100,sex:'male',activity:1.9}));
});

test('insulin resistance is saved without inventing a universal nutrient multiplier', () => {
  const old = {...DEFAULT_PROFILE};
  delete old.insulinResistance;
  assert.equal(validateProfile(old).insulinResistance, false);
  const flagged = validateProfile({...DEFAULT_PROFILE,insulinResistance:true});
  assert.equal(flagged.insulinResistance, true);
  assert.deepEqual(calculateGoals(flagged, '2026-10-16'), calculateGoals(DEFAULT_PROFILE, '2026-10-16'));
  for (const invalid of ['true',1,null,{}]) {
    assert.throws(() => validateProfile({...DEFAULT_PROFILE,insulinResistance:invalid}), /Insulin resistance/);
  }
});

test('new label fields reject invalid quantities and inconsistent subcomponents', () => {
  for (const changed of [
    {fiber:-1}, {fiber:101}, {fiber:NaN}, {fiber:Infinity}, {fiber:false}, {fiber:[]},
    {sodium:-1}, {sodium:100001}, {saturatedFat:8}, {sugar:31}, {addedSugar:7},
  ]) assert.throws(() => validateFood(custom(changed)), `${JSON.stringify(changed)} should be rejected`);
  assert.equal(validateFood(custom({fiber:'2.5',sodium:'230'})).fiber, 2.5);
  assert.equal(validateFood(custom({fiber:'   '})).fiber, null);
  assert.equal(validateFood(custom({sugar:null,addedSugar:4})).addedSugar, 4);
  assert.equal(validateFood(custom({sugar:null})).sugar, null);
});

test('total carbs bound fiber and added sugar even when total sugar is unknown', () => {
  assert.throws(() => validateFood(custom({carbs:10,fiber:30,sugar:null})), /Fiber cannot exceed total carbs/);
  assert.throws(() => validateFood(custom({carbs:10,sugar:null,addedSugar:20})), /Added sugar cannot exceed total carbs/);
  const partiallyKnown = validateFood(custom({carbs:10,fiber:5,sugar:null,addedSugar:4}));
  assert.equal(partiallyKnown.sugar, null);
  assert.equal(partiallyKnown.addedSugar, 4);
  assert.equal(validateFood(custom({carbs:10,fiber:10.1,sugar:null})).fiber, 10.1);
  assert.equal(validateFood(custom({carbs:10,sugar:null,addedSugar:10.1})).addedSugar, 10.1);
});

test('legacy backup migration enriches foods and log snapshots and uses each day’s saved calorie target', () => {
  const state = createInitialState();
  delete state.profile.insulinResistance;
  state.foods = state.foods.map(legacyFood);
  const oldOats = state.foods.find(food => food.id === 'oats');
  const primary = calculateGoals({...DEFAULT_PROFILE,calories:2000}, '2026-09-01');
  const savedGoals = Object.fromEntries(NUTRIENTS.map(key => [key,primary[key]]));
  state.days['2026-09-01'] = {
    entries:[{id:'old-log',foodId:'oats',food:oldOats,amount:75,unit:'g',meal:'Breakfast'}],
    goals:savedGoals, note:'Keep my history',
  };
  state.foods.push(legacyFood(custom()));
  const before = structuredClone(state);
  const restored = validateState(state);
  assert.deepEqual(state, before);
  assert.equal(restored.profile.insulinResistance, false);
  const day = restored.days['2026-09-01'];
  for (const key of NUTRIENTS) assert.equal(day.goals[key], savedGoals[key]);
  assert.equal(day.goals.fiber, 28);
  assert.equal(day.goals.addedSugar, 50);
  assert.equal(day.note, 'Keep my history');
  assert.equal(day.entries[0].food.fiber, starter('oats').fiber);
  close(totals(day.entries).fiber, starter('oats').fiber * 0.75);
  assert.equal(restored.foods.at(-1).fiber, null);
});

test('backup round trips retain explicit unknowns, provided labels, profile flag and safe provenance', () => {
  const state = createInitialState();
  state.profile.insulinResistance = true;
  const food = validateFood(custom({sodium:null,addedSugar:0,nutrientNote:'Read from my label',nutrientSource:'https://example.com/label'}));
  state.foods.push(food);
  state.days['2026-10-16'] = {entries:[newEntry(food, 2, 'portion', 'Lunch', 'label-entry')],goals:calculateGoals(state.profile),note:''};
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.profile.insulinResistance, true);
  assert.deepEqual(restored.foods.at(-1), food);
  assert.deepEqual(restored.days['2026-10-16'].entries[0].food, food);
  assert.equal(restored.days['2026-10-16'].goals.sugar, null);
  assert.equal(validateFood(custom({nutrientSource:'javascript:alert(1)'})).nutrientSource, '');
});
