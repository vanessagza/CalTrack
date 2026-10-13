import {isDateKey,scheduledExercise,calculateGoals,totals} from './core.js?v=11';

// Planning assumptions informed by activity categories in the Adult Compendium.
// METs describe average intensity, not measured energy for an individual lift.
// Repetition pace is seconds for one complete controlled repetition.
const PRESETS={
  'squat':[3.8,4], 'reverse-lunge':[3.8,4], 'glute-bridge':[3,3], 'calf-raise':[3,3],
  'incline-push-up':[3.8,3], 'push-up':[6,3], 'prone-w-raise':[2.8,3],
  'dead-bug':[2.8,4], 'bird-dog':[2.8,4], 'plank':[3,0],
  'goblet-squat':[5,4], 'dumbbell-rdl':[5,4], 'dumbbell-press':[3.5,3],
  'dumbbell-row':[3.5,3], 'shoulder-press':[3.5,3], 'lateral-raise':[3,3],
  'biceps-curl':[3,3], 'leg-press':[5,4], 'lat-pulldown':[3.5,3],
  'cable-row':[3.5,3], 'chest-press':[3.5,3], 'leg-curl':[3,3],
  'hip-abduction':[2.8,3], 'wall-push-up':[2.8,3], 'bent-over-row':[3.5,3],
  'modified-side-plank':[2.8,0], 'walking':[2.8,0], 'mobility':[2.3,0],
};
const TYPES={
  'Lower body':[3.8,4], 'Upper push':[3.5,3], 'Upper pull':[3.5,3],
  'Core':[2.8,4], 'Cardio':[3.5,3], 'Mobility':[2.3,4],
};
export function exerciseEnergyAssumptions(exercise) {
  const values=PRESETS[exercise.id]||TYPES[exercise.group];
  if(!values||!['reps','seconds','minutes'].includes(exercise.unit))throw new Error('Choose a valid exercise type and target unit.');
  return {met:values[0],secondsPerRep:values[1],typeBased:!PRESETS[exercise.id]};
}
export function exerciseEnergy(entry,exercise,weightKg) {
  if(!Number.isFinite(weightKg)||weightKg<30||weightKg>250)throw new Error('Enter a body weight between 30 and 250 kg.');
  const sets=Number(entry.sets),setsMax=Number(entry.setsMax??sets),target=Number(entry.reps),targetMax=Number(entry.repsMax??target);
  const maxTarget=exercise.unit==='minutes'?240:exercise.unit==='seconds'?300:100;
  if(![sets,setsMax,target,targetMax].every(Number.isInteger)||sets<1||setsMax<sets||setsMax>10||target<1||targetMax<target||targetMax>maxTarget)throw new Error('Enter valid sets and targets to estimate calories.');
  const assumptions=exerciseEnergyAssumptions(exercise);
  const averageSets=(sets+setsMax)/2,averageTarget=(target+targetMax)/2,sides=exercise.unilateral?2:1;
  const targetSeconds=exercise.unit==='minutes'?60:exercise.unit==='seconds'?1:assumptions.secondsPerRep;
  const activeMinutes=averageSets*averageTarget*sides*targetSeconds/60;
  // Subtract one resting MET; count active time only, without rest/warm-up credit.
  const kcal=(assumptions.met-1)*3.5*weightKg/200*activeMinutes;
  return {...assumptions,weightKg,averageSets,averageTarget,sides,activeMinutes,kcal,
    usesRange:setsMax!==sets||targetMax!==target};
}
export function exerciseWeightForDate(state,date) {
  if(!isDateKey(date))throw new Error('Choose a valid exercise date.');
  let latest=null;
  for(const record of state.weights||[])if(record.date<=date&&(!latest||record.date>latest.date))latest=record;
  return latest?.weight??((state.weights||[]).length?(state.profile.startWeight??state.profile.weight):state.profile.weight);
}
export function workoutDayEnergy(state,date) {
  const weightKg=exerciseWeightForDate(state,date);
  const entries=(state.workouts.days[date]||[]).map(entry=>{
    const exercise=scheduledExercise(entry,state.workouts);
    return {entry,exercise,estimate:exerciseEnergy(entry,exercise,weightKg)};
  });
  return {weightKg,entries,plannedKcal:entries.reduce((sum,item)=>sum+item.estimate.kcal,0),
    creditedKcal:entries.reduce((sum,item)=>sum+(item.entry.completed?item.estimate.kcal:0),0)};
}
export function dailyCalorieBalance(state,date,baseGoals=null) {
  const goals=baseGoals||state.days[date]?.goals||calculateGoals(state.profile,date);
  const consumed=totals(state.days[date]?.entries||[]),exercise=workoutDayEnergy(state,date);
  const adjustedKcal=goals.kcal+exercise.creditedKcal;
  return {baseGoals:goals,baseKcal:goals.kcal,exercise,consumed,adjustedKcal,
    remainingKcal:adjustedKcal-consumed.kcal};
}
