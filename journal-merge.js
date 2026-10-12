import { validateState, validateWorkouts } from './core.js?v=7';
import { validatePreferences } from './preferences.js?v=7';

const canonical = value => JSON.stringify(value, function (key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item;
});
export const sameJournal = (a, b) => canonical(a) === canonical(b);
export class JournalConflict extends Error {
  constructor() { super('Both devices changed the same information. Choose which journal to keep.'); }
}
function choice(base, local, remote) {
  if (sameJournal(local, remote) || sameJournal(base, remote)) return local;
  if (sameJournal(base, local)) return remote;
  throw new JournalConflict();
}
function keyed(base, local, remote, key, merge = choice) {
  const maps = [base, local, remote].map(list => new Map(list.map(item => [item[key], item])));
  const keys = new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()]);
  return [...keys].flatMap(id => {
    const result = merge(...maps.map(map => map.get(id)));
    return result === undefined ? [] : [result];
  });
}
function fields(base, local, remote) {
  if (!base || !local || !remote) return choice(base, local, remote);
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
    .map(key => [key, choice(base[key], local[key], remote[key])]));
}
function day(base, local, remote) {
  if (!local || !remote) return choice(base, local, remote);
  return {
    entries: keyed(base?.entries || [], local.entries, remote.entries, 'id'),
    goals: choice(base?.goals, local.goals, remote.goals),
    note: choice(base?.note || '', local.note || '', remote.note || ''),
  };
}
export function mergeJournals(base, local, remote) {
  if (sameJournal(local, remote)) return validateState(local);
  const days = {};
  for (const date of new Set([...Object.keys(base.days), ...Object.keys(local.days), ...Object.keys(remote.days)])) {
    const value = day(base.days[date], local.days[date], remote.days[date]);
    if (value) days[date] = value;
  }
  const workouts = [base, local, remote].map(journal => validateWorkouts(journal.workouts));
  const workoutDays = {};
  const workoutEntries = workouts.map(workout => Object.entries(workout.days)
    .flatMap(([date, entries]) => entries.map(entry => ({ ...entry, date }))));
  // Include the date in the record so two devices moving the same exercise conflict.
  for (const { date, ...entry } of keyed(...workoutEntries, 'id')) {
    (workoutDays[date] ||= []).push(entry);
  }
  for(const [date,entries] of Object.entries(workoutDays)) {
    const orders=workouts.map(w=>(w.days[date]||[]).map(e=>e.id));
    const common=orders[0].filter(id=>orders[1].includes(id)&&orders[2].includes(id));
    const shared=orders.map(order=>order.filter(id=>common.includes(id)));
    const chosen=choice(...shared);
    const preferred=sameJournal(chosen,shared[1])?orders[1]:orders[2];
    const rank=new Map(preferred.map((id,index)=>[id,index]));
    entries.sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity));
  }
  const preferences=[base,local,remote].map(journal=>validatePreferences(journal.preferences));
  const mergedPreferences=fields(...preferences.map(({ palettes,typography,...controls })=>controls));
  // Merge individual controls so unrelated appearance edits on two devices survive.
  mergedPreferences.palettes=Object.fromEntries(['light','dark'].map(theme=>
    [theme,fields(...preferences.map(p=>p.palettes[theme]))]));
  mergedPreferences.typography=fields(...preferences.map(p=>p.typography));
  return validateState({
    version: 1,
    profileReady: choice(base.profileReady, local.profileReady, remote.profileReady),
    profile: choice(base.profile, local.profile, remote.profile),
    foods: keyed(base.foods, local.foods, remote.foods, 'id', fields),
    weights: keyed(base.weights, local.weights, remote.weights, 'date'),
    days,
    workouts: { settings:fields(...workouts.map(workout => workout.settings)), days:workoutDays,
      exercises:keyed(...workouts.map(w=>w.exercises),'id',fields),
      notes:Object.fromEntries([...new Set(workouts.flatMap(w=>Object.keys(w.notes)))].flatMap(date=>{
        const note=fields(...workouts.map(w=>w.notes[date]));return note===undefined?[]:[[date,note]];
      })),
      skippedWeeks:[...new Set(workouts.flatMap(w=>w.skippedWeeks))].filter(date=>choice(...workouts.map(w=>w.skippedWeeks.includes(date)))),
      template:choice(...workouts.map(w=>w.template)),
    },
    preferences:mergedPreferences,
    createdAt: remote.createdAt,
  });
}
