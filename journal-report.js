import {
  ALL_NUTRIENTS,
  WORKOUT_EQUIPMENT, WORKOUT_EXPERIENCE, WORKOUT_GOALS,
  ageAt, bodyComposition, calculateGoals, exerciseCatalog, isDateKey,
  portionNutrition, scheduledExercise, todayKey, totals, unitLabel,
} from './core.js?v=18';
import { activityOptions } from './activity-guide.js?v=18';
import { workoutDayEnergy } from './exercise-energy.js?v=18';
import { goalForecast } from './goal-forecast.js?v=19';

const NUTRIENT_LABELS = {
  kcal:['Calories','kcal',0], protein:['Protein','g',1], carbs:['Carbohydrates','g',1], fat:['Fat','g',1],
  fiber:['Fiber','g',1], saturatedFat:['Saturated fat','g',1], sugar:['Total sugars','g',1],
  addedSugar:['Added sugars','g',1], sodium:['Sodium','mg',0],
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = (value, digits=1) => value == null || !Number.isFinite(Number(value)) ? '—'
  : Number(value).toLocaleString('en-US',{maximumFractionDigits:digits});
const dateLabel = date => isDateKey(date)
  ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date(`${date}T12:00:00Z`))
  : '—';
const shortDate = date => isDateKey(date)
  ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00Z`))
  : '—';
const choiceLabel = (choices,value) => choices.find(([key])=>key===value)?.[1] || String(value ?? 'Not set');
const range = (min,max=min) => Number(min)===Number(max) ? String(min) : `${min}–${max}`;
const joined = values => values.filter(Boolean).join(' · ');

function workoutPrescription(entry, exercise) {
  const target = `${range(entry.reps,entry.repsMax ?? entry.reps)} ${exercise.unit==='seconds'?'sec':exercise.unit==='minutes'?'min':'reps'}${exercise.unilateral?' / side':''}`;
  const work = exercise.unit==='minutes' && entry.sets===1 ? target : `${range(entry.sets,entry.setsMax ?? entry.sets)} sets × ${target}`;
  return joined([work,entry.load==null?null:`${number(entry.load,1)} kg`,entry.restSeconds?`${entry.restSeconds} sec rest`:null]);
}

function reportNutrients(values) {
  return ALL_NUTRIENTS.map(key=>{
    const [label,unit,digits]=NUTRIENT_LABELS[key],coverage=values?.coverage?.[key];
    const value=coverage?.total===0&&!['kcal','protein','carbs','fat'].includes(key)?null:values?.[key];
    const known = value==null ? '—' : `${number(value,digits)} ${unit}`;
    const note = coverage && coverage.total>0 && coverage.known<coverage.total
      ? coverage.known ? `${coverage.known}/${coverage.total} items had a value` : 'No saved values' : '';
    return `<div class="nutrient"><span>${label}</span><strong>${known}</strong>${note?`<small>${note}</small>`:''}</div>`;
  }).join('');
}

function profileDetails(profile,calculation,composition,generatedDate) {
  const activity=activityOptions(profile.activity).find(([factor])=>Number(factor)===Number(profile.activity))?.[1] || `Activity factor ${number(profile.activity,3)}`;
  const items=[
    ['Name',profile.name],['Date of birth',shortDate(profile.birthDate)],['Age on report date',`${ageAt(profile.birthDate,generatedDate)} years`],
    ['Formula sex',profile.sex==='female'?'Female':'Male'],['Height',`${number(profile.height,1)} cm`],['Activity setting',activity],
    ['Calorie setting',profile.calorieMode==='manual'?'Manual daily budget':'Use energy formula'],
    ['Current daily target',`${number(calculation.kcal)} kcal`],['Current RMR',`${number(calculation.rmr)} kcal/day`],['Current maintenance TDEE',`${number(calculation.tdee)} kcal/day`],
    ['Goal RMR',`${number(calculation.goalRmr)} kcal/day`],['Goal maintenance TDEE',`${number(calculation.goalTdee)} kcal/day`],
    ['Protein target setting',`${number(profile.proteinFactor,1)} g/kg`],['Fat target setting',`${number(profile.fatPercent,1)}% of calories`],
    ['Daily calorie deficit',`${number(profile.deficit,1)}%`],['Food objective',profile.objective],['Insulin-resistance setting',profile.insulinResistance?'On':'Off'],
    ['Goal mode',profile.goalMode==='composition'?'Body composition':'Scale weight'],
    ['Starting weight',`${number(profile.startWeight,1)} kg`],['Current profile weight',`${number(profile.weight,1)} kg`],
  ];
  if(profile.goalMode==='composition') items.push(
    ['Starting body fat',`${number(profile.startBodyFatPercent,1)}%`],['Current profile body fat',`${number(profile.bodyFatPercent,1)}%`],
    ['Goal body fat',`${number(profile.goalBodyFatPercent,1)}%`],['Starting skeletal muscle',`${number(profile.startMuscleMass,1)} kg`],
    ['Current profile skeletal muscle',`${number(profile.muscleMass,1)} kg`],['Goal skeletal muscle',`${number(profile.goalMuscleMass,1)} kg`],
    ['Estimated composition goal weight',composition.compositionGoalWeight==null?'—':`${number(composition.compositionGoalWeight,1)} kg`],
  );
  else items.push(['Goal weight',`${number(profile.goalWeight,1)} kg`]);
  items.push(['Daily macro targets',`${number(calculation.protein,1)} g protein · ${number(calculation.carbs,1)} g carbohydrates · ${number(calculation.fat,1)} g fat`]);
  return items;
}

export function buildJournalReport(state, generatedDate=todayKey()) {
  if(!state || typeof state!=='object' || !state.profile || !isDateKey(generatedDate)) throw new Error('The saved journal is not ready for a report.');
  const profile=state.profile,workouts=state.workouts||{days:{},notes:{},settings:{},exercises:[]};
  const foodDays=Object.entries(state.days||{}).filter(([,day])=>day && ((day.entries||[]).length || String(day.note||'').trim() || day.goals))
    .sort(([a],[b])=>a.localeCompare(b)).map(([date,day])=>{
      const entries=(day.entries||[]).map(entry=>{
        const consumed=portionNutrition(entry.food,entry.amount,entry.unit),unit=unitLabel(entry.food,entry.unit);
        return {...entry,consumed,portionLabel:`${number(entry.amount,2)} ${unit}${entry.amount>1&&entry.unit==='portion'&&!['tbsp','tsp','mL'].includes(unit)?'s':''} · ${number(consumed.grams,1)} g recorded portion`};
      });
      return {date,entries,total:totals(entries),goals:day.goals||calculateGoals(profile,date),goalSource:day.goals?'Saved targets':'Targets calculated from the current profile',note:String(day.note||'')};
    });
  const allFoodEntries=foodDays.flatMap(day=>day.entries),foodTotals=totals(allFoodEntries);
  const measurements=[...(state.weights||[])].sort((a,b)=>a.date.localeCompare(b.date));
  const workoutDays=Object.entries(workouts.days||{}).filter(([date,entries])=>entries?.length || Object.values(workouts.notes?.[date]||{}).some(value=>String(value||'').trim()))
    .sort(([a],[b])=>a.localeCompare(b)).map(([date,entries])=>{
      const energy=workoutDayEnergy({...state,workouts},date),note=workouts.notes?.[date]||{};
      return {date,note,weightKg:energy.weightKg,plannedKcal:energy.plannedKcal,completedKcal:energy.creditedKcal,
        entries:(entries||[]).map((entry,index)=>({entry,exercise:scheduledExercise(entry,workouts),estimate:energy.entries[index].estimate}))};
    });
  const completedEntries=workoutDays.flatMap(day=>day.entries).filter(item=>item.entry.completed);
  const allDates=[...foodDays.map(day=>day.date),...measurements.map(item=>item.date),...workoutDays.map(day=>day.date)].sort();
  const calculation=calculateGoals(profile,generatedDate),composition=bodyComposition(profile),forecast=state.profileReady===false?null:goalForecast(state,generatedDate);
  const savedFoods=Array.isArray(state.foods)?state.foods:[];
  const savedExercises=(workouts.exercises||[]).map(exercise=>({...exercise}));
  return {
    generatedDate,createdAt:String(state.createdAt||''),profile,calculation,composition,forecast,
    profileDetails:profileDetails(profile,calculation,composition,generatedDate),
    summary:{rangeStart:allDates[0]||null,rangeEnd:allDates.at(-1)||null,loggedFoodDays:Object.values(state.days||{}).filter(day=>day?.entries?.length).length,
      recordedFoodDays:foodDays.length,foodEntries:allFoodEntries.length,foodTotals,measurements:measurements.length,
      workoutDays:workoutDays.length,plannedExercises:workoutDays.reduce((sum,day)=>sum+day.entries.length,0),completedExercises:completedEntries.length,
      completedWorkoutDays:workoutDays.filter(day=>day.entries.some(item=>item.entry.completed)).length,
      completedExerciseKcal:completedEntries.reduce((sum,item)=>sum+item.estimate.kcal,0),savedFoods:savedFoods.length,savedExercises:savedExercises.length,
      intakeClosedThrough:state.intakeClosedThrough||null},
    foodDays,measurements,workoutDays,savedFoods,savedExercises,workoutSettings:workouts.settings||{},workoutTemplate:workouts.template||null,
  };
}

function profileMarkup(report) {
  return `<section class="section"><h2>Current profile, goals & targets</h2><div class="details-grid">${report.profileDetails.map(([label,value])=>`<div class="detail"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div><p class="note">Profile and goal values are the settings saved when this report was created. Dated measurements below preserve what was recorded on each date.</p></section>`;
}

function estimateText(value) {
  if(['estimated','reached'].includes(value?.status)&&Number.isFinite(value.days)) {
    if(value.days===0)return 'Goal reached';
    return `${number(value.days,0)} days · about ${dateLabel(value.date)}`;
  }
  return ({insufficient:'More data needed',stale:'Recent measurement needed',away:'Trend moves away from goal',stalled:'Trend is too flat to estimate',beyond_horizon:'Beyond the 3-year estimate window',invalid:'Check the estimate inputs'}[value?.status]||'No estimate');
}

function goalTimelineMarkup(report) {
  const forecast=report.forecast;
  if(!forecast)return `<section class="section"><h2>Goal timeline</h2><p class="empty">Set up a profile to calculate the goal timeline.</p></section>`;
  const historyRows=forecast.history.metrics.map(metric=>`<tr><td>${esc(metric.label)}</td><td>${number(metric.current,1)} → ${number(metric.target,1)} ${esc(metric.unit)}</td><td>${esc(estimateText(metric))}</td><td>${Number.isFinite(metric.ratePerWeek)?`${metric.ratePerWeek>0?'+':''}${number(metric.ratePerWeek,3)} ${metric.key==='bodyFatPercent'?'percentage points':'kg'} / week`:'—'}</td><td>${metric.points?`${number(metric.points,0)} readings · ${number(metric.spanDays,0)} days`:'—'}</td></tr>`).join('');
  const assumptions=[['Starting daily intake',`${number(forecast.defaults.calories)} kcal`],['Intake source',forecast.intake.source==='history'?`Average of ${number(forecast.intake.days,0)} closed logged days`:'Saved profile budget'],['Typical activity',`${number(forecast.defaults.activity,3)} factor`],['Extra exercise average',forecast.defaults.activity===1.2?`${number(forecast.defaults.exerciseKcalPerDay)} kcal/day`:'Included in activity factor'],['Assumed muscle change',forecast.defaults.muscleRatePerWeek==null?'Not specified':`${number(forecast.defaults.muscleRatePerWeek,3)} kg/week`]];
  const scenarioRows=forecast.scenario.metrics.map(metric=>`<tr><td>${esc(metric.label)}</td><td>${number(metric.current,1)} → ${number(metric.target,1)} ${esc(metric.unit)}</td><td>${esc(estimateText(metric))}</td></tr>`).join('');
  return `<section class="section page-start"><h2>Goal timeline &amp; saved scenario</h2><div class="record-day"><div class="day-heading"><div><h3>Measured-history estimate</h3><p>Based on dated measurements as of ${esc(dateLabel(forecast.asOf))}</p></div><strong>${esc(estimateText(forecast.history))}</strong></div><p class="note">${esc(forecast.history.reason||'Uses the recent measured trend; it is an estimate, not a deadline.')}</p><table><thead><tr><th>Goal</th><th>Current → target</th><th>Timeline</th><th>Measured pace</th><th>Data</th></tr></thead><tbody>${historyRows}</tbody></table></div><div class="record-day"><div class="day-heading"><div><h3>What-if estimate from saved settings</h3><p>This uses the starting assumptions shown below, not unsaved changes to the interactive controls.</p></div><strong>${esc(estimateText(forecast.scenario))}</strong></div><p class="note">${esc(forecast.scenario.reason||'Energy-model estimate; real energy needs and measurement changes vary.')}</p><div class="details-grid">${assumptions.map(([label,value])=>`<div class="detail"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div><table><thead><tr><th>Goal</th><th>Current → target</th><th>Scenario timeline</th></tr></thead><tbody>${scenarioRows}</tbody></table></div></section>`;
}

function foodHistoryMarkup(report) {
  if(!report.foodDays.length) return `<section class="section"><h2>Food history</h2><p class="empty">No dated food entries or day notes are saved.</p></section>`;
  return `<section class="section"><h2>Food history</h2>${report.foodDays.map(day=>`<article class="record-day"><div class="day-heading"><div><h3>${esc(dateLabel(day.date))}</h3><p>${day.entries.length} food ${day.entries.length===1?'entry':'entries'}</p></div><strong>${number(day.total.kcal)} kcal</strong></div><div class="nutrient-grid">${reportNutrients(day.total)}</div><p class="targets"><strong>${esc(day.goalSource)}:</strong> ${number(day.goals.kcal)} kcal · ${number(day.goals.protein,1)} g protein · ${number(day.goals.carbs,1)} g carbohydrates · ${number(day.goals.fat,1)} g fat</p>${day.note?`<p class="user-note"><strong>Day note:</strong> ${esc(day.note)}</p>`:''}${day.entries.length?day.entries.map(item=>`<div class="food-entry"><div class="entry-heading"><strong>${esc(item.food.name)}</strong><span>${esc(item.meal)} · ${esc(item.food.category)}</span></div><p class="entry-portion">${esc(item.portionLabel)}</p><div class="nutrient-grid">${reportNutrients(item.consumed)}</div>${item.food.note?`<p class="entry-note"><strong>Saved food note:</strong> ${esc(item.food.note)}</p>`:''}</div>`).join(''):'<p class="empty">No food portions were entered for this date.</p>'}</article>`).join('')}</section>`;
}

function measurementMarkup(report) {
  return `<section class="section page-start"><h2>Measurement history</h2><p class="note">${report.measurements.length} dated record${report.measurements.length===1?'':'s'} · weight, body fat and skeletal muscle values are shown exactly as saved.</p>${report.measurements.length?`<table><thead><tr><th>Date</th><th>Weight</th><th>Body fat</th><th>Skeletal muscle</th></tr></thead><tbody>${report.measurements.map(item=>`<tr><td>${esc(dateLabel(item.date))}</td><td>${number(item.weight,1)} kg</td><td>${item.bodyFatPercent==null?'—':`${number(item.bodyFatPercent,1)}%`}</td><td>${item.muscleMass==null?'—':`${number(item.muscleMass,1)} kg`}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">No dated measurements are saved.</p>'}</section>`;
}

function workoutMarkup(report) {
  const settings=report.workoutSettings,template=report.workoutTemplate;
  const preferenceRows=[['Training purpose',choiceLabel(WORKOUT_GOALS,settings.goal)],['Experience',choiceLabel(WORKOUT_EXPERIENCE,settings.experience)],['Equipment',choiceLabel(WORKOUT_EQUIPMENT,settings.equipment)],['Repeat routine weekly',settings.autoRepeat?'Yes':'No']];
  const routine=template?`<div class="routine"><h3>Saved repeating routine</h3><p>${esc(template.config)}</p>${template.days.map((entries,index)=>`<p><strong>${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][index]}:</strong> ${entries.length?entries.map(entry=>esc(scheduledExercise(entry,{exercises:report.savedExercises}).name)).join(', '):'Rest day'}</p>`).join('')}</div>`:'';
  const records=report.workoutDays.length?report.workoutDays.map(day=>`<article class="record-day"><div class="day-heading"><div><h3>${esc(dateLabel(day.date))}</h3><p>${day.entries.filter(item=>item.entry.completed).length} of ${day.entries.length} exercises completed</p></div><strong>${number(day.completedKcal)} kcal completed estimate</strong></div>${day.note.title?`<p class="user-note"><strong>Session:</strong> ${esc(day.note.title)}</p>`:''}${day.note.goal?`<p class="user-note"><strong>Session goal:</strong> ${esc(day.note.goal)}</p>`:''}${day.note.note?`<p class="user-note"><strong>Session note:</strong> ${esc(day.note.note)}</p>`:''}${day.entries.map(item=>`<div class="workout-entry"><div class="entry-heading"><strong>${esc(item.exercise.name)}</strong><span class="${item.entry.completed?'completed':'planned'}">${item.entry.completed?'Completed':'Planned'}</span></div><p class="entry-portion">${esc(joined([item.exercise.group,choiceLabel(WORKOUT_EQUIPMENT,item.exercise.equipment),workoutPrescription(item.entry,item.exercise)]))}</p><p class="entry-portion">Estimated ${number(item.estimate.kcal)} kcal · ${number(item.estimate.activeMinutes,1)} active min · based on ${number(item.estimate.weightKg,1)} kg body weight${item.estimate.custom?' · saved calorie calibration':` · ${number(item.estimate.met,1)} MET estimate`}</p>${item.entry.note?`<p class="entry-note"><strong>Exercise note:</strong> ${esc(item.entry.note)}</p>`:''}</div>`).join('')||'<p class="empty">Session notes saved without exercises.</p>'}</article>`).join(''):'<p class="empty">No workout dates are saved.</p>';
  const library=report.savedExercises.length?`<div class="library"><h3>Saved or customized exercises</h3>${report.savedExercises.map(exercise=>`<article class="workout-entry"><div class="entry-heading"><strong>${esc(exercise.name)}</strong><span>${exercise.archived?'Archived':'In library'}</span></div><p class="entry-portion">${esc(joined([exercise.group,exercise.muscles,choiceLabel(WORKOUT_EQUIPMENT,exercise.equipment),`${number(exercise.sets,0)} sets × ${number(exercise.reps,0)} ${exercise.unit}`,`${number(exercise.restSeconds,0)} sec rest`]))}</p>${exercise.instructions?`<p>${esc(exercise.instructions)}</p>`:''}${exercise.cue?`<p>${esc(exercise.cue)}</p>`:''}${exercise.feel?`<p><strong>Should feel:</strong> ${esc(exercise.feel)}</p>`:''}${exercise.easier?`<p><strong>Make easier:</strong> ${esc(exercise.easier)}</p>`:''}${exercise.avoid?`<p><strong>Avoid:</strong> ${esc(exercise.avoid)}</p>`:''}${exercise.energy?`<p><strong>Saved calorie reference:</strong> ${number(exercise.energy.kcal)} kcal · ${number(exercise.energy.weightKg,1)} kg · ${number(exercise.energy.activeMinutes,1)} active minutes</p>`:''}</article>`).join('')}</div>`:'';
  return `<section class="section page-start"><h2>Workout history & plan</h2><div class="details-grid">${preferenceRows.map(([label,value])=>`<div class="detail"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div><p class="note">Exercise calorie numbers are estimates from the saved targets and the body weight recorded for that date, or the profile weight when no earlier record exists.</p>${routine}${records}${library}</section>`;
}

function foodLibraryMarkup(report) {
  return `<section class="section page-start"><h2>Saved food library</h2><p class="note">Nutrition label values are stored per 100 g. This appendix also preserves the saved portion, notes and source for each food.</p>${report.savedFoods.length?report.savedFoods.map(food=>`<article class="food-entry"><div class="entry-heading"><strong>${esc(food.name)}</strong><span>${esc(food.category)} · ${food.favorite?'Favorite':'Not favorite'} · ${food.verified?'Verified label':'Editable estimate'}</span></div><p class="entry-portion">1 ${esc(food.portionUnit)} · ${number(food.portionGrams,1)} g</p><div class="nutrient-grid">${reportNutrients(food)}</div>${food.note?`<p class="entry-note"><strong>Food note:</strong> ${esc(food.note)}</p>`:''}${food.nutrientNote?`<p class="entry-note"><strong>Nutrient source note:</strong> ${esc(food.nutrientNote)}</p>`:''}${food.source?`<p class="entry-note"><strong>Source:</strong> ${esc(food.source)}</p>`:''}${food.nutrientSource?`<p class="entry-note"><strong>Additional nutrient source:</strong> ${esc(food.nutrientSource)}</p>`:''}</article>`).join(''):'<p class="empty">No saved foods are in the library.</p>'}</section>`;
}

function summaryMarkup(report) {
  const summary=report.summary,rangeText=summary.rangeStart?`${shortDate(summary.rangeStart)} – ${shortDate(summary.rangeEnd)}`:'No dated records';
  const cards=[['History date range',rangeText],['Food log dates',number(summary.loggedFoodDays,0)],['Food entries',number(summary.foodEntries,0)],['Calories recorded',`${number(summary.foodTotals.kcal)} kcal`],['Protein recorded',`${number(summary.foodTotals.protein,1)} g`],['Carbohydrates recorded',`${number(summary.foodTotals.carbs,1)} g`],['Fat recorded',`${number(summary.foodTotals.fat,1)} g`],['Measurements',number(summary.measurements,0)],['Workout dates',number(summary.workoutDays,0)],['Completed exercises',`${number(summary.completedExercises,0)} / ${number(summary.plannedExercises,0)}`],['Completed exercise estimate',`${number(summary.completedExerciseKcal)} kcal`],['Food logging confirmed through',summary.intakeClosedThrough?shortDate(summary.intakeClosedThrough):'Not marked'],['Saved foods',number(summary.savedFoods,0)]];
  return `<div class="summary-grid">${cards.map(([label,value])=>`<div class="summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div><div class="summary-nutrients"><h2>All food entries combined</h2><div class="nutrient-grid">${reportNutrients(summary.foodTotals)}</div></div>`;
}

export function renderJournalReport(state,{generatedDate=todayKey(),baseURL=''}={}) {
  const report=buildJournalReport(state,generatedDate),summary=report.summary;
  const base=baseURL?`<base href="${esc(baseURL)}">`:'';
  const recordDates=summary.rangeStart?`${shortDate(summary.rangeStart)} – ${shortDate(summary.rangeEnd)}`:'No dated food, measurement or workout records';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Balance history report · ${esc(report.generatedDate)}</title>${base}<style>
    *{box-sizing:border-box}body{margin:0;background:#f4f6f2;color:#25342d;font:14px/1.55 Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px max(20px,calc((100vw - 900px)/2));background:#fff;border-bottom:1px solid #d7ded6}.toolbar p{margin:0;color:#55655a;font-size:12px}.toolbar button{padding:10px 15px;border:0;border-radius:7px;background:#1d5145;color:white;font:600 13px Arial,sans-serif;cursor:pointer}.report{max-width:900px;margin:28px auto;padding:38px;background:#fff;box-shadow:0 4px 24px #25342d14}.report-header{border-bottom:2px solid #dce7dc;padding-bottom:22px}.kicker{margin:0 0 5px;color:#39735b;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase}h1{margin:0;font:400 31px/1.2 Georgia,serif}h2{margin:24px 0 12px;font:600 19px/1.3 Georgia,serif;color:#1d5145}h3{margin:0;font-size:15px;line-height:1.35}.subtitle,.note,.empty{color:#65736a}.subtitle{margin:8px 0 0}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:20px}.summary-card,.detail{border:1px solid #dfe6dd;border-radius:7px;padding:10px}.summary-card span,.detail span{display:block;color:#647268;font-size:10px}.summary-card strong,.detail strong{display:block;margin-top:4px;font-size:12px;overflow-wrap:anywhere}.summary-nutrients{margin-top:16px}.section{margin-top:26px}.section>h2:first-child{margin-top:0}.details-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.detail{min-height:52px}.note,.targets,.entry-note,.entry-portion,.user-note{font-size:11px}.targets{padding:8px 10px;background:#f3f7f1;border-radius:5px}.record-day{margin:14px 0 0;padding:14px;border:1px solid #dfe6dd;border-radius:8px;break-inside:auto}.day-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:8px;break-after:avoid}.day-heading>strong{white-space:nowrap}.day-heading p{margin:3px 0 0;color:#65736a;font-size:11px}.nutrient-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.nutrient{min-width:0;padding:6px 7px;background:#f7f9f6;border-radius:4px}.nutrient span{display:block;color:#65736a;font-size:9px}.nutrient strong{display:block;font-size:11px;overflow-wrap:anywhere}.nutrient small{display:block;color:#7a6850;font-size:8px;line-height:1.3}.food-entry,.workout-entry{margin-top:9px;padding:10px;border-left:3px solid #dce7dc;background:#fbfcfa;break-inside:avoid}.entry-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.entry-heading>span{color:#65736a;font-size:10px;text-align:right}.entry-portion{margin:4px 0 7px;color:#58665d}.entry-note,.user-note{margin:7px 0 0;color:#526158}.completed{color:#28714c!important;font-weight:700}.planned{color:#8b6840!important;font-weight:700}.routine,.library{margin-top:18px}.routine{padding:12px;background:#f7f9f6}.routine p{margin:5px 0;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}th,td{padding:8px;border-bottom:1px solid #dfe6dd;text-align:left;vertical-align:top}th{background:#f3f7f1;color:#405148;font-size:10px}.section h2,.record-day h3{break-after:avoid}.page-start{break-before:page}.end-note{margin-top:26px;padding-top:10px;border-top:1px solid #dfe6dd;color:#65736a;font-size:10px}
    @media(max-width:700px){.report{margin:0;padding:20px}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.details-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nutrient-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.toolbar{padding:10px 14px}}
    @page{size:A4;margin:13mm}@media print{body{background:#fff;font-size:9pt}.toolbar{display:none}.report{max-width:none;margin:0;padding:0;box-shadow:none}.summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.details-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.nutrient-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.section{margin-top:18px}.page-start{break-before:page}.record-day{padding:9px}.food-entry,.workout-entry{padding:7px}.record-day,.food-entry,.workout-entry{break-inside:auto}.summary-card,.detail,.nutrient{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}
  </style></head><body><div class="toolbar"><p>To create a PDF, choose <strong>Save as PDF</strong> in the print dialog. The report covers ${esc(recordDates)}.</p><button id="print-report" type="button">Print / save as PDF</button></div><main class="report"><header class="report-header"><p class="kicker">Daily Balance · Personal journal</p><h1>Complete history report</h1><p class="subtitle">${esc(report.profile.name)} · Created ${esc(dateLabel(report.generatedDate))}</p><p class="subtitle">Includes current profile and goals, measured-history and saved-settings goal estimates, dated food and measurement history, all workout records, and saved food and exercise details.</p>${summaryMarkup(report)}</header>${profileMarkup(report)}${goalTimelineMarkup(report)}${foodHistoryMarkup(report)}${measurementMarkup(report)}${workoutMarkup(report)}${foodLibraryMarkup(report)}<p class="end-note">Nutrition and exercise energy values are estimates from the data saved in this journal. Missing values are shown as —. Use the original journal backup when you need a restorable copy of the data.</p></main></body></html>`;
}

export function exportJournalReportPDF(state) {
  const printWindow=window.open('','_blank');
  if(!printWindow)return false;
  try {
    const html=renderJournalReport(state,{baseURL:new URL('.',window.location.href).href});
    let printed=false;
    const print=()=>{if(printed||printWindow.closed)return;printed=true;printWindow.focus();printWindow.print();};
    printWindow.addEventListener('load',print,{once:true});
    printWindow.document.open();printWindow.document.write(html);printWindow.document.close();
    printWindow.document.querySelector('#print-report')?.addEventListener('click',print);
    setTimeout(print,350);
    return true;
  } catch {
    printWindow.close();
    return false;
  }
}
