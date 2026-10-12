import { validatePreferences } from './preferences.js?v=9';
import { EXERCISE_DETAILS, PRESERVATION_ROUTINE, matchesStarterRoutine } from './workout-plan.js?v=9';
export { WARMUP_TEXT, PRESERVATION_ROUTINE, matchesStarterRoutine } from './workout-plan.js?v=9';

export const STORAGE_KEY = 'daily-balance-v1';
export const TIME_ZONE = 'Asia/Tashkent';
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'];
export const CATEGORIES = ['Protein', 'Bread & grains', 'Dairy', 'Snacks', 'Fruit', 'Extras'];
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];
export const WORKOUT_GOALS = [
  ['preserve', 'Muscle preservation'], ['build', 'Muscle building'],
  ['strength', 'Increase strength'], ['fitness', 'General fitness'],
];
export const WORKOUT_EXPERIENCE = [['beginner', 'Starting out'], ['regular', 'Training regularly']];
export const WORKOUT_EQUIPMENT = [['bodyweight', 'Bodyweight only'], ['dumbbells', 'Dumbbells & bodyweight'], ['gym', 'Full gym']];
export const EXERCISE_PRESETS = [
  { id:'squat', name:'Bodyweight squat', group:'Lower body', equipment:'bodyweight', compound:true, cue:'Sit back and down with control; keep your feet planted.' },
  { id:'reverse-lunge', name:'Reverse lunge', group:'Lower body', equipment:'bodyweight', compound:true, unilateral:true, cue:'Step back with control. Reps are per leg.' },
  { id:'glute-bridge', name:'Glute bridge', group:'Lower body', equipment:'bodyweight', cue:'Lift your hips without arching your lower back.' },
  { id:'calf-raise', name:'Standing calf raise', group:'Lower body', equipment:'bodyweight', cue:'Rise slowly onto your toes and lower with control.' },
  { id:'incline-push-up', name:'Incline push-up', group:'Upper push', equipment:'bodyweight', compound:true, cue:'Use a stable raised surface; keep your body in a straight line.' },
  { id:'push-up', name:'Push-up', group:'Upper push', equipment:'bodyweight', compound:true, cue:'Use a variation that lets you control every rep.' },
  { id:'prone-w-raise', name:'Prone W raise', group:'Upper pull', equipment:'bodyweight', cue:'Lie face down and gently lift your arms in a W shape.' },
  { id:'dead-bug', name:'Dead bug', group:'Core', equipment:'bodyweight', unilateral:true, cue:'Keep your lower back steady. Reps are per side.' },
  { id:'bird-dog', name:'Bird dog', group:'Core', equipment:'bodyweight', unilateral:true, cue:'Reach opposite arm and leg without rotating. Reps are per side.' },
  { id:'plank', name:'Plank', group:'Core', equipment:'bodyweight', unit:'seconds', cue:'Keep a straight line and breathe throughout the hold.' },
  { id:'goblet-squat', name:'Goblet squat', group:'Lower body', equipment:'dumbbells', compound:true, cue:'Hold one dumbbell at your chest and squat with control.' },
  { id:'dumbbell-rdl', name:'Dumbbell Romanian deadlift', group:'Lower body', equipment:'dumbbells', compound:true, cue:'Hinge at your hips; keep the weights close to your legs.' },
  { id:'dumbbell-press', name:'Dumbbell floor chest press', group:'Upper push', equipment:'dumbbells', compound:true, cue:'Lower until your upper arms gently touch the floor.' },
  { id:'dumbbell-row', name:'One-arm dumbbell row', group:'Upper pull', equipment:'dumbbells', compound:true, unilateral:true, cue:'Support your torso and pull toward your hip. Reps are per arm.' },
  { id:'shoulder-press', name:'Dumbbell shoulder press', group:'Upper push', equipment:'dumbbells', compound:true, cue:'Press overhead without leaning back.' },
  { id:'lateral-raise', name:'Dumbbell lateral raise', group:'Upper push', equipment:'dumbbells', cue:'Use a light weight and lift without swinging.' },
  { id:'biceps-curl', name:'Dumbbell biceps curl', group:'Upper pull', equipment:'dumbbells', cue:'Keep your upper arms still and lower slowly.' },
  { id:'leg-press', name:'Leg press', group:'Lower body', equipment:'gym', compound:true, cue:'Use a comfortable range and avoid locking your knees.' },
  { id:'lat-pulldown', name:'Lat pulldown', group:'Upper pull', equipment:'gym', compound:true, cue:'Pull toward your upper chest without swinging your torso.' },
  { id:'cable-row', name:'Seated cable row', group:'Upper pull', equipment:'gym', compound:true, cue:'Pull with control while keeping your torso steady.' },
  { id:'chest-press', name:'Machine chest press', group:'Upper push', equipment:'gym', compound:true, cue:'Adjust the seat so the handles sit around chest height.' },
  { id:'leg-curl', name:'Leg curl', group:'Lower body', equipment:'gym', cue:'Bend your knees with control and lower slowly.' },
  { id:'hip-abduction', name:'Side-lying hip abduction', group:'Lower body', equipment:'bodyweight', unilateral:true, cue:'Keep your hips stacked and lift the top leg with control.' },
  { id:'wall-push-up', name:'Wall or incline push-up', group:'Upper push', equipment:'bodyweight', compound:true, cue:'Start against a wall; progress to a sturdy nonslip countertop.' },
  { id:'bent-over-row', name:'Bent-over dumbbell row', group:'Upper pull', equipment:'dumbbells', compound:true, cue:'Hinge at your hips and pull the dumbbells toward your lower ribs.' },
  { id:'modified-side-plank', name:'Modified side plank', group:'Core', equipment:'bodyweight', unit:'seconds', unilateral:true, cue:'Support yourself on your forearm and bent knees.' },
  { id:'walking', name:'Comfortable walk', group:'Cardio', equipment:'bodyweight', unit:'minutes', cue:'Keep a comfortable conversational pace.' },
  { id:'mobility', name:'Gentle mobility or stretching', group:'Mobility', equipment:'bodyweight', unit:'minutes', cue:'Move your shoulders, ankles and hips gently.' },
].map(exercise=>({...exercise,unit:exercise.unit||'reps',...EXERCISE_DETAILS[exercise.id],image:`./assets/exercises/${exercise.id}.svg`}));
export const EXERCISE_GROUPS=['Lower body','Upper push','Upper pull','Core','Cardio','Mobility'];
export const DEFAULT_WORKOUT_SETTINGS = { goal:'preserve', experience:'beginner', equipment:'bodyweight', autoRepeat:true,view:'grid' };
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

export function weekDates(date) {
  if (!isDateKey(date)) throw new Error('Choose a valid workout date.');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(date, -((weekday + 6) % 7));
  return Array.from({ length:7 }, (_, i) => shiftDate(monday, i));
}

export function validateWorkoutSettings(value = DEFAULT_WORKOUT_SETTINGS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Workout settings are invalid.');
  const settings = {};
  for (const [key, options] of [['goal', WORKOUT_GOALS], ['experience', WORKOUT_EXPERIENCE], ['equipment', WORKOUT_EQUIPMENT]]) {
    if (!options.some(([id]) => id === value[key])) throw new Error(`Choose a valid workout ${key}.`);
    settings[key] = value[key];
  }
  if(value.autoRepeat!==undefined&&typeof value.autoRepeat!=='boolean')throw new Error('Weekly repeat setting is invalid.');
  settings.autoRepeat=value.autoRepeat!==false;
  if(value.view!==undefined&&!['grid','list'].includes(value.view))throw new Error('Choose grid or list calendar view.');
  settings.view=value.view||'grid';
  return settings;
}

export function validateExercise(value) {
  if(!value||!/^custom-exercise-[\w-]{1,80}$/.test(value.id))throw new Error('Custom exercise ID is invalid.');
  const name=String(value.name||'').trim().slice(0,100);
  if(!name)throw new Error('Give your exercise a name.');
  if(!EXERCISE_GROUPS.includes(value.group))throw new Error('Choose an exercise type.');
  if(!WORKOUT_EQUIPMENT.some(([key])=>key===value.equipment))throw new Error('Choose exercise equipment.');
  if(!['reps','seconds','minutes'].includes(value.unit))throw new Error('Choose reps, seconds or minutes.');
  const sets=numberIn(value.sets??2,1,10,'Default sets'),reps=numberIn(value.reps??10,1,value.unit==='seconds'?300:value.unit==='minutes'?240:100,'Default target');
  const restSeconds=numberIn(value.restSeconds??60,0,600,'Rest');
  if(![sets,reps,restSeconds].every(Number.isInteger))throw new Error('Sets, targets and rest must be whole numbers.');
  const image=String(value.image||'');
  if(image&&(image.length>350000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)))throw new Error('Use a JPEG, PNG or WebP exercise illustration.');
  return {id:value.id,name,group:value.group,equipment:value.equipment,unit:value.unit,unilateral:value.unilateral===true,
    sets,reps,restSeconds,compound:value.compound===true,instructions:String(value.instructions||'').slice(0,2500),
    muscles:String(value.muscles||'').slice(0,160),avoid:String(value.avoid||'').slice(0,1200),image,archived:value.archived===true};
}
export function exerciseCatalog(workouts) {return [...EXERCISE_PRESETS,...(workouts.exercises||[])];}
export function scheduledExercise(entry,workouts) {
  const exercise=exerciseCatalog(workouts).find(e=>e.id===entry.exerciseId)||entry.exercise;
  return {...exercise,...entry.exercise};
}
export function validateWorkoutEntry(value,catalog=EXERCISE_PRESETS) {
  if (!value || typeof value !== 'object') throw new Error('Workout exercise is missing.');
  let preset = catalog.find(e => e.id === value.exerciseId);
  let snapshot;
  if(value.exercise&&value.exerciseId.startsWith('custom-exercise-')) {
    const checked=validateExercise({...value.exercise,image:''});
    if(checked.id!==value.exerciseId)throw new Error('Exercise snapshot is invalid.');
    snapshot={id:checked.id,name:checked.name,group:checked.group,equipment:checked.equipment,unit:checked.unit,unilateral:checked.unilateral};
    preset={...preset,...snapshot};
  }
  if (!preset) throw new Error('Choose an exercise from the preset list.');
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 100) throw new Error('Workout exercise ID is invalid.');
  const sets = numberIn(value.sets, 1, 10, 'Sets');
  const max=preset.unit==='seconds'?300:preset.unit==='minutes'?240:100;
  const reps = numberIn(value.reps,1,max,'Exercise target');
  const setsMax=numberIn(value.setsMax??sets,sets,10,'Maximum sets');
  const repsMax=numberIn(value.repsMax??reps,reps,max,'Maximum target');
  const restSeconds=numberIn(value.restSeconds??(preset.unit==='minutes'?0:60),0,600,'Rest');
  if (![sets,setsMax,reps,repsMax,restSeconds].every(Number.isInteger)) throw new Error('Sets, targets and rest must be whole numbers.');
  const load = value.load === '' || value.load == null ? null : numberIn(value.load, 0, 500, 'Exercise weight');
  if (value.completed !== undefined && typeof value.completed !== 'boolean') throw new Error('Exercise completion is invalid.');
  if(preset.id.startsWith('custom-exercise-')&&!snapshot)snapshot={id:preset.id,name:preset.name,group:preset.group,equipment:preset.equipment,unit:preset.unit,unilateral:preset.unilateral};
  return { id:value.id, exerciseId:preset.id, sets,setsMax,reps,repsMax,restSeconds,load,...(snapshot?{exercise:snapshot}:{}),
    note:String(value.note || '').slice(0, 400), completed:value.completed === true };
}
export function validateSessionNote(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Session details are invalid.');
  return {title:String(value.title||'').slice(0,120),goal:String(value.goal||'').slice(0,1500),note:String(value.note||'').slice(0,2000)};
}
export const workoutConfigKey=settings=>`${settings.goal}:${settings.experience}:${settings.equipment}`;

export function validateWorkouts(value) {
  // Version 1 journals from before the planner have no workout records.
  if (value === undefined) value={settings:{...DEFAULT_WORKOUT_SETTINGS},days:{}};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Workout history is invalid.');
  const settings = validateWorkoutSettings(value.settings);
  if(value.exercises!==undefined&&(!Array.isArray(value.exercises)||value.exercises.length>200))throw new Error('Exercise library is invalid.');
  const exercises=(value.exercises||[]).map(validateExercise),catalog=[...EXERCISE_PRESETS,...exercises];
  if(new Set(exercises.map(e=>e.id)).size!==exercises.length)throw new Error('Exercise library IDs must be unique.');
  if (!value.days || typeof value.days !== 'object' || Array.isArray(value.days) || Object.keys(value.days).length > 10000) throw new Error('Workout history is invalid.');
  const days = {};
  const ids = new Set();
  for (const [date, entries] of Object.entries(value.days)) {
    if (!isDateKey(date) || !Array.isArray(entries) || entries.length > 50) throw new Error('Workout day is invalid.');
    days[date] = entries.map(value => {
      const entry = validateWorkoutEntry(value,catalog);
      if (ids.has(entry.id)) throw new Error('Workout exercises must have distinct IDs.');
      ids.add(entry.id);
      return entry;
    });
  }
  const notes={};
  if(value.notes!==undefined&&(!value.notes||typeof value.notes!=='object'||Array.isArray(value.notes)||Object.keys(value.notes).length>10000))throw new Error('Session history is invalid.');
  for(const [date,note] of Object.entries(value.notes||{})){if(!isDateKey(date))throw new Error('Session date is invalid.');notes[date]=validateSessionNote(note);}
  const skippedWeeks=value.skippedWeeks||[];
  if(!Array.isArray(skippedWeeks)||skippedWeeks.length>10000||skippedWeeks.some(date=>!isDateKey(date)||weekDates(date)[0]!==date))throw new Error('Cleared weeks are invalid.');
  let template=null;
  if(value.template!=null) {
    const t=value.template;
    if(!/^(preserve|build|strength|fitness):(beginner|regular):(bodyweight|dumbbells|gym)$/.test(t.config)||!Array.isArray(t.days)||t.days.length!==7||!Array.isArray(t.notes)||t.notes.length!==7)throw new Error('Weekly routine is invalid.');
    template={config:t.config,days:t.days.map(entries=>{if(!Array.isArray(entries)||entries.length>50)throw new Error('Weekly routine is invalid.');return entries.map(entry=>({...validateWorkoutEntry(entry,catalog),completed:false}));}),notes:t.notes.map(validateSessionNote)};
  }
  return {settings,days,exercises,notes,skippedWeeks:[...new Set(skippedWeeks)],template};
}

export function workoutSuggestion(profile, settings, exerciseId, date = todayKey(), calories = null,catalog=EXERCISE_PRESETS) {
  const preferences = validateWorkoutSettings(settings);
  const exercise = catalog.find(e => e.id === exerciseId);
  if (!exercise) throw new Error('Choose an exercise from the preset list.');
  const energy = calculateGoals(profile, date, calories);
  if(exercise.id.startsWith('custom-exercise-'))return {sets:exercise.sets,setsMax:exercise.sets,reps:exercise.reps,repsMax:exercise.reps,restSeconds:exercise.restSeconds,load:null,energy,reducedVolume:false};
  const ratio = energy.kcal / energy.tdee;
  // These are conservative planning heuristics, not a strength prediction.
  let sets = { preserve:3, build:4, strength:3, fitness:2 }[preferences.goal];
  if (preferences.experience === 'beginner') sets = Math.min(sets, 3);
  const reducedVolume = ratio < 0.9 && sets > 2;
  if (reducedVolume) sets = Math.max(2, sets - 1);
  const reps = exercise.unit==='minutes'? (exercise.id==='mobility'?5:20):exercise.unit === 'seconds' ? (preferences.experience === 'beginner' ? 20 : 30)
    : preferences.goal === 'strength' && exercise.compound ? (preferences.experience === 'beginner' ? 8 : 5)
    : exercise.group === 'Core' ? 8 : preferences.goal === 'fitness' ? 12 : exercise.compound ? 10 : 12;
  return { sets:exercise.unit==='minutes'?1:sets,reps,load:null,restSeconds:exercise.unit==='minutes'?0:60,energy,reducedVolume };
}

export function starterWeek(settings,date,existing={},earliest=todayKey(),template=null) {
  const dates=weekDates(date),days={},notes={};
  const personal=template?.config===workoutConfigKey(settings)?template:null;
  if(!personal&&!matchesStarterRoutine(settings))return {days,notes};
  dates.forEach((day,index)=>{
    if(day<earliest||existing[day]?.length)return;
    days[day]=personal?personal.days[index].map(entry=>({...entry,id:crypto.randomUUID(),completed:false})):PRESERVATION_ROUTINE[index].entries.map(([exerciseId,sets,reps,repsMax,restSeconds,setsMax=sets])=>validateWorkoutEntry({id:crypto.randomUUID(),exerciseId,sets,setsMax,reps,repsMax,restSeconds,load:null,completed:false}));
    notes[day]=validateSessionNote(personal?personal.notes[index]:PRESERVATION_ROUTINE[index]);
  });
  return {days,notes};
}

export function suggestWorkoutWeek(profile, settings, date, nutritionDays = {}, existing = {}, earliest = todayKey()) {
  validateWorkoutSettings(settings);
  if(matchesStarterRoutine(settings))return starterWeek(settings,date,existing,earliest).days;
  const dates = weekDates(date);
  const sessions = settings.experience === 'beginner' ? [0, 3] : [0, 2, 4];
  const programs = {
    bodyweight:[['squat','incline-push-up','prone-w-raise','glute-bridge','dead-bug'], ['reverse-lunge','push-up','prone-w-raise','calf-raise','plank']],
    dumbbells:[['goblet-squat','dumbbell-press','dumbbell-row','dumbbell-rdl','dead-bug'], ['reverse-lunge','shoulder-press','dumbbell-row','glute-bridge','plank']],
    gym:[['leg-press','chest-press','lat-pulldown','leg-curl','dead-bug'], ['goblet-squat','shoulder-press','cable-row','dumbbell-rdl','plank']],
  };
  const result = {};
  sessions.forEach((offset, i) => {
    const day = dates[offset];
    if (day < earliest || existing[day]?.length) return;
    result[day] = programs[settings.equipment][i % 2].map(exerciseId => {
      const target = workoutSuggestion(profile, settings, exerciseId, day, nutritionDays[day]?.goals?.kcal ?? null);
      return validateWorkoutEntry({ id:crypto.randomUUID(), exerciseId, ...target, completed:false });
    });
  });
  return result;
}

export function copyWorkoutWeek(days, date, earliest = todayKey(),catalog=EXERCISE_PRESETS) {
  const result = {};
  for (const source of weekDates(date)) {
    const target = shiftDate(source, 7);
    if (target < earliest || days[target]?.length || !days[source]?.length) continue;
    result[target] = days[source].map(entry => validateWorkoutEntry({ ...entry, id:crypto.randomUUID(), completed:false },catalog));
  }
  return result;
}

export function clearWorkoutSchedule(workouts,scope,date) {
  if(!['day','week','all'].includes(scope))throw new Error('Choose a valid clear option.');
  const result=structuredClone(workouts),dates=scope==='all'?new Set([...Object.keys(result.days),...Object.keys(result.notes)]):new Set(scope==='week'?weekDates(date):[date]);
  if(scope!=='all'&&!isDateKey(date))throw new Error('Choose a valid date.');
  for(const day of dates){delete result.days[day];delete result.notes[day];}
  if(scope==='all'){result.settings.autoRepeat=false;result.skippedWeeks=[];}
  else result.skippedWeeks=[...new Set([...result.skippedWeeks,weekDates(date)[0]])];
  return result;
}

export function createInitialState() {
  return { version: 1, profileReady: false,
    profile: structuredClone(DEFAULT_PROFILE), foods: structuredClone(DEFAULT_FOODS),
    days: {}, weights: [], workouts:validateWorkouts(), preferences:validatePreferences(), createdAt: new Date().toISOString() };
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
  return { version: 1, profileReady: value.profileReady !== false, profile, foods, days, weights,
    workouts:validateWorkouts(value.workouts), preferences:validatePreferences(value.preferences), createdAt: String(value.createdAt || '') };
}

export function suggestions(foods, kcalRemaining, proteinRemaining) {
  if (kcalRemaining < 20 || proteinRemaining <= 0) return [];
  return foods.filter(f => ['Protein', 'Dairy'].includes(f.category) && f.protein >= 8)
    .map(f => ({ food: f, nutrition: portionNutrition(f) }))
    .filter(x => x.nutrition.kcal > 0 && x.nutrition.kcal <= kcalRemaining + 0.0001)
    .sort((a, b) => (b.nutrition.protein / b.nutrition.kcal) - (a.nutrition.protein / a.nutrition.kcal))
    .slice(0, 3);
}
