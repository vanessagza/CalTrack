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
function device(db,{storage=new MemoryStorage(),timeoutMs=500,pollMs=60000}={}) {
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
    assert.match(d.view.message,/too long/);
    const readCount=db.reads.length;await wait(50);assert.equal(db.reads.length,readCount);
    db.holdRead=null;db.row.journal.profile.name='Latest';db.row.revision++;
    d.sync.retry();await until(()=>d.view.ready);assert.equal(d.journal.profile.name,'Latest');
    release();await wait(5);assert.equal(d.journal.profile.name,'Latest');
  }finally{release?.();d.sync.stop();}
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
