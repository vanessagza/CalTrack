import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, newEntry, validateExercise, validateWorkoutEntry,
} from '../core.js';
import { buildJournalReport, renderJournalReport } from '../journal-report.js';

function sampleJournal() {
  const state=createInitialState();
  state.profileReady=true;
  state.profile={...state.profile,name:'A <B> & Co',weight:80,startWeight:82,goalMode:'composition',goalWeight:null,
    bodyFatPercent:30,startBodyFatPercent:32,goalBodyFatPercent:25,muscleMass:40,startMuscleMass:39,goalMuscleMass:41};
  const food={...state.foods.find(item=>item.id==='egg'),id:'custom-snack',name:'Snack <bar> & tea',category:'Snacks',portionGrams:50,portionUnit:'bar',
    kcal:400,protein:20,carbs:30,fat:15,fiber:4,saturatedFat:3,sugar:8,addedSugar:5,sodium:180,note:'Saved food note <keep>'};
  state.foods.push(food);
  state.days['2026-11-02']={entries:[newEntry(food,2,'portion','Breakfast','food-entry-1')],
    goals:{kcal:1600,protein:120,carbs:170,fat:48.9},note:'Day note <script>alert(1)</script>'};
  state.weights=[
    {date:'2026-11-01',weight:82,bodyFatPercent:32,muscleMass:39},
    {date:'2026-11-03',weight:81,bodyFatPercent:31,muscleMass:39.5},
  ];
  const exercise=validateExercise({id:'custom-exercise-walk',name:'Outdoor walk & talk',group:'Cardio',equipment:'bodyweight',unit:'minutes',
    sets:1,reps:20,restSeconds:0,cue:'Saved exercise cue',instructions:'Saved instructions',feel:'Light effort',easier:'Shorter route',avoid:'Unsafe roads'});
  state.workouts.exercises=[exercise];
  state.workouts.days['2026-11-03']=[validateWorkoutEntry({id:'workout-entry-1',exerciseId:exercise.id,exercise,sets:1,setsMax:1,reps:20,repsMax:20,
    restSeconds:0,load:null,note:'Workout note <keep>',completed:true},[exercise])];
  state.workouts.notes['2026-11-03']={title:'Evening walk',goal:'Move gently',note:'Felt good'};
  return state;
}

test('full history report includes dated meals, measurements, workouts, goals, and saved food details',()=>{
  const state=sampleJournal(),report=buildJournalReport(state,'2026-11-04');
  assert.deepEqual([report.summary.rangeStart,report.summary.rangeEnd],['2026-11-01','2026-11-03']);
  assert.equal(report.summary.foodEntries,1);
  assert.equal(report.summary.measurements,2);
  assert.equal(report.summary.completedExercises,1);
  assert.equal(report.foodDays[0].entries[0].food.name,'Snack <bar> & tea');
  assert.equal(report.foodDays[0].entries[0].consumed.kcal,400);
  assert.equal(report.foodDays[0].goalSource,'Saved targets');
  assert.equal(report.foodDays[0].entries[0].consumed.protein,20);
  assert.equal(report.measurements[1].bodyFatPercent,31);
  assert.equal(report.measurements[1].muscleMass,39.5);
  assert.equal(report.workoutDays[0].entries[0].exercise.name,'Outdoor walk & talk');
  assert.equal(report.workoutDays[0].entries[0].entry.completed,true);
  assert.ok(report.workoutDays[0].entries[0].estimate.kcal>0);
  assert.ok(report.profileDetails.some(([label])=>label==='Goal body fat'));
  assert.ok(report.profileDetails.some(([label])=>label==='Goal skeletal muscle'));
  assert.ok(report.forecast);
  assert.equal(report.forecast.asOf,'2026-11-04');
  assert.ok(report.savedFoods.some(food=>food.id==='custom-snack'));
  assert.equal(state.days['2026-11-02'].entries.length,1,'report generation must not mutate the journal');
});

test('print-ready report escapes journal text and exposes Save as PDF instructions',()=>{
  const html=renderJournalReport(sampleJournal(),{generatedDate:'2026-11-04',baseURL:'https://example.test/'});
  assert.match(html,/<title>Daily Balance history report · 2026-11-04<\/title>/);
  assert.match(html,/Snack &lt;bar&gt; &amp; tea/);
  assert.match(html,/Day note &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/Save as PDF/);
  assert.match(html,/Skeletal muscle/);
  assert.match(html,/Goal timeline &amp; saved scenario/);
  assert.match(html,/Completed/);
  assert.match(html,/@page\{size:A4/);
});
