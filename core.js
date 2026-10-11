export const STORAGE_KEY = 'daily-balance-v1';
export const TIME_ZONE = 'Asia/Tashkent';
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'];
export const CATEGORIES = ['Protein', 'Bread & grains', 'Dairy', 'Snacks', 'Fruit', 'Extras'];
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];
export const DEFAULT_PROFILE = {
  name: 'You', birthDate: '1996-01-01', sex: 'female', height: 170,
  weight: 70, startWeight: 70, goalWeight: 65, activity: 1.2,
  calorieMode: 'manual', calories: 1600, deficit: 10, proteinFactor: 1.8,
  fatPercent: 30, objective: 'Lose fat · preserve muscle',
};

function food(id, name, category, grams, unit, kcal, protein, carbs, fat, note, source = '', verified = false) {
  return { id, name, category, portionGrams: grams, portionUnit: unit,
    kcal, protein, carbs, fat, note, source, verified, favorite: true };
}

// Nutrition is per 100 g. Generic foods are explicitly estimates, not exact product labels.
export const DEFAULT_FOODS = [
  food('sourdough', 'Sourdough bread', 'Bread & grains', 40, 'slice', 250, 8.3, 49, 1.5,
    'Estimated 40 g slice. Weigh your slice or replace these values with the package label.'),
  food('white-bread', 'White bread toast', 'Bread & grains', 30, 'slice', 266.67, 8.67, 49.67, 3.33,
    'Estimated 30 g slice, without butter. Toasting alone does not add calories.'),
  food('beef-cooked', 'Beef tenderloin · cooked', 'Protein', 100, 'serving', 200, 29.8, 0, 8.4,
    'Estimated 240 kcal per 120 g cooked beef. Trim and cooking change the values. Log cooking oil separately.'),
  food('beef-raw', 'Beef tenderloin · raw', 'Protein', 100, 'serving', 150, 21, 0, 7.2,
    'Approximate lean raw beef. Use the raw entry only when the weight was measured before cooking.'),
  food('egg', 'Large egg', 'Protein', 50, 'egg', 144, 12.6, 0.72, 9.5,
    'One large egg, about 50 g edible weight: 72 kcal. Oil, butter and other ingredients are separate.'),
  food('olive-oil', 'Olive oil', 'Extras', 13.5, 'tbsp', 884, 0, 0, 100,
    '1 tbsp ≈ 13.5 g; 1 tsp ≈ 4.5 g; 1 mL ≈ 0.9 g. Count the amount consumed, including oil in the food.'),
  food('sun-tomato', 'Mini sun-dried tomato', 'Extras', 4, 'piece', 250, 10, 37.5, 7.5,
    'Estimated 10 kcal per small piece. Size and oil packing vary; edit the label for yours.'),
  food('kinder-small', 'Kinder Chocolate · 12.5 g', 'Snacks', 12.5, 'bar', 566, 8.7, 53.5, 35,
    'Official small-bar label. The 21 g bar is a separate entry. Check your own regional packaging.',
    'https://www.kinder.com/uk/en/kinder-chocolate', true),
  food('kinder-medium', 'Kinder Chocolate · 21 g', 'Snacks', 21, 'bar', 566, 8.7, 53.5, 35,
    'Official medium-bar label. A 21 g bar contains about 119 kcal.',
    'https://www.kinder.com/uk/en/kinder-chocolate', true),
  food('tronky', 'Kinder Tronky · 18 g', 'Snacks', 18, 'bar', 521, 9.8, 58, 28,
    'Official Middle East label: 521 kcal per 100 g. An 18 g bar is 93.78 kcal. Labels can differ by country.',
    'https://www.kinder.com/me/en/kinder-tronky', true),
  food('jin-mild', 'Jin Ramyeon · mild', 'Bread & grains', 120, 'packet', 416.6667, 10, 65.8333, 12.5,
    'Starter estimate for a 120 g packet: 500 kcal, 12 g protein, 79 g carbs, 15 g fat. Recipes vary; verify your packet. Eggs and oil are separate.'),
  food('tuna', 'Tuna in water · drained', 'Protein', 100, 'serving', 116, 25.5, 0, 0.8,
    'Generic estimate for drained tuna in water. Oil-packed tuna needs a different label.'),
  food('salmon-raw', 'Salmon · raw', 'Protein', 100, 'serving', 208, 20.4, 0, 13.4,
    'Generic raw Atlantic salmon estimate. Use your actual raw weight; no added oil included.'),
  food('salmon-cooked', 'Salmon · cooked', 'Protein', 100, 'serving', 206, 22.1, 0, 12.4,
    'Generic cooked Atlantic salmon estimate, without added oil. Species and cooking change the values.'),
  food('chicken', 'Chicken breast · cooked', 'Protein', 100, 'serving', 165, 31, 0, 3.6,
    'Generic skinless cooked breast estimate. Log sauces and oil separately.'),
  food('greek-yogurt', 'Greek yogurt · 0% fat', 'Dairy', 170, 'pot', 59, 10.3, 3.6, 0.4,
    'Generic plain 0% yogurt estimate. A starter 170 g pot is about 100 kcal. Check the size and label of yours.'),
  food('cream-cheese', 'Cream cheese', 'Dairy', 15, 'tbsp', 342, 6.2, 4.1, 34.4,
    'Generic full-fat cream cheese estimate; light varieties differ.'),
  food('feta', 'Feta cheese', 'Dairy', 30, 'serving', 265, 14.2, 3.9, 21.5,
    'Generic feta estimate. A 30 g portion is about 80 kcal.'),
  food('pasta', 'Pasta · cooked', 'Bread & grains', 150, 'serving', 158, 5.8, 30.9, 0.9,
    'Plain cooked pasta. Log sauce and cheese separately. Do not use this for dry pasta weight.'),
  food('bolognese', 'Pasta bolognese', 'Bread & grains', 300, 'bowl', 150, 8, 17, 5.5,
    'Rough recipe estimate, including sauce. Recipes vary substantially; save your own food entry for better accuracy.'),
  food('rice', 'White rice · cooked', 'Bread & grains', 150, 'serving', 130, 2.7, 28.2, 0.3,
    'Generic plain cooked rice estimate. No oil or butter included.'),
  food('oats', 'Oats · dry', 'Bread & grains', 40, 'serving', 379, 13.2, 67.7, 6.5,
    'Generic dry oats estimate. Milk and toppings are separate.'),
  food('kiwi', 'Kiwi · green', 'Fruit', 75, 'fruit', 61, 1.1, 14.7, 0.5,
    'Generic edible fruit estimate. Weigh without the peel if you do not eat it.'),
  food('dragon-fruit', 'Dragon fruit', 'Fruit', 150, 'half fruit', 60, 1.2, 13, 0.1,
    'Generic estimate; a half fruit is provisionally 150 g of edible flesh. Actual size varies.'),
  food('banana', 'Banana', 'Fruit', 118, 'fruit', 89, 1.1, 22.8, 0.3,
    'Generic edible weight estimate for a medium banana, without the peel.'),
  food('chia', 'Chia seeds', 'Extras', 12, 'tbsp', 486, 16.5, 42.1, 30.7,
    'Generic estimate. Total carbs include fiber; the tracker does not use net carbs.'),
  food('garlic-cracker', 'Garlic crackers', 'Snacks', 20, 'serving', 440, 8, 67, 15,
    'Approximate starter entry. Use the label for your brand and weigh the portion.'),
];

export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(x => x.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function ageAt(birthDate, date = todayKey()) {
  if (!isDateKey(birthDate) || !isDateKey(date)) throw new Error('Enter a valid birth date.');
  const [y, m, d] = date.split('-').map(Number);
  const [by, bm, bd] = birthDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function shiftDate(date, count) {
  if (!isDateKey(date)) throw new Error('Choose a valid date.');
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

function numberIn(value, min, max, label) {
  if (value === '' || value === null || value === undefined) throw new Error(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function validateProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('Profile is missing.');
  const age = ageAt(value.birthDate);
  if (age < 18 || age > 100) throw new Error('This tracker’s energy formula is for adults aged 18–100.');
  if (!['female', 'male'].includes(value.sex)) throw new Error('Choose a formula sex setting.');
  if (!['manual', 'calculated'].includes(value.calorieMode)) throw new Error('Choose a calorie mode.');
  const p = {
    ...DEFAULT_PROFILE,
    name: String(value.name || 'You').slice(0, 40), birthDate: value.birthDate, sex: value.sex,
    height: numberIn(value.height, 100, 230, 'Height'), weight: numberIn(value.weight, 30, 250, 'Current weight'),
    startWeight: numberIn(value.startWeight ?? value.weight, 30, 250, 'Starting weight'),
    goalWeight: numberIn(value.goalWeight, 30, 250, 'Goal weight'),
    activity: numberIn(value.activity, 1.2, 1.9, 'Activity multiplier'),
    calorieMode: value.calorieMode, calories: numberIn(value.calories, 1200, 4000, 'Daily budget'),
    deficit: numberIn(value.deficit, 0, 20, 'Deficit'),
    proteinFactor: numberIn(value.proteinFactor, 1.4, 2.2, 'Protein factor'),
    fatPercent: numberIn(value.fatPercent, 20, 35, 'Fat percentage'),
  };
  const bmiGoal = p.goalWeight / (p.height / 100) ** 2;
  if (bmiGoal < 18.5) throw new Error('This adult tracker does not set weight-loss goals below BMI 18.5.');
  return p;
}

export function calculateGoals(profile, date = todayKey(), overrideCalories = null) {
  const p = validateProfile(profile);
  const age = ageAt(p.birthDate, date);
  const rmr = 10 * p.weight + 6.25 * p.height - 5 * age + (p.sex === 'male' ? 5 : -161);
  const tdee = rmr * p.activity;
  const rawCalculated = tdee * (1 - p.deficit / 100);
  const floor = p.sex === 'female' ? 1200 : 1500;
  const calculatedCalories = Math.max(floor, Math.round(rawCalculated / 25) * 25);
  const kcal = overrideCalories === null ? (p.calorieMode === 'manual' ? p.calories : calculatedCalories)
    : numberIn(overrideCalories, 1200, 4000, 'Daily budget');
  const protein = p.weight * p.proteinFactor;
  const fat = kcal * (p.fatPercent / 100) / 9;
  const carbs = (kcal - protein * 4 - fat * 9) / 4;
  if (carbs < 0) throw new Error('This calorie budget cannot accommodate your protein and fat targets.');
  return { kcal, protein, carbs, fat, rmr, tdee, age, calculatedCalories,
    calculatedFloorApplied: rawCalculated < floor,
    bmi: p.weight / (p.height / 100) ** 2,
    goalBmi: p.goalWeight / (p.height / 100) ** 2 };
}

export function validateFood(value) {
  if (!value || typeof value !== 'object') throw new Error('Food is missing.');
  const name = String(value.name ?? '').trim().slice(0, 100);
  if (!name) throw new Error('Give the food a name.');
  const f = { id: String(value.id || '').slice(0, 100), name,
    category: CATEGORIES.includes(value.category) ? value.category : 'Extras',
    portionGrams: numberIn(value.portionGrams, 0.1, 5000, 'Portion weight'),
    portionUnit: String(value.portionUnit || 'serving').trim().slice(0, 24),
    note: String(value.note || '').slice(0, 800), source: safeURL(value.source),
    verified: value.verified === true, favorite: value.favorite !== false,
    kcal: numberIn(value.kcal, 0, 1000, 'Calories per 100 g'),
    protein: numberIn(value.protein, 0, 100, 'Protein per 100 g'),
    carbs: numberIn(value.carbs, 0, 100, 'Carbs per 100 g'),
    fat: numberIn(value.fat, 0, 100, 'Fat per 100 g') };
  if (f.protein + f.carbs + f.fat > 102) throw new Error('Macros per 100 g cannot add up to more than about 100 g.');
  return f;
}

export function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

export function allowedUnits(f) {
  const values = ['portion', 'g'];
  if (f.id === 'olive-oil') values.push('tsp', 'mL');
  return values;
}

export function unitLabel(f, unit) {
  return unit === 'portion' ? f.portionUnit : unit;
}

export function portionNutrition(value, amount = 1, unit = 'portion') {
  const f = validateFood(value);
  const q = numberIn(amount, 0.01, 10000, 'Amount');
  if (!allowedUnits(f).includes(unit)) throw new Error('Choose an available portion unit.');
  const grams = unit === 'g' ? q : unit === 'tsp' ? q * 4.5 : unit === 'mL' ? q * 0.9 : q * f.portionGrams;
  if (grams > 10000) throw new Error('One food entry cannot exceed 10,000 g.');
  const result = { grams };
  for (const nutrient of NUTRIENTS) result[nutrient] = f[nutrient] * grams / 100;
  return result;
}

export function newEntry(f, amount, unit, meal = 'Other', id = crypto.randomUUID()) {
  const snapshot = validateFood(f);
  portionNutrition(snapshot, amount, unit);
  if (!MEALS.includes(meal)) throw new Error('Choose a meal.');
  return { id, foodId: snapshot.id, food: snapshot, amount: Number(amount), unit, meal };
}

export function totals(entries = []) {
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    const values = portionNutrition(e.food, e.amount, e.unit);
    for (const key of NUTRIENTS) sum[key] += values[key];
  }
  return sum;
}

export function remaining(consumed, goals) {
  const result = {};
  for (const key of NUTRIENTS) result[key] = goals[key] - consumed[key];
  return result;
}

export function progress(consumed, target) {
  return target > 0 ? Math.max(0, Math.min(100, consumed / target * 100)) : 0;
}

export function createInitialState() {
  return { version: 1, profileReady: false,
    profile: structuredClone(DEFAULT_PROFILE), foods: structuredClone(DEFAULT_FOODS),
    days: {}, weights: [], createdAt: new Date().toISOString() };
}

export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.foods) || !Array.isArray(value.weights)) throw new Error('Choose a Daily Balance backup file.');
  const profile = validateProfile(value.profile);
  calculateGoals(profile);
  if (value.foods.length > 1000 || value.weights.length > 10000) throw new Error('This backup exceeds the tracker’s record limit.');
  const foods = value.foods.map(validateFood);
  const ids = new Set();
  for (const f of foods) {
    if (!f.id || ids.has(f.id)) throw new Error('Foods must have distinct IDs.');
    ids.add(f.id);
  }
  if (!value.days || typeof value.days !== 'object' || Array.isArray(value.days) || Object.keys(value.days).length > 10000) throw new Error('Day history is invalid.');
  const days = {};
  for (const [date, day] of Object.entries(value.days)) {
    if (!isDateKey(date) || !Array.isArray(day.entries) || day.entries.length > 1000) throw new Error('Day history is invalid.');
    const entryIds = new Set();
    const entries = day.entries.map(e => {
      if (!e.id || entryIds.has(e.id)) throw new Error('Food log entries must have distinct IDs.');
      entryIds.add(e.id);
      return newEntry(e.food, e.amount, e.unit, e.meal, String(e.id).slice(0, 100));
    });
    const g = day.goals;
    let goals;
    if (g) {
      goals = { kcal: numberIn(g.kcal, 1200, 4000, 'Saved calorie goal'),
        protein: numberIn(g.protein, 1, 600, 'Saved protein goal'),
        carbs: numberIn(g.carbs, 0, 1000, 'Saved carb goal'),
        fat: numberIn(g.fat, 0, 300, 'Saved fat goal') };
      if (Math.abs(goals.protein * 4 + goals.carbs * 4 + goals.fat * 9 - goals.kcal) > 2) throw new Error('Saved macro targets do not match the calorie target.');
    }
    days[date] = { entries, ...(goals ? { goals } : {}), note: String(day.note || '').slice(0, 800) };
  }
  const weights = value.weights.map(w => {
    if (!isDateKey(w.date)) throw new Error('Weight date is invalid.');
    return { date: w.date, weight: numberIn(w.weight, 30, 250, 'Recorded weight') };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { version: 1, profileReady: value.profileReady !== false, profile, foods, days, weights, createdAt: String(value.createdAt || '') };
}

export function suggestions(foods, kcalRemaining, proteinRemaining) {
  if (kcalRemaining < 20 || proteinRemaining <= 0) return [];
  return foods.filter(f => ['Protein', 'Dairy'].includes(f.category) && f.protein >= 8)
    .map(f => ({ food: f, nutrition: portionNutrition(f) }))
    .filter(x => x.nutrition.kcal > 0 && x.nutrition.kcal <= kcalRemaining + 0.0001)
    .sort((a, b) => (b.nutrition.protein / b.nutrition.kcal) - (a.nutrition.protein / a.nutrition.kcal))
    .slice(0, 3);
}
