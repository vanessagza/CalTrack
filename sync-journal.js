import { validateState } from './core.js?v=8';

// An older tab omitting a newer feature is not a request to reset that feature.
export function validateCloudJournal(value,previous) {
  if(!previous)return validateState(value);
  const raw={...value};
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
