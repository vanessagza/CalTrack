import { validateState } from './core.js?v=10';
import { validatePreferences,DEFAULT_PREFERENCES } from './preferences.js?v=10';

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
  }
  return validateState(raw);
}
