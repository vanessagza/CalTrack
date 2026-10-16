import {
  STORAGE_KEY, DEFAULT_PROFILE, CATEGORIES, MEALS, NUTRIENTS, EXTRA_NUTRIENTS, nutrientGoals,
  todayKey, ageAt, shiftDate, isDateKey, validateProfile, validateFood,
  calculateGoals, portionNutrition, allowedUnits, unitLabel, newEntry,
  totals, remaining, progress, createInitialState, validateState, suggestions, closeIntakeDays, closedIntakeThrough,
  WORKOUT_GOALS, WORKOUT_EXPERIENCE, WORKOUT_EQUIPMENT, EXERCISE_PRESETS,
  weekDates, validateWorkoutSettings, validateWorkoutEntry, workoutSuggestion,
  suggestWorkoutWeek, copyWorkoutWeek,
  EXERCISE_GROUPS,exerciseCatalog,scheduledExercise,validateExercise,validateSessionNote,
  WARMUP_TEXT,matchesStarterRoutine,starterWeek,workoutConfigKey,clearWorkoutSchedule,
} from './core.js?v=16';
import { createJournalSync } from './cloud-sync.js?v=16';
import { sameJournal } from './journal-merge.js?v=16';
import {validateCloudJournal} from './sync-journal.js?v=16';
import { PALETTE_ROLES, TEXT_ROLES, DEFAULT_PREFERENCES, validatePreferences, colorRGB, colorHex, validateHex, contrastRatio } from './preferences.js?v=16';
import { applyAppearance, prepareProfilePhoto,prepareExerciseImage } from './appearance.js?v=16';
import { workoutDashboard,prescription,guideHTML } from './workout-view.js?v=16';
import {exerciseEnergy,exerciseActiveMinutes,exerciseWeightForDate,workoutDayEnergy,dailyCalorieBalance} from './exercise-energy.js?v=16';
import {exerciseLibraryDashboard,exerciseLibraryResults,exerciseLibraryCount} from './exercise-library-view.js?v=16';
import {weeklyIntakeDashboard} from './weekly-intake-view.js?v=16';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const num = (value, digits = 0) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const nutrientInfo = {
  fiber: ['Fiber', 'g'], saturatedFat: ['Saturated fat', 'g'],
  sugar: ['Total sugar', 'g'], addedSugar: ['Added sugar', 'g'], sodium: ['Sodium', 'mg'],
};
const nutrientValue = (value,key) => value == null ? '—' : num(value,key==='sodium'?0:1);
function nutrientDetails(n, className='') {
  return `<dl class="nutrient-details ${className}">${EXTRA_NUTRIENTS.map(key=>`<div><dt>${nutrientInfo[key][0]}</dt><dd>${nutrientValue(n[key],key)} ${nutrientInfo[key][1]}</dd></div>`).join('')}</dl>`;
}
function secondaryNutrients(g,t) {
  return `<div class="secondary-nutrients" aria-label="Additional daily nutrients"><p class="secondary-nutrient-heading">DAILY NUTRIENTS <a href="#goals">How targets work ↗</a></p>${['fiber','saturatedFat','sugar','sodium'].map(key=>{
    const [label,unit]=nutrientInfo[key],value=t[key],isSugar=key==='sugar';
    const limit=isSugar?g.carbs:g[key],coverage=t.coverage?.[key];
    const partial=coverage&&!coverage.complete,maximum=['saturatedFat','sodium'].includes(key),difference=limit-(value??0);
    const status=value==null?'Missing data':partial?`Known subtotal · ${coverage.known}/${coverage.total} foods${maximum&&difference<0?` · ${num(-difference,key==='sodium'?0:1)} ${unit} over limit`:''}`:isSugar?
      limit>0?'Part of total carbs · no sugar target':'Amount tracked · no positive carb budget':maximum?`${num(Math.abs(difference),key==='sodium'?0:1)} ${unit} ${difference<0?'over limit':'below limit'}`:
      difference>0?`${num(difference,1)} g to goal`:'Goal reached';
    const reference=isSugar?'carbohydrate budget reference':maximum?'limit':'goal';
    const text=`${label}: ${value==null?'unknown':`${nutrientValue(value,key)} ${unit}${partial?', known subtotal':''}`}${limit>0?` compared with ${num(limit,key==='sodium'?0:1)} ${unit} ${reference}`:'; no positive carbohydrate budget is set'}${isSugar?'; this is not a recommended sugar limit':''}${partial?'; some foods have missing data':''}`;
    return `<div class="secondary-nutrient" data-nutrient="${key}"><div class="nutrient-top"><span>${label}</span><span>${nutrientValue(value,key)}${limit>0?` <small>/ ${maximum?'&lt; ':''}${num(limit,key==='sodium'?0:1)} ${unit}${isSugar?' carbs':''}</small>`:` ${unit}`}</span></div><div class="progress-track" role="progressbar" aria-label="${label}" ${limit>0?`aria-valuemin="0" aria-valuemax="${limit}"`:''} ${value==null||limit<=0?'':`aria-valuenow="${Math.min(value,limit)}"`} aria-valuetext="${esc(text)}"><div class="progress-fill" style="width:${limit>0?progress(value??0,limit):0}%"></div></div><div class="nutrient-status">${status}</div></div>`;
  }).join('')}<p class="nutrient-footnote">Sugar shows its share of your carb budget, not a recommended sugar limit. Missing values are excluded; totals may be incomplete.</p></div>`;
}
const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  foods: '<path d="M6 3v7m-3-7v5a3 3 0 0 0 6 0V3M6 11v10m12-18c-3 3-4 6-4 10h5M19 3v18"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7m2-5v6l4 2"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  workout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4m8-4v4m-8 8h2m4 0h2m-8 4h2"/>',
  exercises: '<path d="M2 9v6m2-8v10m4-12v14m8-14v14m4-12v10m2-8v6M8 12h8"/>',
  settings: '<path d="m9 3-.6 2.2-2 .9L4.3 5.5 2 9.5l1.7 1.6v2L2 14.7l2.3 4 2.1-.6 2 .9L9 21h6l.6-2.1 2-.9 2.1.6 2.3-4-1.7-1.5v-2L22 9.5l-2.3-4-2.1.6-2-.9L15 3H9Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  leaf: '<path d="M20 3C11 1 3 5 4 12c1 7 12 8 16-9ZM4 21c3-8 8-11 12-14"/>',
  bread: '<path d="M5 10a4 4 0 0 1 0-8h14a4 4 0 0 1 0 8v10H5V10Zm4 2v4m6-4v4"/>',
  protein: '<path d="M8 5c-3 0-6 3-6 7s3 7 7 7 11-3 12-7-4-10-7-9-3 2-6 2Z"/><path d="M6 12c2-3 7-5 10-5"/>',
  snack: '<path d="m5 5 14 14M6 2l4 4-4 4-4-4 4-4Zm12 12 4 4-4 4-4-4 4-4ZM9 9l6-3 3 3-3 6-6 3-3-3 3-6Z"/>',
  dairy: '<path d="M8 3h8l3 5v13H5V8l3-5ZM5 8h14M8 3l3 5m-2 5h6v4H9v-4Z"/>',
  fruit: '<path d="M12 7c-6-6-12 2-8 9 4 7 6 3 8 3s4 4 8-3c4-7-2-15-8-9ZM12 7c0-3 2-5 5-5m-5 5c-3-1-5-2-5-5"/>',
  scale: '<path d="M3 6h18v15H3V6ZM7 6V3h10v3m-8 9a4 4 0 0 1 6 0m-3-1 2-3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name, extra = '') => `<svg ${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
const categoryIcon = cat => ({ 'Protein':'protein', 'Bread & grains':'bread', 'Dairy':'dairy', 'Snacks':'snack', 'Fruit':'fruit', 'Extras':'leaf' }[cat] || 'leaf');
const tile = f => `<span class="food-tile ${categoryIcon(f.category)}">${icon(categoryIcon(f.category))}</span>`;
const dateText = (date, opts = {}) => new Intl.DateTimeFormat('en-US', { timeZone:'UTC', month:'short', day:'numeric', ...opts }).format(new Date(`${date}T12:00:00Z`));
let state, loadError = '', saveFailed = false, needsSetup = false;
let journalSync;
let syncView = { phase: 'starting', message: '', email: '', signedIn: false,ready:false };
let readyAccount=null,pausedFocus=null;
const appearanceDraft=new Map();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const raw=saved ? JSON.parse(saved) : null;
  state = raw ? validateState(raw) : createInitialState();
  if (!raw?.preferences) {
    const oldTheme=localStorage.getItem('daily-balance-theme');
    if (['light','dark'].includes(oldTheme))state.preferences.theme=oldTheme;
  }
} catch (error) {
  try {
    state=validateState(JSON.parse(localStorage.getItem(STORAGE_KEY+'-recovery')));
    loadError='Your latest saved data could not be read. The previous local snapshot was recovered. Export a backup to keep it.';
  } catch {
    state = createInitialState();
    loadError = 'Your saved data could not be read. Restore a backup before adding new records if you need to recover it.';
  }
}
needsSetup = state.profileReady === false;
const returningFromSignIn = /(?:access_token|refresh_token|error_description)=/.test(location.hash);
let checkingAccount=false;
try{checkingAccount=!!localStorage.getItem('daily-balance-auth');}catch{/* Continue with local setup. */}
if (needsSetup && !checkingAccount && !returningFromSignIn && location.hash !== '#settings') location.hash = 'goals';
let selectedDate = todayKey();
let intakeWeekDate = selectedDate;
let workoutDate = todayKey();
let route = location.hash.slice(1) || 'today';
let foodQuery = '', foodFilter = 'All';
let pickerFood = null, editingEntryId = null, modalUnit = 'portion', foodBasis = '100',foodPortionGrams=100;
let undoState = null, undoRestoresJournal=false, toastTimer, lastFocused = null, pendingImport = null;
let restDeadline=0,restInterval;
let draftExerciseImage='';
let exerciseImageGeneration=0;
let exerciseFilters={search:'',group:'all',equipment:'all',source:'all',status:'active'};

function save() {
  try {
    if (journalSync) journalSync.saveLocal(state);
    else {
      const previous=localStorage.getItem(STORAGE_KEY),next=JSON.stringify(state);
      if(previous&&previous!==next){try{localStorage.setItem(STORAGE_KEY+'-recovery',previous);}catch{/* Keep the main write available. */}}
      localStorage.setItem(STORAGE_KEY,next);
    }
    saveFailed = false;
    appearanceDraft.clear();
    updateSaveStatus();
    return true;
  } catch {
    saveFailed = true;
    updateSaveStatus();
    toast('Changes are only in memory. Export a backup to keep them.', true);
    return false;
  }
}
function updateSaveStatus() {
  const labels = { starting:'Checking sign-in…', local:'Saved in this browser', syncing:'Syncing…',paused:'Check account before editing',
    pending:'Waiting to sync', synced:'Synced to your account', choose:'Ready to connect your journal',
    offline:'Offline · editing paused', error:'Sync unavailable · editing paused' };
  $('#save-status').textContent = saveFailed ? 'Not saved · export backup' : labels[syncView.phase];
  $('.status-dot').classList.toggle('failed', saveFailed || ['error','offline'].includes(syncView.phase));
  $('#main').inert=syncView.ready===false;
  $('#theme-toggle').disabled=syncView.ready===false;
  for(const form of document.querySelectorAll('#dialog form:not(#sync-signin-form)'))form.inert=!syncView.ready;
  const lock=$('#sync-lock');
  lock.hidden=!syncView.signedIn||syncView.ready;
  $('#sync-lock-message').textContent=syncView.message||'Editing is paused until this device confirms the latest account copy.';
  $('#sync-error-details').textContent=syncView.error?`${syncView.error.code} · ${syncView.error.stage}`:'';
  $('#recover-appearance').hidden=!syncView.signedIn||!['error','offline'].includes(syncView.phase)||!journalSync?.recoverableAppearance();
}

function showSyncAccount() {
  let content;
  if (!syncView.signedIn) {
    content = `<form id="sync-signin-form"><div class="field"><label for="sync-email">Email address</label><input id="sync-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><p class="subtle-note">We’ll email you a sign-in link. Open it on this device, then sign in with the same email on your other devices. Your journal stays private to your account.</p><div id="sync-signin-error" class="form-error" role="alert"></div><p id="sync-signin-result" role="status" class="subtle-note"></p><div class="dialog-footer"><button class="btn primary" type="submit">Email me a sign-in link</button></div></form>`;
  } else {
    const detail = syncView.message || (syncView.phase === 'synced' ? 'Your journal is saved to your account. Your other devices check for updates while the site is open.' : 'Your journal is saved here while we sync your account.');
    content = `<div id="sync-account-body"><p class="sync-email">${esc(syncView.email)}</p><p id="sync-account-message" class="subtle-note" role="status">${esc(detail)}</p>`;
    if (syncView.phase === 'choose') {
      content += `<p class="subtle-note">This account has no journal yet. Upload the information already saved in this browser, or start a fresh journal. Your original browser copy is kept.</p><div class="sync-actions"><button class="btn primary" data-action="sync-upload">Upload this journal</button><button class="btn secondary" data-action="sync-empty">Start fresh</button></div>`;
    } else {
      content += `<button class="btn secondary small" data-action="sync-refresh">Sync now</button>`;
    }
    content+=`<p class="subtle-note">Changes upload immediately. Other open devices check every five minutes, and returning to a device checks the account before editing resumes. Choose Sync now to check immediately. Changes from other devices are combined automatically. Earlier local saves remain available for recovery.</p><div class="sync-actions"><button class="btn secondary small" data-action="backup">Export current journal</button><button class="text-button" data-action="sync-recovery">Export previous local save</button></div>`;
    if(syncView.error)content+=`<p class="subtle-note">${esc(syncView.error.code)} · ${esc(syncView.error.stage)}</p>`;
    if(journalSync?.recoverableAppearance())content+=`<button class="btn secondary small" data-action="recover-appearance">Recover saved appearance</button><p class="subtle-note">Restore only your appearance from a saved local copy. Your current food, workout and weight records are kept.</p>`;
    content += `<div class="dialog-footer"><button class="text-button" data-action="sync-signout">Sign out on this device</button></div></div>`;
  }
  openDialog(dialogHeading('One journal. Every device.', 'Keep your food log, profile and weight history together.') + content);
}
function toast(message, error = false, allowUndo = false) {
  if(saveFailed&&!error&&!message.startsWith('Backup exported')){message='Changes are only in memory. Export a backup before leaving this page.';error=true;}
  const el = $('#toast');
  el.innerHTML = `${esc(message)}${allowUndo ? ' <button class="toast-undo" data-action="undo">Undo</button>' : ''}`;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), allowUndo ? 8000 : 3500);
}
function rememberUndo(restoresJournal=false) {undoState=structuredClone(state);undoRestoresJournal=restoresJournal;}
function currentDay(create = false) {
  if (create && !state.days[selectedDate]) state.days[selectedDate] = { entries:[], goals:calculateGoals(state.profile,selectedDate), note:'' };
  return state.days[selectedDate] || { entries:[], note:'' };
}
function currentGoals() { const goals=currentDay().goals || calculateGoals(state.profile,selectedDate);return {...nutrientGoals(goals.kcal),...goals}; }
function updateDayGoals(kcal) {
  const goals = calculateGoals(state.profile, selectedDate, Number(kcal));
  currentDay(true).goals = goals;
  if (selectedDate === todayKey()) {
    state.profile.calories = goals.kcal;
    state.profile.calorieMode = 'manual';
  }
  save();
}
function applyTodaysGoals(profile) {
  const date=todayKey();
  if(!state.days[date])state.days[date]={entries:[],note:''};
  state.days[date].goals=calculateGoals(profile);
}
function setDate(date) {
  if (!isDateKey(date)) return toast('Choose a valid date.', true);
  selectedDate = date;
  intakeWeekDate = date;
  if (route !== 'today') location.hash = 'today';
  else render();
}
function renderIntakeWeek(focusAction='') {
  $('#weekly-intake').outerHTML=weeklyIntakeDashboard({state,date:intakeWeekDate,today:todayKey(),dateText,icon,num,esc});
  if(focusAction)$(`[data-action="${focusAction}"]`)?.focus({preventScroll:true});
}

function heading(title, subtitle, actions = '', eyebrow = 'YOUR NUTRITION, AT A GLANCE') {
  return `<section class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1>${subtitle ? `<p class="heading-sub">${subtitle}</p>` : ''}</div><div class="heading-actions">${actions}</div></section>`;
}
function addButton(small = false) { return `<button class="btn primary${small ? ' small' : ''}" data-action="pick-food">${icon('plus')} Add food</button>`; }
function dateControl() {
  return `<div class="date-control"><button class="icon-btn" data-action="prev-day" aria-label="Previous day">${icon('left')}</button><input type="date" id="selected-date" value="${selectedDate}" aria-label="Food log date"><button class="icon-btn" data-action="next-day" aria-label="Next day">${icon('right')}</button></div>`;
}
function empty(message, description, action = '') { return `<div class="empty-state">${icon('foods')}<h3>${esc(message)}</h3><p>${esc(description)}</p>${action}</div>`; }

function summaryContent(baseGoals, t, exerciseKcal=0) {
  const g={...baseGoals,kcal:baseGoals.kcal+exerciseKcal};
  const rest = remaining(t, g);
  const over = rest.kcal < -0.5;
  const circumference = 2 * Math.PI * 64;
  return `<div class="summary-main"><div class="calorie-area"><div class="ring" role="img" aria-label="${num(t.kcal)} of ${num(g.kcal)} calories logged">
    <svg viewBox="0 0 156 156"><circle class="track" cx="78" cy="78" r="64" fill="none" stroke-width="10"/><circle class="value ${over ? 'over' : ''}" cx="78" cy="78" r="64" fill="none" stroke-width="10" stroke-dasharray="${circumference * progress(t.kcal,g.kcal)/100} ${circumference}"/></svg>
    <div class="ring-center"><strong>${num(t.kcal)}</strong><small>of ${num(g.kcal)} kcal</small><span class="ring-label">Consumed</span></div></div>
    <div class="calorie-copy"><span class="small-label">${over ? 'ABOVE YOUR BUDGET' : selectedDate===todayKey()?'REMAINING TODAY':'REMAINING THIS DAY'}</span><div class="remaining-number ${over ? 'day-over' : ''}">${num(Math.abs(rest.kcal))} <small>kcal</small></div><p>${over ? 'One day is one part of your overall pattern.' : 'Room for your next meal.<br>Make it count for you.'}</p><a class="tiny-pill" href="#goals">${icon('leaf')} Lose fat · preserve muscle</a></div></div>
    <div class="macro-list">${['protein','carbs','fat'].map(key => {
      const title = {protein:'Protein',carbs:'Carbohydrates',fat:'Fats'}[key];
      return `<div class="macro"><div class="macro-top"><span class="macro-title"><span class="dot ${key}"></span>${title}</span><span class="macro-values">${num(t[key],1)} g <span>/ ${num(g[key],1)} g</span></span></div><div class="progress-track" role="progressbar" aria-label="${title}" aria-valuemin="0" aria-valuemax="${g[key]}" aria-valuenow="${Math.min(t[key],g[key])}" aria-valuetext="${num(t[key],1)} grams consumed of ${num(g[key],1)} grams"><div class="progress-fill ${key}" style="width:${progress(t[key],g[key])}%"></div></div><div class="macro-bottom"><span>${key==='protein' ? 'For your muscle goal' : key==='carbs' ? 'Your energy balance' : 'A flexible daily target'}</span><span class="${rest[key] < -.05 ? 'exceeded' : ''}">${num(Math.abs(rest[key]),1)} g ${rest[key] < -.05 ? 'above target' : 'remaining'}</span></div></div>`;
    }).join('')}${secondaryNutrients(baseGoals,t)}</div></div><div class="activity-calorie-summary" aria-label="Daily exercise calorie adjustment"><div><span>Base budget</span><strong data-base-calories>${num(baseGoals.kcal)} kcal</strong></div><div><span>Completed exercise · estimate</span><strong data-calorie-credit>+${num(exerciseKcal,1)} kcal</strong></div><div><span>Adjusted calorie budget</span><strong data-adjusted-calories>${num(g.kcal,1)} kcal</strong></div><p>Only checked workouts for this date add estimated calories. Macro and nutrient targets keep their base values. <button class="text-button" data-action="view-calorie-workouts">View this day’s workouts</button></p></div>`;
}

function renderToday() {
  const g = currentGoals(), day = currentDay(), balance=dailyCalorieBalance(state,selectedDate,g),t=balance.consumed;
  const exerciseKcal=balance.exercise.creditedKcal,r=remaining(t,{...g,kcal:balance.adjustedKcal});
  const isToday = selectedDate === todayKey();
  const dateLabel = dateText(selectedDate,{weekday:'long',month:'long'});
  const suggestionsList = suggestions(state.foods,r.kcal,r.protein);
  const nextHeading = r.kcal < 20 ? 'Your day, in perspective.' : r.protein > 1 ? `${num(r.protein)} g more protein.` : 'Your protein target is met.';
  const nextCopy = r.kcal < 20 ? 'Your logged calories have reached your selected budget. These numbers are estimates; let your longer-term pattern guide your choices.'
    : r.protein > 1 ? `You have about ${num(r.kcal)} calories left. These saved portions can help with the protein remaining.`
    : `There are about ${num(r.kcal)} calories left in your selected budget. Carbs and fats are flexible targets.`;
  $('#main').innerHTML = heading('Your daily balance.',`A clear view of what you ate${isToday ? ' today' : ''}, ${esc(state.profile.name)}.`,dateControl()+addButton(),dateLabel.toUpperCase())
    + (!isToday ? `<div class="notice">${icon('history')}You’re viewing ${dateText(selectedDate,{year:'numeric'})}. <button class="text-button" data-action="today">Back to today</button></div>` : '')
    + `<section class="card summary-card" aria-label="Daily calorie and macro progress"><div id="summary-live">${summaryContent(g,t,exerciseKcal)}</div><div class="budget-row"><div class="budget-label"><strong>My base daily calorie budget</strong><span>Completed exercise is added separately</span></div><div class="budget-slider"><span>1,200</span><input id="budget-slider" type="range" min="1200" max="${Math.max(2200,Math.ceil(g.kcal/100)*100)}" step="25" value="${g.kcal}" aria-label="Daily calorie budget"><span>${num(Math.max(2200,Math.ceil(g.kcal/100)*100))}</span></div><div class="budget-value"><input id="budget-number" type="number" min="1200" max="4000" step="25" value="${g.kcal}" aria-label="Daily calorie budget in kilocalories"><span>kcal</span></div></div></section>
    <div class="daily-grid"><section class="card"><div class="card-head"><div><h2>${isToday ? 'Today’s' : 'Your'} food journal</h2><p>Every portion, in one place.</p></div><span class="badge">${day.entries.length} ${day.entries.length===1 ? 'entry' : 'entries'}</span></div>
    ${day.entries.length ? `<div class="log-table-scroll" role="region" aria-label="Food journal entries" tabindex="0">${renderLog(day.entries)}</div>` : empty('A fresh page.','Add a usual food or save a new one to start this day.',addButton())}
    ${day.note ? `<p class="log-note">${esc(day.note)}</p>` : ''}
    ${day.entries.length ? `<div class="log-totals"><span>Daily total <strong>${num(t.kcal)} kcal</strong></span><span>P <strong>${num(t.protein,1)} g</strong></span><span>C <strong>${num(t.carbs,1)} g</strong></span><span>F <strong>${num(t.fat,1)} g</strong></span></div>` : ''}
    <div class="log-footer"><button class="btn secondary small" data-action="pick-food">${icon('plus')} Add another food</button><button class="text-button" data-action="copy-day">Copy another day</button></div></section>
    <aside><section class="card next-card"><span class="small-label">TO FINISH YOUR DAY</span><h2>${nextHeading}</h2><p>${nextCopy}</p><div id="suggestion-list" class="suggestion-list">${suggestionsList.map(x=>`<div class="suggestion">${tile(x.food)}<div class="suggestion-copy"><strong>${esc(x.food.name)}</strong><small>${num(x.food.portionGrams)} g · ${num(x.nutrition.protein,1)} g protein · ${num(x.nutrition.kcal)} kcal</small></div><button class="icon-btn" data-action="add-suggestion" data-id="${esc(x.food.id)}" aria-label="Add ${esc(x.food.name)}">${icon('plus')}</button></div>`).join('')}</div><div class="next-note">${r.fat < -1 ? 'You’re above the fat target today. A lean option can fit your remaining calories; there’s no need to make up for it tomorrow.' : 'Portions use your saved food values. Pick what suits your appetite and tolerance.'}</div></section>
    <section class="card goal-glance"><span class="small-label">YOUR WEIGHT GOAL</span><div class="weight-glance"><div><strong>${num(state.profile.weight,1)} <span style="font-size:11px">kg</span></strong><small>Current weight</small></div>${icon('right')}<div><strong>${num(state.profile.goalWeight,1)} <span style="font-size:11px">kg</span></strong><small>Goal weight</small></div></div><div class="goal-caption"><span>${num(state.profile.height,1)} cm · ${ageAt(state.profile.birthDate)} years</span><a href="#goals">View my goals ↗</a></div></section></aside></div>
    <p class="subtle-note">Food values and energy needs are estimates. Calories follow food labels; macro calories can differ slightly because of fiber, food-specific factors and rounding. Carbs are total carbs.</p>${weeklyIntakeDashboard({state,date:intakeWeekDate,today:todayKey(),dateText,icon,num,esc})}`;
}

function renderLog(entries) {
  let rows = `<div class="log-header"><span>Food & portion</span><span>Protein</span><span class="mobile-hide">Carbs</span><span class="mobile-hide">Fats</span><span>Calories</span><span>Actions</span></div>`;
  for (const meal of MEALS) {
    const group = entries.filter(e=>e.meal===meal);
    if (!group.length) continue;
    rows += `<div class="meal-label">${meal==='Other' ? 'Meals · as reported' : meal}</div>`;
    for (const e of group) {
      const n = portionNutrition(e.food,e.amount,e.unit);
      const portion = e.unit==='g' ? `${num(e.amount,2)} g` : `${num(e.amount,2)} ${esc(unitLabel(e.food,e.unit))}${e.amount>1 && !['tbsp','tsp','mL'].includes(unitLabel(e.food,e.unit)) ? 's' : ''} · ${num(n.grams,1)} g`;
      rows += `<div class="food-row"><div class="food-name">${tile(e.food)}<div><div class="food-title">${esc(e.food.name)}</div><div class="food-detail">${portion}</div></div></div><span class="log-amount protein-color">${num(n.protein,1)}</span><span class="mobile-hide carbs-color">${num(n.carbs,1)}</span><span class="mobile-hide fat-color">${num(n.fat,1)}</span><span class="row-kcal">${num(n.kcal)}</span><div class="row-actions"><button class="icon-btn" data-action="edit-entry" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.food.name)} portion">${icon('edit')}</button><button class="icon-btn delete" data-action="remove-entry" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.food.name)}">${icon('trash')}</button></div></div>`;
    }
  }
  return rows;
}

function foodCard(f) {
  const n = portionNutrition(f);
  return `<article class="card food-card"><div class="food-card-top">${tile(f)}<span class="label-tag ${f.verified ? '' : 'estimate'}">${f.verified ? 'Official label' : 'Editable estimate'}</span><button class="text-button star favorite ${f.favorite ? 'active' : ''}" data-action="favorite" data-id="${esc(f.id)}" aria-label="${f.favorite?'Unfavorite':'Favorite'} ${esc(f.name)}" aria-pressed="${f.favorite}">${icon('star')}</button></div><h3>${esc(f.name)}</h3><span class="food-card-sub">1 ${esc(f.portionUnit)} · ${num(f.portionGrams,1)} g</span><div class="food-card-numbers"><div><strong>${num(n.kcal)}</strong><small>kcal</small></div><div><strong class="protein-color">${num(n.protein,1)}</strong><small>Protein · g</small></div><div><strong class="carbs-color">${num(n.carbs,1)}</strong><small>Carbs · g</small></div><div><strong class="fat-color">${num(n.fat,1)}</strong><small>Fats · g</small></div></div>${nutrientDetails(n,'food-card-nutrients')}<small class="food-nutrient-note">${f.nutrientNote?'Additional nutrients · researched estimates':'Additional nutrients · saved values; — means unknown'}</small><div class="food-card-actions"><button class="btn soft small" data-action="food-portion" data-id="${esc(f.id)}">${icon('plus')} Log food</button><button class="icon-btn" data-action="edit-food" data-id="${esc(f.id)}" aria-label="Edit ${esc(f.name)} label">${icon('edit')}</button></div></article>`;
}
function filteredFoods(query = foodQuery, filter = foodFilter) {
  return state.foods.filter(f=>(filter==='All' || filter==='Favorites' && f.favorite || f.category===filter)
    && `${f.name} ${f.category}`.toLowerCase().includes(query.toLowerCase().trim()));
}
function renderFoods() {
  $('#main').innerHTML = heading('Your usual foods.', 'Saved portions. Less guesswork. Add, edit, and log them whenever you need.',`<button class="btn primary" data-action="new-food">${icon('plus')} Save a food</button>`,'A FOOD LIST THAT KNOWS YOU')
    + `<div class="toolbar"><div class="search">${icon('search')}<input id="food-search" value="${esc(foodQuery)}" placeholder="Search your foods…" aria-label="Search saved foods"></div></div><div class="filter-pills" style="margin-bottom:20px">${['All','Favorites',...CATEGORIES].map(c=>`<button class="filter-pill ${foodFilter===c?'active':''}" data-action="food-filter" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="foods-grid" id="foods-grid">${filteredFoods().map(foodCard).join('')}</div><div id="foods-empty">${filteredFoods().length?'':empty('No foods found.','Try another search or save a new food.',`<button class="btn soft" data-action="new-food">Save a food</button>`)}</div><p class="subtle-note">Standard foods and recipes are starting estimates. Kinder entries use the linked manufacturer labels. Set the portion weight and nutrition to match your own packaging for better accuracy. Additional nutrients in matching starter foods are filled automatically with researched estimates. Other foods keep unknown values until you enter a label; unknown does not mean zero. <a href="./NUTRITION_SOURCES.md" target="_blank" rel="noopener noreferrer">Food nutrient sources ↗</a> Editing a food preserves values already recorded in past log entries.</p>`;
}

function weightChart() {
  const weights = state.weights.slice(-12);
  if (weights.length < 2) return `<div class="empty-state" style="padding:19px 8px">${icon('scale')}<p style="margin-bottom:0">${weights.length ? "Your first weight is saved.<br>Log another measurement to see your trend." : "Log your first measurement to start a weight trend."}</p></div>`;
  const values = weights.map(w=>w.weight);
  const min = Math.min(...values,state.profile.goalWeight)-.5, max = Math.max(...values)+.5;
  const x = i => 32 + i/(weights.length-1)*306;
  const y = weight => 128 - (weight-min)/(max-min)*103;
  const points = weights.map((w,i)=>`${x(i)},${y(w.weight)}`).join(' ');
  return `<svg class="weight-chart" viewBox="0 0 370 165" role="img" aria-label="Weight trend from ${num(weights[0].weight,1)} to ${num(weights.at(-1).weight,1)} kilograms; goal ${num(state.profile.goalWeight,1)} kilograms"><line x1="32" y1="${y(state.profile.goalWeight)}" x2="338" y2="${y(state.profile.goalWeight)}" stroke="#d2dec3" stroke-dasharray="4 4"/><text x="32" y="${y(state.profile.goalWeight)-7}" font-size="9" fill="#95a081">Goal ${num(state.profile.goalWeight,1)} kg</text><polyline points="${points}" fill="none" stroke="#4e7b62" stroke-width="2.5" stroke-linejoin="round"/>${weights.map((w,i)=>`<circle cx="${x(i)}" cy="${y(w.weight)}" r="3.5" fill="#4e7b62"/><title>${dateText(w.date)}: ${num(w.weight,1)} kg</title>`).join('')}<text x="32" y="151" font-size="9" fill="#96a18b">${esc(dateText(weights[0].date))}</text><text x="338" y="151" text-anchor="end" font-size="9" fill="#96a18b">${esc(dateText(weights.at(-1).date))}</text></svg>`;
}
function renderHistory() {
  const logged = Object.entries(state.days).filter(([,d])=>d.entries.length).sort((a,b)=>b[0].localeCompare(a[0]));
  const week = logged.filter(([date])=>date<=todayKey() && date>=shiftDate(todayKey(),-6));
  const average = week.length ? week.reduce((sum,[,d])=>sum+totals(d.entries).kcal,0)/week.length : 0;
  const proteinAverage = week.length ? week.reduce((sum,[,d])=>sum+totals(d.entries).protein,0)/week.length : 0;
  $('#main').innerHTML = heading('See your bigger picture.','Your days and weight trend, without losing the details.',`<button class="btn primary" data-action="log-weight">${icon('plus')} Log weight</button>`,'PROGRESS OVER TIME')
    + `<div class="history-stats"><section class="card stat-card"><span class="small-label">7-DAY CALORIE AVERAGE</span><strong>${week.length?num(average):'—'} <small>kcal</small></strong><p>Across ${week.length} logged ${week.length===1?'day':'days'} this week</p></section><section class="card stat-card"><span class="small-label">7-DAY PROTEIN AVERAGE</span><strong>${week.length?num(proteinAverage,1):'—'} <small>g</small></strong><p>Unlogged days are excluded</p></section><section class="card stat-card"><span class="small-label">WEIGHT TO GOAL</span><strong>${num(Math.abs(state.profile.weight-state.profile.goalWeight),1)} <small>kg</small></strong><p>Current ${num(state.profile.weight,1)} → goal ${num(state.profile.goalWeight,1)} kg</p></section></div>
    <div class="history-grid"><section class="card"><div class="card-head"><div><h2>Your logged days</h2><p>Open a day to review or change its portions.</p></div><span class="badge">${logged.length} days</span></div>${logged.length?logged.slice(0,100).map(([date,d])=>{const balance=dailyCalorieBalance(state,date),t=balance.consumed,g={...balance.baseGoals,kcal:balance.adjustedKcal};return `<div class="history-row"><div class="history-day"><strong>${dateText(date,{weekday:'short'})}</strong><small>${date.slice(0,4)} · ${d.entries.length} entries</small></div><div class="history-progress"><small>${num(t.kcal)} / ${num(g.kcal)} kcal · ${num(t.protein,1)} g protein${balance.exercise.creditedKcal?` · +${num(balance.exercise.creditedKcal,1)} exercise kcal`:""}</small><div class="progress-track"><div class="progress-fill" style="background:var(--green);width:${progress(t.kcal,g.kcal)}%"></div></div></div><button class="btn secondary small" data-action="open-day" data-date="${date}">Open ${icon('right')}</button></div>`;}).join(''):empty('Your history starts here.','Log a food and its date will appear here.') }<p class="history-summary">Macro targets are saved with each day. ${logged.length>100?'Showing your latest 100 logged days. ':''}An incomplete day still counts as a logged day.</p></section>
    <section class="card"><div class="card-head"><div><h2>Weight journal</h2><p>A trend matters more than a single measurement.</p></div><button class="text-button" data-action="log-weight">Log weight</button></div><div class="chart-wrap">${weightChart()}<table class="weight-table"><caption class="sr-only">Recorded weights in kilograms</caption><tbody>${state.weights.slice(-15).reverse().map(w=>`<tr><td>${dateText(w.date,{year:'numeric'})}</td><td>${num(w.weight,1)} kg</td><td><button class="icon-btn delete" data-action="delete-weight" data-date="${w.date}" aria-label="Remove weight for ${dateText(w.date)}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div></section></div>`;
}

function field(label, name, value, type='number', attrs='', note='', full=false) {
  return `<div class="field ${full?'full':''}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}>${note?`<small>${note}</small>`:''}</div>`;
}
function selectField(label,name,options,value,note='') {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select>${note?`<small>${note}</small>`:''}</div>`;
}
function readProfileForm() {
  const data = Object.fromEntries(new FormData($('#profile-form')));
  return validateProfile({...state.profile,...data,insulinResistance:$('#insulinResistance').checked});
}
function renderEnergyCalculations(p) {
  const g = calculateGoals(p);
  return `<h2>The numbers behind your goal.</h2><p>Your goal-weight estimates update with your target weight. Actual energy needs also depend on movement, body composition and weight trends.</p>
    <div class="calc-pair"><div class="calc-result"><span>Resting energy · RMR at goal weight</span><strong data-goal-rmr>${num(g.goalRmr)}</strong><small>kcal / day · at ${num(p.goalWeight,1)} kg</small></div><div class="calc-result"><span>Maintenance · TDEE at goal weight</span><strong data-goal-tdee>${num(g.goalTdee)}</strong><small>kcal / day · at ${num(p.goalWeight,1)} kg</small></div></div>
    <div class="goal-budget-reference"><div><span>Formula-mode calorie budget</span><strong data-goal-calorie-budget>${num(g.calculatedCalories)}</strong><small>kcal / day · ${p.deficit}% below goal-weight maintenance, before rounding and guardrails</small></div><p>${p.calorieMode==='manual'?`Your active budget is the manually selected <strong>${num(g.kcal)} kcal</strong>. Choose “Use the energy formula” for automatic goal-weight adjustments.`:`Your active budget follows this goal-weight formula: <strong>${num(g.kcal)} kcal</strong>.`}</p></div>
    <div class="calc-current-reference"><span>At your current weight · ${num(p.weight,1)} kg</span><p>RMR <strong data-current-rmr>${num(g.rmr)}</strong> kcal / day · TDEE <strong data-current-tdee>${num(g.tdee)}</strong> kcal / day</p><small>The weekly deficit/surplus estimate uses energy needs at your recorded weight. The goal-weight RMR is the dashed chart reference.</small></div>
    <div class="target-summary"><span>Current BMI</span><strong>${num(g.bmi,1)}</strong><span>Goal BMI</span><strong>${num(g.goalBmi,1)}</strong></div>
    <div class="equation"><strong>1. Resting energy at your goal weight</strong><code>Goal RMR = 10 × goal weight + 6.25 × height − 5 × age ${p.sex==='female'?'− 161':'+ 5'}</code><p>10 × ${p.goalWeight} + 6.25 × ${p.height} − 5 × ${g.age} ${p.sex==='female'?'− 161':'+ 5'} = <strong>${num(g.goalRmr)} kcal / day</strong>. RMR estimates energy used at rest; it is a reference, not a daily calorie limit.</p></div>
    <div class="equation"><strong>2. Goal-weight maintenance and calorie budget</strong><code>Goal TDEE = goal RMR × activity factor<br>Formula budget = goal TDEE × (1 − deficit % ÷ 100)</code><p>${num(g.goalRmr)} × ${p.activity} = <strong>${num(g.goalTdee)} kcal / day</strong> to estimate maintenance at ${num(p.goalWeight,1)} kg. Applying your ${p.deficit}% deficit gives a formula budget of <strong>${num(g.calculatedCalories)} kcal</strong>, rounded to 25 kcal.${g.calculatedFloorApplied?' A minimum-budget guardrail was applied.':''}${g.calculatedMacroFloorApplied?' The automatic budget was also raised to fit your current-weight protein and fat settings.':''}${g.calculatedCeilingApplied?' The automatic budget is limited to the tracker maximum of 4,000 kcal; the goal-weight TDEE estimate above remains uncapped.':''}</p><p>A 0% deficit uses goal-weight maintenance before rounding and guardrails. Changing goal weight updates these estimates immediately; formula mode updates the active budget when you save. Other recorded days keep their saved budgets.</p></div>
    <div class="equation"><strong>3. Protein for your muscle goal</strong><code>Protein = current weight × ${p.proteinFactor} g/kg</code><p>${p.weight} × ${p.proteinFactor} = <strong>${num(g.protein,1)} g</strong>. Protein uses your current weight. The default 1.8 g/kg is an adjustable planning choice within the 1.4–2.0 g/kg range often used for exercising adults.</p></div>
    <div class="equation"><strong>4. Fats and the remaining carbs</strong><code>Fat = calories × ${p.fatPercent}% ÷ 9<br>Carbs = (calories − protein × 4 − fat × 9) ÷ 4</code><p>Fat: <strong>${num(g.fat,1)} g</strong> · Carbs: <strong>${num(g.carbs,1)} g</strong>. These use your active ${num(g.kcal)} kcal budget, with 4 kcal/g for protein and carbs and 9 kcal/g for fat.</p></div>
    <div class="source-links"><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">Mifflin–St Jeor equation ↗</a><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noopener noreferrer">Protein position statement ↗</a></div>`;
}
function renderCalculations(p) {
  const g=calculateGoals(p);
  return renderEnergyCalculations(p)+`<div class="equation nutrient-equations"><strong>5. Fiber and daily limits</strong><code>Fiber goal = base calories × 14 ÷ 1,000<br>Saturated fat limit = base calories × 10% ÷ 9<br>Sodium limit = 2,300 mg per day</code><p>At ${num(g.kcal)} kcal: aim for <strong>${num(g.fiber,1)} g fiber</strong>; keep saturated fat below <strong>${num(g.saturatedFat,1)} g</strong>, and sodium below <strong>${num(g.sodium)} mg</strong>. Total sugar includes naturally occurring sugar and has no universal daily limit.</p><p>The total sugar bar shows sugar as a share of your carbohydrate budget; it is a visual reference, not a recommended sugar limit. These adult planning references use your base calorie budget. In formula mode, goal weight, height, age, formula sex and activity affect that budget. In manual mode, they use your selected calories. There is no separate height, sex or weight multiplier for these nutrients. Completed exercise does not raise these targets.</p><p>${p.insulinResistance?'<strong>Insulin resistance guidance is on.</strong> Aim for at least 14 g fiber per 1,000 kcal, choose high-fiber, minimally processed carbohydrates, and limit sugary drinks. Insulin resistance alone does not establish different universal numerical limits; the checkbox keeps these guideline targets. A clinician may individualize your carbohydrate plan and limits.':'The insulin resistance option adds relevant food guidance. Evidence does not establish a separate universal numerical adjustment for insulin resistance.'}</p><p>Fiber and saturated fat are already included in total carbs and fats. Added sugar is part of total sugar. These fields do not add extra calories.</p></div><div class="source-links"><a href="https://cdn.realfood.gov/DGA.pdf" target="_blank" rel="noopener noreferrer">2025–2030 dietary guidance ↗</a><a href="https://www.fda.gov/food/nutrition-facts-label/added-sugars-nutrition-facts-label" target="_blank" rel="noopener noreferrer">FDA added sugar reference ↗</a><a href="https://doi.org/10.2337/dc26-S005" target="_blank" rel="noopener noreferrer">ADA 2026 nutrition guidance ↗</a><a href="./NUTRITION_SOURCES.md" target="_blank" rel="noopener noreferrer">Food estimates & sources ↗</a></div>`;
}
function renderGoals() {
  const p = state.profile;
  $('#main').innerHTML = heading('Built around you.','Your measurements, your goal, and formulas you can actually see.','','YOUR PERSONAL SETTINGS')
    + `<div class="profile-layout"><form class="card profile-form" id="profile-form"><section class="form-section"><h2>My measurements</h2><div class="form-grid">${field('Name','name',p.name,'text','required maxlength="40"')}${field('Date of birth','birthDate',p.birthDate,'date','required')}${field('Current weight · kg','weight',p.weight,'number','required min="30" max="250" step="0.1"')}${field('Height · cm','height',p.height,'number','required min="100" max="230" step="0.1"')}${field('Goal weight · kg','goalWeight',p.goalWeight,'number','required min="30" max="250" step="0.1"')}${field('Starting weight · kg','startWeight',p.startWeight,'number','required min="30" max="250" step="0.1"')}${selectField('Formula sex setting','sex',[['female','Female · −161'],['male','Male · +5']],p.sex,'Used only for the resting-energy equation.')}${selectField('Typical activity','activity',[[1.2,'Mostly sedentary · 1.20'],[1.375,'Light activity · 1.375'],[1.55,'Moderate activity · 1.55'],[1.725,'Very active · 1.725'],[1.9,'Highly active · 1.90']],p.activity,'Choose your usual whole-day activity, not a single workout.')}</div></section><section class="form-section"><h2>My daily targets</h2><div class="form-grid">${selectField('Calorie target mode','calorieMode',[['manual','Use my selected budget'],['calculated','Use the energy formula']],p.calorieMode)}${field('Selected calorie budget · kcal','calories',p.calories,'number','required min="1200" max="4000" step="25"','Select the calorie budget you want to track.')}${field('Formula deficit · %','deficit',p.deficit,'number','required min="0" max="20" step="1"','Used below goal-weight maintenance in formula mode. 0% estimates maintenance at your goal weight.')}${field('Protein · g per kg','proteinFactor',p.proteinFactor,'number','required min="1.4" max="2.2" step="0.1"','Multiplied by your current weight.')}${field('Fat share · % of calories','fatPercent',p.fatPercent,'number','required min="20" max="35" step="1"','Carbs use the calories left after protein and fat.')}</div><label class="settings-toggle nutrition-condition"><input id="insulinResistance" name="insulinResistance" type="checkbox" ${p.insulinResistance?'checked':''}><span><strong>I have insulin resistance</strong><small>Show relevant nutrition guidance. Universal numerical targets stay the same; personal treatment may need different targets.</small></span></label><span class="formula-badge">Calories are estimates, not an exact prescription.</span></section><div class="form-error" id="profile-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">${icon('check')} Save my goals</button><span class="secondary-note">Updates today and future days.<br>Other recorded days keep their targets.</span></div></form>
    <div><section class="card calc-panel" id="calc-preview">${renderCalculations(p)}</section><section class="card backup-panel"><h2>Keep a copy of your journal.</h2><p>Your settings, foods and logs are saved on this browser and device. Sign in with Sync devices to keep the same journal on your laptop and phone. Export a backup whenever you want an extra copy.</p><div class="backup-buttons"><button class="btn secondary small" data-action="backup">${icon('download')} Export backup</button><button class="btn secondary small" data-action="import">Restore backup</button></div><input type="file" id="backup-file" accept="application/json,.json" hidden></section></div></div>`;
}

function workoutEntries(date = workoutDate) { return state.workouts.days[date] || []; }
function workoutTarget(exerciseId, date = workoutDate) {
  return workoutSuggestion(state.profile, state.workouts.settings, exerciseId, date, state.days[date]?.goals?.kcal ?? null,exerciseCatalog(state.workouts));
}
function workoutPrescription(entry, exercise) {
  return prescription(entry,exercise);
}
function setWorkoutDate(date) {
  if (!isDateKey(date)) return toast('Choose a valid workout date.', true);
  workoutDate = date;
  render();
}
function ensureWorkoutWeek() {
  const w=state.workouts,dates=weekDates(workoutDate);
  if(!syncView.ready||needsSetup||!w.settings.autoRepeat||w.skippedWeeks.includes(dates[0])||dates.some(date=>w.days[date]?.length||w.notes[date]))return;
  const additions=starterWeek(w.settings,workoutDate,w.days,todayKey(),w.template);
  if(!Object.keys(additions.days).length)return;
  Object.assign(w.days,additions.days);Object.assign(w.notes,additions.notes);save();
}
function renderWorkouts() {
  ensureWorkoutWeek();
  $('#main').innerHTML=heading('Your week in motion.','Your whole week, with the details to move confidently.',
    `<button class="btn primary" data-action="pick-exercise">${icon('plus')} Add exercise</button>`, 'YOUR WORKOUT PLANNER')
    + workoutDashboard({state,date:workoutDate,dateText,icon,field,selectField,restDeadline});
  updateRestTimer();
}
function renderExercises() {
  $('#main').innerHTML=exerciseLibraryDashboard({state,filters:exerciseFilters,esc,icon,num});
}
function updateExerciseLibraryResults() {
  $('#exercise-library-results').innerHTML=exerciseLibraryResults({state,filters:exerciseFilters,esc,icon,num});
  $('#exercise-library-count').textContent=exerciseLibraryCount({state,filters:exerciseFilters});
}
function exercisePickerResults() {
  const query = ($('#exercise-search')?.value || '').trim().toLowerCase();
  const group = $('#exercise-group')?.value || 'All';
  const equipment = $('#exercise-equipment')?.value || 'All';
  const available = equipment === 'All' ? ['bodyweight','dumbbells','gym'] : equipment === 'gym' ? ['bodyweight','dumbbells','gym'] : equipment === 'dumbbells' ? ['bodyweight','dumbbells'] : ['bodyweight'];
  const list = exerciseCatalog(state.workouts).filter(e => !e.archived&&available.includes(e.equipment) && (group === 'All' || e.group === group) && `${e.name} ${e.group}`.toLowerCase().includes(query));
  return list.length ? list.map(e => `<button class="pick-food exercise-preset" data-action="choose-exercise" data-id="${e.id}"><span class="food-tile">${icon('workout')}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.group)} · ${e.equipment === 'bodyweight' ? 'Bodyweight' : e.equipment === 'dumbbells' ? 'Dumbbell' : 'Gym machine'}</small></span><span class="pick-kcal">${icon('plus')}</span></button>`).join('') : '<p class="subtle-note">No exercises match. Try another search or equipment filter.</p>';
}
function showExercisePicker() {
  openDialog(dialogHeading('Choose your exercise.',`Add to ${dateText(workoutDate,{weekday:'long'})}. Sets and reps start with suggestions you can edit.`)
    + `<div class="search">${icon('search')}<input id="exercise-search" placeholder="Search exercises…" aria-label="Search exercises"></div><div class="form-grid exercise-filters">${selectField('Exercise type','exercise-group',[['All','All types'],...EXERCISE_GROUPS.map(x => [x,x])],'All')}${selectField('Equipment','exercise-equipment',[['All','All equipment'],...WORKOUT_EQUIPMENT],state.workouts.settings.equipment)}</div><div id="exercise-results" class="dialog-search-results"></div><div class="dialog-footer"><button class="btn secondary" data-action="new-exercise">Create a new exercise</button><button class="text-button" data-action="exercise-library">Manage my exercise library</button></div>`);
  $('#exercise-results').innerHTML = exercisePickerResults();
}
function showWorkoutEditor(exerciseId, entry = null) {
  const exercise = entry?scheduledExercise(entry,state.workouts):exerciseCatalog(state.workouts).find(e => e.id === exerciseId);
  if (!exercise) throw new Error('Choose an exercise from the preset list.');
  const value = entry || { ...workoutTarget(exerciseId), note:'' };
  const seconds = exercise.unit === 'seconds',minutes=exercise.unit==='minutes';
  const definition=exerciseCatalog(state.workouts).find(e=>e.id===exerciseId);
  const compatibleDefaults=!entry||(definition?.unit===exercise.unit&&!!definition.unilateral===!!exercise.unilateral);
  openDialog(dialogHeading(entry ? 'Edit your exercise.' : 'Plan your exercise.',`${esc(exercise.name)} · ${esc(exercise.group)}`)
    + `<form id="workout-form" data-id="${esc(entry?.id || '')}" data-exercise-id="${exercise.id}" data-source-date="${workoutDate}" data-from-library="${route==='exercises'}"><div class="form-grid">
      ${field('Scheduled date','exercise-date',workoutDate,'date','required')}
      ${field('Sets','exercise-sets',value.sets,'number','required min="1" max="10" step="1"')}
      ${field('Maximum sets · optional','exercise-sets-max',value.setsMax??value.sets,'number','min="1" max="10" step="1"','Keep the same number for a fixed target.')}
      ${field(minutes?'Minutes per set':seconds ? 'Seconds per set' : `Reps per set${exercise.unilateral ? ' · per side' : ''}`,'exercise-reps',value.reps,'number',`required min="1" max="${seconds?300:minutes?240:100}" step="1"`)}
      ${field('Maximum target · optional','exercise-reps-max',value.repsMax??value.reps,'number',`min="1" max="${seconds?300:minutes?240:100}" step="1"`,'For example, 8 and 12 makes an 8–12 range.')}
      ${field('Rest between sets · seconds','exercise-rest',value.restSeconds??60,'number','required min="0" max="600" step="1"')}
      ${field('Weight · kg (optional)','exercise-load',value.load ?? '', 'number','min="0" max="500" step="0.1"','Per dumbbell for dumbbell exercises; 0 for bodyweight.')}
      <div class="field full"><label for="exercise-note">Notes · optional</label><textarea id="exercise-note" name="exercise-note" maxlength="400" placeholder="For example: use the 6 kg dumbbells">${esc(value.note)}</textarea></div></div>
      <div class="dialog-food-details">${esc(exercise.cue)}<br>Choose a weight or variation that leaves about 2–3 reps in reserve. ${entry ? 'Moving this exercise to another date resets its checkbox.' : 'You can change every suggested target before saving.'}</div>
      ${compatibleDefaults?`<button class="text-button" type="button" data-action="workout-use-suggestion">Use suggested sets & ${minutes?'minutes':seconds ? 'seconds' : 'reps'}</button>`:'<p class="subtle-note">This workout keeps its original target unit and side count. Set its targets above; the library now uses different defaults.</p>'}
      <div id="workout-energy-preview" class="exercise-energy-preview" role="status" aria-live="polite"></div>
      <div class="form-error" id="workout-error" role="alert"></div><div class="dialog-footer"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">${icon('check')} ${entry ? 'Save changes' : 'Add exercise'}</button></div></form>`);
  $('#workout-form').dataset.lastSets=String(value.sets);$('#workout-form').dataset.lastReps=String(value.reps);
  updateWorkoutEnergyPreview();
}

function updateWorkoutEnergyPreview() {
  const form=$('#workout-form');if(!form)return;
  try {
    const existing=workoutEntries(form.dataset.sourceDate).find(entry=>entry.id===form.dataset.id);
    const exercise=existing?scheduledExercise(existing,state.workouts):exerciseCatalog(state.workouts).find(e=>e.id===form.dataset.exerciseId);
    const estimate=exerciseEnergy({sets:Number($('#exercise-sets').value),setsMax:Number($('#exercise-sets-max').value||$('#exercise-sets').value),
      reps:Number($('#exercise-reps').value),repsMax:Number($('#exercise-reps-max').value||$('#exercise-reps').value)},
      exercise,exerciseWeightForDate(state,$('#exercise-date').value));
    $('#workout-energy-preview').innerHTML=`<strong>Estimated extra burn: ~${num(estimate.kcal,1)} kcal</strong><span>${num(estimate.activeMinutes,1)} active min · ${estimate.custom?'your calorie estimate':`${num(estimate.met,1)} MET`} · ${num(estimate.weightKg,1)} kg body weight${estimate.usesRange?' · midpoint of your ranges':''}. ${exercise.unit==='reps'?`${estimate.secondsPerRep} sec per rep. `:''}${exercise.unilateral?'Both sides included. ':''}${existing?.completed&&$('#exercise-date').value===form.dataset.sourceDate?'Saving updates this day’s calorie credit.':'Added to remaining calories when you check the exercise.'}</span>`;
  }catch{$('#workout-energy-preview').textContent='Enter valid sets, targets and a date to preview estimated calories.';}
}

function showExerciseLibrary() {
  closeDialog();
  if(route==='exercises')renderExercises();else location.hash='exercises';
}
function showCustomExerciseEditor(exercise=null) {
  const defaults=exercise?workoutTarget(exercise.id):{sets:2,reps:10,restSeconds:60};
  const value={name:'',group:'Lower body',equipment:'bodyweight',unit:'reps',instructions:'',muscles:'',avoid:'',cue:'',feel:'',easier:'',unilateral:false,...exercise,
    sets:exercise?.sets??defaults.sets,reps:exercise?.reps??defaults.reps,restSeconds:exercise?.restSeconds??defaults.restSeconds??60};
  draftExerciseImage=exercise?.image||'';
  exerciseImageGeneration++;
  openDialog(dialogHeading(exercise?'Edit your exercise.':'Create your own exercise.','Choose its targets, calorie estimate, instructions and image. Changes save with your journal.')
    + `<form id="custom-exercise-form" data-id="${esc(exercise?.id||'')}"><div class="form-grid">
      ${field('Exercise name','custom-name',value.name,'text','required maxlength="100"','',true)}
      ${field('Short description · optional','custom-description',value.cue,'text','maxlength="400"','',true)}
      ${selectField('Exercise type','custom-group',EXERCISE_GROUPS.map(x=>[x,x]),value.group)}
      ${selectField('Equipment','custom-equipment',WORKOUT_EQUIPMENT,value.equipment)}
      ${selectField('Target unit','custom-unit',[['reps','Repetitions'],['seconds','Seconds'],['minutes','Minutes']],value.unit)}
      ${field('Default sets','custom-sets',value.sets,'number','required min="1" max="10" step="1"')}
      ${field(value.unit==='minutes'?'Default minutes per set':value.unit==='seconds'?'Default seconds per set':'Default reps per set','custom-reps',value.reps,'number',`required min="1" max="${value.unit==='minutes'?240:value.unit==='seconds'?300:100}" step="1"`)}
      ${field('Default rest · seconds','custom-rest',value.restSeconds,'number','required min="0" max="600" step="1"')}
      <label class="field full custom-check"><span><input type="checkbox" id="custom-unilateral" ${value.unilateral?'checked':''}> Targets are per side</span></label>
      <label class="field full custom-check"><span><input type="checkbox" id="custom-compound" ${value.compound?'checked':''}> Uses several muscle groups</span></label>
      <div class="field full">${selectField('Calorie estimate','custom-calorie-mode',[['automatic','Automatic estimate'],['manual','Set my own calories']],value.energy?'manual':'automatic')}</div>
      <div class="field full" id="custom-calorie-settings"><div class="form-grid">
        ${field('Calories burned · kcal','custom-calories',value.energy?.kcal??'','number','min="0" max="10000" step="0.1"','Estimated extra burn for all default sets and targets above.')}
        ${field('Body weight for this estimate · kg','custom-calorie-weight',value.energy?.weightKg??state.profile.weight,'number','min="30" max="250" step="0.1"','Workout estimates scale with body weight and your edited targets.')}
      </div></div>
      <div class="field full"><div id="custom-energy-preview" class="exercise-energy-preview" role="status" aria-live="polite"></div></div>
      ${field('Muscles or focus · optional','custom-muscles',value.muscles,'text','maxlength="160"','',true)}
      <div class="field full"><label for="custom-instructions">How to do it</label><textarea id="custom-instructions" maxlength="2500" placeholder="Describe setup, movement and how to finish.">${esc(value.instructions)}</textarea></div>
      <div class="field full"><label for="custom-feel">What you should feel · optional</label><textarea id="custom-feel" maxlength="1200">${esc(value.feel)}</textarea></div>
      <div class="field full"><label for="custom-easier">Easier variation · optional</label><textarea id="custom-easier" maxlength="1200">${esc(value.easier)}</textarea></div>
      <div class="field full"><label for="custom-avoid">Common mistakes · optional</label><textarea id="custom-avoid" maxlength="1200">${esc(value.avoid)}</textarea></div>
      <div class="field full"><label for="custom-image">Exercise illustration · optional</label><input id="custom-image" type="file" accept="image/jpeg,image/png,image/webp"><small>Replace or remove the image for any exercise. JPEG, PNG or WebP, up to 10 MB.</small><small id="custom-image-status" role="status" aria-live="polite"></small><div id="custom-image-preview">${draftExerciseImage?`<img src="${esc(draftExerciseImage)}" alt="Exercise illustration preview">`:''}</div><button class="text-button" type="button" data-action="remove-exercise-image">Remove illustration</button></div>
      </div><div class="form-error" id="custom-exercise-error" role="alert"></div><div class="dialog-footer">
      ${exercise?`<button class="btn secondary small" type="button" data-action="${exercise.archived?'restore-library-exercise':'delete-library-exercise'}" data-id="${esc(exercise.id)}">${exercise.archived?'Restore to library':'Delete exercise'}</button>`:''}
      ${exercise?.customized?`<button class="text-button" type="button" data-action="reset-library-exercise" data-id="${esc(exercise.id)}">Reset to preset</button>`:''}
      <button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">Save exercise type</button></div></form>`);
  updateCustomEnergyPreview();
}
function readExerciseDefinition() {
  const form=$('#custom-exercise-form'),existing=exerciseCatalog(state.workouts).find(e=>e.id===form.dataset.id);
  const exercise={...existing,id:existing?.id||'custom-exercise-draft',name:$('#custom-name').value,group:$('#custom-group').value,
    equipment:$('#custom-equipment').value,unit:$('#custom-unit').value,sets:Number($('#custom-sets').value),reps:Number($('#custom-reps').value),
    restSeconds:Number($('#custom-rest').value),muscles:$('#custom-muscles').value,unilateral:$('#custom-unilateral').checked,
    compound:$('#custom-compound').checked,cue:$('#custom-description').value,instructions:$('#custom-instructions').value,
    feel:$('#custom-feel').value,easier:$('#custom-easier').value,avoid:$('#custom-avoid').value,image:draftExerciseImage,archived:existing?.archived||false,energy:null,reset:false};
  if($('#custom-calorie-mode').value==='manual') {
    if($('#custom-calories').value===''||$('#custom-calorie-weight').value==='')throw new Error('Enter calories and the body weight for your estimate.');
    exercise.energy={kcal:Number($('#custom-calories').value),weightKg:Number($('#custom-calorie-weight').value),activeMinutes:exerciseActiveMinutes(exercise,exercise)};
  }
  return exercise;
}
function updateCustomEnergyPreview() {
  const form=$('#custom-exercise-form');if(!form)return;
  const manual=$('#custom-calorie-mode').value==='manual';
  $('#custom-calorie-settings').hidden=!manual;
  for(const input of [$('#custom-calories'),$('#custom-calorie-weight')]){input.disabled=!manual;input.required=manual;}
  try {
    const exercise=readExerciseDefinition(),estimate=exerciseEnergy(exercise,exercise,state.profile.weight);
    $('#custom-energy-preview').innerHTML=`<strong>Default exercise: ~${num(estimate.kcal,1)} kcal extra burn</strong><span>${num(estimate.activeMinutes,1)} active min at ${num(state.profile.weight,1)} kg · ${manual?'your calorie estimate':'automatic estimate'}. Only completed exercises add to your daily remaining calories. Rest is excluded.</span>`;
  }catch{$('#custom-energy-preview').textContent='Enter valid default targets and calorie settings to preview this exercise.';}
}
function setLibraryExerciseArchived(id,archived) {
  const exercise=exerciseCatalog(state.workouts).find(e=>e.id===id);if(!exercise)return;
  rememberUndo();
  const defaults=workoutTarget(id),saved=validateExercise({...exercise,sets:exercise.sets??defaults.sets,reps:exercise.reps??defaults.reps,restSeconds:exercise.restSeconds??defaults.restSeconds??60,archived});
  const existing=state.workouts.exercises.some(e=>e.id===id);
  if(!existing)undoState.workouts.exercises.push(validateExercise({...saved,reset:true,energy:null,archived:false}));
  state.workouts.exercises=existing?state.workouts.exercises.map(e=>e.id===id?saved:e):[...state.workouts.exercises,saved];
  save();closeDialog();render();toast(archived?'Exercise deleted from the library. Scheduled workouts are kept.':'Exercise restored to the library.',false,true);
}
function showSessionEditor() {
  const value=state.workouts.notes[workoutDate]||{};
  openDialog(dialogHeading('Plan this session.',dateText(workoutDate,{weekday:'long'}))+`<form id="session-form">${field('Session title','session-title',value.title||'','text','maxlength="120"')}<div class="field"><label for="session-goal">Goal</label><textarea id="session-goal" maxlength="1500">${esc(value.goal||'')}</textarea></div><div class="field"><label for="session-note">Session notes</label><textarea id="session-note" maxlength="2000">${esc(value.note||'')}</textarea></div><div class="dialog-footer"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">Save session</button></div></form>`);
}
function updateRestTimer() {
  const seconds=Math.max(0,Math.ceil((restDeadline-Date.now())/1000));
  if($('#rest-countdown'))$('#rest-countdown').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  if(restDeadline&&seconds===0){clearInterval(restInterval);restDeadline=0;$('#rest-timer')?.classList.remove('active');toast('Rest timer finished.');}
}

function avatarMarkup(large=false) {
  const initials=state.profile.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'DB';
  return state.preferences.avatar ? `<img src="${esc(state.preferences.avatar)}" alt="${large ? 'Your profile photo' : ''}">` : esc(initials);
}
function colorSetting(role,label,description,palette) {
  const channels=colorRGB(palette[role]);
  return `<section class="color-setting" data-palette-role="${role}"><div class="color-setting-head"><div><h3>${label}</h3><p>${description}</p></div><input type="color" data-color-picker="${role}" value="${palette[role]}" aria-label="${label} color"></div><div class="hex-field"><label for="color-${role}-hex">HEX</label><input id="color-${role}-hex" data-color-hex="${role}" value="${palette[role]}" maxlength="7" pattern="#[a-fA-F0-9]{6}" aria-label="${label} hex color"></div><div class="rgb-sliders">${['Red','Green','Blue'].map((channel,i)=>`<div class="rgb-channel"><label for="color-${role}-${i}">${channel}</label><input type="range" id="color-${role}-${i}" min="0" max="255" step="1" value="${channels[i]}" data-rgb-role="${role}" data-rgb-channel="${i}" aria-label="${label} ${channel.toLowerCase()}"><input type="number" min="0" max="255" step="1" value="${channels[i]}" data-rgb-role="${role}" data-rgb-channel="${i}" aria-label="${label} ${channel.toLowerCase()} value"></div>`).join('')}</div></section>`;
}
function renderSettings() {
  const p=state.preferences,theme=document.documentElement.dataset.theme,palette=p.palettes[theme];
  $('#main').innerHTML=heading('Make this space yours.','Your colors, your text sizes, and a little more comfort.','','YOUR PERSONAL SETTINGS')
    + `<section class="card settings-profile"><div class="settings-avatar">${avatarMarkup(true)}</div><div class="settings-profile-copy"><h2>${esc(state.profile.name)}</h2><p>${syncView.signedIn ? 'Your settings and photo sync with your private account.' : 'Saved in this browser. Sign in to take your settings to other devices.'}</p><div class="settings-photo-actions"><button class="btn secondary small" data-action="upload-avatar">Upload photo</button><button class="text-button" data-action="remove-avatar" ${p.avatar ? '' : 'disabled'}>Remove photo</button><a class="text-button" href="#goals">Edit profile</a></div><small>JPEG, PNG or WebP · up to 10 MB. Photos are shown as a centered circle.</small><input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp" hidden><div class="form-error" id="avatar-error" role="alert"></div></div><button class="btn secondary small" data-action="sync-account">${syncView.signedIn ? 'My account' : 'Sync devices'}</button></section>
    <form id="settings-form" class="settings-grid"><section class="card settings-panel"><div class="settings-section-heading"><div><h2>Your ${theme} palette.</h2><p>Each theme keeps its own five colors. Changes preview immediately and save when you finish adjusting.</p></div><span class="palette-mode">${icon(theme==='dark' ? 'star' : 'leaf')} ${theme==='dark' ? 'Dark' : 'Light'}</span></div>
      ${selectField('Appearance mode','appearance-mode',[['system','Follow my device'],['light','Light · my palette'],['dark','Dark · my palette']],p.theme)}
      <div class="color-controls">${PALETTE_ROLES.map(([role,label,description])=>colorSetting(role,label,description,palette)).join('')}</div><div class="settings-panel-footer"><p id="palette-contrast" role="status"></p><button class="btn secondary small" type="button" data-action="reset-palette">Reset ${theme} colors</button></div><div class="form-error" id="appearance-error" role="alert"></div></section>
      <div class="settings-aside"><section class="card settings-panel"><div class="settings-section-heading"><div><h2>Text that works for you.</h2><p>Adjust each kind of text independently, throughout the app.</p></div></div><div class="typography-controls">${TEXT_ROLES.map(([role,label,min,max])=>`<div class="text-size-control"><div><label for="text-size-${role}">${label}</label><output id="text-size-${role}-value">${p.typography[role]} px</output></div><input id="text-size-${role}" type="range" min="${min}" max="${max}" step="1" value="${p.typography[role]}" data-text-size="${role}" aria-label="${label} size"></div>`).join('')}</div><button class="text-button" type="button" data-action="reset-typography">Reset text sizes</button></section>
      <section class="card settings-panel settings-preview" aria-label="Appearance preview"><span class="small-label">LIVE PREVIEW</span><h2 class="preview-title">Your daily balance.</h2><h3>Today’s workout</h3><p class="preview-body">Squat · 3 sets × 10 reps</p><p class="preview-subtext">Your labels and supporting details.</p><span class="preview-accent">Your accent color</span></section>
      <section class="card settings-panel"><div class="settings-section-heading"><div><h2>A little more comfort.</h2></div></div>${selectField('Layout spacing','appearance-density',[['comfortable','Comfortable · more room'],['compact','Compact · closer together']],p.density)}<label class="settings-toggle"><input id="appearance-motion" type="checkbox" ${p.reduceMotion ? 'checked' : ''}><span><strong>Reduce motion</strong><small>Use fewer animations and instant transitions. Your device’s reduced-motion preference is also respected.</small></span></label></section>
      <section class="card settings-panel"><h2>Your settings travel with you.</h2><p class="settings-description">Colors, text sizes, spacing and your profile photo are included in backups and sync with your account when you sign in.</p><div class="backup-buttons"><button class="btn secondary small" type="button" data-action="backup">${icon('download')} Export backup</button><a class="btn secondary small" href="#goals">Restore backup</a></div></section></div></form>`;
  for(const [role] of PALETTE_ROLES)updateColorControls(role);
}
function updatePaletteContrast() {
  if (!$('#palette-contrast'))return;
  const palette=state.preferences.palettes[document.documentElement.dataset.theme];
  const main=contrastRatio(palette.text,palette.surface),secondary=contrastRatio(palette.subtext,palette.surface);
  $('#palette-contrast').textContent=`Text contrast: ${main.toFixed(1)}:1 · Secondary: ${secondary.toFixed(1)}:1${Math.min(main,secondary)<4.5 ? ' · Increasing contrast can make small text easier to read.' : ''}`;
}
function updateColorControls(role) {
  const section=$(`[data-palette-role="${role}"]`);
  if (!section)return;
  const value=state.preferences.palettes[document.documentElement.dataset.theme][role],rgb=colorRGB(value);
  section.querySelector('[data-color-picker]').value=value;
  section.querySelector('[data-color-hex]').value=value;
  for (const input of section.querySelectorAll('[data-rgb-channel]')) {
    const channel=Number(input.dataset.rgbChannel);input.value=rgb[channel];
    if(input.type==='range') {
      const from=[...rgb],to=[...rgb];from[channel]=0;to[channel]=255;
      input.style.setProperty('--rgb-track',`linear-gradient(to right,${colorHex(from)},${colorHex(to)})`);
    }
  }
  updatePaletteContrast();
}
function editAppearanceInput(el) {
  const palette=state.preferences.palettes[document.documentElement.dataset.theme];
  if (el.dataset.rgbRole) {
    const value=Number(el.value);
    if (el.value==='' || !Number.isInteger(value) || value<0 || value>255)return false;
    const channels=colorRGB(palette[el.dataset.rgbRole]);channels[Number(el.dataset.rgbChannel)]=value;
    palette[el.dataset.rgbRole]=colorHex(channels);updateColorControls(el.dataset.rgbRole);
  } else if (el.dataset.colorPicker || el.dataset.colorHex) {
    const role=el.dataset.colorPicker || el.dataset.colorHex;
    if (!/^#[\da-f]{6}$/i.test(el.value))return false;
    palette[role]=validateHex(el.value);updateColorControls(role);
  } else if (el.dataset.textSize) {
    state.preferences.typography[el.dataset.textSize]=Number(el.value);
    $(`#text-size-${el.dataset.textSize}-value`).textContent=`${el.value} px`;
  } else return false;
  const role=el.dataset.rgbRole||el.dataset.colorPicker||el.dataset.colorHex;
  if(role)appearanceDraft.set(`palettes.${document.documentElement.dataset.theme}.${role}`,palette[role]);
  else if(el.dataset.textSize)appearanceDraft.set(`typography.${el.dataset.textSize}`,state.preferences.typography[el.dataset.textSize]);
  applyAppearance(state.preferences);
  $('#appearance-error')?.classList.remove('visible');
  return true;
}

function render() {
  if (!['today','foods','history','goals','workouts','exercises','settings'].includes(route)) route='today';
  applyAppearance(state.preferences);
  for (const a of document.querySelectorAll('[data-nav]')) {
    const active = a.dataset.nav===route;
    a.classList.toggle('active',active);
    if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  }
  $('#page-label').textContent = {today:'Daily intake',foods:'My foods',history:'History',goals:'Profile & goals',workouts:'Workouts',exercises:'Exercises',settings:'Settings'}[route];
  $('#sidebar-name').textContent = state.profile.name;
  $('#profile-avatar').innerHTML=avatarMarkup();
  $('#food-count').textContent = state.foods.length;
  ({today:renderToday,foods:renderFoods,history:renderHistory,goals:renderGoals,workouts:renderWorkouts,exercises:renderExercises,settings:renderSettings}[route])();
  if(loadError)$('#main').insertAdjacentHTML('afterbegin',`<div class="notice journal-recovery">${icon('info')}<span>${esc(loadError)}</span></div>`);
  if (needsSetup && route!=='settings') $('#main').insertAdjacentHTML('afterbegin', '<div class="notice">'+icon('info')+'<span>Welcome. The measurements below are placeholders. Set your own profile and save it, or use <strong>Restore backup</strong> below to bring over your existing settings and food journal.</span></div>');
  updateSaveStatus();
}

function openDialog(html) {
  const d = $('#dialog');
  if (!d.open) lastFocused = document.activeElement;
  $('#dialog-content').innerHTML = `<div class="dialog-body">${html}</div>`;
  if (!d.open) d.showModal();
  const first = d.querySelector('input:not([type=hidden]), select, button');
  first?.focus();
}
function closeDialog() { $('#dialog').close(); lastFocused?.isConnected && lastFocused.focus(); }
function dialogHeading(title, description) {
  return `<div class="dialog-heading"><div><h2 id="dialog-title">${esc(title)}</h2><p>${description}</p></div><button class="icon-btn" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>`;
}
function showPicker() {
  openDialog(dialogHeading('What did you eat?',`Choose a food to log for ${dateText(selectedDate)}.`)
    + `<div class="search">${icon('search')}<input id="picker-search" placeholder="Search your usual foods…" aria-label="Search foods to log"></div><div id="picker-results" class="dialog-search-results">${pickerResults('')}</div><div class="dialog-footer"><button class="btn secondary" data-action="new-food">${icon('plus')} Save a new food</button></div>`);
}
function pickerResults(query) {
  const foods = filteredFoods(query,'All').sort((a,b)=>Number(b.favorite)-Number(a.favorite));
  return foods.length ? foods.map(f=>`<button class="pick-food" data-action="food-portion" data-id="${esc(f.id)}">${tile(f)}<span><strong>${esc(f.name)}</strong><small>1 ${esc(f.portionUnit)} · ${num(f.portionGrams,1)} g</small></span><span class="pick-kcal">${num(portionNutrition(f).kcal)} kcal</span></button>`).join('') : '<p class="subtle-note" style="padding:10px">No saved food matches. Save a new food using its label.</p>';
}
function showPortion(f, entry = null) {
  pickerFood = structuredClone(f);
  editingEntryId = entry?.id || null;
  modalUnit = entry?.unit || (f.portionGrams===100 && f.portionUnit==='serving' ? 'g' : 'portion');
  const amount = entry?.amount || (modalUnit==='g' ? 100 : 1);
  const presets = f.id==='olive-oil' ? [.5,1,2] : modalUnit==='g' ? [50,100,120,150,200] : [.5,1,2,5];
  openDialog(dialogHeading(entry?'Edit your portion':'Add to your journal',`${esc(f.name)} · ${dateText(selectedDate)}`)
    + `<form id="portion-form"><div class="form-grid">${field('Amount','amount',amount,'number','required min="0.01" max="10000" step="any"')}${selectField('Unit','unit',allowedUnits(f).map(u=>[u,u==='portion'?`${f.portionUnit} · ${num(f.portionGrams,1)} g`:u]),modalUnit)}${selectField('Meal','meal',MEALS.map(m=>[m,m==='Other'?'Other / not specified':m]),entry?.meal||'Other')}</div><div class="portion-presets">${presets.map(q=>`<button type="button" data-action="portion-preset" data-amount="${q}">${num(q,1)}</button>`).join('')}</div><div id="portion-preview" class="form-preview"></div><div id="portion-nutrients"></div><div class="dialog-food-details">${f.nutrientNote?`${esc(f.nutrientNote)}${f.nutrientSource?` <a href="${esc(f.nutrientSource)}" target="_blank" rel="noopener noreferrer">Additional nutrient source ↗</a>`:''}<br>`:''}${esc(f.note)}${f.source?`<br><a href="${esc(f.source)}" target="_blank" rel="noopener noreferrer">View source label ↗</a>`:''}${entry?'<br>This entry uses the label saved when it was logged.':''}</div><div class="form-error" id="portion-error" role="alert"></div><div class="dialog-footer"><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn primary">${icon('plus')} ${entry?'Save portion':'Add food'}</button></div></form>`);
  updatePortionPreview();
}
function updatePortionPreview() {
  try {
    const n = portionNutrition(pickerFood,$('#amount').value,$('#unit').value);
    $('#portion-preview').innerHTML = NUTRIENTS.map(key=>`<div><strong class="${key}-color">${num(n[key],key==='kcal'?0:1)}</strong><small>${{kcal:'Calories · kcal',protein:'Protein · g',carbs:'Carbs · g',fat:'Fats · g'}[key]}</small></div>`).join('');
    $('#portion-nutrients').innerHTML=nutrientDetails(n)+`<p class="secondary-note">For this portion · — means unknown. Already included in calories, carbs and fats.</p>`;
    $('#portion-error').classList.remove('visible');
  } catch (error) { $('#portion-preview').innerHTML = '<small>Enter a valid portion to calculate nutrition.</small>';$('#portion-nutrients').innerHTML=''; }
}
function showFoodEditor(f = null) {
  const value = f || {name:'',category:'Extras',portionUnit:'serving',portionGrams:100,kcal:'',protein:'',carbs:'',fat:'',note:'',source:''};
  foodBasis='100';
  foodPortionGrams=Number(value.portionGrams);
  openDialog(dialogHeading(f?'Edit your saved food':'Save a food you eat','Use the nutrition label and portion size for your own product.')
    + `<form id="food-form" data-id="${esc(f?.id||'')}"><div class="form-grid">${field('Food name','food-name',value.name,'text','required maxlength="100"','',true)}${selectField('Category','category',CATEGORIES.map(c=>[c,c]),value.category)}${field('Portion name','portionUnit',value.portionUnit,'text','required maxlength="24"','For example: slice, bar, egg, packet.')}${field('Grams in one portion','portionGrams',value.portionGrams,'number','required min="0.1" max="5000" step="any"')}${selectField('Nutrition values below are','nutritionBasis',[['100','Per 100 g'],['portion','Per one portion']],foodBasis)}${field('Calories · kcal','food-kcal',value.kcal,'number','required min="0" step="any"')}${field('Protein · g','food-protein',value.protein,'number','required min="0" step="any"')}${field('Carbs · g','food-carbs',value.carbs,'number','required min="0" step="any"')}${field('Fats · g','food-fat',value.fat,'number','required min="0" step="any"')}<fieldset class="extra-nutrient-fields full"><legend>Additional nutrients · optional</legend><p>Use values from the same label and nutrition basis above. Leave unknown values blank; enter 0 only when the amount is known to be zero. Carbs include fiber and sugars; fats include saturated fat.</p><div class="form-grid">${EXTRA_NUTRIENTS.map(key=>field(`${nutrientInfo[key][0]} · ${nutrientInfo[key][1]}`,key,value[key]??'','number','min="0" step="any" placeholder="Unknown"')).join('')}</div><div id="food-nutrient-preview"></div>${value.nutrientNote?`<p class="nutrient-provenance">${esc(value.nutrientNote)}${value.nutrientSource?` <a href="${esc(value.nutrientSource)}" target="_blank" rel="noopener noreferrer">View nutrient source ↗</a>`:''}</p>`:''}</fieldset><div class="field full"><label for="food-note">Notes about this food</label><textarea id="food-note" name="food-note" maxlength="800">${esc(value.note)}</textarea></div>${field('Label or source link · optional','food-source',value.source,'url','placeholder="https://…"','',true)}</div><div class="form-error" id="food-error" role="alert"></div><p class="secondary-note">Past food log entries keep their original values when you change a saved label.</p><div class="dialog-footer">${f?`<button type="button" class="btn danger small" data-action="delete-food" data-id="${esc(f.id)}">Delete food</button>`:''}<button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">${icon('check')} Save food</button></div></form>`);
  updateFoodNutrientPreview();
}
function foodNutrientInput(key) {return $(`#${NUTRIENTS.includes(key)?'food-':''}${key}`);}
function rescaleFoodEditor(factor) {
  for(const key of [...NUTRIENTS,...EXTRA_NUTRIENTS]) {
    const input=foodNutrientInput(key);
    if(input.value!=='')input.value=Number((Number(input.value)*factor).toFixed(6));
  }
}
function updateFoodNutrientPreview() {
  const grams=Number($('#portionGrams').value),factor=foodBasis==='100'?grams/100:1;
  const n=Object.fromEntries(EXTRA_NUTRIENTS.map(key=>[key,foodNutrientInput(key).value===''?null:Number(foodNutrientInput(key).value)*factor]));
  $('#food-nutrient-preview').innerHTML=`<span class="small-label">ONE PORTION · ${num(grams,1)} g</span>${nutrientDetails(n)}`;
}
function showWeightDialog() {
  openDialog(dialogHeading('Log your weight.','Try to measure under similar conditions. One entry per date.')
    + `<form id="weight-form"><div class="form-grid">${field('Date','weight-date',todayKey(),'date',`required max="${todayKey()}"`)}${field('Weight · kg','weight-value',state.profile.weight,'number','required min="30" max="250" step="0.1"')}</div><div class="form-error" id="weight-error" role="alert"></div><div class="dialog-footer"><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">Save weight</button></div></form>`);
}
function showCopyDialog() {
  const dates = Object.entries(state.days).filter(([date,d])=>date!==selectedDate&&d.entries.length).sort((a,b)=>b[0].localeCompare(a[0]));
  openDialog(dialogHeading('Reuse a logged day.',`Copy foods into ${dateText(selectedDate)}. Existing entries stay in place.`)
    + (dates.length?`<form id="copy-form">${selectField('Day to copy','copy-date',dates.map(([d,day])=>[d,`${dateText(d,{year:'numeric'})} · ${day.entries.length} foods`]),dates[0][0])}<p class="secondary-note">Copies the portions and meal names, using the nutrition values recorded on that day.</p><div class="dialog-footer"><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">Copy foods</button></div></form>`:empty('No other day to copy.','Log a second day, then reuse its foods here.')));
}
function backup(journal=state) {
  const blob = new Blob([JSON.stringify(journal,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url;a.download=`daily-balance-backup-${todayKey()}.json`;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Backup exported. Keep it to restore your journal.');
}
function showError(selector,error) { const el=$(selector);el.textContent=error.message||String(error);el.classList.add('visible'); }

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button) return;
  const {action,id,date}=button.dataset;
  if(!syncView.ready&&!['backup','close-dialog','sync-account','sync-upload','sync-empty','sync-refresh','sync-signout','sync-recovery','recover-appearance','stop-rest'].includes(action))return toast('Wait until this device is synced before editing.',true);
  if(needsSetup&&['pick-food','food-portion','add-suggestion','copy-day','log-weight','pick-exercise','choose-exercise','library-add-workout','suggest-workout-week','copy-workout-week','load-starter-routine'].includes(action)){location.hash='goals';toast('Save your profile or restore your backup first.');return;}
  try {
    if(action==='view-calorie-workouts'){workoutDate=selectedDate;location.hash='workouts';return;}
    if(action==='workout-food-day'){setDate(workoutDate);return;}
    if(action==='load-starter-routine') {
      const count=weekDates(workoutDate).flatMap(date=>workoutEntries(date)).length;
      openDialog(dialogHeading('Load the glutes & chest starter plan?',`The supplied plan includes 22 exercises and activities across this week.`)+`<p class="subtle-note">This replaces ${count} scheduled entries in this week, selects muscle preservation, starting out and dumbbells/bodyweight, and enables weekly repeat. Your other weeks are kept. Undo is available.</p><div class="dialog-footer"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-starter-routine">Load starter plan</button></div>`);return;
    }
    if(action==='confirm-starter-routine') {
      rememberUndo();
      const dates=weekDates(workoutDate),w=state.workouts;
      w.settings={...w.settings,goal:'preserve',experience:'beginner',equipment:'dumbbells',autoRepeat:true};w.template=null;
      for(const day of dates){delete w.days[day];delete w.notes[day];}
      w.skippedWeeks=w.skippedWeeks.filter(date=>date!==dates[0]);
      const plan=starterWeek(w.settings,workoutDate,{},dates[0]);Object.assign(w.days,plan.days);Object.assign(w.notes,plan.notes);
      save();closeDialog();render();toast('Your starter routine is loaded and will repeat weekly.',false,true);return;
    }
    if(action==='exercise-library')return showExerciseLibrary();
    if(action==='new-exercise')return showCustomExerciseEditor();
    if(action==='edit-custom-exercise')return showCustomExerciseEditor(exerciseCatalog(state.workouts).find(e=>e.id===id));
    if(action==='library-add-workout')return showWorkoutEditor(id);
    if(action==='reset-exercise-filters') {
      exerciseFilters={search:'',group:'all',equipment:'all',source:'all',status:'active'};renderExercises();$('#library-search').focus();return;
    }
    if(action==='remove-exercise-image') {
      draftExerciseImage='';exerciseImageGeneration++;$('#custom-image-preview').innerHTML='';
      const form=$('#custom-exercise-form');delete form.dataset.imagePending;form.querySelector('button[type="submit"]').disabled=false;
      const input=form.querySelector('#custom-image');input.disabled=false;input.value='';form.querySelector('#custom-image-status').textContent='';return;
    }
    if(action==='delete-library-exercise') {
      const exercise=exerciseCatalog(state.workouts).find(e=>e.id===id);if(!exercise)return;
      openDialog(dialogHeading(`Delete ${exercise.name}?`,'Remove this exercise from your active library.')+`<p class="subtle-note">Scheduled workouts and past calorie credits are kept. You can restore this exercise with the Archived filter, or use Undo.</p><div class="dialog-footer"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn danger" data-action="confirm-delete-library-exercise" data-id="${esc(id)}">Delete exercise</button></div>`);return;
    }
    if(action==='confirm-delete-library-exercise')return setLibraryExerciseArchived(id,true);
    if(action==='restore-library-exercise')return setLibraryExerciseArchived(id,false);
    if(action==='reset-library-exercise') {
      const original=EXERCISE_PRESETS.find(e=>e.id===id);if(!original)return;
      const restored=validateExercise({...original,reset:true,energy:null,archived:false});
      rememberUndo();state.workouts.exercises=state.workouts.exercises.map(e=>e.id===id?restored:e);
      save();closeDialog();render();toast('Original preset restored.',false,true);return;
    }
    if(action==='archive-exercise') {
      const exercise=exerciseCatalog(state.workouts).find(e=>e.id===id);if(exercise)setLibraryExerciseArchived(id,!exercise.archived);return;
    }
    if(action==='library-guide'||action==='workout-instructions') {
      const exercise=action==='library-guide'?exerciseCatalog(state.workouts).find(e=>e.id===id):scheduledExercise(workoutEntries(date).find(e=>e.id===id),state.workouts);
      if(!exercise)return;
      openDialog(dialogHeading(exercise.name,'Technique and a visual reference.')+guideHTML(exercise)+`<div class="dialog-footer"><button class="btn secondary" data-action="close-dialog">Close</button><button class="btn primary" data-action="edit-custom-exercise" data-id="${esc(exercise.id)}">Edit exercise type</button></div>`);return;
    }
    if(action==='session-notes')return showSessionEditor();
    if(action==='start-rest') {
      clearInterval(restInterval);restDeadline=Date.now()+Number(button.dataset.seconds)*1000;renderWorkouts();restInterval=setInterval(updateRestTimer,1000);return;
    }
    if(action==='stop-rest'){clearInterval(restInterval);restDeadline=0;$('#rest-timer')?.classList.remove('active');return;}
    if(action==='reorder-workout') {
      const entries=workoutEntries(),index=entries.findIndex(e=>e.id===id),target=index+Number(button.dataset.direction);
      if(index<0||target<0||target>=entries.length)return;
      [entries[index],entries[target]]=[entries[target],entries[index]];save();renderWorkouts();return;
    }
    if(action==='save-workout-routine') {
      const dates=weekDates(workoutDate);
      state.workouts.template={config:workoutConfigKey(state.workouts.settings),days:dates.map(date=>workoutEntries(date).map(entry=>({...entry,completed:false}))),notes:dates.map(date=>validateSessionNote(state.workouts.notes[date]))};
      state.workouts.settings.autoRepeat=true;save();renderWorkouts();toast('This week is saved as your repeating routine.');return;
    }
    if(action==='clear-workouts'||action==='confirm-clear-workouts') {
      const scope=button.dataset.scope;
      if(scope==='all'&&action==='clear-workouts') {
        const count=Object.values(state.workouts.days).flat().length;
        openDialog(dialogHeading('Clear all scheduled workouts?',`${count} exercises will be removed from all dates.`)+`<p class="subtle-note">Your exercise library and saved routine stay available. Automatic weekly repeat will be paused. You can undo this clear immediately afterward.</p><div class="dialog-footer"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn danger" data-action="confirm-clear-workouts" data-scope="all">Clear all scheduled workouts</button></div>`);return;
      }
      rememberUndo();state.workouts=clearWorkoutSchedule(state.workouts,scope,workoutDate);save();closeDialog();render();toast(scope==='all'?'All scheduled workouts cleared. Weekly repeat is paused.':`${scope==='week'?'Week':'Day'} cleared. It will stay empty until you add exercises.`,false,true);return;
    }
    if(action==='upload-avatar')return $('#avatar-file').click();
    if(action==='remove-avatar') {
      state.preferences.avatar='';save();render();toast('Profile photo removed.');return;
    }
    if(action==='reset-palette') {
      const theme=document.documentElement.dataset.theme;
      state.preferences.palettes[theme]={...DEFAULT_PREFERENCES.palettes[theme]};
      save();render();toast(`${theme==='dark'?'Dark':'Light'} palette reset.`);return;
    }
    if(action==='reset-typography') {
      state.preferences.typography={...DEFAULT_PREFERENCES.typography};save();render();toast('Text sizes reset.');return;
    }
    if(action==='sync-account') return showSyncAccount();
    if(action==='sync-upload') { journalSync.uploadLocal();closeDialog();return; }
    if(action==='sync-empty') { journalSync.startEmpty();closeDialog();return; }
    if(action==='sync-refresh') { journalSync.retry();return; }
    if(action==='recover-appearance') {
      if(journalSync.recoverAppearance()){closeDialog();toast('Your saved appearance is restored on this device. Current journal records are kept.');}
      else toast('No different saved appearance was found on this device.',true);
      return;
    }
    if(action==='sync-recovery') {
      const previous=journalSync.previousJournal();
      if(previous)backup(previous);else toast('No previous local save is available on this device.',true);
      return;
    }
    if(action==='sync-signout') { void journalSync.signOut().then(closeDialog).catch(error=>toast(error.message,true));return; }
    if(action==='pick-exercise') {if(date)workoutDate=date;return showExercisePicker();}
    if(action==='choose-exercise') return showWorkoutEditor(id);
    if(action==='workout-day') {
      setWorkoutDate(date);
      $('.workout-session').scrollIntoView({behavior:state.preferences.reduceMotion?'instant':'smooth',block:'start'});
      return;
    }
    if(action==='workout-today') return setWorkoutDate(todayKey());
    if(action==='prev-workout-week') return setWorkoutDate(shiftDate(workoutDate,-7));
    if(action==='next-workout-week') return setWorkoutDate(shiftDate(workoutDate,7));
    if(action==='edit-workout') {
      const entry=workoutEntries().find(e=>e.id===id);
      if(entry)showWorkoutEditor(entry.exerciseId,entry);
      return;
    }
    if(action==='remove-workout') {
      rememberUndo();
      state.workouts.days[workoutDate]=workoutEntries().filter(e=>e.id!==id);
      if(!state.workouts.days[workoutDate].length)delete state.workouts.days[workoutDate];
      save();render();toast('Exercise removed.',false,true);return;
    }
    if(action==='workout-use-suggestion') {
      const form=$('#workout-form');
      const target=workoutTarget(form.dataset.exerciseId,$('#exercise-date').value);
      $('#exercise-sets').value=target.sets;$('#exercise-reps').value=target.reps;
      $('#exercise-sets-max').value=target.setsMax??target.sets;$('#exercise-reps-max').value=target.repsMax??target.reps;$('#exercise-rest').value=target.restSeconds??60;
      form.dataset.lastSets=String(target.sets);form.dataset.lastReps=String(target.reps);updateWorkoutEnergyPreview();
      $('#workout-error').classList.remove('visible');return;
    }
    if(action==='suggest-workout-week'||action==='copy-workout-week') {
      const w=state.workouts,from=workoutDate;
      const routine=action==='suggest-workout-week'?starterWeek(w.settings,workoutDate,w.days,todayKey(),w.template):null;
      const additions=action==='suggest-workout-week'
        ? (Object.keys(routine.days).length?routine.days:suggestWorkoutWeek(state.profile,w.settings,workoutDate,state.days,w.days))
        : copyWorkoutWeek(w.days,workoutDate,todayKey(),exerciseCatalog(w));
      const count=Object.values(additions).flat().length;
      if(!count)return toast(action==='suggest-workout-week'?'No empty upcoming session days in this week. Choose another week or add exercises yourself.':'No exercises to copy into empty upcoming days next week.');
      rememberUndo();Object.assign(state.workouts.days,additions);
      if(routine)Object.assign(w.notes,routine.notes);
      if(action==='copy-workout-week')for(const day of weekDates(from)){const target=shiftDate(day,7);if(target>=todayKey()&&w.notes[day]&&!w.notes[target]&&(additions[target]||!w.days[target]?.length))w.notes[target]=structuredClone(w.notes[day]);}
      w.skippedWeeks=w.skippedWeeks.filter(week=>week!==weekDates(action==='copy-workout-week'?shiftDate(from,7):from)[0]);
      if(action==='copy-workout-week')workoutDate=shiftDate(workoutDate,7);
      save();render();toast(`${count} exercises ${action==='suggest-workout-week'?'planned':'copied to next week'}.`,false,true);return;
    }
    if(action==='pick-food') return showPicker();
    if(action==='close-dialog') return closeDialog();
    if(action==='food-portion') { const f=state.foods.find(f=>f.id===id); if(f)showPortion(f);return; }
    if(action==='new-food') return showFoodEditor();
    if(action==='edit-food') return showFoodEditor(state.foods.find(f=>f.id===id));
    if(action==='prev-day') return setDate(shiftDate(selectedDate,-1));
    if(action==='next-day') return setDate(shiftDate(selectedDate,1));
    if(action==='today') return setDate(todayKey());
    if(action==='open-day') return setDate(date);
    if(['weekly-prev','weekly-next','weekly-current'].includes(action)) {
      intakeWeekDate=action==='weekly-current'?todayKey():shiftDate(intakeWeekDate,action==='weekly-prev'?-7:7);
      renderIntakeWeek(action);return;
    }
    if(action==='weekly-open-day') {
      setDate(date);$('.summary-card')?.scrollIntoView({behavior:state.preferences.reduceMotion?'instant':'smooth',block:'start'});return;
    }
    if(action==='log-weight') return showWeightDialog();
    if(action==='backup') return backup();
    if(action==='copy-day') return showCopyDialog();
    if(action==='import') return $('#backup-file').click();
    if(action==='restore-confirm') {
      if(!pendingImport)return;
      rememberUndo(true);state=pendingImport;needsSetup=state.profileReady===false;pendingImport=null;loadError='';save();closeDialog();render();toast('Backup restored.',false,true);return;
    }
    if(action==='undo') {
      if(!undoState)return;
      const completed=closedIntakeThrough(state);
      state=undoState;
      if(!undoRestoresJournal)state.intakeClosedThrough=[completed,closedIntakeThrough(state)].filter(Boolean).sort().at(-1)||null;
      needsSetup=state.profileReady===false;undoState=null;undoRestoresJournal=false;save();render();toast('Restored.');return;
    }
    if(action==='food-filter') { foodFilter=button.dataset.filter;renderFoods();return; }
    if(action==='favorite') { const f=state.foods.find(f=>f.id===id);f.favorite=!f.favorite;save();renderFoods();return; }
    if(action==='portion-preset') { $('#amount').value=button.dataset.amount;updatePortionPreview();return; }
    if(action==='edit-entry') { const e=currentDay().entries.find(e=>e.id===id);if(e)showPortion(e.food,e);return; }
    if(action==='remove-entry') {
      rememberUndo();const day=currentDay(true);day.entries=day.entries.filter(e=>e.id!==id);save();render();toast('Food removed.',false,true);return;
    }
    if(action==='delete-food') {
      rememberUndo();state.foods=state.foods.filter(f=>f.id!==id);save();closeDialog();render();toast('Saved food removed. Your recorded entries are kept.',false,true);return;
    }
    if(action==='delete-weight') {
      if(state.weights.length===1)return toast('Keep at least one measurement in your weight journal.',true);
      const weights=state.weights.filter(w=>w.date!==date);
      const p=validateProfile({...state.profile,weight:weights.at(-1).weight});calculateGoals(p);
      rememberUndo();state.weights=weights;state.profile=p;
      applyTodaysGoals(p);
      save();render();toast('Weight measurement removed.',false,true);return;
    }
    if(action==='add-suggestion') {
      const f=state.foods.find(f=>f.id===id);
      currentDay(true).entries.push(newEntry(f,1,'portion','Other'));closeIntakeDays(state,selectedDate);save();render();toast(`${f.name} added.`);return;
    }
  } catch(error) { toast(error.message,true); }
});

document.addEventListener('input',event=>{
  const el=event.target;
  if(!syncView.ready&&el.closest('#main'))return;
  if(['exercise-sets','exercise-reps'].includes(el.id)) {
    const form=$('#workout-form'),kind=el.id==='exercise-sets'?'Sets':'Reps',max=$('#'+el.id+'-max');
    if(max.value===form.dataset['last'+kind]||Number(max.value)<Number(el.value))max.value=el.value;
    form.dataset['last'+kind]=el.value;
  }
  if(el.closest('#workout-form'))updateWorkoutEnergyPreview();
  if(el.closest('#custom-exercise-form'))updateCustomEnergyPreview();
  if(el.id==='library-search'){exerciseFilters.search=el.value;updateExerciseLibraryResults();}
  if(el.closest('#settings-form'))editAppearanceInput(el);
  if(el.id==='food-search') {
    foodQuery=el.value;const list=filteredFoods();$('#foods-grid').innerHTML=list.map(foodCard).join('');
    $('#foods-empty').innerHTML=list.length?'':empty('No foods found.','Try another search or save a new food.');
  }
  if(el.id==='picker-search') $('#picker-results').innerHTML=pickerResults(el.value);
  if(el.id==='exercise-search') $('#exercise-results').innerHTML=exercisePickerResults();
  if(el.id==='amount') updatePortionPreview();
  if(el.closest('#food-form')) {
    if(el.id==='portionGrams') {
      const grams=Number(el.value);
      if(Number.isFinite(grams)&&grams>0) {
        if(foodBasis==='portion')rescaleFoodEditor(grams/foodPortionGrams);
        foodPortionGrams=grams;
      }
    }
    updateFoodNutrientPreview();
  }
  if(el.id==='budget-slider') {
    try {
      const g=calculateGoals(state.profile,selectedDate,Number(el.value));
      $('#budget-number').value=el.value;
      $('#summary-live').innerHTML=summaryContent(g,totals(currentDay().entries),workoutDayEnergy(state,selectedDate).creditedKcal);
    } catch(error){toast(error.message,true);}
  }
  if(el.closest('#profile-form')) {
    try { $('#calc-preview').innerHTML=renderCalculations(readProfileForm());$('#profile-error').classList.remove('visible'); }
    catch(error) { showError('#profile-error',error); }
  }
});

document.addEventListener('change',async event=>{
  const el=event.target;
  try {
    if(el.id==='custom-image') {
      const file=el.files[0];if(!file)return;
      const form=el.closest('#custom-exercise-form');if(!form||form!==$('#custom-exercise-form')||!$('#dialog').open)return;
      // Returning from a native file picker can pause sync before this change.
      // Prepare only this editor's draft; submitting still requires a ready account.
      const account=syncView.signedIn?syncView.email:'local',generation=++exerciseImageGeneration,submit=form.querySelector('button[type="submit"]');
      const current=()=>$('#dialog').open&&form.isConnected&&form===$('#custom-exercise-form')&&generation===exerciseImageGeneration&&account===(syncView.signedIn?syncView.email:'local');
      const status=form.querySelector('#custom-image-status');status.textContent='Preparing your image…';
      form.querySelector('#custom-exercise-error').classList.remove('visible');
      el.disabled=true;submit.disabled=true;form.dataset.imagePending='true';
      try {
        const image=await prepareExerciseImage(file);if(!current())return;
        draftExerciseImage=image;form.querySelector('#custom-image-preview').innerHTML=`<img src="${esc(image)}" alt="Exercise illustration preview">`;status.textContent='Image ready to save.';
      }catch(error){if(current()){showError('#custom-exercise-error',error);status.textContent='Image could not be opened.';}}
      finally{if(current()){el.disabled=false;el.value='';submit.disabled=false;delete form.dataset.imagePending;}}return;
    }
    if(!syncView.ready&&(el.closest('#main')||el.closest('#custom-exercise-form')))return;
    if(el.id==='custom-unit') {
      $('#custom-reps').max=el.value==='minutes'?240:el.value==='seconds'?300:100;
      $('label[for="custom-reps"]').textContent=el.value==='minutes'?'Default minutes per set':el.value==='seconds'?'Default seconds per set':'Default reps per set';
      updateCustomEnergyPreview();return;
    }
    if(el.id==='custom-calorie-mode'){updateCustomEnergyPreview();return;}
    if(['library-group','library-equipment','library-source','library-status'].includes(el.id)) {
      exerciseFilters[el.id.slice('library-'.length)]=el.value;updateExerciseLibraryResults();return;
    }
    if(el.id==='workout-repeat'||el.id==='workout-view') {
      if(el.id==='workout-repeat')state.workouts.settings.autoRepeat=el.checked;else state.workouts.settings.view=el.value;
      save();renderWorkouts();return;
    }
    if(el.id==='avatar-file') {
      const file=el.files[0];if(!file)return;
      const journal=state;el.disabled=true;
      try {
        const avatar=await prepareProfilePhoto(file);
        if(state!==journal)throw new Error('Your journal changed while the photo was opening. Choose it again.');
        state.preferences=validatePreferences({...state.preferences,avatar});save();render();toast('Your profile photo is saved.');
      } finally { el.disabled=false;el.value=''; }
      return;
    }
    if(el.id==='appearance-mode') {
      state.preferences.theme=el.value;state.preferences=validatePreferences(state.preferences);save();render();return;
    }
    if(el.id==='appearance-density'||el.id==='appearance-motion') {
      if(el.id==='appearance-density')state.preferences.density=el.value;
      else state.preferences.reduceMotion=el.checked;
      applyAppearance(state.preferences);save();return;
    }
    if(el.closest('#settings-form')&&(el.dataset.rgbRole||el.dataset.colorPicker||el.dataset.colorHex||el.dataset.textSize)) {
      if(!editAppearanceInput(el)) {
        if(el.dataset.rgbRole)updateColorControls(el.dataset.rgbRole);
        else if(el.dataset.colorHex)updateColorControls(el.dataset.colorHex);
        throw new Error(el.dataset.rgbRole?'Enter a whole number from 0 to 255.':'Use a six-digit color such as #a1c4ff.');
      }
      state.preferences=validatePreferences(state.preferences);save();return;
    }
    if(el.id==='workout-date')return setWorkoutDate(el.value);
    if(['workout-goal','workout-experience','workout-equipment'].includes(el.id)) {
      state.workouts.settings=validateWorkoutSettings({...state.workouts.settings,goal:$('#workout-goal').value,experience:$('#workout-experience').value,equipment:$('#workout-equipment').value});
      save();renderWorkouts();$(`#${el.id}`).focus();return;
    }
    if(['exercise-group','exercise-equipment'].includes(el.id)) {
      $('#exercise-results').innerHTML=exercisePickerResults();return;
    }
    if(el.dataset.workoutComplete) {
      const entry=workoutEntries(el.dataset.date||workoutDate).find(e=>e.id===el.dataset.workoutComplete);
      if(entry){entry.completed=el.checked;save();renderWorkouts();$('[data-workout-complete="'+CSS.escape(entry.id)+'"][data-placement="'+el.dataset.placement+'"]')?.focus();}
      return;
    }
    if(el.id==='selected-date') return setDate(el.value);
    if(['budget-slider','budget-number'].includes(el.id)) {const focusId=document.activeElement===el?el.id:null;updateDayGoals(el.value);renderToday();if(focusId)$(`#${focusId}`).focus();return;}
    if(el.id==='unit') {
      const amount=$('#amount');
      const n=portionNutrition(pickerFood,amount.value,modalUnit);
      amount.value=Number((el.value==='g'?n.grams:el.value==='tsp'?n.grams/4.5:el.value==='mL'?n.grams/.9:n.grams/pickerFood.portionGrams).toFixed(3));
      modalUnit=el.value;updatePortionPreview();return;
    }
    if(el.id==='nutritionBasis') {
      const grams=Number($('#portionGrams').value);
      if(!Number.isFinite(grams)||grams<=0)throw new Error('Enter the portion weight first.');
      const factor=el.value==='portion'?grams/100:100/grams;
      if(el.value!==foodBasis)rescaleFoodEditor(factor);
      foodBasis=el.value;updateFoodNutrientPreview();return;
    }
    if(el.id==='backup-file') {
      const file=el.files[0];if(!file)return;
      if(file.size>10*1024*1024)throw new Error('Choose a backup smaller than 10 MB.');
      pendingImport=validateState(JSON.parse(await file.text()));
      openDialog(dialogHeading('Restore this journal?',`The backup contains ${pendingImport.foods.length} saved foods, ${Object.keys(pendingImport.days).length} food dates, ${pendingImport.weights.length} weight records, and ${Object.values(pendingImport.workouts.days).flat().length} workout exercises.`)
        + `<p class="subtle-note">This replaces the journal in this browser. Export your current data first if you want to keep both copies.</p><div class="dialog-footer"><button class="btn secondary" data-action="backup">Export current data</button><button class="btn primary" data-action="restore-confirm">Restore backup</button></div>`);
    }
    if(el.closest('#profile-form')) $('#calc-preview').innerHTML=renderCalculations(readProfileForm());
  } catch(error) {
    if(el.closest('#custom-exercise-form'))showError('#custom-exercise-error',error);
    else if(el.id==='avatar-file'&&$('#avatar-error'))showError('#avatar-error',error);
    else if(el.closest('#settings-form'))showError('#appearance-error',error);
    else if(el.closest('#profile-form'))showError('#profile-error',error);else toast(error.message,true);
  }
});

document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  try {
    if(!syncView.ready&&form.id!=='sync-signin-form')throw new Error('Wait for your saved journal to finish loading.');
    if(form.id==='custom-exercise-form') {
      if(form.dataset.imagePending)throw new Error('Wait for your exercise image to finish loading.');
      const existing=state.workouts.exercises.find(e=>e.id===form.dataset.id);
      const exercise=validateExercise({...readExerciseDefinition(),id:form.dataset.id||`custom-exercise-${crypto.randomUUID()}`});
      if(!existing&&exercise.id.startsWith('custom-exercise-')&&state.workouts.exercises.filter(e=>e.id.startsWith('custom-exercise-')).length>=200)throw new Error('Your library can contain up to 200 custom exercise types.');
      if(existing)state.workouts.exercises=state.workouts.exercises.map(e=>e.id===exercise.id?exercise:e);else state.workouts.exercises.push(exercise);
      save();closeDialog();render();toast('Exercise type saved to your library.');return;
    }
    if(form.id==='session-form') {
      state.workouts.notes[workoutDate]=validateSessionNote({title:$('#session-title').value,goal:$('#session-goal').value,note:$('#session-note').value});save();closeDialog();renderWorkouts();toast('Session details saved.');return;
    }
    if(form.id==='settings-form') {state.preferences=validatePreferences(state.preferences);save();toast('Settings saved.');return;}
    if(form.id==='sync-signin-form') {
      const button=form.querySelector('button[type=submit]');
      button.disabled=true;
      $('#sync-signin-error').classList.remove('visible');
      try {
        await journalSync.signIn($('#sync-email').value.trim());
        $('#sync-signin-result').textContent='Check your inbox and open the sign-in link on this device. You can close this dialog while you wait.';
      } catch(error) { showError('#sync-signin-error',error); }
      finally { button.disabled=false; }
      return;
    }
    if(form.id==='workout-form') {
      if(needsSetup)throw new Error('Save your profile first to personalize workout suggestions.');
      const data=Object.fromEntries(new FormData(form)),date=data['exercise-date'],source=form.dataset.sourceDate;
      if(!isDateKey(date))throw new Error('Choose a valid workout date.');
      const existing=workoutEntries(source).find(e=>e.id===form.dataset.id);
      const entry=validateWorkoutEntry({id:existing?.id||crypto.randomUUID(),exerciseId:form.dataset.exerciseId,
        sets:data['exercise-sets'],reps:data['exercise-reps'],load:data['exercise-load'],note:data['exercise-note'],
        setsMax:data['exercise-sets-max']||data['exercise-sets'],repsMax:data['exercise-reps-max']||data['exercise-reps'],restSeconds:data['exercise-rest'],exercise:existing?.exercise,
        completed:source===date&&(existing?.completed??false)},exerciseCatalog(state.workouts));
      if(workoutEntries(date).length>=50&&(!existing||date!==source))throw new Error('One day can contain up to 50 exercises.');
      if(existing&&date===source)state.workouts.days[date]=workoutEntries(date).map(e=>e.id===existing.id?entry:e);
      else {
        if(existing){state.workouts.days[source]=workoutEntries(source).filter(e=>e.id!==existing.id);if(!state.workouts.days[source].length)delete state.workouts.days[source];}
        state.workouts.days[date]=[...workoutEntries(date),entry];
      }
      workoutDate=date;
      const fromLibrary=form.dataset.fromLibrary==='true';
      save();closeDialog();if(fromLibrary&&route!=='workouts')location.hash='workouts';else render();toast(existing?'Exercise updated.':'Exercise added to your plan.');return;
    }
    if(form.id==='portion-form') {
      const data=Object.fromEntries(new FormData(form));
      const entry=newEntry(pickerFood,data.amount,data.unit,data.meal,editingEntryId||crypto.randomUUID());
      const day=currentDay(true);
      if(editingEntryId)day.entries=day.entries.map(e=>e.id===editingEntryId?entry:e);else day.entries.push(entry);
      closeIntakeDays(state,selectedDate);
      save();closeDialog();render();toast(editingEntryId?'Portion updated.':`${pickerFood.name} added.`);
    }
    if(form.id==='food-form') {
      const data=Object.fromEntries(new FormData(form)),existing=state.foods.find(f=>f.id===form.dataset.id);
      const grams=Number(data.portionGrams),factor=data.nutritionBasis==='portion'?100/grams:1;
      const raw={id:existing?.id||`custom-${crypto.randomUUID()}`,name:data['food-name'],category:data.category,portionUnit:data.portionUnit,portionGrams:grams,note:data['food-note'],source:data['food-source'],favorite:existing?.favorite??true,verified:false};
      for(const n of NUTRIENTS) {if(data[`food-${n}`]==='')throw new Error('Fill in calories and all three macro values.');raw[n]=Number(data[`food-${n}`])*factor;}
      for(const key of EXTRA_NUTRIENTS)raw[key]=data[key]===''?null:Number(data[key])*factor;
      if(existing&&['name','category','source'].every(key=>raw[key]===existing[key])&&NUTRIENTS.every(key=>Math.abs(raw[key]-existing[key])<.00001)&&EXTRA_NUTRIENTS.every(key=>raw[key]==null?existing[key]==null:existing[key]!=null&&Math.abs(raw[key]-existing[key])<.00001)) {
        raw.nutrientNote=existing.nutrientNote;raw.nutrientSource=existing.nutrientSource;
      }
      const food=validateFood(raw);
      if(existing)state.foods=state.foods.map(f=>f.id===food.id?food:f);else state.foods.push(food);
      save();closeDialog();render();toast('Food saved to your list.');
    }
    if(form.id==='profile-form') {
      const p=readProfileForm();calculateGoals(p);
      if(p.weight!==state.profile.weight||!state.weights.length){state.weights=state.weights.filter(w=>w.date!==todayKey());state.weights.push({date:todayKey(),weight:p.weight});state.weights.sort((a,b)=>a.date.localeCompare(b.date));}
      state.profile=p;state.profileReady=true;needsSetup=false;applyTodaysGoals(p);save();render();toast('Your profile and goals are saved.');
    }
    if(form.id==='weight-form') {
      const date=$('#weight-date').value,weight=Number($('#weight-value').value);
      if(!isDateKey(date)||date>todayKey())throw new Error('Choose today or a past date.');
      if(!Number.isFinite(weight)||weight<30||weight>250)throw new Error('Enter a weight between 30 and 250 kg.');
      const candidateWeights=state.weights.filter(w=>w.date!==date);candidateWeights.push({date,weight});candidateWeights.sort((a,b)=>a.date.localeCompare(b.date));
      const p=validateProfile({...state.profile,weight:candidateWeights.at(-1).weight});calculateGoals(p);
      state.weights=candidateWeights;state.profile=p;
      applyTodaysGoals(p);
      save();closeDialog();render();toast('Weight recorded.');
    }
    if(form.id==='copy-form') {
      const date=$('#copy-date').value,entries=state.days[date].entries;
      rememberUndo();currentDay(true).entries.push(...entries.map(e=>newEntry(e.food,e.amount,e.unit,e.meal)));
      if(entries.length)closeIntakeDays(state,selectedDate);
      save();closeDialog();render();toast('Foods copied into this day.',false,true);
    }
  } catch(error) {
    const selector={ 'portion-form':'#portion-error','food-form':'#food-error','profile-form':'#profile-error','weight-form':'#weight-error','workout-form':'#workout-error','custom-exercise-form':'#custom-exercise-error' }[form.id];
    if(selector)showError(selector,error);else toast(error.message,true);
  }
});

window.addEventListener('appearance-theme-change',event=>{
  if(event.detail.userInitiated&&!syncView.ready)return;
  state.preferences.theme=event.detail.preference;
  applyAppearance(state.preferences);
  if(event.detail.userInitiated)save();
  if(route==='settings')renderSettings();
});
window.addEventListener('hashchange',()=>{route=location.hash.slice(1)||'today';render();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY||!event.newValue||journalSync?.isSignedIn())return;
  try{state=validateCloudJournal(JSON.parse(event.newValue),state);needsSetup=state.profileReady===false;render();toast('Journal updated from another tab.');}catch{toast('Another tab saved invalid data. Your current view is kept.',true);}
});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog'))closeDialog();});
$('#dialog').addEventListener('close',()=>{lastFocused?.isConnected&&lastFocused.focus();});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&['today','workouts'].includes(route))render();
});
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
render();
if(!loadError)save();

journalSync = createJournalSync({
  applyJournal(journal,{remoteUpdate=false}={}) {
    if (sameJournal(state,journal)) return;
    if(sameJournal({...state,preferences:{...state.preferences,changeId:''}},{...journal,preferences:{...journal.preferences,changeId:''}})) {
      state.preferences.changeId=journal.preferences.changeId;
      return;
    }
    if(remoteUpdate&&$('#dialog').open&&$('#dialog form:not(#sync-signin-form)'))closeDialog();
    state=validateState(journal);needsSetup=state.profileReady===false;undoState=null;pendingImport=null;
    loadError='';saveFailed=false;render();
  },
  statusChanged(view) {
    const previous=syncView;
    if(previous.ready&&!view.ready)pausedFocus=document.activeElement;
    syncView=view;updateSaveStatus();
    if(view.ready&&!previous.ready) {
      const account=view.signedIn?view.email:'local';
      if(readyAccount!==account) {
        readyAccount=account;
        if(needsSetup&&route!=='settings'){route='goals';if(location.hash!=='#goals')location.hash='goals';}
        render();
      } else if(route==='workouts'&&!$('#dialog').open)renderWorkouts();
      if(appearanceDraft.size) {
        for(const [path,value] of appearanceDraft) {
          const parts=path.split('.');let target=state.preferences;
          for(const part of parts.slice(0,-1))target=target[part];
          target[parts.at(-1)]=value;
        }
        applyAppearance(state.preferences);
        if(route==='settings')renderSettings();
        save();
      }
      if(pausedFocus?.isConnected)pausedFocus.focus({preventScroll:true});
      pausedFocus=null;
    }
    if(route==='settings'&&previous.signedIn!==view.signedIn&&!$('#dialog').open)renderSettings();
    if (view.phase==='choose' && previous.phase!==view.phase) showSyncAccount();
    else if ($('#sync-account-body')) {
      if (!view.signedIn) showSyncAccount();
      else $('#sync-account-message').textContent=view.message || (view.phase==='synced'?'Your journal is synced.':'Syncing your journal…');
    }
  },
});
