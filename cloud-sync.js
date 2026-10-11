import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './sync-config.js';
import { STORAGE_KEY, createInitialState, validateState } from './core.js';
import { JournalConflict, mergeJournals, sameJournal } from './journal-merge.js';

export function createJournalSync({ applyJournal, statusChanged, canRefresh }) {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey: 'daily-balance-auth', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: true, flowType: 'implicit' },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  let user = null, cache = null, phase = 'starting', message = 'Checking sign-in…';
  let epoch = 0, busy = false, queued = false, timer, stopped = false, revisionRetries = 0;
  const hasRecords = journal => journal.profileReady || journal.weights.length || Object.keys(journal.days).length;
  const cacheKey = id => `daily-balance-account-${id}`;
  const emit = (next, detail = '') => {
    phase = next; message = detail;
    statusChanged({ phase, message, email: user?.email || '', signedIn: !!user });
  };
  function persist() {
    if (user && cache) localStorage.setItem(cacheKey(user.id), JSON.stringify(cache));
  }
  function guest() {
    try { return validateState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return createInitialState(); }
  }
  function cached(id) {
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey(id)));
      if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) return null;
      return { journal: validateState(value.journal), base: value.base ? validateState(value.base) : null,
        revision: value.revision, dirty: !!value.dirty, approved: !!value.approved };
    } catch { return null; }
  }
  function showError(error) {
    if (!navigator.onLine || error instanceof TypeError || error.name === 'TimeoutError') {
      emit('offline', 'Changes are saved on this device. Sync will retry when connected.');
    } else if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code)) {
      emit('error', 'Cloud setup is incomplete. Run the Supabase database setup first.');
    } else if (error.code === '42501') {
      emit('error', 'Cloud access was denied. Check the Supabase permissions and policies.');
    } else {
      emit('error', error.message || 'Sync failed. Your changes are still saved on this device.');
    }
  }
  function schedule(delay = 800) {
    clearTimeout(timer);
    timer = setTimeout(() => void synchronize(), delay);
  }
  async function synchronize() {
    if (!user || !cache || stopped || ['choose', 'conflict'].includes(phase)) return;
    if (busy) { queued = true; return; }
    if (!cache.dirty && !canRefresh()) return;
    if (!navigator.onLine) { emit('offline', 'Changes are saved on this device. Waiting for a connection.'); return; }
    busy = true; queued = false;
    const runEpoch = epoch, id = user.id;
    try {
      emit('syncing');
      const { data: row, error } = await client.from('daily_balance_journals')
        .select('user_id,journal,revision,updated_at').eq('user_id', id).maybeSingle();
      if (runEpoch !== epoch) return;
      if (error) throw error;
      const remote = row ? validateState(row.journal) : null;
      if (row && (row.user_id !== id || !Number.isSafeInteger(Number(row.revision)))) {
        throw new Error('Cloud journal response is invalid. Your local journal was kept.');
      }
      if (!cache.approved) {
        if (remote) {
          cache = { journal: remote, base: remote, revision: Number(row.revision), dirty: false, approved: true };
          persist(); applyJournal(remote); emit('synced'); return;
        }
        if (hasRecords(cache.journal)) { emit('choose', 'Upload this browser’s journal to start syncing it with your account.'); return; }
        cache.approved = true; persist(); emit('synced'); return;
      }
      let desired = cache.journal;
      if (remote && cache.dirty) {
        if (!cache.base) throw new JournalConflict();
        desired = mergeJournals(cache.base, cache.journal, remote);
      } else if (remote) {
        cache = { journal: remote, base: remote, revision: Number(row.revision), dirty: false, approved: true };
        persist(); applyJournal(remote); emit('synced'); return;
      } else if (cache.revision > 0) {
        throw new Error('The cloud journal is missing. Export your local backup before recreating it.');
      } else if (!cache.dirty) { emit('synced'); return; }

      // Capture the local copy separately so edits made during this request survive.
      const localBeforeSave = structuredClone(cache.journal);
      const expected = row ? Number(row.revision) : 0;
      const { data: saved, error: saveError } = await client.rpc('save_daily_balance_journal', {
        p_journal: desired, p_expected_revision: expected,
      });
      if (runEpoch !== epoch) return;
      if (saveError?.code === '40001') {
        if (++revisionRetries >= 3) throw new Error('The account journal kept changing. Your edits are saved here; try Sync now again.');
        queued = true; return;
      }
      if (saveError) throw saveError;
      const result = Array.isArray(saved) ? saved[0] : saved;
      if (!result || result.user_id !== id || Number(result.revision) !== expected + 1) {
        throw new Error('Cloud save could not be confirmed. Your local changes were kept.');
      }
      const confirmed = validateState(result.journal);
      revisionRetries = 0;
      const stillEditing = !sameJournal(localBeforeSave, cache.journal);
      const journal = stillEditing ? mergeJournals(localBeforeSave, cache.journal, confirmed) : confirmed;
      cache = { journal, base: confirmed, revision: Number(result.revision), dirty: !sameJournal(journal, confirmed), approved: true };
      persist(); applyJournal(journal);
      emit(cache.dirty ? 'pending' : 'synced');
      if (cache.dirty) queued = true;
    } catch (error) {
      if (runEpoch !== epoch) return;
      if (error instanceof JournalConflict) emit('conflict', error.message);
      else showError(error);
    } finally {
      busy = false;
      if (queued && !stopped) schedule(1000);
    }
  }
  async function bind(session) {
    const next = session?.user || null;
    if (next?.id === user?.id) { if (next) schedule(0); return; }
    epoch++; revisionRetries = 0; clearTimeout(timer);
    user = next;
    if (!user) { cache = null; applyJournal(guest()); emit('local'); return; }
    cache = cached(user.id) || { journal: guest(), base: null, revision: 0, dirty: false, approved: false };
    applyJournal(cache.journal);
    emit('syncing'); schedule(0);
  }
  // Do not call the auth client inside its auth-state callback's lock.
  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      setTimeout(() => void bind(session), 0);
    }
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) showError(error);
    else if (!data.session && !user) emit('local');
    else void bind(data.session);
  }).catch(showError);
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') void synchronize();
  }, 30000);
  const resume = () => { if (document.visibilityState === 'visible') schedule(0); };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('storage', event => {
    if (!user || event.key !== cacheKey(user.id) || !event.newValue) return;
    const incoming = cached(user.id);
    if (!incoming) return;
    try {
      if (cache.dirty && !sameJournal(cache.journal, incoming.journal)) {
        if (!cache.base || !incoming.base || !sameJournal(cache.base, incoming.base)) throw new JournalConflict();
        cache.journal = mergeJournals(cache.base, cache.journal, incoming.journal);
        cache.dirty = true; persist();
      } else cache = incoming;
      applyJournal(cache.journal); schedule(0);
    } catch (error) { emit('conflict', error.message); }
  });
  return {
    isSignedIn: () => !!user,
    saveLocal(journal) {
      if (!user) { localStorage.setItem(STORAGE_KEY, JSON.stringify(journal)); return; }
      if (sameJournal(cache.journal, journal)) return;
      cache.journal = structuredClone(journal); cache.dirty = true; persist();
      if (!['choose', 'conflict'].includes(phase)) { emit('pending'); schedule(); }
    },
    async signIn(email) {
      const { error } = await client.auth.signInWithOtp({ email,
        options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      await bind(null);
    },
    uploadLocal() {
      if (phase !== 'choose') return;
      cache.approved = true; cache.dirty = true; persist(); emit('pending'); schedule(0);
    },
    startEmpty() {
      if (phase !== 'choose') return;
      const empty = createInitialState();
      cache = { journal: empty, base: null, revision: 0, dirty: false, approved: true };
      persist(); applyJournal(empty); emit('synced');
    },
    async resolveConflict(useLocal) {
      if (!user || phase !== 'conflict' || busy) return;
      const runEpoch = epoch;
      const { data: row, error } = await client.from('daily_balance_journals')
        .select('user_id,journal,revision').eq('user_id', user.id).maybeSingle();
      if (runEpoch !== epoch) return;
      if (error) throw error;
      if (!row) throw new Error('No cloud journal was found. Your local journal was kept.');
      const remote = validateState(row.journal);
      if (useLocal) {
        // Saving against this exact revision still protects against another racing edit.
        cache.base = remote; cache.revision = Number(row.revision); cache.dirty = true;
      } else {
        cache = { journal: remote, base: remote, revision: Number(row.revision), dirty: false, approved: true };
        applyJournal(remote);
      }
      persist(); emit('pending'); schedule(0);
    },
    retry: () => { revisionRetries = 0; if (!['choose', 'conflict'].includes(phase)) schedule(0); },
    stop() { stopped = true; clearTimeout(timer); clearInterval(interval); listener.subscription.unsubscribe(); },
  };
}
