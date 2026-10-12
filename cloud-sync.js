import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './sync-config.js';
import { STORAGE_KEY, createInitialState, validateState } from './core.js?v=8';
import { DEFAULT_PREFERENCES } from './preferences.js?v=8';
import { rebaseJournal, sameJournal } from './journal-merge.js?v=8';
import { validateCloudJournal } from './sync-journal.js?v=8';

export function createJournalSync({ applyJournal, statusChanged, client:providedClient, storage:localCache=localStorage, timeoutMs=15000, pollMs=30000 }) {
  const client=providedClient||createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{storageKey:'daily-balance-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'},
    global:{fetch:(url,options)=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(timeoutMs)})},
  });
  let user=null,cache=null,phase='starting',epoch=0,activeRun=null,timer,stopped=false;
  let confirmed=false,refreshRequired=true,retryCount=0,rerun=false;
  const cacheKey=id=>'daily-balance-account-'+id;
  const emit=(next,message='')=>{
    phase=next;
    statusChanged({phase,message,email:user?.email||'',signedIn:!!user,
      ready:phase==='local'||!!(user&&confirmed&&phase==='synced'&&!cache?.dirty)});
  };
  function writeSnapshot(key,value) {
    const next=JSON.stringify(value),previous=localCache.getItem(key);
    if(next===previous)return;
    if(previous)try{JSON.parse(previous);localCache.setItem(key+'-recovery',previous);}catch{/* Prioritize the primary write. */}
    localCache.setItem(key,next);
  }
  function persist(){if(user&&cache)writeSnapshot(cacheKey(user.id),{...cache,protocol:2});}
  function guest() {
    for(const key of [STORAGE_KEY,STORAGE_KEY+'-recovery'])try{return validateState(JSON.parse(localCache.getItem(key)));}catch{/* Try recovery. */}
    return createInitialState();
  }
  function decodeCache(raw) {
    const value=JSON.parse(raw);
    if(!value||!Number.isSafeInteger(value.revision)||value.revision<0)throw new Error('Invalid cached revision.');
    return {journal:validateState(value.journal),base:value.base?validateState(value.base):null,
      revision:value.revision,dirty:value.dirty===true,approved:value.approved===true};
  }
  function cached(id) {
    const key=cacheKey(id);
    // Preserve upgrade snapshots for recovery without publishing any user data.
    for(const suffix of ['', '-recovery'])try {
      const raw=localCache.getItem(key+suffix),value=decodeCache(raw);
      if(JSON.parse(raw).protocol!==2)for(const oldSuffix of ['', '-recovery'])try {
        const old=localCache.getItem(key+oldSuffix);decodeCache(old);
        if(!localCache.getItem(key+'-before-sync-update'+oldSuffix))localCache.setItem(key+'-before-sync-update'+oldSuffix,old);
      }catch{/* An extra recovery snapshot must not prevent syncing. */}
      return value;
    }catch{/* Try the previous account snapshot. */}
    return null;
  }
  function schedule(delay=0) {
    clearTimeout(timer);
    if(!stopped&&user&&phase!=='choose')timer=setTimeout(()=>{
      if(!cache.dirty)refreshRequired=true;
      void synchronize();
    },delay);
  }
  function failure(error) {
    const offline=!navigator.onLine||error instanceof TypeError||/Failed to fetch|NetworkError|Load failed/.test(error.message||'');
    const message=offline?'Connection unavailable. Editing is paused; saved changes will retry when connected.'
      :error.code==='SYNC_TIMEOUT'?'Sync took too long. Editing is paused; your saved changes will retry automatically.'
      :['42P01','PGRST202','PGRST205'].includes(error.code)?'Cloud setup needs attention. Your local journal is kept.'
      :error.code==='42501'?'Cloud access was denied. Your local journal is kept.'
      :error.message||'Sync could not be confirmed. Your local journal is kept.';
    emit(offline?'offline':'error',message);
    if(navigator.onLine)schedule(Math.min(60000,2000*2**Math.min(retryCount++,5)));
  }
  function apply(journal,remoteUpdate=false){applyJournal(structuredClone(journal),{remoteUpdate});}
  function accept(journal,revision,remoteUpdate=false) {
    cache={journal:structuredClone(journal),base:structuredClone(journal),revision,dirty:false,approved:true};
    persist();confirmed=true;refreshRequired=false;retryCount=0;
    apply(journal,remoteUpdate);emit('synced');
  }
  async function synchronize() {
    if(stopped||!user||!cache||phase==='choose')return;
    if(document.visibilityState==='hidden'){emit('paused','This device checks the account before editing when you return.');return;}
    if(activeRun){rerun=true;return;}
    if(!navigator.onLine){emit('offline','Connection unavailable. Editing is paused until this device reconnects.');return;}
    const run={epoch,id:user.id,controller:new AbortController(),cancelled:false};
    activeRun=run;rerun=false;
    const check=()=>{if(run.cancelled||epoch!==run.epoch||stopped)throw new DOMException('Sync cancelled.','AbortError');};
    const deadline=new Promise((_,reject)=>{
      run.deadline=setTimeout(()=>{
        run.cancelled=true;run.controller.abort();
        reject(Object.assign(new Error('Sync took too long.'),{code:'SYNC_TIMEOUT'}));
      },timeoutMs);
      run.controller.signal.addEventListener('abort',()=>{
        if(!run.cancelled)reject(new DOMException('Sync cancelled.','AbortError'));
      },{once:true});
    });
    const task=async()=>{
      const {signal}=run.controller;
      const getRow=async(full)=>{
        const {data,error}=await client.from('daily_balance_journals')
          .select(full?'user_id,journal,revision':'user_id,revision').eq('user_id',run.id).abortSignal(signal).maybeSingle();
        check();if(error)throw error;
        if(data&&(data.user_id!==run.id||!Number.isSafeInteger(data.revision)||data.revision<1))throw new Error('Cloud journal response is invalid. Your local journal was kept.');
        return data;
      };
      const load=async row=>{
        const fallback=cache.approved?(cache.base||cache.journal):undefined;
        const remote=validateCloudJournal(row.journal,fallback);
        if(row.journal.preferences===undefined&&!fallback) {
          const theme=localCache.getItem('daily-balance-theme');
          if(['light','dark'].includes(theme))remote.preferences.theme=theme;
        }
        const materialize=!sameJournal(validateState(row.journal),remote);
        const desired=cache.dirty?rebaseJournal(cache.base||createInitialState(),cache.journal,remote):remote;
        if(!cache.dirty&&!materialize){accept(remote,row.revision,!sameJournal(cache.journal,remote));return;}
        cache={journal:desired,base:structuredClone(remote),revision:row.revision,dirty:materialize||!sameJournal(desired,remote),approved:true};
        persist();apply(desired);
        if(!cache.dirty)accept(remote,row.revision);
      };
      emit('syncing',cache.dirty?'Saving your changes to the account. Editing resumes after confirmation.':'Checking the latest account copy before editing.');
      if(!confirmed||refreshRequired) {
        const row=await getRow(!confirmed||!cache.base);
        if(row&&(!confirmed||!cache.base||row.revision!==cache.revision))await load(row.journal?row:await getRow(true));
        else if(!row) {
          if(cache.revision>0)throw new Error('The account journal is unavailable. Your local copy is kept; retry sync before editing.');
          if(!cache.approved&&(cache.journal.profileReady||cache.journal.weights.length||Object.keys(cache.journal.days).length||Object.keys(cache.journal.workouts.days).length||!sameJournal(cache.journal.preferences,DEFAULT_PREFERENCES))) {
            emit('choose','Upload this browser’s journal to connect it to your empty account.');return;
          }
          cache.approved=true;persist();confirmed=true;refreshRequired=false;
          if(!cache.dirty){emit('synced');return;}
        } else {confirmed=true;refreshRequired=false;if(!cache.dirty)emit('synced');}
      }
      if(!cache.dirty)return;
      // One atomic write per normal edit. A competing device triggers a bounded
      // re-read and rebase of changed fields, never replacement of a whole copy.
      for(let attempt=0;attempt<3;attempt++) {
        check();const expected=cache.revision,sent=structuredClone(cache.journal);
        const {data,error}=await client.rpc('save_daily_balance_journal',{p_journal:sent,p_expected_revision:expected}).abortSignal(signal);
        check();
        if(error?.code==='40001') {
          const latest=await getRow(true);
          if(!latest)throw new Error('The account journal is unavailable. Your local copy is kept.');
          await load(latest);
          if(!cache.dirty)return;
          continue;
        }
        if(error)throw error;
        const saved=Array.isArray(data)?data[0]:data;
        if(!saved||saved.user_id!==run.id||saved.revision!==expected+1)throw new Error('Cloud save was not confirmed. Your changes remain saved on this device.');
        const journal=validateCloudJournal(saved.journal,sent),current=cache.journal;
        const next=sameJournal(sent,current)?journal:rebaseJournal(sent,current,journal);
        if(sameJournal(next,journal)){accept(journal,saved.revision);return;}
        cache={journal:next,base:structuredClone(journal),revision:saved.revision,dirty:true,approved:true};persist();apply(next);
      }
      throw new Error('Another device is saving at the same time. Your changes are kept and will retry shortly.');
    };
    try {
      const locked=async()=>{
        check();
        // Same-browser tabs share one writer; separate devices use revision checks.
        const shared=cached(run.id);
        if(shared&&shared.revision>=cache.revision) {
          const wasDirty=cache.dirty;
          if(wasDirty&&!sameJournal(cache.journal,shared.journal))shared.journal=rebaseJournal(cache.base||createInitialState(),cache.journal,shared.journal);
          shared.dirty=shared.dirty||wasDirty||!!(shared.base&&!sameJournal(shared.journal,shared.base));cache=shared;
        }
        return task();
      };
      const operation=navigator.locks?navigator.locks.request('daily-balance-sync-'+run.id,{signal:run.controller.signal},locked):locked();
      await Promise.race([operation,deadline]);
    }catch(error){if(epoch===run.epoch&&!stopped&&error.name!=='AbortError')failure(error);}
    finally {
      clearTimeout(run.deadline);run.cancelled=true;
      if(activeRun===run)activeRun=null;
      if(epoch===run.epoch&&!stopped&&!['choose','offline','error','paused'].includes(phase))schedule(cache.dirty||rerun?0:pollMs);
      else if(epoch!==run.epoch&&!stopped&&user)schedule(0);
    }
  }
  function bind(session) {
    const next=session?.user||null;
    if(next?.id===user?.id&&phase!=='starting'&&(next||phase==='local'))return;
    epoch++;activeRun?.controller.abort();clearTimeout(timer);user=next;
    confirmed=false;refreshRequired=true;retryCount=0;
    if(!user){cache=null;apply(guest());emit('local');return;}
    cache=cached(user.id)||{journal:guest(),base:null,revision:0,dirty:false,approved:false};
    apply(cache.journal);emit('syncing','Loading the latest account copy. Editing is paused.');schedule(0);
  }
  const {data:listener}=client.auth.onAuthStateChange((event,session)=>{
    if(['SIGNED_OUT','SIGNED_IN','INITIAL_SESSION'].includes(event))setTimeout(()=>bind(session),0);
  });
  const authTimer=setTimeout(()=>{if(phase==='starting')emit('error','Sign-in check took too long. Reload before editing.');},timeoutMs);
  client.auth.getSession().then(({data,error})=>{
    clearTimeout(authTimer);if(error)failure(error);else bind(data.session);
  }).catch(error=>{clearTimeout(authTimer);failure(error);});
  const resume=()=>{
    if(!user||document.visibilityState!=='visible'||activeRun)return;
    refreshRequired=true;emit('syncing','Checking changes from your other devices before editing.');schedule(0);
  };
  const visibility=()=>{
    if(document.visibilityState==='hidden'&&user){clearTimeout(timer);refreshRequired=true;emit('paused','Editing resumes after this device checks the account.');}
    else resume();
  };
  const online=()=>{retryCount=0;resume();};
  const offline=()=>{if(user){activeRun?.controller.abort();clearTimeout(timer);emit('offline','Connection unavailable. Editing is paused until this device reconnects.');}};
  const storage=event=>{
    if(!user||event.key!==cacheKey(user.id)||!event.newValue)return;
    try {
      const incoming=decodeCache(event.newValue);
      if(incoming.revision<cache.revision)return;
      if(cache.dirty&&!sameJournal(cache.journal,incoming.journal)) {
        incoming.journal=rebaseJournal(cache.base||createInitialState(),cache.journal,incoming.journal);
        incoming.dirty=!sameJournal(incoming.journal,incoming.base);
      }
      cache=incoming;refreshRequired=true;
      emit('syncing','Checking the change saved in another tab.');
      if(!activeRun)apply(cache.journal,true);
      schedule(0);
    }catch(error){failure(error);}
  };
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  window.addEventListener('focus',resume);window.addEventListener('storage',storage);
  document.addEventListener('visibilitychange',visibility);
  return {
    isSignedIn:()=>!!user,
    saveLocal(journal) {
      if(!user){if(phase!=='local')throw new Error('Wait for sign-in to finish.');writeSnapshot(STORAGE_KEY,validateState(journal));return;}
      if(!confirmed||phase!=='synced'||cache.dirty||!navigator.onLine)throw new Error('Wait until this device is synced before editing.');
      const next=validateState(journal);if(sameJournal(next,cache.journal))return;
      cache.journal=structuredClone(next);cache.dirty=true;
      try{persist();}catch(error){emit('error','Browser storage could not save this change. Editing is paused; export a backup before leaving.');throw error;}
      emit('pending','Saving your changes. Editing resumes after the account confirms them.');schedule(0);
    },
    async signIn(email){const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;},
    async signOut(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;bind(null);},
    uploadLocal(){if(phase!=='choose')return;cache.approved=true;cache.dirty=true;cache.base=createInitialState();persist();emit('pending','Uploading your journal. Editing resumes after confirmation.');schedule(0);},
    startEmpty(){if(phase!=='choose')return;const empty=createInitialState();cache={journal:empty,base:null,revision:0,dirty:true,approved:true};persist();apply(empty);emit('pending','Creating your account journal.');schedule(0);},
    retry(){retryCount=0;refreshRequired=true;if(user&&phase!=='choose'){emit('syncing','Checking the latest account copy.');schedule(0);}},
    previousJournal(){
      if(!user)return null;const key=cacheKey(user.id);
      for(const suffix of ['-before-sync-update-recovery','-before-sync-update','-recovery'])try{return decodeCache(localCache.getItem(key+suffix)).journal;}catch{/* Try another saved snapshot. */}
      return null;
    },
    stop(){stopped=true;clearTimeout(timer);clearTimeout(authTimer);activeRun?.controller.abort();listener.subscription.unsubscribe();
      window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',resume);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visibility);},
  };
}
