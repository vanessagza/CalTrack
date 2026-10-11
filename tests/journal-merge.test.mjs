import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, newEntry } from '../core.js';
import { mergeJournals, JournalConflict } from '../journal-merge.js';
const fixture = () => ({ ...createInitialState(), profileReady:true });
test('offline devices keep both independently logged foods on the same day', () => {
  const base=fixture(), laptop=structuredClone(base), phone=structuredClone(base);
  laptop.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','laptop-entry')],note:''};
  phone.days['2026-10-11']={entries:[newEntry(base.foods[1],1,'portion','Lunch','phone-entry')],note:''};
  const result=mergeJournals(base,laptop,phone);
  assert.deepEqual(new Set(result.days['2026-10-11'].entries.map(e=>e.id)),new Set(['laptop-entry','phone-entry']));
});
test('a deletion and an unrelated new entry are both retained', () => {
  const base=fixture();
  base.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','old')],note:''};
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.days['2026-10-11'].entries=[];
  phone.days['2026-10-11'].entries.push(newEntry(base.foods[1],1,'portion','Dinner','new'));
  assert.deepEqual(mergeJournals(base,laptop,phone).days['2026-10-11'].entries.map(e=>e.id),['new']);
});
test('editing and deleting the same entry requires a user choice', () => {
  const base=fixture();base.days['2026-10-11']={entries:[newEntry(base.foods[0],1,'portion','Lunch','same')],note:''};
  const laptop=structuredClone(base),phone=structuredClone(base);
  laptop.days['2026-10-11'].entries=[];phone.days['2026-10-11'].entries[0].amount=2;
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('conflicting profiles and same-date weights are not silently overwritten', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.profile.name='Laptop';phone.profile.name='Phone';
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
  laptop.profile=base.profile;phone.profile=base.profile;
  laptop.weights=[{date:'2026-10-11',weight:69}];phone.weights=[{date:'2026-10-11',weight:68}];
  assert.throws(()=>mergeJournals(base,laptop,phone),JournalConflict);
});
test('unrelated food label edits merge and backups remain valid', () => {
  const base=fixture(),laptop=structuredClone(base),phone=structuredClone(base);
  laptop.foods[0].favorite=false;phone.foods[0].note='Updated label note';
  const result=mergeJournals(base,laptop,phone);
  assert.equal(result.foods[0].favorite,false);assert.equal(result.foods[0].note,'Updated label note');
});
