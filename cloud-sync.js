import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './sync-config.js';
import { STORAGE_KEY, createInitialState, validateState } from './core.js?v=10';
import { DEFAULT_PREFERENCES,validatePreferences } from './preferences.js?v=10';
import { rebaseJournal, sameJournal } from './journal-merge.js?v=10';
import { validateCloudJournal,sameAppearance,rebaseAppearance } from './sync-journal.js?v=10';

export function createJournalSync({ applyJournal, statusChanged, client:providedClient, storage:localCache=localStorage, timeoutMs=45000, pollMs=300000 }) {
  const client=providedClient||createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{storageKey:'daily-balance-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'},
    global:{fetch:(url,options)=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(timeoutMs)})},
  });
  let user=null,cache=null,phase='starting',epoch=0,activeRun=null,timer,stopped=false;
  let confirmed=false,refreshRequired=true,rerun=false,circuitOpen=false,lastFailure=null;
  const cacheKey=id=>'daily-balance-account-'+id;
  const emit=(next,message='')=>{
    phase=next;
    statusChanged({phase,message,error:lastFailure,email:user?.email||'',signedIn:!!user,
      ready:phase==='local'||!!(user&&confirmed&&phase==='synced'&&!cache?.dirty&&document.visibilityState==='visible')});
  };
  function writeSnapshot(key,value) {
    const next=JSON.stringify(value),previous=localCache.getItem(key);
    if(next===previous)return;
    if(previous)try{JSON.parse(previous);localCache.setItem(key+'-recovery',previous);}catch{/* Prioritize the primary write. */}
    localCache.setItem(key,next);
  }
  function persist() {
    if(!user||!cache)return;
    const key=cacheKey(user.id),next={...cache,protocol:3};let confirmationOnly=false;
    try {
      const previous=JSON.parse(localCache.getItem(key));
      confirmationOnly=sameJournal({...previous,checkedAt:0},{...next,checkedAt:0});
    }catch{/* A malformed primary still falls back to a full recovery snapshot. */}
    if(confirmationOnly)localCache.setItem(key,JSON.stringify(next));
    else writeSnapshot(key,next);
  }
  const appearanceKey=id=>cacheKey(id)+'-appearance';
  function readAppearance(id) {
    for(const suffix of ['', '-recovery'])try {
      const value=JSON.parse(localCache.getItem(appearanceKey(id)+suffix));
      if(value?.version!==1||typeof value.pending!=='boolean')continue;
      return {...value,preferences:validatePreferences(value.preferences),base:validatePreferences(value.base)};
    }catch{/* Try the independent appearance snapshot. */}
    return null;
  }
  function keepAppearance(preferences,base,revision,pending) {
    if(!user)return;
    writeSnapshot(appearanceKey(user.id),{version:1,preferences:validatePreferences(preferences),base:validatePreferences(base),revision,pending});
  }
  function guest() {
    for(const key of [STORAGE_KEY,STORAGE_KEY+'-recovery'])try{return validateState(JSON.parse(localCache.getItem(key)));}catch{/* Try recovery. */}
    return createInitialState();
  }
  function decodeCache(raw) {
    const value=JSON.parse(raw);
    if(!value||!Number.isSafeInteger(value.revision)||value.revision<0)throw new Error('Invalid cached revision.');
    return {journal:validateState(value.journal),base:value.base?validateState(value.base):null,
      revision:value.revision,dirty:value.dirty===true,approved:value.approved===true,
      checkedAt:Number.isSafeInteger(value.checkedAt)&&value.checkedAt>0?value.checkedAt:0};
  }
  function cached(id) {
    const key=cacheKey(id);
    // Preserve upgrade snapshots for recovery without publishing any user data.
    for(const suffix of ['', '-recovery'])try {
      const raw=localCache.getItem(key+suffix),value=decodeCache(raw);
      if(JSON.parse(raw).protocol!==3)for(const oldSuffix of ['', '-recovery'])try {
        const old=localCache.getItem(key+oldSuffix);decodeCache(old);
        if(!localCache.getItem(key+'-before-sync-update'+oldSuffix))localCache.setItem(key+'-before-sync-update'+oldSuffix,old);
      }catch{/* An extra recovery snapshot must not prevent syncing. */}
      return value;
    }catch{/* Try the previous account snapshot. */}
    return null;
  }
  const freshSnapshot=value=>value.approved&&!value.dirty&&value.checkedAt>0&&value.checkedAt<=Date.now()
    &&Date.now()-value.checkedAt<pollMs&&(value.base?sameJournal(value.journal,value.base):value.revision===0);
  const nextPollDelay=()=>Math.min(pollMs,Math.max(1,pollMs-(Date.now()-(cache.checkedAt||0))));
  function schedule(delay=0,background=false) {
    clearTimeout(timer);
    if(!stopped&&user&&!circuitOpen&&phase!=='choose')timer=setTimeout(()=>{
      if(!cache.dirty)refreshRequired=true;
      void synchronize(background);
    },delay);
  }
  function failure(error,stage='request') {
    clearTimeout(timer);circuitOpen=true;
    const offline=!navigator.onLine||error instanceof TypeError||/Failed to fetch|NetworkError|Load failed/.test(error.message||'');
    const message=offline?'Connection unavailable. Your local journal is kept. Reconnect or choose Retry sync.'
      :error.code==='SYNC_TIMEOUT'&&stage==='waiting for another tab'?'Another app tab did not release its sync lock. Automatic retries have stopped. Close unused app tabs, then choose Retry sync.'
      :error.code==='SYNC_TIMEOUT'?'The Supabase database did not respond in time. Automatic retries have stopped. Your local journal is kept; choose Retry sync after the service recovers.'
      :['42P01','PGRST202','PGRST205'].includes(error.code)?'Cloud setup needs attention. Your local journal is kept.'
      :error.code==='42501'?'Cloud access was denied. Your local journal is kept.'
      :error.message||'Sync could not be confirmed. Your local journal is kept.';
    lastFailure={code:String(error.code||error.name||'SYNC_ERROR'),stage,message:String(error.message||message)};
    emit(offline?'offline':'error',message);
  }
  function apply(journal,remoteUpdate=false){applyJournal(structuredClone(journal),{remoteUpdate});}
  function accept(journal,revision,remoteUpdate=false) {
    cache={journal:structuredClone(journal),base:structuredClone(journal),revision,dirty:false,approved:true,checkedAt:Date.now()};
    persist();
    try{keepAppearance(journal.preferences,journal.preferences,revision,false);}catch{/* The full journal remains the primary recovery copy. */}
    confirmed=true;refreshRequired=false;circuitOpen=false;lastFailure=null;
    apply(journal,remoteUpdate);emit('synced');
  }
  async function synchronize(background=false) {
    if(stopped||!user||!cache||circuitOpen||phase==='choose')return;
    if(document.visibilityState==='hidden'){emit('paused','This device checks the account before editing when you return.');return;}
    if(activeRun){rerun=true;return;}
    if(!navigator.onLine){emit('offline','Connection unavailable. Editing is paused until this device reconnects.');return;}
    const run={epoch,id:user.id,controller:new AbortController(),cancelled:false,stage:'waiting for another tab'};
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
        run.stage=full?'loading the account journal':'checking the account revision';
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
          cache.approved=true;cache.checkedAt=Date.now();persist();confirmed=true;refreshRequired=false;
          if(!cache.dirty){emit('synced');return;}
        } else {confirmed=true;refreshRequired=false;if(!cache.dirty)accept(cache.journal,cache.revision);}
      }
      if(!cache.dirty)return;
      // One atomic write per normal edit. A competing device triggers a bounded
      // re-read and rebase of changed fields, never replacement of a whole copy.
      for(let attempt=0;attempt<3;attempt++) {
        check();const expected=cache.revision,sent=structuredClone(cache.journal);
        run.stage='saving the account journal';
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
      throw new Error('Another device is saving at the same time. Your changes are kept; choose Retry sync to try again.');
    };
    try {
      const locked=async()=>{
        check();
        // Same-browser tabs share one writer; separate devices use revision checks.
        const shared=cached(run.id);
        if(shared&&shared.revision>=cache.revision) {
          const original=shared.journal;
          shared.journal=validateCloudJournal(shared.journal,cache.base||cache.journal);
          if(shared.base)shared.base=validateCloudJournal(shared.base,cache.base||cache.journal);
          shared.dirty=shared.dirty||!sameJournal(original,shared.journal);
          const wasDirty=cache.dirty;
          if(wasDirty&&!sameJournal(cache.journal,shared.journal))shared.journal=rebaseJournal(cache.base||createInitialState(),cache.journal,shared.journal);
          shared.dirty=shared.dirty||wasDirty||!!(shared.base&&!sameJournal(shared.journal,shared.base));cache=shared;
        }
        // An already-connected tab can reuse a recent server confirmation from
        // another tab. Initial loads, returning to a device and manual checks
        // still contact the account before enabling editing.
        if(background&&confirmed&&freshSnapshot(cache)) {
          refreshRequired=false;apply(cache.journal,true);emit('synced');return;
        }
        return task();
      };
      const operation=navigator.locks?navigator.locks.request('daily-balance-sync-'+run.id,{signal:run.controller.signal},locked):locked();
      await Promise.race([operation,deadline]);
    }catch(error){if(epoch===run.epoch&&!stopped&&error.name!=='AbortError')failure(error,run.stage);}
    finally {
      clearTimeout(run.deadline);run.cancelled=true;
      if(activeRun===run)activeRun=null;
      if(epoch===run.epoch&&!stopped&&!['choose','offline','error','paused'].includes(phase)) {
        if(cache.dirty||rerun)schedule(0);
        else schedule(nextPollDelay(),true);
      }
      else if(epoch!==run.epoch&&!stopped&&user)schedule(0);
    }
  }
  function bind(session) {
    const next=session?.user||null;
    if(next?.id===user?.id&&phase!=='starting'&&(next||phase==='local'))return;
    epoch++;activeRun?.controller.abort();clearTimeout(timer);user=next;
    confirmed=false;refreshRequired=true;circuitOpen=false;lastFailure=null;
    if(!user){cache=null;apply(guest());emit('local');return;}
    cache=cached(user.id)||{journal:guest(),base:null,revision:0,dirty:false,approved:false};
    const appearance=readAppearance(user.id);
    if(appearance?.pending) {
      cache.journal.preferences=rebaseAppearance(appearance.base,appearance.preferences,cache.journal.preferences);
      if(!cache.base)cache.base=createInitialState();
      cache.approved=true;cache.dirty=true;
    } else if(!appearance&&cache.approved)try {
      keepAppearance(cache.journal.preferences,cache.base?.preferences||cache.journal.preferences,cache.revision,cache.dirty&&!sameAppearance(cache.journal.preferences,cache.base?.preferences));
    }catch{/* Existing full-journal snapshots remain available. */}
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
    if(!user||circuitOpen||document.visibilityState!=='visible'||activeRun)return;
    refreshRequired=true;emit('syncing','Checking changes from your other devices before editing.');schedule(150);
  };
  const visibility=()=>{
    if(document.visibilityState==='hidden'&&user){clearTimeout(timer);refreshRequired=true;if(!circuitOpen)emit('paused','Editing resumes after this device checks the account.');}
    else resume();
  };
  const online=()=>{circuitOpen=false;resume();};
  const offline=()=>{if(user){activeRun?.controller.abort();clearTimeout(timer);circuitOpen=true;emit('offline','Connection unavailable. Editing is paused until this device reconnects.');}};
  const storage=event=>{
    if(!user||event.key!==cacheKey(user.id)||!event.newValue)return;
    try {
      const incoming=decodeCache(event.newValue);
      if(incoming.revision<cache.revision)return;
      const original=incoming.journal;
      incoming.journal=validateCloudJournal(incoming.journal,cache.base||cache.journal);
      if(incoming.base)incoming.base=validateCloudJournal(incoming.base,cache.base||cache.journal);
      incoming.dirty=incoming.dirty||!sameJournal(original,incoming.journal);
      if(cache.dirty&&!sameJournal(cache.journal,incoming.journal)) {
        incoming.journal=rebaseJournal(cache.base||createInitialState(),cache.journal,incoming.journal);
        incoming.dirty=!sameJournal(incoming.journal,incoming.base);
      }
      cache=incoming;refreshRequired=true;
      if(circuitOpen){if(!activeRun)apply(cache.journal,true);return;}
      // A running operation adopts this shared cache under the writer lock.
      // Do not queue another check for the confirmation it is already waiting on.
      if(activeRun)return;
      if(document.visibilityState==='hidden') {
        clearTimeout(timer);if(!activeRun)apply(cache.journal,true);
        emit('paused','Editing resumes after this device checks the account.');return;
      }
      if(confirmed&&!activeRun&&['synced','pending'].includes(phase)&&freshSnapshot(cache)) {
        refreshRequired=false;
        try{keepAppearance(cache.journal.preferences,cache.journal.preferences,cache.revision,false);}catch{/* The peer's confirmed journal remains available. */}
        emit('syncing','Applying your other tab’s confirmed changes.');
        apply(cache.journal,true);emit('synced');
        if(cache.dirty)schedule(0);else schedule(nextPollDelay(),true);
        return;
      }
      if(cache.dirty&&!activeRun&&confirmed) {
        emit('pending','Another tab is saving your changes. Editing resumes after account confirmation.');
        apply(cache.journal,true);
        // Give the writer time to confirm. If it closes, this tab checks the
        // account and recovers the staged operation under the shared writer lock.
        schedule(2000,true);return;
      }
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
      const preferencesChanged=!sameAppearance(next.preferences,cache.journal.preferences);
      next.preferences.changeId=preferencesChanged?crypto.randomUUID():cache.journal.preferences.changeId;
      if(sameJournal(next,cache.journal))return;
      cache.journal=structuredClone(next);cache.dirty=true;
      try{
        if(preferencesChanged)keepAppearance(next.preferences,cache.base?.preferences||DEFAULT_PREFERENCES,cache.revision,true);
        persist();
      }catch(error){circuitOpen=true;clearTimeout(timer);emit('error','Browser storage could not save this change. Editing is paused; export a backup before leaving.');throw error;}
      emit('pending','Saving your changes. Editing resumes after the account confirms them.');schedule(0);
    },
    async signIn(email){const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;},
    async signOut(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;bind(null);},
    uploadLocal(){
      if(phase!=='choose')return;
      cache.approved=true;cache.dirty=true;cache.base=createInitialState();
      if(!sameAppearance(cache.journal.preferences,DEFAULT_PREFERENCES)) {
        cache.journal.preferences.changeId=crypto.randomUUID();
        keepAppearance(cache.journal.preferences,DEFAULT_PREFERENCES,cache.revision,true);
      }
      persist();emit('pending','Uploading your journal. Editing resumes after confirmation.');schedule(0);
    },
    startEmpty(){if(phase!=='choose')return;const empty=createInitialState();cache={journal:empty,base:null,revision:0,dirty:true,approved:true};persist();apply(empty);emit('pending','Creating your account journal.');schedule(0);},
    retry(){circuitOpen=false;refreshRequired=true;if(user&&phase!=='choose'){emit('syncing','Checking the latest account copy.');schedule(0);}},
    recoverableAppearance(){
      if(!user)return null;
      const own=readAppearance(user.id);
      if(own&&!sameAppearance(own.preferences,cache.journal.preferences))return own.preferences;
      try {
        const previous=JSON.parse(localCache.getItem(appearanceKey(user.id)+'-recovery'));
        const preferences=validatePreferences(previous.preferences);
        if(!sameAppearance(preferences,cache.journal.preferences))return preferences;
      }catch{/* Try retained full-journal snapshots. */}
      for(const suffix of ['-before-sync-update-recovery','-before-sync-update','-recovery'])try {
        const preferences=decodeCache(localCache.getItem(cacheKey(user.id)+suffix)).journal.preferences;
        if(!sameAppearance(preferences,DEFAULT_PREFERENCES)&&!sameAppearance(preferences,cache.journal.preferences))return preferences;
      }catch{/* Try another valid snapshot for this account only. */}
      return null;
    },
    recoverAppearance(){
      const preferences=this.recoverableAppearance();
      if(!preferences)return false;
      preferences.changeId=crypto.randomUUID();
      keepAppearance(preferences,cache.base?.preferences||cache.journal.preferences,cache.revision,true);
      cache.journal.preferences=preferences;cache.dirty=true;persist();apply(cache.journal);
      if(!circuitOpen){emit('pending','Recovered appearance is saved here and is syncing to your account.');schedule(0);}
      else emit('error','Your previous appearance is restored and saved on this device. Sync is paused until the database recovers; choose Retry sync afterward.');
      return true;
    },
    previousJournal(){
      if(!user)return null;const key=cacheKey(user.id);
      for(const suffix of ['-before-sync-update-recovery','-before-sync-update','-recovery'])try{return decodeCache(localCache.getItem(key+suffix)).journal;}catch{/* Try another saved snapshot. */}
      return null;
    },
    stop(){stopped=true;clearTimeout(timer);clearTimeout(authTimer);activeRun?.controller.abort();listener.subscription.unsubscribe();
      window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',resume);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visibility);},
  };
}
