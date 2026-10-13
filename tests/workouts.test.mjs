import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE, DEFAULT_WORKOUT_SETTINGS, EXERCISE_PRESETS, TIME_ZONE,
  createInitialState, validateState, newEntry, todayKey, weekDates,
  validateWorkouts, validateWorkoutEntry, workoutSuggestion,
  suggestWorkoutWeek, copyWorkoutWeek,
} from '../core.js';

const profile = { ...DEFAULT_PROFILE };
const settings = { ...DEFAULT_WORKOUT_SETTINGS, experience:'regular' };
const entry = overrides => validateWorkoutEntry({
  id:'exercise-1', exerciseId:'squat', sets:3, reps:10,
  load:null, note:'Controlled reps', completed:false, ...overrides,
});

test('existing version 1 backups gain an empty planner without losing journal data', () => {
  const legacy = createInitialState();
  delete legacy.workouts;
  legacy.profileReady = true;
  legacy.days['2026-10-12'] = { entries:[newEntry(legacy.foods[0], 2, 'portion', 'Lunch', 'food-entry')], note:'Lunch' };
  legacy.weights = [{ date:'2026-10-12', weight:70 }];
  const restored = validateState(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(restored.workouts, { libraryVersion:1,settings:DEFAULT_WORKOUT_SETTINGS, days:{},exercises:[],notes:{},skippedWeeks:[],template:null });
  assert.deepEqual(restored.days['2026-10-12'].entries, legacy.days['2026-10-12'].entries);
  assert.deepEqual(restored.weights, legacy.weights);
  assert.deepEqual(restored.profile, legacy.profile);
});

test('backup round trip preserves workout preferences, weight, notes and checkboxes', () => {
  const state = createInitialState();
  state.workouts = { ...state.workouts,settings:{ ...settings, goal:'build', equipment:'dumbbells' },
    days:{ '2026-10-12':[entry({ load:12.5, completed:true })] } };
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).workouts, state.workouts);
});

test('calendar weeks follow Monday through Sunday across year and leap boundaries', () => {
  assert.deepEqual(weekDates('2027-01-03'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(weekDates('2028-02-29')[1], '2028-02-29');
  assert.throws(() => weekDates('2026-02-30'), /valid workout date/);
  assert.equal(TIME_ZONE, 'Asia/Tashkent');
  assert.equal(todayKey(new Date('2026-10-11T20:00:00Z')), '2026-10-12');
});

test('suggestions account for goal, experience, exercise type and calorie availability', () => {
  const preserve = workoutSuggestion(profile, settings, 'squat', '2026-10-12', 2000);
  const build = workoutSuggestion(profile, { ...settings, goal:'build' }, 'squat', '2026-10-12', 2000);
  const strength = workoutSuggestion(profile, { ...settings, goal:'strength' }, 'squat', '2026-10-12', 2000);
  const beginner = workoutSuggestion(profile, { ...settings, goal:'strength', experience:'beginner' }, 'squat', '2026-10-12', 2000);
  const deficit = workoutSuggestion(profile, { ...settings, goal:'build' }, 'squat', '2026-10-12', 1200);
  assert.equal(preserve.sets, 3);
  assert.equal(build.sets, 4);
  assert.equal(strength.reps, 5);
  assert.equal(beginner.reps, 8);
  assert.equal(deficit.sets, 3);
  assert.equal(deficit.reducedVolume, true);
  assert.equal(build.load, null);
  assert.equal(workoutSuggestion(profile, settings, 'plank').reps, 30);
  const fitness = workoutSuggestion(profile, { ...settings, goal:'fitness' }, 'squat', '2026-10-12', 1200);
  assert.equal(fitness.sets, 2);
  assert.equal(fitness.reducedVolume, false);
});

test('measurements influence energy estimates rather than inventing lifting weights', () => {
  const female = workoutSuggestion(profile, settings, 'squat', '2026-10-12', 1600);
  const male = workoutSuggestion({ ...profile, sex:'male' }, settings, 'squat', '2026-10-12', 1600);
  const taller = workoutSuggestion({ ...profile, height:180 }, settings, 'squat', '2026-10-12', 1600);
  const heavier = workoutSuggestion({ ...profile, weight:85 }, settings, 'squat', '2026-10-12', 1600);
  assert.ok(male.energy.tdee > female.energy.tdee);
  assert.ok(taller.energy.tdee > female.energy.tdee);
  assert.ok(heavier.energy.tdee > female.energy.tdee);
  assert.equal(male.load, null);
  assert.equal(male.sets, 2);
  assert.equal(female.sets, 3);
});

test('suggested weeks respect equipment, recovery days and daily calorie targets', () => {
  for (const equipment of ['bodyweight','dumbbells','gym']) {
    const week = suggestWorkoutWeek(profile, { ...settings, goal:'build', equipment }, '2026-10-12',
      { '2026-10-12':{ goals:{ kcal:1200 } }, '2026-10-14':{ goals:{ kcal:2000 } } }, {}, '2026-10-12');
    assert.deepEqual(Object.keys(week), ['2026-10-12','2026-10-14','2026-10-16']);
    assert.equal(week['2026-10-12'][0].sets, 3);
    assert.equal(week['2026-10-14'][0].sets, 4);
    for (const [date, entries] of Object.entries(week)) {
      assert.equal(entries.length, 5);
      assert.ok(entries.every(e => e.completed === false && e.load === null));
      assert.ok(entries.every(e => equipment === 'gym' || EXERCISE_PRESETS.find(p => p.id === e.exerciseId).equipment !== 'gym'));
      if (equipment === 'bodyweight') assert.ok(entries.every(e => EXERCISE_PRESETS.find(p => p.id === e.exerciseId).equipment === 'bodyweight'));
      assert.equal(date.length, 10);
    }
    assert.doesNotThrow(() => validateWorkouts({ settings:{ ...settings, equipment }, days:week }));
  }
  const beginner = suggestWorkoutWeek(profile, DEFAULT_WORKOUT_SETTINGS, '2026-10-12', {}, {}, '2026-10-12');
  assert.deepEqual(Object.keys(beginner), ['2026-10-12','2026-10-15']);
});

test('suggesting a week never changes existing sessions or inserts exercises in the past', () => {
  const saved = { '2026-10-14':[entry({ sets:7, completed:true })] };
  const snapshot = structuredClone(saved);
  const additions = suggestWorkoutWeek(profile, settings, '2026-10-12', {}, saved, '2026-10-13');
  assert.deepEqual(Object.keys(additions), ['2026-10-16']);
  assert.deepEqual(saved, snapshot);
});

test('copying a week preserves custom targets, resets completion and leaves occupied days alone', () => {
  const source = entry({ reps:14, sets:4, load:6, completed:true });
  const days = { '2026-10-12':[source], '2026-10-15':[entry({ id:'exercise-2' })],
    '2026-10-22':[entry({ id:'already-planned', sets:5 })] };
  const snapshot = structuredClone(days);
  const copy = copyWorkoutWeek(days, '2026-10-12', '2026-10-12');
  assert.deepEqual(Object.keys(copy), ['2026-10-19']);
  assert.deepEqual(copy['2026-10-19'][0], { ...source, id:copy['2026-10-19'][0].id, completed:false });
  assert.notEqual(copy['2026-10-19'][0].id, source.id);
  assert.deepEqual(days, snapshot);
  assert.deepEqual(copyWorkoutWeek(days, '2026-10-12', '2026-10-23'), {});
});

test('invalid imported exercises are rejected before replacing the journal', () => {
  for (const invalid of [
    { exerciseId:'unknown' }, { sets:0 }, { sets:11 }, { sets:2.5 },
    { reps:0 }, { reps:101 }, { reps:NaN }, { load:-1 }, { load:501 },
    { completed:'true' }, { id:'' }, { id:'x'.repeat(101) },
  ]) assert.throws(() => entry(invalid));
  assert.equal(entry({ exerciseId:'plank', reps:120 }).reps, 120);
  assert.throws(() => entry({ exerciseId:'plank', reps:301 }));
  assert.equal(entry({ load:'' }).load, null);
  assert.equal(entry({ load:0 }).load, 0);
  assert.throws(() => validateWorkouts({ settings, days:{ '2026-02-30':[entry()] } }));
  assert.throws(() => validateWorkouts({ settings, days:{ '2026-10-12':[entry(),entry()] } }), /distinct IDs/);
  assert.throws(() => validateWorkouts({ settings, days:{ '2026-10-12':[entry()], '2026-10-13':[entry()] } }), /distinct IDs/);
  assert.throws(() => validateWorkouts({ settings:{ ...settings, goal:'unknown' }, days:{} }));
  assert.throws(() => validateWorkouts(null));
});
