import {
  ageAt, calculateGoals, closedIntakeThrough, isDateKey, shiftDate, todayKey,
  totals, validateProfile,
} from './core.js?v=18';
import { workoutDayEnergy } from './exercise-energy.js?v=18';

const MAX_DAYS = 1095;
const HISTORY_DAYS = 90;
const INTAKE_DAYS = 28;
const KCAL_PER_KG = 7700;
const DAY_MS = 86400000;
const dayNumber = date => Date.parse(`${date}T12:00:00Z`) / DAY_MS;
const optional = value => value === null || value === undefined || value === '' ? null : Number(value);
const direction = (start, target, current, key) => Math.sign(target - start) || (key==='muscleMass'?1:key==='bodyFatPercent'?-1:Math.sign(target-current));
const reached = (current, target, sign) => !sign ? Math.abs(current - target) < 0.05 : sign * (current - target) >= -1e-8;
const dated = (days, today) => ({ days, date: days === null ? null : shiftDate(today, days) });
const statusPriority = ['invalid', 'insufficient', 'stale', 'away', 'stalled', 'beyond_horizon'];

function combine(metrics, today) {
  if (metrics.every(metric => metric.status === 'reached')) return { status:'reached', ...dated(0,today) };
  if (metrics.every(metric => ['reached','estimated'].includes(metric.status))) {
    return { status:'estimated', ...dated(Math.max(...metrics.map(metric => metric.days)),today) };
  }
  return { status:statusPriority.find(status => metrics.some(metric => metric.status === status)) || 'insufficient', ...dated(null,today) };
}

function metricDefinitions(p) {
  return p.goalMode === 'composition'
    ? [
      {key:'bodyFatPercent',label:'Body fat',unit:'%',current:p.bodyFatPercent,target:p.goalBodyFatPercent,start:p.startBodyFatPercent},
      {key:'muscleMass',label:'Skeletal muscle',unit:'kg',current:p.muscleMass,target:p.goalMuscleMass,start:p.startMuscleMass},
    ]
    : [{key:'weight',label:'Scale weight',unit:'kg',current:p.weight,target:p.goalWeight,start:p.startWeight}];
}

function historyMetric(definition, measurements, today) {
  const points = measurements.filter(record => Number.isFinite(record[definition.key]));
  const first = points[0], last = points.at(-1);
  const spanDays = points.length > 1 ? dayNumber(last.date) - dayNumber(first.date) : 0;
  const metric = {...definition,ratePerWeek:null,rateUsable:false,points:points.length,spanDays,lastDate:last?.date || null,status:'insufficient',...dated(null,today)};
  if (points.length >= 3 && spanDays >= 14) {
    const xs = points.map(record => dayNumber(record.date) - dayNumber(first.date));
    const ys = points.map(record => record[definition.key]);
    const meanX = xs.reduce((sum,value)=>sum+value,0) / xs.length;
    const meanY = ys.reduce((sum,value)=>sum+value,0) / ys.length;
    const denominator = xs.reduce((sum,value)=>sum+(value-meanX)**2,0);
    const slope = xs.reduce((sum,value,index)=>sum+(value-meanX)*(ys[index]-meanY),0) / denominator;
    metric.ratePerWeek = slope * 7;
    metric.rateUsable = dayNumber(today)-dayNumber(last.date)<=28;
  }
  const sign = direction(definition.start,definition.target,definition.current,definition.key);
  if (last && Math.abs(last[definition.key]-definition.current)>0.05) return {...metric,rateUsable:false,reason:'Your current profile reading differs from the latest dated measurement. Log your current measurements to refresh the history estimate.'};
  if (reached(definition.current,definition.target,sign)) return {...metric,status:'reached',...dated(0,today)};
  if (metric.ratePerWeek === null) return metric;
  if (dayNumber(today) - dayNumber(last.date) > 28) return {...metric,status:'stale'};
  if (Math.abs(metric.ratePerWeek) < 0.001) return {...metric,status:'stalled'};
  if (sign * metric.ratePerWeek <= 0) return {...metric,status:'away'};
  const days = Math.ceil(Math.abs((definition.target - definition.current) / metric.ratePerWeek) * 7);
  if (days > MAX_DAYS) return {...metric,status:'beyond_horizon'};
  return {...metric,status:'estimated',...dated(days,today)};
}

function context(state, today) {
  if (!isDateKey(today)) throw new Error('Choose a valid forecast date.');
  const profile = validateProfile(state?.profile);
  const goals = calculateGoals(profile,today);
  const from = shiftDate(today,-HISTORY_DAYS+1);
  // One real reading per date. A profile value is never invented as a dated reading.
  const unique = new Map();
  for (const record of state.weights || []) {
    if (isDateKey(record?.date) && record.date <= today && record.date >= from) unique.set(record.date,record);
  }
  const measurements = [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const metrics = metricDefinitions(profile).map(definition=>historyMetric(definition,measurements,today));
  let history = {...combine(metrics,today),metrics,windowDays:HISTORY_DAYS};
  if (profile.goalMode==='composition' && history.status==='estimated') {
    const reverses = metrics.some(metric=>metric.rateUsable && !reached(
      metric.current+metric.ratePerWeek*history.days/7,metric.target,
      direction(metric.start,metric.target,metric.current,metric.key)));
    if (reverses) history = {...history,status:'away',...dated(null,today),reason:'The measured trends do not keep both goal thresholds reached on the same projected day. One reading would move back beyond its target before the other goal is reached.'};
  }
  const intakeStart = shiftDate(today,-INTAKE_DAYS);
  const closedThrough = closedIntakeThrough(state,today);
  const foodDays = Object.entries(state.days || {})
    .filter(([date,day])=>isDateKey(date) && date>=intakeStart && date<today && closedThrough && date<=closedThrough && day?.entries?.length)
    .sort(([a],[b])=>a.localeCompare(b));
  const averageIntake = foodDays.length ? foodDays.reduce((sum,[,day])=>sum+totals(day.entries).kcal,0)/foodDays.length : null;
  const intake = {
    source:foodDays.length>=7?'history':'settings',
    kcal:foodDays.length>=7?averageIntake:goals.kcal,
    days:foodDays.length,windowDays:INTAKE_DAYS,
    firstDate:foodDays[0]?.[0] || null,lastDate:foodDays.at(-1)?.[0] || null,
  };
  let exerciseTotal = 0;
  {
    for (const [date,entries] of Object.entries(state.workouts?.days || {})) {
      if (isDateKey(date) && date>=intakeStart && date<today && entries.some(entry=>entry.completed)) exerciseTotal+=workoutDayEnergy(state,date).creditedKcal;
    }
  }
  const muscle = metrics.find(metric=>metric.key==='muscleMass');
  const muscleRatePerWeek = muscle?.status==='reached'?0:muscle && ['estimated','stalled','away'].includes(muscle.status) && muscle.rateUsable ? Number(muscle.ratePerWeek.toFixed(6)) : null;
  const limits = {
    minCalories:Math.max(profile.sex==='male'?1500:1200,Math.ceil(goals.protein*4/(1-profile.fatPercent/100))),
    maxCalories:4000,maxDays:MAX_DAYS,minMuscleRate:-0.5,maxMuscleRate:0.5,
  };
  const defaults = {
    calories:Number(intake.kcal.toFixed(4)),activity:profile.activity,muscleRatePerWeek,
    exerciseKcalPerDay:exerciseTotal/INTAKE_DAYS,
  };
  return {profile,mode:profile.goalMode,asOf:today,history,intake,limits,defaults};
}

function projectedTdee(profile,date,activity,exerciseKcalPerDay,weight,bodyFatPercent) {
  const rmr = profile.goalMode === 'composition'
    ? 370+21.6*weight*(1-bodyFatPercent/100)
    : 10*weight+6.25*profile.height-5*ageAt(profile.birthDate,date)+(profile.sex==='male'?5:-161);
  return rmr*activity+(activity===1.2?exerciseKcalPerDay:0);
}

function modelScenario(ctx, options, today) {
  const {profile,limits} = ctx;
  const input = {...ctx.defaults,...options};
  const calories = Number(input.calories), activity = Number(input.activity);
  const rawExercise = Number(input.exerciseKcalPerDay);
  const muscleRatePerWeek = optional(input.muscleRatePerWeek);
  const exerciseKcalPerDay = activity===1.2?rawExercise:0;
  const definitions = metricDefinitions(profile);
  const metrics = definitions.map(definition=>({
    ...definition,ratePerWeek:definition.key==='muscleMass'?muscleRatePerWeek:null,
    points:0,spanDays:0,lastDate:today,status:'insufficient',...dated(null,today),
  }));
  const result = {status:'insufficient',...dated(null,today),metrics,calories,activity,muscleRatePerWeek,
    exerciseKcalPerDay,currentTdee:null,dailyBalanceKcal:null,trajectory:[],reason:null};
  const invalid = reason => ({...result,status:'invalid',reason});
  if (input.calories==='' || input.calories===null || !Number.isFinite(calories) || calories<limits.minCalories || calories>limits.maxCalories) return invalid(`Use ${limits.minCalories}–${limits.maxCalories} kcal for this scenario. The minimum retains the tracker’s energy and macro guardrails.`);
  if (input.activity==='' || input.activity===null || !Number.isFinite(activity) || activity<1.2 || activity>1.9) return invalid('Choose an activity factor between 1.20 and 1.90.');
  if (activity===1.2 && (input.exerciseKcalPerDay==='' || input.exerciseKcalPerDay===null || !Number.isFinite(rawExercise) || rawExercise<0 || rawExercise>1000)) return invalid('Use 0–1,000 kcal per day for the separately logged net exercise estimate.');
  if (profile.goalMode==='composition' && muscleRatePerWeek!==null && (!Number.isFinite(muscleRatePerWeek) || muscleRatePerWeek<limits.minMuscleRate || muscleRatePerWeek>limits.maxMuscleRate)) return invalid('Use an assumed skeletal-muscle change between −0.5 and +0.5 kg per week.');
  let weight = profile.weight;
  let fatMass = profile.goalMode==='composition'?weight*profile.bodyFatPercent/100:null;
  let muscle = profile.goalMode==='composition'?profile.muscleMass:null;
  const otherLean = profile.goalMode==='composition'?weight-fatMass-muscle:null;
  const signFor = definition=>direction(definition.start,definition.target,definition.current,definition.key);
  const currentFor = definition=>definition.key==='weight'?weight:definition.key==='muscleMass'?muscle:fatMass/weight*100;
  const isReached = definition=>reached(currentFor(definition),definition.target,signFor(definition));
  const muscleDefinition = definitions.find(definition=>definition.key==='muscleMass');
  const missingMuscleRate = muscleDefinition && !isReached(muscleDefinition) && muscleRatePerWeek===null;
  result.currentTdee = projectedTdee(profile,today,activity,exerciseKcalPerDay,weight,profile.bodyFatPercent);
  result.dailyBalanceKcal = result.currentTdee-calories;
  let terminated = false;
  for (let day=0;day<=MAX_DAYS;day++) {
    for (let index=0;index<definitions.length;index++) {
      if (metrics[index].days===null && isReached(definitions[index])) {
        metrics[index]={...metrics[index],status:day===0?'reached':'estimated',...dated(day,today)};
      }
    }
    const allReached = definitions.every(isReached);
    if (day%7===0 || allReached || day===MAX_DAYS) result.trajectory.push({day,weight,bodyFatPercent:fatMass===null?null:fatMass/weight*100,muscleMass:muscle});
    if (allReached) return {...result,status:day===0?'reached':'estimated',...dated(day,today)};
    if (day===MAX_DAYS) break;
    const date = shiftDate(today,day);
    const tdee = projectedTdee(profile,date,activity,exerciseKcalPerDay,weight,fatMass===null?null:fatMass/weight*100);
    const massChange = (calories-tdee)/KCAL_PER_KG;
    if (profile.goalMode==='weight') {
      weight+=massChange;
    } else {
      // Calories approximate a fat-energy change only. Muscle change is an
      // independent user assumption, with no calorie-to-muscle conversion.
      fatMass+=massChange;
      if (!isReached(muscleDefinition) && muscleRatePerWeek!==null) {
        const next = muscle+muscleRatePerWeek/7;
        const sign = signFor(muscleDefinition);
        muscle = sign*(next-muscleDefinition.target)>=-1e-8 && sign*muscleRatePerWeek>0 ? muscleDefinition.target : next;
      }
      weight=fatMass+otherLean+muscle;
    }
    const fat = fatMass===null?null:fatMass/weight*100;
    if (!Number.isFinite(weight) || weight<30 || weight>250 || (fat!==null && (fat<3 || fat>65 || muscle<1 || muscle>weight-fatMass))) {
      terminated = true;
      break;
    }
  }
  for (let index=0;index<metrics.length;index++) {
    if (metrics[index].days!==null) continue;
    const definition = definitions[index], sign = signFor(definition);
    if (definition.key==='muscleMass') {
      metrics[index].status = muscleRatePerWeek===null?'insufficient':Math.abs(muscleRatePerWeek)<0.001?'stalled':sign*muscleRatePerWeek<=0?'away':'beyond_horizon';
    } else {
      const change = currentFor(definition)-definition.current;
      metrics[index].status = Math.abs(change)<0.01?'stalled':sign*change<0?'away':'beyond_horizon';
    }
  }
  const unresolved = combine(metrics,today);
  // Individual first crossings are not enough: both composition thresholds
  // must hold on the same modeled day. A reversing path gets no combined ETA.
  const status = missingMuscleRate?'insufficient':unresolved.days!==null?'beyond_horizon':unresolved.status;
  const reason = missingMuscleRate
    ? 'A muscle-growth rate cannot be inferred from calories or activity. Enter an assumed weekly muscle change, or log enough recent muscle measurements.'
    : terminated
      ? 'The modeled path leaves the tracker’s body-size or composition bounds before all goals are reached.'
      : status==='beyond_horizon'
        ? profile.goalMode==='composition'?'Both goal thresholds are not reached together within the 3-year projection horizon. An energy plateau can prevent a goal at fixed intake.':'The goal is not reached within the 3-year projection horizon. An energy plateau can prevent a goal at fixed intake.'
        : status==='away'
          ? 'At least one modeled measurement moves away from its goal with these assumptions.'
          : status==='stalled'
            ? 'At least one modeled measurement does not make enough progress toward its goal with these assumptions.'
            : 'More measurements or an explicit muscle-change assumption are needed.';
  return {...result,status,...dated(null,today),reason};
}

/** Read-only estimates. No dates or scenario values are stored in the journal. */
export function goalForecast(state, today=todayKey()) {
  const ctx = context(state,today);
  const {profile,...summary} = ctx;
  return {...summary,scenario:modelScenario(ctx,{},today)};
}

export function forecastScenario(state, options={}, today=todayKey()) {
  return modelScenario(context(state,today),options,today);
}
