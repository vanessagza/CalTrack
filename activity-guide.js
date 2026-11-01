// Whole-day planning estimates. Intermediate factors allow gradual adjustment;
// workout frequency alone does not determine a person's daily expenditure.
const ACTIVITY_LEVELS = [
  [1.2, 'Mostly seated · 1.20', 'Mostly sitting, little walking. Add separately logged completed workout estimates to the daily budget and weekly maintenance comparison.'],
  [1.25, 'Mostly seated + some exercise · 1.25', 'Mostly sitting with a little walking and short, gentle workouts during the week.'],
  [1.3, 'Mostly seated + regular short workouts · 1.30', 'Mostly sitting, with regular short workouts and some everyday walking.'],
  [1.375, 'Lightly active · 1.375', 'More everyday walking or somewhat harder regular workouts, with much of the day still seated.'],
  [1.45, 'Between light and moderate · 1.45', 'A mix of sitting, walking and regular moderate exercise.'],
  [1.55, 'Moderately active · 1.55', 'A fair amount of daily movement alongside regular moderate or hard exercise.'],
  [1.65, 'Between moderate and very active · 1.65', 'A lot of daily walking or time on your feet, plus demanding exercise.'],
  [1.725, 'Very active · 1.725', 'A physically active day and frequent demanding training.'],
  [1.8, 'Between very and highly active · 1.80', 'Strenuous daily work or substantial training volumes most days.'],
  [1.9, 'Highly active · 1.90', 'Very demanding physical work and/or sustained high-volume athletic training.'],
];

const factorText = value => value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

export function activityOptions(value) {
  const options = ACTIVITY_LEVELS.map(([factor, label]) => [factor, label]);
  const factor = Number(value);
  // A restored journal may contain a valid factor between the listed choices.
  // Preserve it instead of silently selecting the first option on the next save.
  if (Number.isFinite(factor) && factor >= 1.2 && factor <= 1.9 && !options.some(([option]) => option === factor)) {
    options.push([factor, `My existing estimate · ${factorText(factor)}`]);
    options.sort(([a], [b]) => a - b);
  }
  return options;
}

export function activityGuide(activity) {
  const factor = Number(activity);
  const selected = Number.isFinite(factor) && factor >= 1.2 && factor <= 1.9 ? factor : 1.2;
  return `<section class="activity-guide" aria-labelledby="activity-guide-title">
    <h3 id="activity-guide-title">How to choose your typical activity</h3>
    <p>Think about your whole week: time sitting, walking, work and workout intensity. Four short sessions do not automatically mean “moderately active.” These factors are starting estimates, not measured calorie burn.</p>
    <div class="activity-example"><strong>Mostly sedentary, with 30-minute workouts 4 times a week?</strong><p>Try <strong>1.25–1.30</strong> if the sessions are gentle to moderate and the rest of your day is mostly seated. Consider <strong>1.375</strong> for harder sessions or more everyday walking. Review your intake and measurement trends over 2–4 weeks, then adjust gradually.</p></div>
    <p class="activity-policy" data-activity-policy>${selected === 1.2
      ? '<strong>Your 1.20 selection:</strong> only completed net exercise estimates are added to your seated baseline in the daily calorie budget and weekly maintenance comparison. This is an alternative if you prefer to log individual workouts.'
      : `<strong>Your ${factorText(selected)} selection:</strong> usual workouts are included in this factor. Logged exercise does not add a second credit to your daily calorie budget or weekly maintenance comparison.`}</p>
    <p class="activity-budget-note">Workout burn estimates remain visible at every activity level. Choose either a seated baseline with separately logged workouts (1.20), or an estimate for your whole usual week (above 1.20).</p>
    <details><summary>Compare all activity levels</summary><table class="activity-level-table"><caption class="sr-only">Whole-day activity estimates</caption><thead><tr><th scope="col">Factor</th><th scope="col">Typical week</th></tr></thead><tbody>${ACTIVITY_LEVELS.map(([value, label, description]) => `<tr${selected === value ? ' class="activity-selected"' : ''}><th scope="row">${factorText(value)}${selected === value ? '<span class="sr-only"> · selected</span>' : ''}</th><td><strong>${label.slice(0, label.lastIndexOf(' · '))}</strong><span>${description}</span></td></tr>`).join('')}</tbody></table></details>
  </section>`;
}
