import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE, bodyComposition, calculateGoals, createInitialState,
  energyNeeds, newEntry, validateMeasurement, validateProfile, validateState,
} from '../core.js';
import { weeklyIntake } from '../weekly-intake.js';

const date = '2026-10-16';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const profile = (changes = {}) => ({
  ...DEFAULT_PROFILE, birthDate:'1996-01-01', sex:'female', height:170,
  weight:80, startWeight:80, goalWeight:65, activity:1.3,
  goalMode:'composition', bodyFatPercent:30, startBodyFatPercent:30, goalBodyFatPercent:25,
  muscleMass:28, startMuscleMass:28, goalMuscleMass:32,
  calorieMode:'calculated', deficit:0, ...changes,
});

test('composition goals derive the same goal weight while independent fat and muscle progress changes', () => {
  const start = validateProfile(profile());
  assert.equal(start.goalWeight, 80);
  const halfway = validateProfile(profile({bodyFatPercent:27.5, muscleMass:30}));
  const finish = validateProfile(profile({bodyFatPercent:25, muscleMass:32}));
  for (const p of [start, halfway, finish]) {
    assert.equal(p.weight, 80);
    assert.equal(p.goalWeight, 80);
    const composition = bodyComposition(p);
    assert.equal(composition.startLeanMass, 56);
    assert.equal(composition.otherLeanMass, 28);
    assert.equal(composition.goalLeanMass, 60);
  }
  assert.equal(bodyComposition(start).fatProgress, 0);
  assert.equal(bodyComposition(start).muscleProgress, 0);
  assert.equal(bodyComposition(halfway).fatProgress, 50);
  assert.equal(bodyComposition(halfway).muscleProgress, 50);
  assert.equal(bodyComposition(finish).fatProgress, 100);
  assert.equal(bodyComposition(finish).muscleProgress, 100);
});

test('composition energy uses fat-free mass, with a stable starting anchor for the goal', () => {
  const start = calculateGoals(profile(), date);
  near(start.rmr, 370 + 21.6 * 56);
  near(start.goalRmr, 370 + 21.6 * 60);
  near(start.goalTdee, (370 + 21.6 * 60) * 1.3);
  assert.equal(start.energyMethod, 'katch');
  assert.equal(start.kcal, 2175);
  const changed = calculateGoals(profile({weight:82, bodyFatPercent:27, muscleMass:31}), date);
  near(changed.rmr, 370 + 21.6 * 82 * .73);
  assert.equal(changed.goalRmr, start.goalRmr);
  assert.equal(changed.goalTdee, start.goalTdee);
  assert.equal(changed.goalWeight, start.goalWeight);
  assert.equal(changed.kcal, start.kcal);
  assert.notEqual(changed.protein, start.protein);
});

test('goal body fat affects implied weight while muscle affects goal lean mass and resting energy', () => {
  const base = calculateGoals(profile(), date);
  const lowerFat = calculateGoals(profile({goalBodyFatPercent:20}), date);
  assert.equal(lowerFat.goalWeight, 75);
  assert.equal(lowerFat.goalLeanMass, base.goalLeanMass);
  assert.equal(lowerFat.goalRmr, base.goalRmr);
  const moreMuscle = calculateGoals(profile({goalMuscleMass:34}), date);
  near(moreMuscle.goalWeight, 62 / .75);
  near(moreMuscle.goalRmr, 370 + 21.6 * 62);
  assert.ok(moreMuscle.kcal > base.kcal);
});

test('legacy weight mode keeps its Mifflin formula and does not require composition measurements', () => {
  const legacy = {...DEFAULT_PROFILE};
  for (const key of ['goalMode','bodyFatPercent','startBodyFatPercent','goalBodyFatPercent','muscleMass','startMuscleMass','goalMuscleMass']) delete legacy[key];
  const p = validateProfile(legacy);
  assert.equal(p.goalMode, 'weight');
  assert.equal(p.bodyFatPercent, null);
  assert.equal(p.goalWeight, 65);
  const original = calculateGoals(p, date);
  const withReadings = calculateGoals({...p, bodyFatPercent:30, muscleMass:25}, date);
  assert.equal(withReadings.rmr, original.rmr);
  assert.equal(withReadings.goalRmr, original.goalRmr);
  assert.equal(withReadings.kcal, original.kcal);
  assert.equal(withReadings.energyMethod, 'mifflin');
});

test('composition validation rejects missing baselines, impossible muscle readings and invalid target weights', () => {
  for (const key of ['bodyFatPercent','startBodyFatPercent','goalBodyFatPercent','muscleMass','startMuscleMass','goalMuscleMass']) {
    assert.throws(() => validateProfile(profile({[key]:null})), /required/);
  }
  assert.throws(() => validateProfile(profile({bodyFatPercent:66})), /between/);
  assert.throws(() => validateProfile(profile({muscleMass:57})), /fat-free mass/);
  assert.throws(() => validateProfile(profile({startMuscleMass:57})), /fat-free mass/);
  assert.throws(() => validateProfile(profile({goalMuscleMass:1,goalBodyFatPercent:3})), /goal weight|BMI/);
  assert.throws(() => validateProfile(profile({goalMode:'invalid'})), /Choose/);
  assert.throws(() => validateProfile(profile({muscleMass:true})), /number/);
});

test('measurement validation and backup round trips preserve optional composition without fabricating old readings', () => {
  const old = {date, weight:80};
  assert.deepEqual(validateMeasurement(old), old);
  const measured = {date, weight:80, bodyFatPercent:27.5, muscleMass:30};
  assert.deepEqual(validateMeasurement(measured), measured);
  assert.throws(() => validateMeasurement({...measured, muscleMass:60}), /fat-free mass/);
  const state = createInitialState();
  state.profile = validateProfile(profile({bodyFatPercent:27.5, muscleMass:30}));
  state.weights = [{...old,date:'2026-10-15'}, measured];
  const restored = validateState(JSON.parse(JSON.stringify(state)), date);
  assert.deepEqual(restored.profile, state.profile);
  assert.deepEqual(restored.weights, state.weights);
  assert.equal(bodyComposition(restored.profile).fatProgress, 50);
  assert.equal(bodyComposition(restored.profile).muscleProgress, 50);
});

test('dated maintenance uses the matching fat reading and falls back without importing current body fat', () => {
  const p = profile({bodyFatPercent:25,muscleMass:32});
  const weightOnly = energyNeeds(p, date, 80);
  near(weightOnly.rmr, 10 * 80 + 6.25 * 170 - 5 * 30 - 161);
  const withFat = energyNeeds(p, date, 80, 30);
  near(withFat.rmr, 370 + 21.6 * 56);
  assert.equal(weightOnly.goalRmr, withFat.goalRmr);

  const state = createInitialState();
  state.profile = validateProfile(p);
  state.intakeClosedThrough = '2026-10-15';
  state.weights = [
    {date:'2026-10-12', weight:80, bodyFatPercent:30, muscleMass:28},
    {date:'2026-10-14', weight:80},
    {date:'2026-10-16', weight:80, bodyFatPercent:25, muscleMass:32},
  ];
  const food = state.foods[0];
  for (const d of ['2026-10-12','2026-10-13','2026-10-14','2026-10-15']) state.days[d] = {entries:[newEntry(food,100,'g','Other',d)]};
  const days = weeklyIntake(state, date, date).days;
  near(days[0].currentRmrKcal, withFat.rmr);
  near(days[1].currentRmrKcal, withFat.rmr);
  near(days[2].currentRmrKcal, weightOnly.rmr);
  near(days[3].currentRmrKcal, weightOnly.rmr);
  for (const day of days.filter(day => day.included)) near(day.goalMaintenanceKcal, withFat.goalTdee);
});
