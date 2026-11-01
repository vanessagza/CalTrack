import { goalForecast, forecastScenario } from './goal-forecast.js?v=19';
import { activityOptions } from './activity-guide.js?v=18';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num = (value, digits=0) => Number(value).toLocaleString('en-US',{maximumFractionDigits:digits});
const dateText = value => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00Z`)) : '';
const estimated = value => ['estimated','reached'].includes(value?.status) && Number.isFinite(value?.days);
const numericDays = value => estimated(value) ? num(value.days) : '—';
const statusText = status => ({
  estimated:'If this pace continues', reached:'Goal reached', insufficient:'More data needed',
  stale:'Recent measurements needed', stalled:'No clear progress toward this goal',
  away:'Current trend moves away from this goal', beyond_horizon:'Beyond the 3-year estimate window',
  invalid:'Check the scenario inputs',
}[status] || 'No estimate yet');
const statusExplanation = (status, scenario=false) => ({
  estimated:scenario?'A simulation from your current measurements and these assumptions.':'Based on your recent measurement trend, not a promised completion date.',
  reached:'Your current measurements meet the chosen target.',
  insufficient:scenario?'A missing rate or assumption prevents a complete goal estimate.':'Log at least 3 measurements over 14 days for each target. Only the last 90 days are used.',
  stale:'The latest measurement is over 28 days old. Add a new reading to refresh this estimate.',
  stalled:scenario?'These assumptions do not reach the target in the model.':'The measured trend is too flat to estimate a finish date.',
  away:scenario?'These assumptions move away from the chosen target.':'The measured trend is moving away from the target, so it has no finish date at this pace.',
  beyond_horizon:'No useful finish date is shown beyond 1,095 days. Review the estimate as your history grows.',
  invalid:'Enter valid values to see a new estimate.',
}[status] || 'Add measurements and review your settings to build an estimate.');

function metricCards(metrics=[], scenario=false) {
  return metrics.map(metric => `<article class="forecast-metric" ${scenario?'data-scenario-metric':'data-forecast-metric'}="${esc(metric.key)}" data-status="${esc(metric.status)}">
    <div class="forecast-metric-heading"><strong>${esc(metric.label)}</strong><span>${num(metric.current,1)} → ${num(metric.target,1)} ${esc(metric.unit)}</span></div>
    <p class="forecast-metric-time">${estimated(metric)?`<strong>${num(metric.days)}</strong> days${metric.days===0?' · reached':''}`:esc(statusText(metric.status))}</p>
    ${estimated(metric)&&metric.date?`<small>About ${esc(dateText(metric.date))}</small>`:''}
    ${!scenario&&Number.isFinite(metric.ratePerWeek)?`<small>Measured trend: ${metric.ratePerWeek>0?'+':''}${num(metric.ratePerWeek,3)} ${metric.key==='bodyFatPercent'?'percentage points':'kg'} / week</small>`:''}
    ${!scenario&&metric.points?`<small>${num(metric.points)} readings over ${num(metric.spanDays)} days${metric.lastDate?` · latest ${esc(dateText(metric.lastDate))}`:''}</small>`:''}
    ${!estimated(metric)?`<small>${esc(metric.reason||statusExplanation(metric.status,scenario))}</small>`:''}
  </article>`).join('');
}

function comparisonBars(baseline, scenario) {
  const values=[baseline,scenario].filter(estimated).map(value=>value.days);
  const maximum=Math.max(1,...values);
  const row=(label,value,kind)=>`<div class="forecast-comparison-row"><span>${label}</span><div class="forecast-duration-track"><span class="forecast-duration-fill ${kind}" style="width:${estimated(value)?Math.max(value.days===0?0:2,value.days/maximum*100):0}%"></span></div><strong>${estimated(value)?`${num(value.days)} days`:'No date'}</strong></div>`;
  return `<div class="forecast-comparison" aria-label="Model duration comparison"><h4>Compare the same model</h4>${row('Starting inputs',baseline,'baseline')}${row('Your scenario',scenario,'scenario')}<small>Both bars use the energy model. Your measured-history estimate above uses a different method.</small></div>`;
}

function scenarioHTML(forecast, scenario) {
  if(scenario.status==='invalid')return `<div class="forecast-input-error" data-forecast-error role="alert">${esc(scenario.reason||'Check your scenario inputs.')}</div><div class="forecast-scenario-total" data-forecast-scenario-status data-status="invalid"><span class="small-label">YOUR SCENARIO</span><p><strong data-forecast-scenario-days>—</strong></p><span>Enter valid values to calculate a new estimate.</span></div>`;
  const baseline=forecast.scenario;
  let difference='Change an input to compare the simulated timing.';
  if(estimated(baseline)&&estimated(scenario)) {
    const delta=scenario.days-baseline.days;
    difference=delta===0?'The same estimated timing as the starting inputs.':`${num(Math.abs(delta))} ${Math.abs(delta)===1?'day':'days'} ${delta<0?'sooner':'later'} than the starting inputs in this model.`;
  } else if(estimated(scenario)) difference='This scenario has an estimate; the starting inputs do not have a complete goal date.';
  else difference='A complete date needs every remaining target to be reachable under these assumptions.';
  return `<div class="forecast-scenario-total" data-forecast-scenario-status data-status="${esc(scenario.status)}"><span class="small-label">YOUR SCENARIO · ESTIMATE</span><p><strong data-forecast-scenario-days>${numericDays(scenario)}</strong>${estimated(scenario)?'<span>days left</span>':''}</p><h4>${estimated(scenario)?scenario.days===0?'Goal reached':`Around ${esc(dateText(scenario.date))}`:esc(statusText(scenario.status))}</h4><span>${esc(statusExplanation(scenario.status,true))}</span></div>
    <p class="forecast-difference" data-forecast-difference>${esc(difference)}</p>
    <div class="forecast-energy-readout"><div><span>Starting maintenance estimate</span><strong data-forecast-tdee>${num(scenario.currentTdee)} kcal / day</strong></div><div><span>Starting ${scenario.dailyBalanceKcal>=0?'deficit':'surplus'}</span><strong data-forecast-balance>${num(Math.abs(scenario.dailyBalanceKcal))} kcal / day</strong></div></div>
    ${forecast.mode==='composition'?`<div class="forecast-metrics scenario-metrics">${metricCards(scenario.metrics,true)}</div>`:''}
    ${comparisonBars(baseline,scenario)}
    ${scenario.reason?`<p class="forecast-model-note">${esc(scenario.reason)}</p>`:''}`;
}

function field(label,id,value,attrs,note='') {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" value="${value==null?'':esc(value)}" ${attrs}>${note?`<small>${note}</small>`:''}</div>`;
}

export function renderGoalForecast({state,today}) {
  if(state.profileReady===false)return `<section id="goal-forecast" class="card goal-forecast" aria-labelledby="goal-forecast-title"><div class="forecast-heading"><div><span class="small-label">YOUR GOAL, OVER TIME</span><h2 id="goal-forecast-title">How long might it take?</h2><p>Save your profile and goals to build your timeline and explore a different plan.</p></div></div></section>`;
  const forecast=goalForecast(state,today), defaults=forecast.defaults, limits=forecast.limits;
  return `<section id="goal-forecast" class="card goal-forecast" aria-labelledby="goal-forecast-title">
    <div class="forecast-heading"><div><span class="small-label">YOUR GOAL, OVER TIME</span><h2 id="goal-forecast-title">How long might it take?</h2><p>Use your history to estimate the time left, then explore a different plan.</p></div><a class="text-button" href="#history">Review measurements ↗</a></div>
    <p class="forecast-saved-note">Uses your saved goals and measurements; save profile changes to refresh.</p>
    <div class="forecast-layout"><div class="forecast-history"><div class="forecast-history-total" data-forecast-history-status data-status="${esc(forecast.history.status)}"><span class="small-label">AT YOUR MEASURED PACE</span><p><strong data-forecast-history-days>${numericDays(forecast.history)}</strong>${estimated(forecast.history)?'<span>estimated days left</span>':''}</p><h3>${estimated(forecast.history)?forecast.history.days===0?'Goal reached':`Around ${esc(dateText(forecast.history.date))}`:esc(statusText(forecast.history.status))}</h3><p>${esc(forecast.history.reason||statusExplanation(forecast.history.status))}</p></div>
      <div class="forecast-metrics">${metricCards(forecast.history.metrics)}</div>
      ${forecast.mode==='composition'?'<p class="forecast-model-note">Body fat and skeletal muscle have separate timelines. Your overall estimate uses the slower target, so unchanged scale weight can still show progress. Targets already met are assumed maintained if their trend is unknown.</p>':''}
      <details class="forecast-method"><summary>How these estimates work</summary><div><p>The history estimate fits a straight trend through dated measurements in the last 90 days. Each target needs at least 3 readings spanning 14 days, with a reading in the last 28 days. Future readings are excluded. The remaining change from your latest known measurements is divided by the measured rate, assuming that pace continues from today. Unmeasured progress since your last reading is not assumed.</p><p>The scenario uses your saved energy formula, activity and proposed intake. It recalculates maintenance as the simulated body changes, using about 7,700 kcal per kg as a rough energy approximation. Plateaus can leave a target without a finish date.</p>${forecast.mode==='composition'?'<p>Muscle change is an independent assumption taken from an eligible measured trend or entered by you. This calculator does not infer muscle gain from calorie, protein or exercise settings. The model holds other lean tissue constant and stops assumed muscle change at your muscle target; body fat is recalculated from fat and lean mass.</p>':''}<p>Real energy needs, water weight and measurement error vary. Dates are planning estimates and will change as you log more data. The model stops at 3 years.</p></div></details></div>
    <div class="forecast-playground"><div class="forecast-playground-heading"><div><span class="small-label">WHAT IF?</span><h3>Try a different plan.</h3></div><button type="button" class="text-button" data-forecast-reset>Reset scenario</button></div><p class="forecast-source" data-forecast-intake-source>${forecast.intake.source==='history'?`Starting intake: ${num(forecast.intake.kcal)} kcal / day from ${num(forecast.intake.days)} closed, logged days in the last 28 days.`:`Starting intake: your saved ${num(forecast.intake.kcal)} kcal budget. At least 7 closed, logged days in the last 28 days are needed to use an intake average.`}</p>
      <fieldset class="forecast-controls"><legend class="sr-only">Scenario assumptions</legend>
        <div class="forecast-calorie-control">${field('Daily intake · kcal','forecast-calories',defaults.calories,`min="${limits.minCalories}" max="${limits.maxCalories}" step="any" inputmode="decimal"`)}<input id="forecast-calories-range" type="range" aria-label="Scenario daily calorie intake" min="${limits.minCalories}" max="${limits.maxCalories}" step="25" value="${Math.max(limits.minCalories,Math.min(limits.maxCalories,defaults.calories))}"><small>Scenario range: ${num(limits.minCalories)}–${num(limits.maxCalories)} kcal / day.</small></div>
        <div class="field"><label for="forecast-activity">Typical activity</label><select id="forecast-activity">${activityOptions(defaults.activity).map(([value,label])=>`<option value="${value}"${value===defaults.activity?' selected':''}>${esc(label)}</option>`).join('')}</select><small>Factors above 1.20 include usual workouts.</small></div>
        <div data-forecast-exercise-field${defaults.activity===1.2?'':' hidden'}>${field('Extra net exercise · kcal / day','forecast-exercise',defaults.exerciseKcalPerDay,'min="0" max="1000" step="5" inputmode="decimal"','Average separately logged exercise per calendar day, used only at 1.20.')}</div>
        ${forecast.mode==='composition'?field('Assumed muscle change · kg / week','forecast-muscle-rate',defaults.muscleRatePerWeek,`min="${limits.minMuscleRate}" max="${limits.maxMuscleRate}" step="0.01" inputmode="decimal"`,'Positive for gain, negative for loss. Leave blank if unknown. A trend-derived starting value is still an assumption.'):''}
      </fieldset><p class="forecast-unsaved-note">Explore freely: these controls do not change your saved profile, targets or journal.</p>
      <div class="forecast-scenario-results" data-forecast-results aria-live="polite" aria-atomic="true">${scenarioHTML(forecast,forecast.scenario)}</div>
    </div></div>
  </section>`;
}

export function mountGoalForecast(container,{state,today}) {
  if(!container||!container.querySelector('#forecast-calories'))return;
  const forecast=goalForecast(state,today);
  const calories=container.querySelector('#forecast-calories');
  const slider=container.querySelector('#forecast-calories-range');
  const activity=container.querySelector('#forecast-activity');
  const exercise=container.querySelector('#forecast-exercise');
  const muscle=container.querySelector('#forecast-muscle-rate');
  const results=container.querySelector('[data-forecast-results]');
  const read=input=>input&&input.value.trim()!==''?Number(input.value):null;
  const update=event=>{
    if(event?.target===slider)calories.value=slider.value;
    else if(Number.isFinite(read(calories)))slider.value=calories.value;
    const selected=read(activity);
    container.querySelector('[data-forecast-exercise-field]').hidden=selected!==1.2;
    const options={calories:read(calories),activity:selected,exerciseKcalPerDay:selected===1.2?read(exercise):0,muscleRatePerWeek:muscle?read(muscle):null};
    try { results.innerHTML=scenarioHTML(forecast,forecastScenario(state,options,today)); }
    catch(error) { results.innerHTML=scenarioHTML(forecast,{status:'invalid',reason:error.message||'Check your scenario inputs.'}); }
  };
  container.addEventListener('input',update);
  container.addEventListener('change',update);
  container.querySelector('[data-forecast-reset]').addEventListener('click',()=>{
    calories.value=forecast.defaults.calories;
    activity.value=forecast.defaults.activity;
    exercise.value=forecast.defaults.exerciseKcalPerDay;
    if(muscle)muscle.value=forecast.defaults.muscleRatePerWeek??'';
    update();
  });
}
