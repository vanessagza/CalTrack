import {
  STORAGE_KEY, DEFAULT_PROFILE, CATEGORIES, MEALS, NUTRIENTS,
  todayKey, ageAt, shiftDate, isDateKey, validateProfile, validateFood,
  calculateGoals, portionNutrition, allowedUnits, unitLabel, newEntry,
  totals, remaining, progress, createInitialState, validateState, suggestions,
  WORKOUT_GOALS, WORKOUT_EXPERIENCE, WORKOUT_EQUIPMENT, EXERCISE_PRESETS,
  weekDates, validateWorkoutSettings, validateWorkoutEntry, workoutSuggestion,
  suggestWorkoutWeek, copyWorkoutWeek,
} from './core.js?v=4';
import { createJournalSync } from './cloud-sync.js?v=4';
import { sameJournal } from './journal-merge.js?v=4';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const num = (value, digits = 0) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  foods: '<path d="M6 3v7m-3-7v5a3 3 0 0 0 6 0V3M6 11v10m12-18c-3 3-4 6-4 10h5M19 3v18"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7m2-5v6l4 2"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  workout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4m8-4v4m-8 8h2m4 0h2m-8 4h2"/>',
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
let syncView = { phase: 'local', message: '', email: '', signedIn: false };
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  state = saved ? validateState(JSON.parse(saved)) : createInitialState();
} catch (error) {
  state = createInitialState();
  loadError = 'Your saved data could not be read. Restore a backup before adding new records if you need to recover it.';
}
needsSetup = state.profileReady === false;
const returningFromSignIn = /(?:access_token|refresh_token|error_description)=/.test(location.hash);
if (needsSetup && !returningFromSignIn) location.hash = 'goals';
let selectedDate = todayKey();
let workoutDate = todayKey();
let route = location.hash.slice(1) || 'today';
let foodQuery = '', foodFilter = 'All';
let pickerFood = null, editingEntryId = null, modalUnit = 'portion', foodBasis = '100';
let undoState = null, toastTimer, lastFocused = null, pendingImport = null;

function save() {
  try {
    if (journalSync) journalSync.saveLocal(state);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveFailed = false;
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
  const labels = { starting:'Checking sign-in…', local:'Saved in this browser', syncing:'Syncing…',
    pending:'Waiting to sync', synced:'Synced to your account', choose:'Ready to connect your journal',
    conflict:'Review sync changes', offline:'Saved here · offline', error:'Saved here · sync needs attention' };
  $('#save-status').textContent = saveFailed ? 'Not saved · export backup' : labels[syncView.phase];
  $('.status-dot').classList.toggle('failed', saveFailed || ['error','conflict','offline'].includes(syncView.phase));
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
    } else if (syncView.phase === 'conflict') {
      content += `<p class="subtle-note">Export a backup of this device’s changes before choosing. Use the account copy to replace this device’s journal, or keep this device’s copy to replace the account journal.</p><div class="sync-actions"><button class="btn secondary" data-action="backup">Export this copy</button><button class="btn secondary" data-action="sync-use-cloud">Use account copy</button><button class="btn primary" data-action="sync-use-local">Keep this device’s copy</button></div>`;
    } else {
      content += `<button class="btn secondary small" data-action="sync-refresh">Sync now</button>`;
    }
    content += `<div class="dialog-footer"><button class="text-button" data-action="sync-signout">Sign out on this device</button></div></div>`;
  }
  openDialog(dialogHeading('One journal. Every device.', 'Keep your food log, profile and weight history together.') + content);
}
function toast(message, error = false, allowUndo = false) {
  const el = $('#toast');
  el.innerHTML = `${esc(message)}${allowUndo ? ' <button class="toast-undo" data-action="undo">Undo</button>' : ''}`;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), allowUndo ? 8000 : 3500);
}
function currentDay(create = false) {
  if (create && !state.days[selectedDate]) state.days[selectedDate] = { entries:[], goals:calculateGoals(state.profile), note:'' };
  return state.days[selectedDate] || { entries:[], note:'' };
}
function currentGoals() { return currentDay().goals || calculateGoals(state.profile); }
function updateDayGoals(kcal) {
  const goals = calculateGoals(state.profile, todayKey(), Number(kcal));
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
  if (route !== 'today') location.hash = 'today';
  else render();
}

function heading(title, subtitle, actions = '', eyebrow = 'YOUR NUTRITION, AT A GLANCE') {
  return `<section class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1>${subtitle ? `<p class="heading-sub">${subtitle}</p>` : ''}</div><div class="heading-actions">${actions}</div></section>`;
}
function addButton(small = false) { return `<button class="btn primary${small ? ' small' : ''}" data-action="pick-food">${icon('plus')} Add food</button>`; }
function dateControl() {
  return `<div class="date-control"><button class="icon-btn" data-action="prev-day" aria-label="Previous day">${icon('left')}</button><input type="date" id="selected-date" value="${selectedDate}" aria-label="Food log date"><button class="icon-btn" data-action="next-day" aria-label="Next day">${icon('right')}</button></div>`;
}
function empty(message, description, action = '') { return `<div class="empty-state">${icon('foods')}<h3>${esc(message)}</h3><p>${esc(description)}</p>${action}</div>`; }

function summaryContent(g, t) {
  const rest = remaining(t, g);
  const over = rest.kcal < -0.5;
  const circumference = 2 * Math.PI * 64;
  return `<div class="summary-main"><div class="calorie-area"><div class="ring" role="img" aria-label="${num(t.kcal)} of ${num(g.kcal)} calories logged">
    <svg viewBox="0 0 156 156"><circle class="track" cx="78" cy="78" r="64" fill="none" stroke-width="10"/><circle class="value ${over ? 'over' : ''}" cx="78" cy="78" r="64" fill="none" stroke-width="10" stroke-dasharray="${circumference * progress(t.kcal,g.kcal)/100} ${circumference}"/></svg>
    <div class="ring-center"><strong>${num(t.kcal)}</strong><small>of ${num(g.kcal)} kcal</small><span class="ring-label">Consumed</span></div></div>
    <div class="calorie-copy"><span class="small-label">${over ? 'ABOVE YOUR BUDGET' : 'REMAINING TODAY'}</span><div class="remaining-number ${over ? 'day-over' : ''}">${num(Math.abs(rest.kcal))} <small>kcal</small></div><p>${over ? 'One day is one part of your overall pattern.' : 'Room for your next meal.<br>Make it count for you.'}</p><a class="tiny-pill" href="#goals">${icon('leaf')} Lose fat · preserve muscle</a></div></div>
    <div class="macro-list">${['protein','carbs','fat'].map(key => {
      const title = {protein:'Protein',carbs:'Carbohydrates',fat:'Fats'}[key];
      return `<div class="macro"><div class="macro-top"><span class="macro-title"><span class="dot ${key}"></span>${title}</span><span class="macro-values">${num(t[key],1)} g <span>/ ${num(g[key],1)} g</span></span></div><div class="progress-track" role="progressbar" aria-label="${title}" aria-valuemin="0" aria-valuemax="${g[key]}" aria-valuenow="${Math.min(t[key],g[key])}" aria-valuetext="${num(t[key],1)} grams consumed of ${num(g[key],1)} grams"><div class="progress-fill ${key}" style="width:${progress(t[key],g[key])}%"></div></div><div class="macro-bottom"><span>${key==='protein' ? 'For your muscle goal' : key==='carbs' ? 'Your energy balance' : 'A flexible daily target'}</span><span class="${rest[key] < -.05 ? 'exceeded' : ''}">${num(Math.abs(rest[key]),1)} g ${rest[key] < -.05 ? 'above target' : 'remaining'}</span></div></div>`;
    }).join('')}</div></div>`;
}

function renderToday() {
  const g = currentGoals(), day = currentDay(), t = totals(day.entries), r = remaining(t,g);
  const isToday = selectedDate === todayKey();
  const dateLabel = dateText(selectedDate,{weekday:'long',month:'long'});
  const suggestionsList = suggestions(state.foods,r.kcal,r.protein);
  const nextHeading = r.kcal < 20 ? 'Your day, in perspective.' : r.protein > 1 ? `${num(r.protein)} g more protein.` : 'Your protein target is met.';
  const nextCopy = r.kcal < 20 ? 'Your logged calories have reached your selected budget. These numbers are estimates; let your longer-term pattern guide your choices.'
    : r.protein > 1 ? `You have about ${num(r.kcal)} calories left. These saved portions can help with the protein remaining.`
    : `There are about ${num(r.kcal)} calories left in your selected budget. Carbs and fats are flexible targets.`;
  $('#main').innerHTML = heading('Your daily balance.',`A clear view of what you ate${isToday ? ' today' : ''}, ${esc(state.profile.name)}.`,dateControl()+addButton(),dateLabel.toUpperCase())
    + (loadError ? `<div class="notice">${icon('info')}${esc(loadError)}</div>` : '')
    + (!isToday ? `<div class="notice">${icon('history')}You’re viewing ${dateText(selectedDate,{year:'numeric'})}. <button class="text-button" data-action="today">Back to today</button></div>` : '')
    + `<section class="card summary-card" aria-label="Daily calorie and macro progress"><div id="summary-live">${summaryContent(g,t)}</div><div class="budget-row"><div class="budget-label"><strong>My daily calorie budget</strong><span>Adjust it and see your targets update</span></div><div class="budget-slider"><span>1,200</span><input id="budget-slider" type="range" min="1200" max="${Math.max(2200,Math.ceil(g.kcal/100)*100)}" step="25" value="${g.kcal}" aria-label="Daily calorie budget"><span>${num(Math.max(2200,Math.ceil(g.kcal/100)*100))}</span></div><div class="budget-value"><input id="budget-number" type="number" min="1200" max="4000" step="25" value="${g.kcal}" aria-label="Daily calorie budget in kilocalories"><span>kcal</span></div></div></section>
    <div class="daily-grid"><section class="card"><div class="card-head"><div><h2>${isToday ? 'Today’s' : 'Your'} food journal</h2><p>Every portion, in one place.</p></div><span class="badge">${day.entries.length} ${day.entries.length===1 ? 'entry' : 'entries'}</span></div>
    ${day.entries.length ? renderLog(day.entries) : empty('A fresh page.','Add a usual food or save a new one to start this day.',addButton())}
    ${day.note ? `<p class="log-note">${esc(day.note)}</p>` : ''}
    ${day.entries.length ? `<div class="log-totals"><span>Daily total <strong>${num(t.kcal)} kcal</strong></span><span>P <strong>${num(t.protein,1)} g</strong></span><span>C <strong>${num(t.carbs,1)} g</strong></span><span>F <strong>${num(t.fat,1)} g</strong></span></div>` : ''}
    <div class="log-footer"><button class="btn secondary small" data-action="pick-food">${icon('plus')} Add another food</button><button class="text-button" data-action="copy-day">Copy another day</button></div></section>
    <aside><section class="card next-card"><span class="small-label">TO FINISH YOUR DAY</span><h2>${nextHeading}</h2><p>${nextCopy}</p><div id="suggestion-list" class="suggestion-list">${suggestionsList.map(x=>`<div class="suggestion">${tile(x.food)}<div class="suggestion-copy"><strong>${esc(x.food.name)}</strong><small>${num(x.food.portionGrams)} g · ${num(x.nutrition.protein,1)} g protein · ${num(x.nutrition.kcal)} kcal</small></div><button class="icon-btn" data-action="add-suggestion" data-id="${esc(x.food.id)}" aria-label="Add ${esc(x.food.name)}">${icon('plus')}</button></div>`).join('')}</div><div class="next-note">${r.fat < -1 ? 'You’re above the fat target today. A lean option can fit your remaining calories; there’s no need to make up for it tomorrow.' : 'Portions use your saved food values. Pick what suits your appetite and tolerance.'}</div></section>
    <section class="card goal-glance"><span class="small-label">YOUR WEIGHT GOAL</span><div class="weight-glance"><div><strong>${num(state.profile.weight,1)} <span style="font-size:11px">kg</span></strong><small>Current weight</small></div>${icon('right')}<div><strong>${num(state.profile.goalWeight,1)} <span style="font-size:11px">kg</span></strong><small>Goal weight</small></div></div><div class="goal-caption"><span>${num(state.profile.height,1)} cm · ${ageAt(state.profile.birthDate)} years</span><a href="#goals">View my goals ↗</a></div></section></aside></div>
    <p class="subtle-note">Food values and energy needs are estimates. Calories follow food labels; macro calories can differ slightly because of fiber, food-specific factors and rounding. Carbs are total carbs.</p>`;
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
  return `<article class="card food-card"><div class="food-card-top">${tile(f)}<span class="label-tag ${f.verified ? '' : 'estimate'}">${f.verified ? 'Official label' : 'Editable estimate'}</span><button class="text-button star favorite ${f.favorite ? 'active' : ''}" data-action="favorite" data-id="${esc(f.id)}" aria-label="${f.favorite?'Unfavorite':'Favorite'} ${esc(f.name)}" aria-pressed="${f.favorite}">${icon('star')}</button></div><h3>${esc(f.name)}</h3><span class="food-card-sub">1 ${esc(f.portionUnit)} · ${num(f.portionGrams,1)} g</span><div class="food-card-numbers"><div><strong>${num(n.kcal)}</strong><small>kcal</small></div><div><strong class="protein-color">${num(n.protein,1)}</strong><small>Protein · g</small></div><div><strong class="carbs-color">${num(n.carbs,1)}</strong><small>Carbs · g</small></div><div><strong class="fat-color">${num(n.fat,1)}</strong><small>Fats · g</small></div></div><div class="food-card-actions"><button class="btn soft small" data-action="food-portion" data-id="${esc(f.id)}">${icon('plus')} Log food</button><button class="icon-btn" data-action="edit-food" data-id="${esc(f.id)}" aria-label="Edit ${esc(f.name)} label">${icon('edit')}</button></div></article>`;
}
function filteredFoods(query = foodQuery, filter = foodFilter) {
  return state.foods.filter(f=>(filter==='All' || filter==='Favorites' && f.favorite || f.category===filter)
    && `${f.name} ${f.category}`.toLowerCase().includes(query.toLowerCase().trim()));
}
function renderFoods() {
  $('#main').innerHTML = heading('Your usual foods.', 'Saved portions. Less guesswork. Add, edit, and log them whenever you need.',`<button class="btn primary" data-action="new-food">${icon('plus')} Save a food</button>`,'A FOOD LIST THAT KNOWS YOU')
    + `<div class="toolbar"><div class="search">${icon('search')}<input id="food-search" value="${esc(foodQuery)}" placeholder="Search your foods…" aria-label="Search saved foods"></div></div><div class="filter-pills" style="margin-bottom:20px">${['All','Favorites',...CATEGORIES].map(c=>`<button class="filter-pill ${foodFilter===c?'active':''}" data-action="food-filter" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="foods-grid" id="foods-grid">${filteredFoods().map(foodCard).join('')}</div><div id="foods-empty">${filteredFoods().length?'':empty('No foods found.','Try another search or save a new food.',`<button class="btn soft" data-action="new-food">Save a food</button>`)}</div><p class="subtle-note">Standard foods and recipes are starting estimates. Kinder entries use the linked manufacturer labels. Set the portion weight and nutrition to match your own packaging for better accuracy. Editing a food preserves the values already recorded in past log entries.</p>`;
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
    <div class="history-grid"><section class="card"><div class="card-head"><div><h2>Your logged days</h2><p>Open a day to review or change its portions.</p></div><span class="badge">${logged.length} days</span></div>${logged.length?logged.slice(0,100).map(([date,d])=>{const t=totals(d.entries),g=d.goals||calculateGoals(state.profile);return `<div class="history-row"><div class="history-day"><strong>${dateText(date,{weekday:'short'})}</strong><small>${date.slice(0,4)} · ${d.entries.length} entries</small></div><div class="history-progress"><small>${num(t.kcal)} / ${num(g.kcal)} kcal · ${num(t.protein,1)} g protein</small><div class="progress-track"><div class="progress-fill" style="background:var(--green);width:${progress(t.kcal,g.kcal)}%"></div></div></div><button class="btn secondary small" data-action="open-day" data-date="${date}">Open ${icon('right')}</button></div>`;}).join(''):empty('Your history starts here.','Log a food and its date will appear here.') }<p class="history-summary">Macro targets are saved with each day. ${logged.length>100?'Showing your latest 100 logged days. ':''}An incomplete day still counts as a logged day.</p></section>
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
  return validateProfile({...state.profile,...data});
}
function renderCalculations(p) {
  const g = calculateGoals(p);
  return `<h2>The numbers behind your goal.</h2><p>Formulas make the arithmetic consistent. They estimate your needs; actual needs vary with movement, body composition and weight trends.</p><div class="calc-pair"><div class="calc-result"><span>Resting energy · RMR</span><strong>${num(g.rmr)}</strong><small>kcal / day · estimate</small></div><div class="calc-result"><span>Maintenance · TDEE</span><strong>${num(g.tdee)}</strong><small>kcal / day · estimate</small></div></div><div class="target-summary"><span>Current BMI</span><strong>${num(g.bmi,1)}</strong><span>Goal BMI</span><strong>${num(g.goalBmi,1)}</strong></div><div class="equation"><strong>1. Mifflin–St Jeor resting energy</strong><code>10 × weight + 6.25 × height − 5 × age ${p.sex==='female'?'− 161':'+ 5'}</code><p>10 × ${p.weight} + 6.25 × ${p.height} − 5 × ${g.age} ${p.sex==='female'?'− 161':'+ 5'} = <strong>${num(g.rmr)} kcal</strong></p></div><div class="equation"><strong>2. Activity and calorie budget</strong><code>Maintenance = resting energy × activity factor</code><p>${num(g.rmr)} × ${p.activity} = ${num(g.tdee)} kcal. The ${p.deficit}% deficit estimate is ${num(g.calculatedCalories)} kcal, rounded to the nearest 25.${g.calculatedFloorApplied?' A minimum-budget guardrail was applied.':''}</p><p>${p.calorieMode==='manual'?`Your selected budget is <strong>${num(g.kcal)} kcal</strong>. It is a tracking target you can edit, rather than a measured energy requirement.`:`Your formula-based budget is <strong>${num(g.kcal)} kcal</strong>.`}</p></div><div class="equation"><strong>3. Protein for your muscle goal</strong><code>Protein = current weight × ${p.proteinFactor} g/kg</code><p>${p.weight} × ${p.proteinFactor} = <strong>${num(g.protein,1)} g</strong>. The default 1.8 g/kg is an adjustable planning choice within the 1.4–2.0 g/kg range often used for exercising adults.</p></div><div class="equation"><strong>4. Fats and the remaining carbs</strong><code>Fat = calories × ${p.fatPercent}% ÷ 9<br>Carbs = (calories − protein × 4 − fat × 9) ÷ 4</code><p>Fat: <strong>${num(g.fat,1)} g</strong> · Carbs: <strong>${num(g.carbs,1)} g</strong>. Targets add up to ${num(g.kcal)} kcal using 4 kcal/g for protein and carbs and 9 kcal/g for fat. The default ${p.fatPercent}% fat share is a planning setting, not a measured personal requirement.</p></div><div class="source-links"><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">Energy equation paper ↗</a><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noopener noreferrer">Protein position statement ↗</a></div>`;
}
function renderGoals() {
  const p = state.profile;
  $('#main').innerHTML = heading('Built around you.','Your measurements, your goal, and formulas you can actually see.','','YOUR PERSONAL SETTINGS')
    + `<div class="profile-layout"><form class="card profile-form" id="profile-form"><section class="form-section"><h2>My measurements</h2><div class="form-grid">${field('Name','name',p.name,'text','required maxlength="40"')}${field('Date of birth','birthDate',p.birthDate,'date','required')}${field('Current weight · kg','weight',p.weight,'number','required min="30" max="250" step="0.1"')}${field('Height · cm','height',p.height,'number','required min="100" max="230" step="0.1"')}${field('Goal weight · kg','goalWeight',p.goalWeight,'number','required min="30" max="250" step="0.1"')}${field('Starting weight · kg','startWeight',p.startWeight,'number','required min="30" max="250" step="0.1"')}${selectField('Formula sex setting','sex',[['female','Female · −161'],['male','Male · +5']],p.sex,'Used only for the resting-energy equation.')}${selectField('Typical activity','activity',[[1.2,'Mostly sedentary · 1.20'],[1.375,'Light activity · 1.375'],[1.55,'Moderate activity · 1.55'],[1.725,'Very active · 1.725'],[1.9,'Highly active · 1.90']],p.activity,'Choose your usual whole-day activity, not a single workout.')}</div></section><section class="form-section"><h2>My daily targets</h2><div class="form-grid">${selectField('Calorie target mode','calorieMode',[['manual','Use my selected budget'],['calculated','Use the energy formula']],p.calorieMode)}${field('Selected calorie budget · kcal','calories',p.calories,'number','required min="1200" max="4000" step="25"','Select the calorie budget you want to track.')}${field('Formula deficit · %','deficit',p.deficit,'number','required min="0" max="20" step="1"','Used in formula mode. 0% estimates maintenance.')}${field('Protein · g per kg','proteinFactor',p.proteinFactor,'number','required min="1.4" max="2.2" step="0.1"','Multiplied by your current weight.')}${field('Fat share · % of calories','fatPercent',p.fatPercent,'number','required min="20" max="35" step="1"','Carbs use the calories left after protein and fat.')}</div><span class="formula-badge">Calories are estimates, not an exact prescription.</span></section><div class="form-error" id="profile-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">${icon('check')} Save my goals</button><span class="secondary-note">Updates today and future days.<br>Other recorded days keep their targets.</span></div></form>
    <div><section class="card calc-panel" id="calc-preview">${renderCalculations(p)}</section><section class="card backup-panel"><h2>Keep a copy of your journal.</h2><p>Your settings, foods and logs are saved on this browser and device. Sign in with Sync devices to keep the same journal on your laptop and phone. Export a backup whenever you want an extra copy.</p><div class="backup-buttons"><button class="btn secondary small" data-action="backup">${icon('download')} Export backup</button><button class="btn secondary small" data-action="import">Restore backup</button></div><input type="file" id="backup-file" accept="application/json,.json" hidden></section></div></div>`;
}

function workoutEntries(date = workoutDate) { return state.workouts.days[date] || []; }
function workoutTarget(exerciseId, date = workoutDate) {
  return workoutSuggestion(state.profile, state.workouts.settings, exerciseId, date, state.days[date]?.goals?.kcal ?? null);
}
function workoutPrescription(entry, exercise) {
  return `${entry.sets} sets × ${entry.reps} ${exercise.unit === 'seconds' ? 'sec' : 'reps'}${exercise.unilateral ? ' / side' : ''}${entry.load !== null ? ` · ${num(entry.load,1)} kg` : ''}`;
}
function setWorkoutDate(date) {
  if (!isDateKey(date)) return toast('Choose a valid workout date.', true);
  workoutDate = date;
  render();
}
function renderWorkouts() {
  const dates = weekDates(workoutDate), entries = workoutEntries();
  const weekEntries = dates.flatMap(date => workoutEntries(date));
  const complete = weekEntries.filter(e => e.completed).length;
  const settings = state.workouts.settings;
  const target = workoutTarget('squat');
  const goalLabel = WORKOUT_GOALS.find(([id]) => id === settings.goal)[1];
  $('#main').innerHTML = heading('Your week in motion.','Plan your sessions. Build at your pace. Check off each exercise.',
    `<button class="btn primary" data-action="pick-exercise">${icon('plus')} Add exercise</button>`, 'YOUR WORKOUT PLANNER')
    + `<section class="card workout-settings" aria-label="Workout preferences"><div class="form-grid">
      ${selectField('Training purpose','workout-goal',WORKOUT_GOALS,settings.goal)}
      ${selectField('Experience','workout-experience',WORKOUT_EXPERIENCE,settings.experience)}
      ${selectField('Available equipment','workout-equipment',WORKOUT_EQUIPMENT,settings.equipment)}
      </div><p class="secondary-note">These preferences guide new suggestions. Your saved exercises keep their sets, reps and weights.</p></section>
    <section class="card workout-calendar" aria-label="Weekly workout calendar"><div class="workout-week-heading"><div><span class="small-label">MONDAY – SUNDAY</span><h2>${dateText(dates[0])} – ${dateText(dates[6],{year:'numeric'})}</h2></div><div class="workout-week-controls"><button class="icon-btn" data-action="prev-workout-week" aria-label="Previous workout week">${icon('left')}</button><button class="text-button" data-action="workout-today">This week</button><button class="icon-btn" data-action="next-workout-week" aria-label="Next workout week">${icon('right')}</button></div></div>
      <div class="workout-days">${dates.map(date => {
        const list = workoutEntries(date), done = list.filter(e => e.completed).length;
        return `<button class="workout-day${date === workoutDate ? ' selected' : ''}${date === todayKey() ? ' is-today' : ''}" data-action="workout-day" data-date="${date}" aria-pressed="${date === workoutDate}" aria-label="${dateText(date,{weekday:'long',year:'numeric'})}: ${done} of ${list.length} exercises complete">
          <span>${dateText(date,{weekday:'short'}).split(',')[0]}</span><strong>${Number(date.slice(-2))}</strong><small>${list.length ? `${done}/${list.length} done` : 'Rest'}</small><span class="workout-day-dot${list.length && done === list.length ? ' done' : ''}${list.length ? ' planned' : ''}" aria-hidden="true"></span></button>`;
      }).join('')}</div><div class="workout-week-summary"><span><strong>${complete} / ${weekEntries.length}</strong> exercises complete</span><span><strong>${dates.filter(date => workoutEntries(date).length).length}</strong> training days</span><progress value="${complete}" max="${weekEntries.length || 1}" aria-label="Weekly exercise completion"></progress></div></section>
    <div class="workout-layout"><section class="card workout-session"><div class="card-head"><div><h2>${dateText(workoutDate,{weekday:'long',month:'long'})}</h2><p>${entries.length ? `${entries.filter(e => e.completed).length} of ${entries.length} exercises complete` : 'A little space to move, or a day to recover.'}</p></div><input type="date" id="workout-date" value="${workoutDate}" aria-label="Workout date"></div>
      ${entries.length ? `<ul class="workout-list">${entries.map(entry => {
        const exercise = EXERCISE_PRESETS.find(e => e.id === entry.exerciseId);
        return `<li class="workout-exercise${entry.completed ? ' completed' : ''}"><label class="workout-check"><input type="checkbox" data-workout-complete="${esc(entry.id)}" ${entry.completed ? 'checked' : ''} aria-label="Mark ${esc(exercise.name)} complete"><span><strong>${esc(exercise.name)}</strong><small>${workoutPrescription(entry,exercise)}</small><span class="workout-exercise-meta">${esc(exercise.group)} · ${WORKOUT_EQUIPMENT.find(([id]) => id === exercise.equipment)[1].replace(' & bodyweight','')}${entry.note ? `<br>${esc(entry.note)}` : ''}</span></span></label><div class="row-actions"><button class="icon-btn" data-action="edit-workout" data-id="${esc(entry.id)}" aria-label="Edit ${esc(exercise.name)}">${icon('edit')}</button><button class="icon-btn delete" data-action="remove-workout" data-id="${esc(entry.id)}" aria-label="Remove ${esc(exercise.name)}">${icon('trash')}</button></div></li>`;
      }).join('')}</ul>` : `<div class="empty-state workout-empty">${icon('workout')}<h3>No exercises planned.</h3><p>Add an exercise for this day, or suggest a week using your preferences.</p><button class="btn secondary small" data-action="pick-exercise">${icon('plus')} Add an exercise</button></div>`}
      ${entries.length ? '<div class="log-footer"><button class="btn secondary small" data-action="pick-exercise">'+icon('plus')+' Add another exercise</button></div>' : ''}</section>
      <aside class="card workout-guide"><span class="small-label">BUILT AROUND YOUR GOAL</span><h2>${esc(goalLabel)}.</h2><p>Start with ${settings.experience === 'beginner' ? 'two' : 'three'} full-body sessions, with recovery days in between.</p><button class="btn primary wide" data-action="suggest-workout-week">${icon('plus')} Suggest this week</button><button class="btn secondary wide" data-action="copy-workout-week" ${weekEntries.length ? '' : 'disabled'}>Copy plan to next week ${icon('right')}</button><p class="secondary-note">Suggestions fill empty session days from today onward. Copying keeps your edits, resets checkboxes and fills only empty days next week.</p>
        <details class="workout-rationale"><summary>How suggestions are chosen</summary><p>Your training purpose, experience and exercise type guide sets and reps. Your weight (${num(state.profile.weight,1)} kg), height (${num(state.profile.height,1)} cm), age and formula sex setting estimate maintenance energy.</p><div class="workout-energy"><span>Selected day’s calorie target<strong>${num(target.energy.kcal)} kcal</strong></span><span>Estimated maintenance<strong>${num(target.energy.tdee)} kcal</strong></span></div><p>${target.reducedVolume ? 'Your calorie target is over 10% below estimated maintenance, so the suggested number of sets is reduced.' : 'Your calorie target does not trigger a reduction in suggested sets.'} The planner uses your saved calorie target; a partial food log is not treated as a full day of intake.</p><p>These are starting suggestions. Measurements cannot predict your strength or the right lifting weight.</p><a href="#goals">Edit measurements & calorie target ↗</a></details>
        <div class="workout-progression"><strong>Ready to progress?</strong><p>When all sets feel controlled with about 2–3 reps left in reserve, edit the exercise to add a rep or a small weight increase. Copy your updated week to reuse it.</p><small>For dumbbells, enter the weight of each dumbbell. Use 0 kg for bodyweight. Warm-up sets are separate.</small></div></aside></div>`;
}
function exercisePickerResults() {
  const query = ($('#exercise-search')?.value || '').trim().toLowerCase();
  const group = $('#exercise-group')?.value || 'All';
  const equipment = $('#exercise-equipment')?.value || 'All';
  const available = equipment === 'All' ? ['bodyweight','dumbbells','gym'] : equipment === 'gym' ? ['bodyweight','dumbbells','gym'] : equipment === 'dumbbells' ? ['bodyweight','dumbbells'] : ['bodyweight'];
  const list = EXERCISE_PRESETS.filter(e => available.includes(e.equipment) && (group === 'All' || e.group === group) && `${e.name} ${e.group}`.toLowerCase().includes(query));
  return list.length ? list.map(e => `<button class="pick-food exercise-preset" data-action="choose-exercise" data-id="${e.id}"><span class="food-tile">${icon('workout')}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.group)} · ${e.equipment === 'bodyweight' ? 'Bodyweight' : e.equipment === 'dumbbells' ? 'Dumbbell' : 'Gym machine'}</small></span><span class="pick-kcal">${icon('plus')}</span></button>`).join('') : '<p class="subtle-note">No exercises match. Try another search or equipment filter.</p>';
}
function showExercisePicker() {
  openDialog(dialogHeading('Choose your exercise.',`Add to ${dateText(workoutDate,{weekday:'long'})}. Sets and reps start with suggestions you can edit.`)
    + `<div class="search">${icon('search')}<input id="exercise-search" placeholder="Search exercises…" aria-label="Search exercises"></div><div class="form-grid exercise-filters">${selectField('Exercise type','exercise-group',[['All','All types'],...['Lower body','Upper push','Upper pull','Core'].map(x => [x,x])],'All')}${selectField('Equipment','exercise-equipment',[['All','All equipment'],...WORKOUT_EQUIPMENT],state.workouts.settings.equipment)}</div><div id="exercise-results" class="dialog-search-results"></div>`);
  $('#exercise-results').innerHTML = exercisePickerResults();
}
function showWorkoutEditor(exerciseId, entry = null) {
  const exercise = EXERCISE_PRESETS.find(e => e.id === exerciseId);
  if (!exercise) throw new Error('Choose an exercise from the preset list.');
  const value = entry || { ...workoutTarget(exerciseId), note:'' };
  const seconds = exercise.unit === 'seconds';
  openDialog(dialogHeading(entry ? 'Edit your exercise.' : 'Plan your exercise.',`${esc(exercise.name)} · ${esc(exercise.group)}`)
    + `<form id="workout-form" data-id="${esc(entry?.id || '')}" data-exercise-id="${exercise.id}" data-source-date="${workoutDate}"><div class="form-grid">
      ${field('Scheduled date','exercise-date',workoutDate,'date','required')}
      ${field('Sets','exercise-sets',value.sets,'number','required min="1" max="10" step="1"')}
      ${field(seconds ? 'Seconds per set' : `Reps per set${exercise.unilateral ? ' · per side' : ''}`,'exercise-reps',value.reps,'number',`required min="1" max="${seconds ? 300 : 100}" step="1"`)}
      ${field('Weight · kg (optional)','exercise-load',value.load ?? '', 'number','min="0" max="500" step="0.1"','Per dumbbell for dumbbell exercises; 0 for bodyweight.')}
      <div class="field full"><label for="exercise-note">Notes · optional</label><textarea id="exercise-note" name="exercise-note" maxlength="400" placeholder="For example: use the 6 kg dumbbells">${esc(value.note)}</textarea></div></div>
      <div class="dialog-food-details">${esc(exercise.cue)}<br>Choose a weight or variation that leaves about 2–3 reps in reserve. ${entry ? 'Moving this exercise to another date resets its checkbox.' : 'You can change every suggested target before saving.'}</div>
      <button class="text-button" type="button" data-action="workout-use-suggestion">Use suggested sets & ${seconds ? 'seconds' : 'reps'}</button>
      <div class="form-error" id="workout-error" role="alert"></div><div class="dialog-footer"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">${icon('check')} ${entry ? 'Save changes' : 'Add exercise'}</button></div></form>`);
}

function render() {
  if (!['today','foods','history','goals','workouts'].includes(route)) route='today';
  for (const a of document.querySelectorAll('[data-nav]')) {
    const active = a.dataset.nav===route;
    a.classList.toggle('active',active);
    if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  }
  $('#page-label').textContent = {today:'Daily intake',foods:'My foods',history:'History',goals:'Profile & goals',workouts:'Workouts'}[route];
  $('#sidebar-name').textContent = state.profile.name;
  $('#food-count').textContent = state.foods.length;
  ({today:renderToday,foods:renderFoods,history:renderHistory,goals:renderGoals,workouts:renderWorkouts}[route])();
  if (needsSetup) $('#main').insertAdjacentHTML('afterbegin', '<div class="notice">'+icon('info')+'<span>Welcome. The measurements below are placeholders. Set your own profile and save it, or use <strong>Restore backup</strong> below to bring over your existing settings and food journal.</span></div>');
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
    + `<form id="portion-form"><div class="form-grid">${field('Amount','amount',amount,'number','required min="0.01" max="10000" step="any"')}${selectField('Unit','unit',allowedUnits(f).map(u=>[u,u==='portion'?`${f.portionUnit} · ${num(f.portionGrams,1)} g`:u]),modalUnit)}${selectField('Meal','meal',MEALS.map(m=>[m,m==='Other'?'Other / not specified':m]),entry?.meal||'Other')}</div><div class="portion-presets">${presets.map(q=>`<button type="button" data-action="portion-preset" data-amount="${q}">${num(q,1)}</button>`).join('')}</div><div id="portion-preview" class="form-preview"></div><div class="dialog-food-details">${esc(f.note)}${f.source?`<br><a href="${esc(f.source)}" target="_blank" rel="noopener noreferrer">View source label ↗</a>`:''}${entry?'<br>This entry uses the label saved when it was logged.':''}</div><div class="form-error" id="portion-error" role="alert"></div><div class="dialog-footer"><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn primary">${icon('plus')} ${entry?'Save portion':'Add food'}</button></div></form>`);
  updatePortionPreview();
}
function updatePortionPreview() {
  try {
    const n = portionNutrition(pickerFood,$('#amount').value,$('#unit').value);
    $('#portion-preview').innerHTML = NUTRIENTS.map(key=>`<div><strong class="${key}-color">${num(n[key],key==='kcal'?0:1)}</strong><small>${{kcal:'Calories · kcal',protein:'Protein · g',carbs:'Carbs · g',fat:'Fats · g'}[key]}</small></div>`).join('');
    $('#portion-error').classList.remove('visible');
  } catch (error) { $('#portion-preview').innerHTML = '<small>Enter a valid portion to calculate nutrition.</small>'; }
}
function showFoodEditor(f = null) {
  const value = f || {name:'',category:'Extras',portionUnit:'serving',portionGrams:100,kcal:'',protein:'',carbs:'',fat:'',note:'',source:''};
  foodBasis='100';
  openDialog(dialogHeading(f?'Edit your saved food':'Save a food you eat','Use the nutrition label and portion size for your own product.')
    + `<form id="food-form" data-id="${esc(f?.id||'')}"><div class="form-grid">${field('Food name','food-name',value.name,'text','required maxlength="100"','',true)}${selectField('Category','category',CATEGORIES.map(c=>[c,c]),value.category)}${field('Portion name','portionUnit',value.portionUnit,'text','required maxlength="24"','For example: slice, bar, egg, packet.')}${field('Grams in one portion','portionGrams',value.portionGrams,'number','required min="0.1" max="5000" step="any"')}${selectField('Nutrition values below are','nutritionBasis',[['100','Per 100 g'],['portion','Per one portion']],foodBasis)}${field('Calories · kcal','food-kcal',value.kcal,'number','required min="0" step="any"')}${field('Protein · g','food-protein',value.protein,'number','required min="0" step="any"')}${field('Carbs · g','food-carbs',value.carbs,'number','required min="0" step="any"')}${field('Fats · g','food-fat',value.fat,'number','required min="0" step="any"')}<div class="field full"><label for="food-note">Notes about this food</label><textarea id="food-note" name="food-note" maxlength="800">${esc(value.note)}</textarea></div>${field('Label or source link · optional','food-source',value.source,'url','placeholder="https://…"','',true)}</div><div class="form-error" id="food-error" role="alert"></div><p class="secondary-note">Past food log entries keep their original values when you change a saved label.</p><div class="dialog-footer">${f?`<button type="button" class="btn danger small" data-action="delete-food" data-id="${esc(f.id)}">Delete food</button>`:''}<button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" type="submit">${icon('check')} Save food</button></div></form>`);
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
function backup() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
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
  if(needsSetup&&['pick-food','food-portion','add-suggestion','copy-day','log-weight','pick-exercise','choose-exercise','suggest-workout-week','copy-workout-week'].includes(action)){location.hash='goals';toast('Save your profile or restore your backup first.');return;}
  try {
    if(action==='sync-account') return showSyncAccount();
    if(action==='sync-upload') { journalSync.uploadLocal();closeDialog();return; }
    if(action==='sync-empty') { journalSync.startEmpty();closeDialog();return; }
    if(action==='sync-refresh') { journalSync.retry();return; }
    if(action==='sync-signout') { void journalSync.signOut().then(closeDialog).catch(error=>toast(error.message,true));return; }
    if(action==='sync-use-cloud'||action==='sync-use-local') {
      void journalSync.resolveConflict(action==='sync-use-local').then(closeDialog).catch(error=>toast(error.message,true));return;
    }
    if(action==='pick-exercise') return showExercisePicker();
    if(action==='choose-exercise') return showWorkoutEditor(id);
    if(action==='workout-day') return setWorkoutDate(date);
    if(action==='workout-today') return setWorkoutDate(todayKey());
    if(action==='prev-workout-week') return setWorkoutDate(shiftDate(workoutDate,-7));
    if(action==='next-workout-week') return setWorkoutDate(shiftDate(workoutDate,7));
    if(action==='edit-workout') {
      const entry=workoutEntries().find(e=>e.id===id);
      if(entry)showWorkoutEditor(entry.exerciseId,entry);
      return;
    }
    if(action==='remove-workout') {
      undoState=structuredClone(state);
      state.workouts.days[workoutDate]=workoutEntries().filter(e=>e.id!==id);
      if(!state.workouts.days[workoutDate].length)delete state.workouts.days[workoutDate];
      save();render();toast('Exercise removed.',false,true);return;
    }
    if(action==='workout-use-suggestion') {
      const form=$('#workout-form');
      const target=workoutTarget(form.dataset.exerciseId,$('#exercise-date').value);
      $('#exercise-sets').value=target.sets;$('#exercise-reps').value=target.reps;
      $('#workout-error').classList.remove('visible');return;
    }
    if(action==='suggest-workout-week'||action==='copy-workout-week') {
      const additions=action==='suggest-workout-week'
        ? suggestWorkoutWeek(state.profile,state.workouts.settings,workoutDate,state.days,state.workouts.days)
        : copyWorkoutWeek(state.workouts.days,workoutDate);
      const count=Object.values(additions).flat().length;
      if(!count)return toast(action==='suggest-workout-week'?'No empty upcoming session days in this week. Choose another week or add exercises yourself.':'No exercises to copy into empty upcoming days next week.');
      undoState=structuredClone(state);Object.assign(state.workouts.days,additions);
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
    if(action==='log-weight') return showWeightDialog();
    if(action==='backup') return backup();
    if(action==='copy-day') return showCopyDialog();
    if(action==='import') return $('#backup-file').click();
    if(action==='restore-confirm') {
      if(!pendingImport)return;
      undoState=structuredClone(state);state=pendingImport;needsSetup=state.profileReady===false;pendingImport=null;loadError='';save();closeDialog();render();toast('Backup restored.',false,true);return;
    }
    if(action==='undo') {
      if(!undoState)return;state=undoState;needsSetup=state.profileReady===false;undoState=null;save();render();toast('Restored.');return;
    }
    if(action==='food-filter') { foodFilter=button.dataset.filter;renderFoods();return; }
    if(action==='favorite') { const f=state.foods.find(f=>f.id===id);f.favorite=!f.favorite;save();renderFoods();return; }
    if(action==='portion-preset') { $('#amount').value=button.dataset.amount;updatePortionPreview();return; }
    if(action==='edit-entry') { const e=currentDay().entries.find(e=>e.id===id);if(e)showPortion(e.food,e);return; }
    if(action==='remove-entry') {
      undoState=structuredClone(state);const day=currentDay(true);day.entries=day.entries.filter(e=>e.id!==id);save();render();toast('Food removed.',false,true);return;
    }
    if(action==='delete-food') {
      undoState=structuredClone(state);state.foods=state.foods.filter(f=>f.id!==id);save();closeDialog();render();toast('Saved food removed. Your recorded entries are kept.',false,true);return;
    }
    if(action==='delete-weight') {
      if(state.weights.length===1)return toast('Keep at least one measurement in your weight journal.',true);
      const weights=state.weights.filter(w=>w.date!==date);
      const p=validateProfile({...state.profile,weight:weights.at(-1).weight});calculateGoals(p);
      undoState=structuredClone(state);state.weights=weights;state.profile=p;
      applyTodaysGoals(p);
      save();render();toast('Weight measurement removed.',false,true);return;
    }
    if(action==='add-suggestion') {
      const f=state.foods.find(f=>f.id===id);
      currentDay(true).entries.push(newEntry(f,1,'portion','Other'));save();render();toast(`${f.name} added.`);return;
    }
  } catch(error) { toast(error.message,true); }
});

document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='food-search') {
    foodQuery=el.value;const list=filteredFoods();$('#foods-grid').innerHTML=list.map(foodCard).join('');
    $('#foods-empty').innerHTML=list.length?'':empty('No foods found.','Try another search or save a new food.');
  }
  if(el.id==='picker-search') $('#picker-results').innerHTML=pickerResults(el.value);
  if(el.id==='exercise-search') $('#exercise-results').innerHTML=exercisePickerResults();
  if(el.id==='amount') updatePortionPreview();
  if(el.id==='budget-slider') {
    try {
      const g=calculateGoals(state.profile,todayKey(),Number(el.value));
      $('#budget-number').value=el.value;
      $('#summary-live').innerHTML=summaryContent(g,totals(currentDay().entries));
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
    if(el.id==='workout-date')return setWorkoutDate(el.value);
    if(['workout-goal','workout-experience','workout-equipment'].includes(el.id)) {
      state.workouts.settings=validateWorkoutSettings({goal:$('#workout-goal').value,experience:$('#workout-experience').value,equipment:$('#workout-equipment').value});
      save();renderWorkouts();$(`#${el.id}`).focus();return;
    }
    if(['exercise-group','exercise-equipment'].includes(el.id)) {
      $('#exercise-results').innerHTML=exercisePickerResults();return;
    }
    if(el.dataset.workoutComplete) {
      const entry=workoutEntries().find(e=>e.id===el.dataset.workoutComplete);
      if(entry){entry.completed=el.checked;save();renderWorkouts();$('[data-workout-complete="'+CSS.escape(entry.id)+'"]')?.focus();}
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
      if(el.value!==foodBasis)for(const n of NUTRIENTS){const input=$(`#food-${n}`);if(input.value!=='')input.value=Number((Number(input.value)*factor).toFixed(6));}
      foodBasis=el.value;return;
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
    if(el.closest('#profile-form'))showError('#profile-error',error);else toast(error.message,true);
  }
});

document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  try {
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
        completed:source===date&&(existing?.completed??false)});
      if(workoutEntries(date).length>=50&&(!existing||date!==source))throw new Error('One day can contain up to 50 exercises.');
      if(existing&&date===source)state.workouts.days[date]=workoutEntries(date).map(e=>e.id===existing.id?entry:e);
      else {
        if(existing){state.workouts.days[source]=workoutEntries(source).filter(e=>e.id!==existing.id);if(!state.workouts.days[source].length)delete state.workouts.days[source];}
        state.workouts.days[date]=[...workoutEntries(date),entry];
      }
      workoutDate=date;
      save();closeDialog();render();toast(existing?'Exercise updated.':'Exercise added to your plan.');return;
    }
    if(form.id==='portion-form') {
      const data=Object.fromEntries(new FormData(form));
      const entry=newEntry(pickerFood,data.amount,data.unit,data.meal,editingEntryId||crypto.randomUUID());
      const day=currentDay(true);
      if(editingEntryId)day.entries=day.entries.map(e=>e.id===editingEntryId?entry:e);else day.entries.push(entry);
      save();closeDialog();render();toast(editingEntryId?'Portion updated.':`${pickerFood.name} added.`);
    }
    if(form.id==='food-form') {
      const data=Object.fromEntries(new FormData(form)),existing=state.foods.find(f=>f.id===form.dataset.id);
      const grams=Number(data.portionGrams),factor=data.nutritionBasis==='portion'?100/grams:1;
      const raw={id:existing?.id||`custom-${crypto.randomUUID()}`,name:data['food-name'],category:data.category,portionUnit:data.portionUnit,portionGrams:grams,note:data['food-note'],source:data['food-source'],favorite:existing?.favorite??true,verified:false};
      for(const n of NUTRIENTS) {if(data[`food-${n}`]==='')throw new Error('Fill in calories and all three macro values.');raw[n]=Number(data[`food-${n}`])*factor;}
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
      undoState=structuredClone(state);currentDay(true).entries.push(...entries.map(e=>newEntry(e.food,e.amount,e.unit,e.meal)));
      save();closeDialog();render();toast('Foods copied into this day.',false,true);
    }
  } catch(error) {
    const selector={ 'portion-form':'#portion-error','food-form':'#food-error','profile-form':'#profile-error','weight-form':'#weight-error','workout-form':'#workout-error' }[form.id];
    if(selector)showError(selector,error);else toast(error.message,true);
  }
});

window.addEventListener('hashchange',()=>{route=location.hash.slice(1)||'today';render();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY||!event.newValue||journalSync?.isSignedIn())return;
  try{state=validateState(JSON.parse(event.newValue));needsSetup=state.profileReady===false;render();toast('Journal updated from another tab.');}catch{toast('Another tab saved invalid data. Your current view is kept.',true);}
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
  applyJournal(journal) {
    if (sameJournal(state,journal)) return;
    state=validateState(journal);needsSetup=state.profileReady===false;undoState=null;pendingImport=null;
    loadError='';saveFailed=false;render();
  },
  canRefresh: () => !$('#dialog').open && !document.activeElement?.closest('form'),
  statusChanged(view) {
    const previous=syncView;
    syncView=view;updateSaveStatus();
    if (['choose','conflict'].includes(view.phase) && previous.phase!==view.phase) showSyncAccount();
    else if ($('#sync-account-body')) {
      if (!view.signedIn) showSyncAccount();
      else $('#sync-account-message').textContent=view.message || (view.phase==='synced'?'Your journal is synced.':'Syncing your journal…');
    }
  },
});
