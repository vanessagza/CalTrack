import {
  ageAt, closedIntakeThrough, isDateKey, todayKey,
  totals as foodTotals, validateProfile, weekDates,
} from './core.js?v=15';
import { exerciseWeightForDate, workoutDayEnergy } from './exercise-energy.js?v=15';

export { closeIntakeDays, closedIntakeThrough as inferredIntakeClosedThrough } from './core.js?v=15';

// A practical comparison band, not a claim that predicted expenditure is exact.
const MAINTENANCE_TOLERANCE = 0.05;

function maintenanceForDate(state, profile, date) {
  const weightKg = exerciseWeightForDate(state, date);
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
    throw new Error('Enter a body weight between 30 and 250 kg.');
  }
  // Use maintenance expenditure directly. The selected calorie budget, deficit,
  // and protein target do not determine whether intake is below maintenance.
  const rmr = 10 * weightKg + 6.25 * profile.height - 5 * ageAt(profile.birthDate, date)
    + (profile.sex === 'male' ? 5 : -161);
  const baseMaintenanceKcal = rmr * profile.activity;
  // Higher activity multipliers already include habitual activity. Only the
  // sedentary baseline receives additional completed, net exercise estimates.
  const hasCompletedExercise = state.workouts?.days?.[date]?.some(entry => entry.completed === true);
  const exerciseKcal = profile.activity === 1.2 && hasCompletedExercise
    ? workoutDayEnergy(state, date).creditedKcal : 0;
  return { baseMaintenanceKcal, exerciseKcal, maintenanceKcal:baseMaintenanceKcal + exerciseKcal };
}

/**
 * Read a Monday–Sunday week without closing days or changing saved records.
 * Only closed days containing real food entries contribute to averages and
 * matched expenditure. All projections use that observed daily pace for 7 days.
 * Positive balances indicate a surplus; negative balances indicate a deficit.
 */
export function weeklyIntake(state, anchorDate, today = todayKey()) {
  if (!isDateKey(anchorDate) || !isDateKey(today)) throw new Error('Choose a valid weekly intake date.');
  const profile = validateProfile(state?.profile);
  const dates = weekDates(anchorDate);
  const closedThrough = closedIntakeThrough(state, today);
  const includedEntries = [];
  const days = dates.map(date => {
    const entries = state.days?.[date]?.entries || [];
    const totals = foodTotals(entries);
    const hasEntries = entries.length > 0;
    const closed = Boolean(hasEntries && closedThrough && date <= closedThrough && date < today);
    const included = closed;
    const reason = date > today ? 'future' : !hasEntries ? 'missing' : included ? 'included' : 'open';
    if (included) includedEntries.push(...entries);
    return {
      date, totals, hasEntries, closed, included, reason,
      ...(included ? maintenanceForDate(state, profile, date)
        : { maintenanceKcal:null, baseMaintenanceKcal:null, exerciseKcal:null }),
    };
  });
  const includedDays = days.filter(day => day.included);
  const completedDays = includedDays.length;
  const totals = foodTotals(includedEntries);
  const maintenanceKcal = includedDays.reduce((sum, day) => sum + day.maintenanceKcal, 0);
  const averageDailyKcal = completedDays ? totals.kcal / completedDays : null;
  const averageDailyMaintenanceKcal = completedDays ? maintenanceKcal / completedDays : null;
  const observedBalanceKcal = completedDays ? totals.kcal - maintenanceKcal : null;
  const projectedWeeklyIntakeKcal = completedDays ? averageDailyKcal * 7 : null;
  const projectedWeeklyMaintenanceKcal = completedDays ? averageDailyMaintenanceKcal * 7 : null;
  const projectedWeeklyBalanceKcal = completedDays ? observedBalanceKcal / completedDays * 7 : null;
  let status = 'insufficient';
  if (completedDays) {
    const difference = averageDailyKcal - averageDailyMaintenanceKcal;
    const band = averageDailyMaintenanceKcal * MAINTENANCE_TOLERANCE;
    status = difference < -band - 1e-8 ? 'deficit' : difference > band + 1e-8 ? 'surplus' : 'maintenance';
  }
  return {
    weekStart:dates[0], weekEnd:dates[6], closedThrough, days, completedDays, totals,
    averageDailyKcal, averageDailyMaintenanceKcal, observedBalanceKcal,
    projectedWeeklyIntakeKcal, projectedWeeklyMaintenanceKcal, projectedWeeklyBalanceKcal,
    status, partial:completedDays < 7, isEstimate:true,
    maintenanceTolerance:MAINTENANCE_TOLERANCE, exercisePolicy:'sedentary-only',
  };
}
