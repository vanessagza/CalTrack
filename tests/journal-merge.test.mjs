import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, newEntry, validateWorkoutEntry, validateExercise, validateSessionNote, clearWorkoutSchedule } from '../core.js';
import { mergeJournals, JournalConflict } from '../journal-merge.js';
const fixture = () => ({ ...createInitialState(), profileReady:true });
test('offline devices keep both independently logged foods on the same day', () => {
  const base=fixture(), laptop=structuredClone(base), phone=structuredClone(base);
  laptop.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','laptop-entry')],note:''};
  phone.days['2026-10-11']={entries:[newEntry(base.foods[1],1,'portion','Lunch','phone-entry')],note:''};
  const result=mergeJournals(base,laptop,phone);
  assert.deepEqual(new Set(result.days['2026-10-11'].entries.map(e=>e.id)),new Set(['laptop-entry','phone-entry']));
});
test('a deletion and an unrelated new entry are both retained', () => {
  const base=fixture();
  base.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','old')],note:''};
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.days['2026-10-11'].entries=[];
  phone.days['2026-10-11'].entries.push(newEntry(base.foods[1],1,'portion','Dinner','new'));
  assert.deepEqual(mergeJournals(base,laptop,phone).days['2026-10-11'].entries.map(e=>e.id),['new']);
});
test('editing and deleting the same entry requires a user choice', () => {
  const base=fixture();base.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','same')],note:''};
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.days['2026-10-11'].entries=[];phone.days['2026-10-11'].entries[0].amount=2;
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('conflicting profiles and same-date weights are not silently overwritten', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.profile.name='Laptop';phone.profile.name='Phone';
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
  laptop.profile=base.profile;phone.profile=base.profile;
  laptop.weights=[{date:'2026-10-11',weight:69}];phone.weights=[{date:'2026-10-11',weight:68}];
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('unrelated food label edits merge and backups remain valid', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.foods[0].favorite=false;phone.foods[0].note='Updated label note';
  const result=mergeJournals(base,laptop,phone);
  assert.equal(result.foods[0].favorite,false);assert.equal(result.foods[0].note,'Updated label note');
});

const workout = (id, overrides={}) => validateWorkoutEntry({
  id, exerciseId:'squat', sets:3, reps:10, load:null, note:'', completed:false, ...overrides,
});
test('independent workout additions and food logs survive device sync', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.workouts.days['2026-10-12']=[workout('laptop-workout')];
  phone.workouts.days['2026-10-12']=[workout('phone-workout')];
  phone.days['2026-10-12']={entries:[newEntry(base.foods[0],1,'portion','Lunch','phone-food')],note:''};
  const merged=mergeJournals(base,laptop,phone);
  assert.deepEqual(new Set(merged.workouts.days['2026-10-12'].map(e=>e.id)),new Set(['laptop-workout','phone-workout']));
  assert.equal(merged.days['2026-10-12'].entries[0].id,'phone-food');
});
test('completion and strength edits to different exercises are retained', () => {
  const base=fixture();base.workouts.days['2026-10-12']=[workout('first'),workout('second')];
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.workouts.days['2026-10-12'][0].completed=true;
  phone.workouts.days['2026-10-12'][1].load=7.5;
  const merged=mergeJournals(base,laptop,phone);
  assert.equal(merged.workouts.days['2026-10-12'][0].completed,true);
  assert.equal(merged.workouts.days['2026-10-12'][1].load,7.5);
});
test('workout deletion and an unrelated addition both survive sync', () => {
  const base=fixture();base.workouts.days['2026-10-12']=[workout('old')];
  const laptop=structuredClone(base),phone=structuredClone(base);
  delete laptop.workouts.days['2026-10-12'];
  phone.workouts.days['2026-10-12'].push(workout('new'));
  assert.deepEqual(mergeJournals(base,laptop,phone).workouts.days['2026-10-12'].map(e=>e.id),['new']);
});
test('conflicting edits or different reschedules of the same exercise require a choice', () => {
  const base=fixture();base.workouts.days['2026-10-12']=[workout('same')];
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.workouts.days['2026-10-12'][0].sets=laptop.workouts.days['2026-10-12'][0].setsMax=4;phone.workouts.days['2026-10-12'][0].sets=phone.workouts.days['2026-10-12'][0].setsMax=5;
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
  laptop.workouts.days={'2026-10-13':[workout('same')]};
  phone.workouts.days={'2026-10-14':[workout('same')]};
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('independent workout preferences merge and conflicting preferences require a choice', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.workouts.settings.goal='build';phone.workouts.settings.equipment='gym';
  const merged=mergeJournals(base,laptop,phone);
  assert.equal(merged.workouts.settings.goal,'build');assert.equal(merged.workouts.settings.equipment,'gym');
  phone.workouts.settings.goal='strength';
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('legacy account journals merge with newly added workout records', () => {
  const base=fixture();delete base.workouts;
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.workouts={settings:{goal:'build',experience:'regular',equipment:'gym'},days:{'2026-10-12':[workout('new')]}};
  phone.profile.name='Updated on phone';
  const merged=mergeJournals(base,laptop,phone);
  assert.equal(merged.workouts.days['2026-10-12'][0].id,'new');
  assert.equal(merged.workouts.settings.goal,'build');
  assert.equal(merged.profile.name,'Updated on phone');
});

test('reordering exercises survives sync while another device adds an exercise',()=>{
  const base=fixture();base.workouts.days['2026-10-12']=[workout('one'),workout('two'),workout('three')];
  const local=structuredClone(base),remote=structuredClone(base);
  local.workouts.days['2026-10-12'].reverse();
  remote.workouts.days['2026-10-12'].push(workout('four'));
  assert.deepEqual(mergeJournals(base,local,remote).workouts.days['2026-10-12'].map(e=>e.id),['three','two','one','four']);
  assert.deepEqual(mergeJournals(base,remote,local).workouts.days['2026-10-12'].map(e=>e.id),['three','two','one','four']);
  remote.workouts.days['2026-10-12']=[workout('two'),workout('one'),workout('three')];
  assert.throws(()=>mergeJournals(base,local,remote),JournalConflict);
});

test('custom libraries and independent session notes merge with workout changes',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
  const exercise=validateExercise({id:'custom-exercise-a',name:'Step-up',group:'Lower body',equipment:'bodyweight',unit:'reps',instructions:'Use a stable step.'});
  local.workouts.exercises=[exercise];
  local.workouts.days['2026-10-12']=[validateWorkoutEntry({id:'custom-scheduled',exerciseId:exercise.id,sets:2,reps:10},[exercise])];
  remote.workouts.notes['2026-10-12']=validateSessionNote({title:'Leg day',goal:'Build balance'});
  const merged=mergeJournals(base,local,remote);
  assert.equal(merged.workouts.exercises[0].instructions,'Use a stable step.');
  assert.equal(merged.workouts.days['2026-10-12'][0].exercise.name,'Step-up');
  assert.equal(merged.workouts.notes['2026-10-12'].goal,'Build balance');
});

test('clearing a week syncs deletions and its repeat suppression without erasing other weeks',()=>{
  const base=fixture();base.workouts.days={'2026-10-12':[workout('old')],'2026-10-19':[workout('future')]};
  const local=structuredClone(base),remote=structuredClone(base);
  local.workouts=clearWorkoutSchedule(local.workouts,'week','2026-10-12');
  remote.workouts.days['2026-10-19'][0].load=8;
  const merged=mergeJournals(base,local,remote);
  assert.ok(!merged.workouts.days['2026-10-12']);
  assert.equal(merged.workouts.days['2026-10-19'][0].load,8);
  assert.deepEqual(merged.workouts.skippedWeeks,['2026-10-12']);
});
