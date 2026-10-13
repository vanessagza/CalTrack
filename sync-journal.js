import { validateState } from './core.js?v=12';
import { validatePreferences,DEFAULT_PREFERENCES } from './preferences.js?v=12';

export const sameAppearance=(a,b)=>JSON.stringify({...validatePreferences(a),changeId:''})===JSON.stringify({...validatePreferences(b),changeId:''});
export function rebaseAppearance(base,local,remote) {
  const [b,l,r]=[base,local,remote].map(validatePreferences);
  for(const key of ['theme','density','reduceMotion','avatar','changeId'])if(l[key]!==b[key])r[key]=l[key];
  for(const theme of ['light','dark'])for(const key of Object.keys(b.palettes[theme]))if(l.palettes[theme][key]!==b.palettes[theme][key])r.palettes[theme][key]=l.palettes[theme][key];
  for(const key of Object.keys(b.typography))if(l.typography[key]!==b.typography[key])r.typography[key]=l.typography[key];
  return r;
}

// An older tab omitting a newer feature is not a request to reset that feature.
export function validateCloudJournal(value,previous) {
  if(!previous)return validateState(value);
  const raw={...value};
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
  return validateState(raw);
}
