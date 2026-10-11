import { validateState } from './core.js';

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
  return validateState({
    version: 1,
    profileReady: choice(base.profileReady, local.profileReady, remote.profileReady),
    profile: choice(base.profile, local.profile, remote.profile),
    foods: keyed(base.foods, local.foods, remote.foods, 'id', fields),
    weights: keyed(base.weights, local.weights, remote.weights, 'date'),
    days,
    createdAt: remote.createdAt,
  });
}
