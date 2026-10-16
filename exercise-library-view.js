import { exerciseCatalog, EXERCISE_GROUPS, WORKOUT_EQUIPMENT, workoutSuggestion } from './core.js?v=16';
import { exerciseEnergy } from './exercise-energy.js?v=16';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatNumber = (value, digits = 0) => Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
const sourceFor = exercise => exercise.id.startsWith('custom-exercise-') ? 'custom' : 'preset';
const equipmentLabel = exercise => WORKOUT_EQUIPMENT.find(([value]) => value === exercise.equipment)?.[1] || exercise.equipment;
const targetLabel = exercise => exercise.unit === 'seconds' ? 'sec' : exercise.unit === 'minutes' ? 'min' : 'reps';

function normalizedFilters(filters = {}) {
  return { search: String(filters.search || '').trim().toLocaleLowerCase(), group: filters.group || 'all',
    equipment: filters.equipment || 'all', source: filters.source || 'all', status: filters.status || 'active' };
}

export function filterExerciseLibrary(state, filters = {}) {
  const selected = normalizedFilters(filters);
  return exerciseCatalog(state.workouts).filter(exercise => {
    if (selected.status === 'active' && exercise.archived || selected.status === 'archived' && !exercise.archived) return false;
    if (selected.group !== 'all' && exercise.group !== selected.group) return false;
    if (selected.equipment !== 'all' && exercise.equipment !== selected.equipment) return false;
    if (selected.source !== 'all' && sourceFor(exercise) !== selected.source) return false;
    const haystack = [exercise.name, exercise.group, equipmentLabel(exercise), exercise.instructions, exercise.cue,
      exercise.muscles, exercise.avoid, exercise.feel, exercise.easier].filter(Boolean).join(' ').toLocaleLowerCase();
    return !selected.search || haystack.includes(selected.search);
  });
}

export function exerciseLibraryCount({ state, filters = {} }) {
  const count = filterExerciseLibrary(state, filters).length;
  const total = exerciseCatalog(state.workouts).length;
  return `${count} of ${total} exercise${total === 1 ? '' : 's'}`;
}

function defaultTarget(exercise, state) {
  const defaults = sourceFor(exercise) === 'custom' || exercise.customized ? exercise
    : workoutSuggestion(state.profile, state.workouts.settings, exercise.id);
  const sets = defaults.sets ?? 2;
  const reps = defaults.reps ?? (exercise.unit === 'seconds' ? 20 : 10);
  return { sets, setsMax: defaults.setsMax ?? sets, reps, repsMax: defaults.repsMax ?? reps,
    restSeconds: defaults.restSeconds ?? (exercise.unit === 'minutes' ? 0 : 60) };
}

function libraryCard({ exercise, state, esc, icon, num }) {
  const target = defaultTarget(exercise, state), custom = sourceFor(exercise) === 'custom';
  let estimate;
  try { estimate = exerciseEnergy(target, exercise, state.profile.weight); } catch { estimate = null; }
  const title = esc(exercise.name), id = esc(exercise.id);
  const amount = `${num(target.reps)} ${targetLabel(exercise)}${exercise.unilateral ? ' / side' : ''}`;
  const prescription = exercise.unit === 'minutes' && target.sets === 1 ? amount
    : `${num(target.sets)} ${target.sets === 1 ? 'set' : 'sets'} × ${amount}`;
  const description = exercise.cue || exercise.instructions || 'Add a description and technique tips to make this exercise your own.';
  const details = [
    ['Instructions', exercise.instructions && exercise.instructions !== description ? exercise.instructions : ''],
    ['Muscles worked', exercise.muscles], ['What you should feel', exercise.feel],
    ['Make it easier', exercise.easier], ['Common mistakes to avoid', exercise.avoid],
  ].filter(([, value]) => value);
  return `<article class="card exercise-library-card${exercise.archived ? ' archived' : ''}" data-exercise-id="${id}" data-source="${custom ? 'custom' : 'preset'}">
    <div class="library-card-image"><img src="${esc(exercise.image || './assets/exercises/custom.svg')}" alt="Illustration of ${title}" loading="lazy" decoding="async"><div class="library-card-tags"><span class="library-tag">${custom ? 'Custom exercise' : 'Preset exercise'}</span>${exercise.customized && !custom ? '<span class="library-tag customized">Personalized</span>' : ''}${exercise.archived ? '<span class="library-tag archived">Archived</span>' : ''}</div></div>
    <div class="library-card-body"><div class="library-card-heading"><h2>${title}</h2></div>
    <p class="library-card-category">${esc(exercise.group)} <span aria-hidden="true">·</span> ${esc(equipmentLabel(exercise))}${exercise.compound ? ' <span aria-hidden="true">·</span> Compound' : ''}</p>
    <p class="library-card-description">${esc(description)}</p>
    <dl class="library-card-stats"><div><dt>Default target</dt><dd class="library-default-target">${esc(prescription)}</dd></div><div><dt>Rest between sets</dt><dd>${target.restSeconds ? `${num(target.restSeconds)} sec` : 'No rest timer'}</dd></div><div class="library-calories"><dt>Estimated extra burn <span class="library-energy-method">${exercise.energy ? 'Your calories' : 'Automatic'}</span></dt><dd><strong class="library-energy-value">${estimate ? `~${num(estimate.kcal, 1)}` : '—'}</strong> kcal <small>for the default target${estimate ? ` at ${num(estimate.weightKg, 1)} kg` : ''}</small></dd></div></dl>
    ${details.length || exercise.energy ? `<details class="library-technique-details"><summary>Technique & calorie details</summary>${details.map(([label, value]) => `<p><strong>${esc(label)}</strong>${esc(value)}</p>`).join('')}${exercise.energy ? `<p><strong>Your calorie reference</strong>${num(exercise.energy.kcal, 1)} kcal at ${num(exercise.energy.weightKg, 1)} kg for ${num(exercise.energy.activeMinutes, 1)} active min. The estimate adjusts with your body weight and exercise target.</p>` : ''}</details>` : ''}
    <div class="library-card-actions">${exercise.archived ? `<button class="btn secondary small" data-action="restore-library-exercise" data-id="${id}">${icon('plus')} Restore exercise</button>` : `<button class="btn primary small" data-action="library-add-workout" data-id="${id}">${icon('plus')} Add to workout</button>`}<button class="btn secondary small" data-action="edit-custom-exercise" data-id="${id}">${icon('edit')} Edit exercise</button><button class="text-button" data-action="library-guide" data-id="${id}">View details</button>${!exercise.archived ? `<button class="icon-btn delete" data-action="delete-library-exercise" data-id="${id}" aria-label="Delete ${title}" title="Delete exercise">${icon('trash')}</button>` : ''}</div></div>
  </article>`;
}

export function exerciseLibraryResults({ state, filters = {}, esc = escapeHTML, icon = () => '', num = formatNumber }) {
  const exercises = filterExerciseLibrary(state, filters);
  if (!exercises.length) return `<div class="card empty-state library-empty"><span class="library-empty-icon">${icon('search')}</span><h3>No exercises found</h3><p>Try another search or clear your filters to explore your exercise library.</p><div class="library-empty-actions"><button class="btn secondary small" data-action="reset-exercise-filters">Clear filters</button><button class="btn primary small" data-action="new-exercise">${icon('plus')} Create an exercise</button></div></div>`;
  return exercises.map(exercise => libraryCard({ exercise, state, esc, icon, num })).join('');
}

export function exerciseLibraryDashboard({ state, filters = {}, esc = escapeHTML, icon = () => '', num = formatNumber }) {
  const selected = normalizedFilters(filters), catalog = exerciseCatalog(state.workouts);
  const active = catalog.filter(exercise => !exercise.archived);
  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
  const filter = (id, label, options, current) => `<label class="field library-filter"><span>${label}</span><select id="${id}">${options.map(([value, name]) => option(value, name, current)).join('')}</select></label>`;
  return `<section class="card exercise-library-overview" aria-label="Your exercise library"><div class="library-overview-copy"><span class="small-label">YOUR MOVEMENT LIBRARY</span><h1>Make every exercise your own.</h1><p>Create an exercise or personalize a preset with your images, instructions and calorie burn.</p><div class="library-overview-stats"><span><strong>${num(active.length)}</strong> active exercises</span><span><strong>${num(active.filter(exercise => sourceFor(exercise) === 'custom').length)}</strong> custom exercises</span></div></div><button class="btn primary" data-action="new-exercise">${icon('plus')} Create an exercise</button></section>
    <section class="card exercise-library-controls" aria-label="Find exercises"><label class="library-search" for="library-search"><span class="visually-hidden">Search exercises</span>${icon('search')}<input type="search" id="library-search" value="${esc(filters.search || '')}" placeholder="Search exercises, muscles or instructions…" autocomplete="off" aria-controls="exercise-library-results"></label><div class="library-filter-grid">${filter('library-group', 'Exercise type', [['all', 'All types'], ...EXERCISE_GROUPS.map(group => [group, group])], selected.group)}${filter('library-equipment', 'Equipment', [['all', 'All equipment'], ...WORKOUT_EQUIPMENT.map(([value, label]) => [value, value === 'bodyweight' ? 'Bodyweight' : value === 'dumbbells' ? 'Dumbbells' : 'Gym equipment'])], selected.equipment)}${filter('library-source', 'Source', [['all', 'All exercises'], ['preset', 'Presets'], ['custom', 'Custom exercises']], selected.source)}${filter('library-status', 'Status', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All statuses']], selected.status)}</div><div class="library-filter-footer"><span id="exercise-library-count" role="status" aria-live="polite">${exerciseLibraryCount({ state, filters })}</span><button class="text-button" data-action="reset-exercise-filters">Clear filters</button></div></section>
    <p class="library-calorie-note">${icon('info')}<span>Calories adjust to your sets, targets and body weight. Mark the exercise done in Workouts to add its burn to that day’s calorie budget.</span></p>
    <section class="exercise-library-grid" id="exercise-library-results" aria-label="Exercises">${exerciseLibraryResults({ state, filters, esc, icon, num })}</section>`;
}
