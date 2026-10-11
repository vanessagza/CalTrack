import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, validatePreferences, colorRGB, colorHex, contrastRatio, accentText } from '../preferences.js';
import { createInitialState, validateState, newEntry } from '../core.js';
import { mergeJournals, JournalConflict } from '../journal-merge.js';

test('older journals restore with separate default light and dark palettes',()=>{
  const legacy=createInitialState();delete legacy.preferences;
  const restored=validateState(legacy);
  assert.deepEqual(restored.preferences,DEFAULT_PREFERENCES);
  restored.preferences.palettes.dark.background='#000000';
  assert.notEqual(restored.preferences.palettes.light.background,'#000000');
  assert.equal(DEFAULT_PREFERENCES.palettes.dark.background,'#111827');
});
test('RGB controls round trip all channels without mixing color roles',()=>{
  assert.deepEqual(colorRGB('#12abff'),[18,171,255]);
  assert.equal(colorHex([18,171,255]),'#12abff');
  assert.equal(colorHex([0,0,0]),'#000000');
  assert.equal(colorHex([255,255,255]),'#ffffff');
  for(const input of [[256,0,0],[-1,0,0],[1.5,0,0],[1,2]])assert.throws(()=>colorHex(input));
});
test('colors, independent text sizes, spacing and photo survive backup round trips',()=>{
  const state=createInitialState();
  state.preferences.theme='dark';
  state.preferences.palettes.dark.background='#030509';
  state.preferences.palettes.dark.subtext='#ffc4dc';
  state.preferences.typography={title:44,heading:24,body:18,subtext:16};
  state.preferences.density='compact';state.preferences.reduceMotion=true;
  state.preferences.avatar='data:image/png;base64,aGVsbG8=';
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).preferences,state.preferences);
});
test('invalid imported styles and photos cannot inject CSS or external image URLs',()=>{
  for(const value of [
    null,[],{theme:'unknown'},{palettes:null},{palettes:{dark:{background:'red;display:none'}}},
    {palettes:{dark:{text:'#fff'}}},{typography:{body:25}},{typography:{heading:13}},
    {typography:{subtext:10.5}},{density:'tiny'},{reduceMotion:'yes'},
    {avatar:'https://example.com/photo.png'},{avatar:'data:image/svg+xml;base64,PHN2Zz4='},
    {avatar:'data:image/png;base64,'+'a'.repeat(350000)},
  ])assert.throws(()=>validatePreferences(value));
});
test('button text chooses a contrasting color for dark and light accents',()=>{
  assert.equal(accentText('#ffffff'),'#000000');
  assert.equal(accentText('#000000'),'#ffffff');
  assert.equal(contrastRatio('#000000','#ffffff'),21);
});
test('independent color changes on the same palette merge across devices',()=>{
  const base=createInitialState(),local=structuredClone(base),remote=structuredClone(base);
  local.preferences.palettes.dark.background='#030509';remote.preferences.palettes.dark.subtext='#ffc4dc';
  const merged=mergeJournals(base,local,remote);
  assert.equal(merged.preferences.palettes.dark.background,'#030509');
  assert.equal(merged.preferences.palettes.dark.subtext,'#ffc4dc');
  assert.deepEqual(merged.preferences.palettes.light,base.preferences.palettes.light);
});
test('independent text settings and photo edits merge with other journal records',()=>{
  const base=createInitialState(),local=structuredClone(base),remote=structuredClone(base);
  local.preferences.typography.body=18;remote.preferences.typography.subtext=16;
  remote.preferences.avatar='data:image/jpeg;base64,aGVsbG8=';
  remote.days['2026-10-12']={entries:[newEntry(base.foods[0],1,'portion','Lunch','new-food')],note:''};
  const merged=mergeJournals(base,local,remote);
  assert.equal(merged.preferences.typography.body,18);assert.equal(merged.preferences.typography.subtext,16);
  assert.equal(merged.preferences.avatar,remote.preferences.avatar);
  assert.equal(merged.days['2026-10-12'].entries[0].id,'new-food');
});
test('conflicting changes to one color or photo require a deliberate choice',()=>{
  const base=createInitialState(),local=structuredClone(base),remote=structuredClone(base);
  local.preferences.palettes.light.accent='#aa2244';remote.preferences.palettes.light.accent='#2244aa';
  assert.throws(()=>mergeJournals(base,local,remote),JournalConflict);
  local.preferences=structuredClone(base.preferences);remote.preferences=structuredClone(base.preferences);
  local.preferences.avatar='data:image/jpeg;base64,YQ==';remote.preferences.avatar='data:image/jpeg;base64,Yg==';
  assert.throws(()=>mergeJournals(base,local,remote),JournalConflict);
});
test('preferences added to a legacy account do not disappear during sync',()=>{
  const base=createInitialState();delete base.preferences;
  const local=structuredClone(base),remote=structuredClone(base);
  local.preferences=validatePreferences({theme:'dark',typography:{body:18}});
  remote.profile.name='Other device';
  const merged=mergeJournals(base,local,remote);
  assert.equal(merged.preferences.theme,'dark');assert.equal(merged.preferences.typography.body,18);
  assert.equal(merged.profile.name,'Other device');
});
