import { validateState,closedIntakeThrough,todayKey } from './core.js?v=15';
import { validatePreferences,DEFAULT_PREFERENCES } from './preferences.js?v=15';

const NUTRITION_FIELDS=['fiber','saturatedFat','sugar','addedSugar','sodium','nutrientNote','nutrientSource'];
const NUTRIENT_GOALS=['fiber','saturatedFat','sugar','addedSugar','sodium'];
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const sameFoodNutrition=(a,b)=>record(a)&&record(b)&&a.id===b.id&&
  String(a.name||'').trim()===String(b.name||'').trim()&&a.category===b.category&&String(a.source||'')===String(b.source||'')&&
  ['kcal','protein','carbs','fat'].every(key=>a[key]!==null&&a[key]!==undefined&&a[key]!==''&&Number(a[key])===Number(b[key]));
function preserveFoodNutrition(food,saved) {
  if(!sameFoodNutrition(food,saved))return food;
  const result={...food};
  // New nutrient values are per 100 g, so a serving-size change can safely keep
  // them. A changed recipe cannot inherit another recipe's estimates.
  for(const key of NUTRITION_FIELDS)if(!Object.hasOwn(food,key)&&Object.hasOwn(saved,key))result[key]=saved[key];
  return result;
}

export const sameAppearance=(a,b)=>JSON.stringify({...validatePreferences(a),changeId:''})===JSON.stringify({...validatePreferences(b),changeId:''});
export function rebaseAppearance(base,local,remote) {
  const [b,l,r]=[base,local,remote].map(validatePreferences);
  for(const key of ['theme','density','reduceMotion','avatar','changeId'])if(l[key]!==b[key])r[key]=l[key];
  for(const theme of ['light','dark'])for(const key of Object.keys(b.palettes[theme]))if(l.palettes[theme][key]!==b.palettes[theme][key])r.palettes[theme][key]=l.palettes[theme][key];
  for(const key of Object.keys(b.typography))if(l.typography[key]!==b.typography[key])r.typography[key]=l.typography[key];
  return r;
}

// An older tab omitting a newer feature is not a request to reset that feature.
export function validateCloudJournal(value,previous,today=todayKey()) {
  if(!previous)return validateState(value,today);
  const raw={...value};
  // A legacy tab may add newer logs or remove old ones. It can advance a
  // completion watermark through inference, but omission cannot move it back.
  if(!Object.hasOwn(raw,'intakeClosedThrough'))raw.intakeClosedThrough=[closedIntakeThrough(raw,today),closedIntakeThrough(previous,today)].filter(Boolean).sort().at(-1)||null;
  if(record(raw.profile)&&!Object.hasOwn(raw.profile,'insulinResistance')&&Object.hasOwn(previous.profile||{},'insulinResistance'))raw.profile={...raw.profile,insulinResistance:previous.profile.insulinResistance};
  const savedFoods=new Map((previous.foods||[]).map(food=>[food.id,food]));
  if(Array.isArray(raw.foods))raw.foods=raw.foods.map(food=>preserveFoodNutrition(food,savedFoods.get(food?.id)));
  if(record(raw.days))raw.days=Object.fromEntries(Object.entries(raw.days).map(([date,day])=>{
    if(!record(day))return [date,day];
    const savedDay=previous.days?.[date],restored={...day};
    const savedEntries=new Map((savedDay?.entries||[]).map(entry=>[entry.id,entry]));
    if(Array.isArray(day.entries))restored.entries=day.entries.map(entry=>{
      if(!record(entry)||!record(entry.food))return entry;
      const saved=savedEntries.get(entry.id);
      const original=saved?.foodId===entry.foodId?saved.food:undefined;
      // Existing logs retain their original snapshot, even if the catalog has
      // since changed. New logs from an older tab can use a matching catalog.
      const reference=sameFoodNutrition(entry.food,original)?original:savedFoods.get(entry.food.id);
      return {...entry,food:preserveFoodNutrition(entry.food,reference)};
    });
    if(record(day.goals)&&record(savedDay?.goals)) {
      const goals={...day.goals},saved=savedDay.goals;
      // An older client may deliberately recalculate its calorie target. In
      // that case validation derives nutrient targets from the new calories.
      if(Number(goals.kcal)===Number(saved.kcal))for(const key of NUTRIENT_GOALS)if(!Object.hasOwn(goals,key)&&Object.hasOwn(saved,key))goals[key]=saved[key];
      if(!Object.hasOwn(goals,'nutrientTargets')&&Object.hasOwn(saved,'nutrientTargets'))goals.nutrientTargets=saved.nutrientTargets;
      else if(record(goals.nutrientTargets)&&record(saved.nutrientTargets))goals.nutrientTargets={...saved.nutrientTargets,...goals.nutrientTargets};
      restored.goals=goals;
    }
    return [date,restored];
  }));
  // New appearance edits carry an intent ID. An older client stripping that ID
  // and sending defaults must not erase a confirmed custom palette. A deliberate
  // reset from a current client has its own ID and remains authoritative.
  if(raw.preferences&&!raw.preferences.changeId&&previous.preferences?.changeId&&!Array.isArray(raw.preferences)) {
    const legacy=validatePreferences(raw.preferences),saved=previous.preferences;
    for(const key of ['theme','density','reduceMotion','avatar'])if(legacy[key]===DEFAULT_PREFERENCES[key]&&saved[key]!==DEFAULT_PREFERENCES[key])legacy[key]=saved[key];
    for(const theme of ['light','dark'])for(const key of Object.keys(DEFAULT_PREFERENCES.palettes[theme]))if(legacy.palettes[theme][key]===DEFAULT_PREFERENCES.palettes[theme][key]&&saved.palettes[theme][key]!==DEFAULT_PREFERENCES.palettes[theme][key])legacy.palettes[theme][key]=saved.palettes[theme][key];
    for(const key of Object.keys(DEFAULT_PREFERENCES.typography))if(legacy.typography[key]===DEFAULT_PREFERENCES.typography[key]&&saved.typography[key]!==DEFAULT_PREFERENCES.typography[key])legacy.typography[key]=saved.typography[key];
    legacy.changeId=saved.changeId;raw.preferences=legacy;
  }
  if(raw.preferences===undefined)raw.preferences=previous.preferences;
  else if(raw.preferences&&typeof raw.preferences==='object'&&!Array.isArray(raw.preferences)) {
    const p=raw.preferences,f=previous.preferences;
    raw.preferences={...f,...p};
    if(p.palettes&&typeof p.palettes==='object'&&!Array.isArray(p.palettes)) {
      raw.preferences.palettes={...f.palettes,...p.palettes};
      for(const theme of ['light','dark'])if(p.palettes[theme]&&typeof p.palettes[theme]==='object'&&!Array.isArray(p.palettes[theme]))raw.preferences.palettes[theme]={...f.palettes[theme],...p.palettes[theme]};
    }
    if(p.typography&&typeof p.typography==='object'&&!Array.isArray(p.typography))raw.preferences.typography={...f.typography,...p.typography};
  }
  if(raw.workouts===undefined)raw.workouts=previous.workouts;
  else if(raw.workouts&&typeof raw.workouts==='object'&&!Array.isArray(raw.workouts)) {
    raw.workouts={...previous.workouts,...raw.workouts};
    if(value.workouts.settings)raw.workouts.settings={...previous.workouts.settings,...value.workouts.settings};
    if(Array.isArray(value.workouts.exercises)) {
      const saved=new Map((previous.workouts?.exercises||[]).map(exercise=>[exercise.id,exercise]));
      raw.workouts.exercises=value.workouts.exercises.map(exercise=>{
        const older=saved.get(exercise?.id);
        if(!older||!exercise||typeof exercise!=='object')return exercise;
        const restored={...exercise};
        // null is an explicit return to automatic calories. Missing fields come
        // from older clients that did not know those fields existed.
        for(const key of ['energy','cue','feel','easier','reset'])if(!Object.hasOwn(exercise,key)&&Object.hasOwn(older,key))restored[key]=older[key];
        return restored;
      });
      // Current clients declare the library schema, so a restored backup can
      // deliberately replace its definitions. Only legacy clients need their
      // truncated catalog repaired from the last known journal.
      if(value.workouts.libraryVersion!==1) {
        const incoming=new Set(raw.workouts.exercises.map(exercise=>exercise?.id));
        for(const exercise of saved.values())if(!incoming.has(exercise.id))raw.workouts.exercises.push(exercise);
      }
    }
    const savedEntries=new Map(Object.values(previous.workouts?.days||{}).flat().map(entry=>[entry.id,entry]));
    const preserveSnapshot=entry=>{
      if(!entry||typeof entry!=='object')return entry;
      const saved=savedEntries.get(entry.id);
      if(!saved?.exercise||saved.exerciseId!==entry.exerciseId)return entry;
      if(entry.exercise===undefined)return {...entry,exercise:saved.exercise};
      if(entry.exercise&&typeof entry.exercise==='object'&&!Object.hasOwn(entry.exercise,'energy'))return {...entry,exercise:{...entry.exercise,energy:saved.exercise.energy??null}};
      return entry;
    };
    if(value.workouts.days&&typeof value.workouts.days==='object'&&!Array.isArray(value.workouts.days))raw.workouts.days=Object.fromEntries(Object.entries(value.workouts.days)
      .map(([date,entries])=>[date,Array.isArray(entries)?entries.map(preserveSnapshot):entries]));
    if(value.workouts.template&&Array.isArray(value.workouts.template.days)) {
      for(const entries of previous.workouts?.template?.days||[])for(const entry of entries)savedEntries.set(entry.id,entry);
      raw.workouts.template={...value.workouts.template,days:value.workouts.template.days.map(entries=>Array.isArray(entries)?entries.map(preserveSnapshot):entries)};
    }
  }
  return validateState(raw,today);
}
