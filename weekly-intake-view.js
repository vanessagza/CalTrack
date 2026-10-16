import { weeklyIntake } from './weekly-intake.js?v=16';
import { energyNeeds } from './core.js?v=16';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const formatNumber = (value, digits = 0) => Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
const formatDate = (date, options = {}) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...options }).format(new Date(`${date}T12:00:00Z`));

export function weeklyIntakeDashboard({ state, date, today, dateText = formatDate, icon = () => '', num = formatNumber, esc = escapeHTML }) {
  const week = weeklyIntake(state, date, today);
  const count = week.completedDays, enough = count > 0, partial = week.partial;
  const fallbackReference = enough ? null : energyNeeds(state.profile, date);
  const goalRmr = enough ? week.averageDailyRmrKcal : fallbackReference.goalRmr;
  const goalMaintenance = enough ? week.averageDailyGoalMaintenanceKcal : fallbackReference.goalTdee;
  const kcal = value => value == null ? '—' : num(value);
  const range = `${dateText(week.weekStart)} – ${dateText(week.weekEnd, { year: 'numeric' })}`;
  const classification = enough ? `${partial ? 'Projected weekly' : 'Estimated weekly'} ${week.status === 'maintenance' ? 'maintenance' : week.status}` : 'More days to go';
  const magnitude = enough ? Math.abs(week.projectedWeeklyBalanceKcal) : null;
  const summary = !enough ? 'Close a day with food logged to see your weekly average.'
    : week.status === 'maintenance' ? 'Your average intake is within 5% of estimated current-weight maintenance.'
      : `Your average intake is ${week.status === 'deficit' ? 'below' : 'above'} your matched current-weight maintenance estimate.`;
  const maximum = Math.max(1, ...week.days.filter(day => day.included).flatMap(day => [day.totals.kcal, day.rmrKcal || 0]));

  const days = week.days.map(day => {
    const included = day.included && day.closed && day.hasEntries;
    const reason = included ? 'included' : day.reason;
    const status = { included: 'Closed & logged', open: 'In progress', missing: 'Not logged', future: 'Upcoming' }[reason] || 'Not included';
    const weekday = dateText(day.date, { weekday: 'short' }).split(',')[0];
    const fullDate = dateText(day.date, { weekday: 'long', year: 'numeric' });
    const value = included ? day.totals.kcal : null;
    const height = included ? Math.max(value > 0 ? 2 : 0, Math.min(100, value / maximum * 100)) : 0;
    const rmrHeight = included ? Math.min(100, day.rmrKcal / maximum * 100) : 0;
    const isToday = day.date === today;
    return `<article class="weekly-day${included ? ' is-included' : ''}${isToday ? ' is-today' : ''}" data-weekly-date="${esc(day.date)}" data-status="${esc(reason)}">
      <div class="weekly-day-heading"><span>${esc(weekday)}</span><time datetime="${esc(day.date)}">${Number(day.date.slice(-2))}</time>${isToday ? '<small>Today</small>' : ''}</div>
      <div class="weekly-day-chart" ${included ? `role="img" aria-label="${esc(`${kcal(value)} kcal logged; dashed line: RMR at goal weight, ${kcal(day.rmrKcal)} kcal. This is resting energy, not an intake limit.`)}"` : 'aria-hidden="true"'}>${included ? `<span class="weekly-day-bar" style="height:${height}%"></span><span class="weekly-rmr-mark" data-weekly-goal-rmr data-kcal="${day.rmrKcal}" style="bottom:${rmrHeight}%"></span>` : '<span class="weekly-day-placeholder">—</span>'}</div>
      <p class="weekly-day-intake"><strong>${kcal(value)}</strong>${included ? '<small>kcal</small>' : '<small>not counted</small>'}</p>
      <span class="weekly-day-status" data-weekly-status>${esc(status)}</span>
      <button class="text-button weekly-day-open" data-action="weekly-open-day" data-date="${esc(day.date)}" aria-label="Open food journal for ${esc(fullDate)}">Open journal${icon('right')}</button>
    </article>`;
  }).join('');

  return `<section id="weekly-intake" class="card weekly-intake" aria-labelledby="weekly-intake-title">
    <div class="weekly-intake-heading"><div><span class="small-label">THE WEEKLY PICTURE</span><h2 id="weekly-intake-title">Your weekly intake</h2><p>${esc(range)} <span aria-hidden="true">·</span> Monday to Sunday</p></div>
      <nav class="weekly-intake-navigation" aria-label="Weekly intake dates"><button class="icon-btn" data-action="weekly-prev" aria-label="Previous intake week">${icon('left')}</button><button class="text-button" data-action="weekly-current">This week</button><button class="icon-btn" data-action="weekly-next" aria-label="Next intake week">${icon('right')}</button></nav>
    </div>
    <div class="weekly-intake-overview"><div class="weekly-average-comparison"><div class="weekly-average-primary"><span>Average daily intake</span><p><strong data-weekly-average>${kcal(week.averageDailyKcal)}</strong><small>kcal / day</small></p></div><div class="weekly-average-maintenance"><span>Estimated current-weight maintenance</span><p><strong data-weekly-maintenance>${kcal(week.averageDailyMaintenanceKcal)}</strong><small>kcal / day</small></p><small>Matched to the same counted days</small></div></div>
      <div class="weekly-intake-classification" data-weekly-classification data-status="${esc(week.status)}"><span class="weekly-estimate-label">${partial ? '7-DAY PROJECTION' : 'WEEKLY ESTIMATE'}</span><h3>${esc(classification)}</h3>${enough && week.status !== 'maintenance' ? `<p class="weekly-balance-value"><strong>${kcal(magnitude)}</strong><small>kcal ${week.status}</small></p>` : ''}<p class="weekly-classification-copy">${esc(summary)}</p>${enough && partial ? '<small>If these daily averages continued for 7 days.</small>' : ''}</div>
    </div>
    <div class="weekly-intake-ledger"><span><strong data-weekly-total>${kcal(enough ? week.totals.kcal : null)}</strong> kcal across counted days</span><span class="weekly-count-badge"><strong>${num(count)} / 7</strong> closed, logged days</span>${enough ? `<span>${partial ? 'Projected' : 'Total'} weekly intake <strong>${kcal(week.projectedWeeklyIntakeKcal)}</strong> kcal</span>` : ''}</div>
    <div class="weekly-goal-reference" aria-label="Energy references at your goal weight"><div class="weekly-goal-weight"><span>YOUR GOAL WEIGHT</span><p><strong data-weekly-goal-weight>${num(state.profile.goalWeight, 1)}</strong><small>kg</small></p></div><dl><div><dt>RMR at goal weight</dt><dd><strong data-weekly-goal-rmr-average>${kcal(goalRmr)}</strong><small>kcal / day at rest</small></dd></div><div><dt>Maintenance at goal weight · TDEE</dt><dd><strong data-weekly-goal-maintenance>${kcal(goalMaintenance)}</strong><small>kcal / day with activity</small></dd></div></dl><p class="weekly-goal-reference-note">${enough ? 'Goal references use the same counted dates.' : `Goal references use your saved profile for ${esc(dateText(date))}.`} The dashed line shows resting energy, not a recommended intake limit. Formula budgets apply your chosen deficit to goal-weight maintenance.</p></div>
    <div class="weekly-intake-chart-heading"><h3>Day by day</h3><p><span class="weekly-legend-bar" aria-hidden="true"></span> Food intake <span class="weekly-legend-mark" aria-hidden="true"></span> RMR at goal weight</p></div>
    <div class="weekly-intake-days" aria-label="Daily intake for ${esc(range)}">${days}</div>
    <p class="weekly-intake-footnote">A day is recorded after you first log food on a later calendar day. Future-dated food logs do not close a day. Only closed days with food logged count toward this average; in-progress, unlogged and future days stay out.${enough && partial ? ` This is a partial week (${num(count)} of 7 days).` : ''} To correct a total, open that date’s food journal.</p>
    <details class="weekly-intake-method"><summary>How the weekly estimate works</summary><div><p>Daily average = calories from closed, logged days ÷ number of counted days. A partial week projects the intake and current-weight maintenance averages over 7 days; it does not predict what you will eat. Unlogged days are excluded rather than assumed to be zero.</p><p>RMR is resting metabolic rate: estimated energy at rest. The dashed chart line uses Mifflin–St Jeor with your saved goal weight, formula sex, height and age on that date. It is a reference, not a recommended daily intake limit. Goal-weight TDEE multiplies this resting estimate by your activity setting; calculated calorie budgets then apply your chosen deficit. A manual calorie budget is separate.</p><p>Actual deficit, maintenance or surplus compares intake with current-weight TDEE, using your recorded body weight for each counted date. Goal-weight references do not replace this estimate of your current energy expenditure.</p><p>At the sedentary activity setting (1.2), only completed exercise adds its estimated calories above resting energy to current-weight maintenance. Higher activity settings already account for exercise, so workout calories are not added again.</p><p>Intake within 5% above or below matched estimated current-weight maintenance is classified as maintenance. Lower intake is a deficit; higher intake is a surplus. Food logs and energy estimates have uncertainty, and this comparison does not predict a precise weight change.</p></div></details>
  </section>`;
}
