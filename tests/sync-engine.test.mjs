import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalSync } from '../cloud-sync.js';
import { createInitialState,newEntry } from '../core.js';
import { sameJournal } from '../journal-merge.js';

class MemoryStorage {
  values=new Map();writes=0;
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.writes++;this.values.set(key,String(value));}
}
globalThis.window=new EventTarget();
globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
globalThis.location={origin:'http://localhost',pathname:'/'};
globalThis.localStorage=new MemoryStorage();
const id='11111111-1111-4111-8111-111111111111',key='daily-balance-account-'+id;
const fixture=()=>({...createInitialState(),profileReady:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<500;i++){if(predicate())return;await wait(2);}assert.fail('Sync condition timed out.');}
function server(journal=fixture()) {
  return {row:{user_id:id,journal:structuredClone(journal),revision:1},reads:[],writes:0,holdRead:null,holdSave:null,fail:false};
}
function device(db,{storage=new MemoryStorage(),timeoutMs=500,pollMs}={}) {
  let authListener;
  const views=[],journals=[];
  const client={
    auth:{
      onAuthStateChange(callback){authListener=callback;return {data:{subscription:{unsubscribe(){}}}};},
      async getSession(){return {data:{session:{user:{id,email:'sample@example.test'}}}};},
    },
    from(){let select;
      return {select(value){select=value;return this;},eq(){return this;},abortSignal(){return this;},async maybeSingle(){
        db.reads.push(select);
        if(db.holdRead)await db.holdRead;
        if(db.fail)return {error:{message:'Failed to fetch'}};
        return {data:select.includes('journal')?structuredClone(db.row):{user_id:id,revision:db.row.revision}};
      }};
    },
    rpc(name,data){return {async abortSignal(){
      db.writes++;
      if(db.fail)return {error:{message:'Failed to fetch'}};
      if(data.p_expected_revision!==db.row.revision)return {error:{code:'40001',message:'Revision conflict'}};
      db.row={user_id:id,journal:structuredClone(data.p_journal),revision:db.row.revision+1};
      const saved=structuredClone(db.row);
      if(db.holdSave)await db.holdSave;
      return {data:saved};
    }};},
  };
  const sync=createJournalSync({client,storage,timeoutMs,pollMs,statusChanged:view=>views.push(view),applyJournal:journal=>journals.push(journal)});
  return {sync,storage,views,journals,get view(){return views.at(-1)||{};},get journal(){return journals.at(-1);},auth:event=>authListener(event,{user:{id,email:'sample@example.test'}})};
}

test('approved cached accounts remain locked until refreshed even when a form has focus',async()=>{
  const db=server();let release;db.holdRead=new Promise(r=>release=r);
  const storage=new MemoryStorage(),cached=fixture();cached.preferences.palettes.dark.background='#030509';
  storage.setItem(key,JSON.stringify({journal:cached,base:cached,revision:1,approved:true,dirty:false}));
  const d=device(db,{storage});
  try {
    await until(()=>db.reads.length===1);assert.equal(d.view.ready,false);
    assert.throws(()=>d.sync.saveLocal(cached),/synced/);
    release();await until(()=>d.view.phase==='synced');assert.equal(d.view.ready,true);
    assert.equal(db.writes,0);
  }finally{d.sync.stop();}
});

test('pending writes lock editing, one food save preserves preferences, and no-op saves write nothing',async()=>{
  const journal=fixture();journal.preferences.palettes.dark.background='#030509';journal.preferences.typography.body=20;
  const db=server(journal),d=device(db);let release;
  try {
    await until(()=>d.view.ready);const changed=structuredClone(d.journal);
    changed.days['2026-10-12']={entries:[newEntry(changed.foods[0],1,'portion','Lunch','entry')],note:''};
    db.holdSave=new Promise(r=>release=r);d.sync.saveLocal(changed);
    assert.equal(d.view.ready,false);assert.throws(()=>d.sync.saveLocal(changed),/synced/);
    await until(()=>db.writes===1);release();await until(()=>d.view.ready);
    assert.deepEqual(db.row.journal.preferences,journal.preferences);
    d.sync.saveLocal(structuredClone(d.journal));await wait(10);assert.equal(db.writes,1);
  }finally{d.sync.stop();}
});

test('competing devices rebase automatically and preserve unrelated settings',async()=>{
  const db=server(),a=device(db),b=device(db);
  try {
    await until(()=>a.view.ready&&b.view.ready);
    const first=structuredClone(a.journal),second=structuredClone(b.journal);
    first.profile.name='First commit';first.preferences.palettes.dark.background='#030509';
    second.profile.name='Second commit';second.preferences.typography.body=20;
    a.sync.saveLocal(first);await until(()=>a.view.ready);
    b.sync.saveLocal(second);await until(()=>b.view.ready);
    assert.equal(db.row.journal.profile.name,'Second commit');
    assert.equal(db.row.journal.preferences.palettes.dark.background,'#030509');
    assert.equal(db.row.journal.preferences.typography.body,20);
    assert.ok(!b.views.some(v=>v.phase==='conflict'));
    assert.ok(db.writes<=3);
  }finally{a.sync.stop();b.sync.stop();}
});

test('lost upload acknowledgements recover on reload without a duplicate write',async()=>{
  const db=server(),storage=new MemoryStorage();let release;
  let d=device(db,{storage,timeoutMs:25});
  try {
    await until(()=>d.view.ready);const changed=structuredClone(d.journal);changed.preferences.typography.body=20;
    db.holdSave=new Promise(r=>release=r);d.sync.saveLocal(changed);
    await until(()=>d.view.phase==='error');assert.equal(d.view.ready,false);
    assert.ok(JSON.parse(storage.getItem(key)).dirty);assert.equal(db.writes,1);
    d.sync.stop();db.holdSave=null;d=device(db,{storage});
    await until(()=>d.view.ready);
    assert.equal(d.journal.preferences.typography.body,20);assert.equal(db.writes,1);
    assert.equal(JSON.parse(storage.getItem(key)).dirty,false);
    release();await wait(5);assert.equal(d.journal.preferences.typography.body,20);
  }finally{release?.();d.sync.stop();}
});

test('whole-operation timeouts settle syncing and late responses cannot overwrite a newer copy',async()=>{
  const db=server();let release;db.holdRead=new Promise(r=>release=r);
  const d=device(db,{timeoutMs:20});
  try {
    await until(()=>d.view.phase==='error');assert.equal(d.view.ready,false);
    assert.match(d.view.message,/Automatic retries have stopped/);
    const readCount=db.reads.length;await wait(50);assert.equal(db.reads.length,readCount);
    db.holdRead=null;db.row.journal.profile.name='Latest';db.row.revision++;
    d.sync.retry();await until(()=>d.view.ready);assert.equal(d.journal.profile.name,'Latest');
    release();await wait(5);assert.equal(d.journal.profile.name,'Latest');
  }finally{release?.();d.sync.stop();}
});

test('a timeout stays paused through timers, focus and visibility events until explicit retry',async()=>{
  const db=server();db.holdRead=new Promise(()=>{});
  const d=device(db,{timeoutMs:20,pollMs:10});
  try {
    await until(()=>d.view.phase==='error');
    assert.equal(d.view.error.code,'SYNC_TIMEOUT');
    assert.equal(d.view.error.stage,'loading the account journal');
    const reads=db.reads.length;
    for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));
    document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));
    document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));
    await wait(2200);
    assert.equal(db.reads.length,reads);assert.equal(d.view.phase,'error');
    db.holdRead=null;d.sync.retry();await until(()=>d.view.ready);
    assert.ok(db.reads.length>reads);
  }finally{document.visibilityState='visible';d.sync.stop();}
});

test('pending appearance survives a reset full cache and a failed cloud reload',async()=>{
  const db=server(),storage=new MemoryStorage();let d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    const changed=structuredClone(d.journal);
    changed.preferences.theme='dark';changed.preferences.palettes.dark.background='#030509';changed.preferences.typography.body=20;
    db.fail=true;d.sync.saveLocal(changed);await until(()=>d.view.phase==='offline');
    const checkpoint=JSON.parse(storage.getItem(key+'-appearance'));
    assert.equal(checkpoint.pending,true);assert.equal(checkpoint.preferences.palettes.dark.background,'#030509');
    d.sync.stop();
    const reset=JSON.parse(storage.getItem(key));reset.journal.preferences=fixture().preferences;reset.dirty=false;
    reset.journal.days['2026-10-12']={entries:[newEntry(reset.journal.foods[0],1,'portion','Lunch','recent-food')],note:''};
    storage.setItem(key,JSON.stringify(reset));
    d=device(db,{storage});await until(()=>d.view.phase==='offline');
    assert.equal(d.journal.preferences.palettes.dark.background,'#030509');assert.equal(d.journal.preferences.typography.body,20);
    assert.equal(d.journal.days['2026-10-12'].entries[0].id,'recent-food');
    db.fail=false;d.sync.retry();await until(()=>d.view.ready);
    assert.equal(db.row.journal.preferences.palettes.dark.background,'#030509');
    assert.equal(db.row.journal.days['2026-10-12'].entries[0].id,'recent-food');
    assert.equal(JSON.parse(storage.getItem(key+'-appearance')).pending,false);
  }finally{d.sync.stop();}
});

test('recovering saved appearance keeps current logs, persists while cloud is down and syncs after recovery',async()=>{
  const current=fixture();current.days['2026-10-12']={entries:[newEntry(current.foods[0],1,'portion','Lunch','current-food')],note:''};
  const db=server(current),storage=new MemoryStorage(),previous=fixture();previous.preferences.palettes.dark.background='#030509';
  storage.setItem(key,JSON.stringify({journal:current,base:current,revision:1,dirty:false,approved:true}));
  storage.setItem(key+'-before-sync-update',JSON.stringify({journal:previous,base:previous,revision:1,dirty:false,approved:true}));
  db.fail=true;let d=device(db,{storage});
  try {
    await until(()=>d.view.phase==='offline');assert.ok(d.sync.recoverableAppearance());
    assert.equal(d.sync.recoverAppearance(),true);assert.equal(d.view.ready,false);
    assert.equal(d.journal.preferences.palettes.dark.background,'#030509');
    assert.equal(d.journal.days['2026-10-12'].entries[0].id,'current-food');
    const reads=db.reads.length;window.dispatchEvent(new Event('focus'));await wait(20);assert.equal(db.reads.length,reads);
    d.sync.stop();d=device(db,{storage});await until(()=>d.view.phase==='offline');
    assert.equal(d.journal.preferences.palettes.dark.background,'#030509');
    db.fail=false;d.sync.retry();await until(()=>d.view.ready);
    assert.equal(db.row.journal.preferences.palettes.dark.background,'#030509');
    assert.equal(db.row.journal.days['2026-10-12'].entries[0].id,'current-food');
  }finally{d.sync.stop();}
});

test('idle checks fetch revision only, skip writes, and repeated auth notifications do not start loops',async()=>{
  const db=server(),d=device(db,{pollMs:20});
  try {
    await until(()=>d.view.ready);
    for(let i=0;i<10;i++)d.auth('SIGNED_IN');
    await wait(70);
    assert.equal(db.reads.filter(select=>select.includes('journal')).length,1);
    assert.ok(db.reads.length>=2&&db.reads.length<=6);assert.equal(db.writes,0);
    assert.ok(sameJournal(d.journal,db.row.journal));
  }finally{d.sync.stop();}
});

test('routine checks occur every five minutes, while saves and returning to a device remain immediate',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.parse('2026-10-12T12:00:00Z')});
  const db=server(),d=device(db);
  const settle=async()=>{for(let i=0;i<30;i++){t.mock.timers.tick(0);await Promise.resolve();}};
  try {
    await settle();assert.equal(d.view.ready,true);assert.equal(db.reads.length,1);
    const recovery=d.storage.getItem(key+'-recovery');
    for(let i=0;i<4;i++){t.mock.timers.tick(60000);await settle();assert.equal(db.reads.length,1);}
    t.mock.timers.tick(60000);await settle();
    assert.equal(db.reads.length,2);assert.equal(db.reads[1],'user_id,revision');assert.equal(db.writes,0);
    assert.equal(d.storage.getItem(key+'-recovery'),recovery);
    const changed=structuredClone(d.journal);changed.profile.name='Saved immediately';
    d.sync.saveLocal(changed);assert.equal(d.view.ready,false);await settle();
    assert.equal(db.writes,1);assert.equal(db.row.journal.profile.name,'Saved immediately');assert.equal(d.view.ready,true);
    db.row.journal.profile.height=180;db.row.revision++;
    document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(900000);await settle();assert.equal(db.reads.length,2);
    document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));assert.equal(d.view.ready,false);
    t.mock.timers.tick(149);await settle();assert.equal(db.reads.length,2);
    t.mock.timers.tick(1);await settle();
    assert.equal(db.reads.length,4);assert.equal(d.journal.profile.height,180);assert.equal(d.view.ready,true);
  }finally{document.visibilityState='visible';d.sync.stop();t.mock.timers.reset();}
});

test('peer tabs reuse a confirmed save without a request, but pending or legacy snapshots stay locked',async()=>{
  const db=server(),storage=new MemoryStorage(),a=device(db,{storage}),b=device(db,{storage});
  const deliver=()=>{const event=new Event('storage');event.key=key;event.newValue=storage.getItem(key);window.dispatchEvent(event);};
  try {
    await until(()=>a.view.ready&&b.view.ready);
    const changed=structuredClone(a.journal);changed.profile.name='Confirmed in another tab';
    let release;db.holdSave=new Promise(r=>release=r);a.sync.saveLocal(changed);
    await until(()=>db.writes===1);deliver();assert.equal(b.view.ready,false);
    release();await until(()=>a.view.ready);deliver();await until(()=>b.view.ready);
    const reads=db.reads.length;deliver();await wait(30);
    assert.equal(db.reads.length,reads);assert.equal(b.journal.profile.name,'Confirmed in another tab');
    const legacy=JSON.parse(storage.getItem(key));delete legacy.checkedAt;
    storage.setItem(key,JSON.stringify(legacy));deliver();assert.equal(b.view.ready,false);
    await until(()=>a.view.ready&&b.view.ready);assert.ok(db.reads.length>reads);
  }finally{a.sync.stop();b.sync.stop();}
});

test('an interrupted peer save is recovered after a brief wait without duplicating a committed write',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.parse('2026-10-12T12:00:00Z')});
  const settle=async()=>{for(let i=0;i<30;i++){t.mock.timers.tick(0);await Promise.resolve();}};
  try {
    for(const alreadyCommitted of [false,true]) {
      const db=server(),storage=new MemoryStorage(),d=device(db,{storage});
      await settle();const pending=structuredClone(d.journal);pending.profile.name='Recovered peer change';
      if(alreadyCommitted){db.row.journal=pending;db.row.revision++;}
      const snapshot={journal:pending,base:d.journal,revision:1,approved:true,dirty:true,checkedAt:Date.now(),protocol:3};
      storage.setItem(key,JSON.stringify(snapshot));
      const event=new Event('storage');event.key=key;event.newValue=storage.getItem(key);window.dispatchEvent(event);
      assert.equal(d.view.ready,false);assert.equal(d.view.phase,'pending');
      t.mock.timers.tick(1999);await settle();assert.equal(db.reads.length,1);assert.equal(db.writes,0);
      t.mock.timers.tick(1);await settle();
      assert.equal(d.view.ready,true);assert.equal(db.row.journal.profile.name,'Recovered peer change');
      assert.equal(db.writes,alreadyCommitted?0:1);d.sync.stop();
    }
  }finally{t.mock.timers.reset();}
});

test('a hidden tab receiving a confirmed peer save stays paused and checks the server on return',async()=>{
  const db=server(),storage=new MemoryStorage(),d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));
    db.row.journal.profile.name='Peer save';db.row.revision++;
    const snapshot={journal:db.row.journal,base:db.row.journal,revision:db.row.revision,
      approved:true,dirty:false,checkedAt:Date.now(),protocol:3};
    storage.setItem(key,JSON.stringify(snapshot));
    const event=new Event('storage');event.key=key;event.newValue=storage.getItem(key);window.dispatchEvent(event);
    assert.equal(d.view.ready,false);assert.equal(d.view.phase,'paused');
    const reads=db.reads.length;await wait(180);assert.equal(db.reads.length,reads);
    document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(d.view.ready,false);await until(()=>d.view.ready);
    assert.equal(db.reads.length,reads+1);assert.equal(d.journal.profile.name,'Peer save');
  }finally{document.visibilityState='visible';d.sync.stop();}
});

test('an older client omitting appearance restores known colors once, then stays idle',async()=>{
  const saved=fixture();saved.preferences.palettes.dark.background='#030509';saved.preferences.typography.body=20;
  const db=server(saved),storage=new MemoryStorage();delete db.row.journal.preferences;
  storage.setItem(key,JSON.stringify({journal:saved,base:saved,revision:1,approved:true,dirty:false}));
  const d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    assert.deepEqual(db.row.journal.preferences,saved.preferences);assert.equal(db.writes,1);
    d.sync.retry();await until(()=>d.view.ready);assert.equal(db.writes,1);
    assert.ok(d.sync.previousJournal());
  }finally{d.sync.stop();}
});

const extraNutrients=['fiber','saturatedFat','sugar','addedSugar','sodium'];
function nutritionFixture() {
  const state=fixture();state.profile.insulinResistance=true;
  state.foods=[{...state.foods[0],id:'custom-food',name:'My bread',fiber:6.4,saturatedFat:1.2,sugar:4,addedSugar:2,sodium:321,
    nutrientNote:'From my label.',nutrientSource:'https://example.com/nutrition'}];
  state.days['2026-10-12']={entries:[newEntry(state.foods[0],1,'portion','Lunch','saved-food')],note:''};
  return state;
}
function withoutNutrition(state) {
  const older=structuredClone(state);delete older.profile.insulinResistance;
  for(const item of [...older.foods,...Object.values(older.days).flatMap(day=>day.entries.map(entry=>entry.food))])for(const key of [...extraNutrients,'nutrientNote','nutrientSource'])delete item[key];
  return older;
}
function assertSavedNutrition(journal,saved) {
  assert.equal(journal.profile.insulinResistance,true);
  for(const key of [...extraNutrients,'nutrientNote','nutrientSource']) {
    assert.equal(journal.foods[0][key],saved.foods[0][key]);
    assert.equal(journal.days['2026-10-12'].entries[0].food[key],saved.days['2026-10-12'].entries[0].food[key]);
  }
}

test('raw remote legacy journals preserve known nutrition and materialize it once',async()=>{
  const saved=nutritionFixture(),db=server(withoutNutrition(saved)),storage=new MemoryStorage();
  storage.setItem(key,JSON.stringify({journal:saved,base:saved,revision:1,approved:true,dirty:false}));
  const d=device(db,{storage});
  try {
    await until(()=>d.view.ready);assertSavedNutrition(d.journal,saved);assertSavedNutrition(db.row.journal,saved);
    assert.equal(db.writes,1);
    d.sync.retry();await until(()=>d.view.ready);assert.equal(db.writes,1);
  }finally{d.sync.stop();}
});

test('legacy peer cache storage events preserve raw nutrition omissions before defaults are filled',async()=>{
  const saved=nutritionFixture(),db=server(saved),storage=new MemoryStorage(),d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    const older=withoutNutrition(saved);older.profile.name='An older tab';
    db.row={user_id:id,journal:structuredClone(older),revision:2};
    storage.setItem(key,JSON.stringify({journal:older,base:older,revision:2,approved:true,dirty:false,checkedAt:Date.now(),protocol:3}));
    const event=new Event('storage');event.key=key;event.newValue=storage.getItem(key);window.dispatchEvent(event);
    assert.equal(d.view.ready,false);assertSavedNutrition(d.journal,saved);
    d.sync.retry();await until(()=>d.view.ready);
    assertSavedNutrition(db.row.journal,saved);assert.equal(d.journal.profile.name,'An older tab');assert.equal(db.writes,1);
  }finally{d.sync.stop();}
});

test('legacy peer caches read under the writer lock retain catalog and snapshot nutrition',async()=>{
  const saved=nutritionFixture(),db=server(saved),storage=new MemoryStorage(),d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    const older=withoutNutrition(saved);older.profile.name='A pending older tab';
    storage.setItem(key,JSON.stringify({journal:older,base:withoutNutrition(saved),revision:1,approved:true,dirty:true,protocol:3}));
    d.sync.retry();await until(()=>d.view.ready);
    assertSavedNutrition(d.journal,saved);assertSavedNutrition(db.row.journal,saved);
    assert.equal(d.journal.profile.name,'A pending older tab');assert.equal(db.writes,1);
  }finally{d.sync.stop();}
});

test('current peer caches can explicitly clear nutrition and uncheck insulin resistance',async()=>{
  const saved=nutritionFixture(),db=server(saved),storage=new MemoryStorage(),d=device(db,{storage});
  try {
    await until(()=>d.view.ready);
    const current=structuredClone(d.journal);current.profile.insulinResistance=false;
    for(const item of [current.foods[0],current.days['2026-10-12'].entries[0].food])for(const key of extraNutrients)item[key]=null;
    db.row={user_id:id,journal:current,revision:2};
    storage.setItem(key,JSON.stringify({journal:current,base:current,revision:2,approved:true,dirty:false,checkedAt:Date.now(),protocol:3}));
    const event=new Event('storage');event.key=key;event.newValue=storage.getItem(key);window.dispatchEvent(event);
    await until(()=>d.view.ready);assert.equal(d.journal.profile.insulinResistance,false);
    for(const item of [d.journal.foods[0],d.journal.days['2026-10-12'].entries[0].food])for(const key of extraNutrients)assert.equal(item[key],null);
    assert.equal(db.writes,0);
  }finally{d.sync.stop();}
});
