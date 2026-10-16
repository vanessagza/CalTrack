"""Secondary nutrition: saved-label migration, portions, targets and responsive UI."""
import copy
import json
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-10-16'
PAST = '2026-10-15'
KEYS = ['fiber', 'saturatedFat', 'sugar', 'addedSugar', 'sodium']
SUMMARY_KEYS = ['fiber', 'saturatedFat', 'sugar', 'sodium']
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState,calculateGoals,newEntry} from './core.js';
const keys=['fiber','saturatedFat','sugar','addedSugar','sodium'];
const s=createInitialState();
s.profileReady=true;s.preferences.theme='dark';s.workouts.settings.autoRepeat=false;
delete s.profile.insulinResistance;
for(const f of s.foods)for(const key of keys)delete f[key];
const custom={id:'custom-legacy',name:'Legacy custom snack',category:'Snacks',portionGrams:20,
  portionUnit:'piece',kcal:400,protein:8,carbs:60,fat:15,note:'My own old label',
  source:'',verified:false,favorite:true};
s.foods.push(custom);
s.days['2026-10-16']={entries:[
  newEntry(s.foods.find(f=>f.id==='oats'),40,'g','Breakfast','legacy-oats'),
  newEntry(custom,1,'portion','Snacks','legacy-custom')
],goals:calculateGoals(s.profile,'2026-10-16'),note:''};
s.days['2026-10-15']={entries:[
  newEntry(s.foods.find(f=>f.id==='egg'),1,'portion','Lunch','legacy-egg')
],goals:calculateGoals(s.profile,'2026-10-15'),note:''};
for(const day of Object.values(s.days)){
  for(const key of keys)delete day.goals[key];
  for(const entry of day.entries)for(const key of keys)delete entry.food[key];
}
console.log(JSON.stringify(s));
"""
], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'


def near(actual, expected, tolerance=0.011):
    assert abs(float(actual) - expected) < tolerance, (actual, expected)


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(
        viewport={'width': 1440, 'height': 1050}, color_scheme='dark', reduced_motion='reduce')
    context.add_init_script(
        'if(!sessionStorage.getItem("initialized")){'
        'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));'
        'sessionStorage.setItem("initialized","yes");}')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.clock.install(time=TODAY + 'T08:00:00Z')
    page.goto(url + '#today')
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')

    def state():
        return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')

    def meter(key):
        return page.locator('.secondary-nutrients [data-nutrient="' + key + '"]')

    def nutrient_input(key):
        return page.locator('#food-' + key + ',#' + key)

    def goto(route):
        page.locator('[data-nav="' + route + '"]').click()

    def edit_food(food_id):
        goto('foods')
        page.locator('[data-action="edit-food"][data-id="' + food_id + '"]').click()

    def save_food():
        page.locator('#food-form button[type="submit"]').click()
        expect(page.locator('#dialog')).not_to_be_visible()

    def assert_compact_white_meters():
        expect(page.locator('.secondary-nutrients [role="progressbar"]')).to_have_count(4)
        expect(meter('sugar').locator('[role="progressbar"]')).to_have_count(1)
        expect(meter('addedSugar').locator('[role="progressbar"]')).to_have_count(0)
        layout = page.evaluate('''() => {
          const secondary=document.querySelector('.secondary-nutrients');
          const main=[...document.querySelectorAll('.macro .progress-track')];
          const bars=[...secondary.querySelectorAll('[role="progressbar"]')];
          return {
            below:secondary.getBoundingClientRect().top>=Math.max(...main.map(el=>el.getBoundingClientRect().bottom)),
            compact:bars.every(el=>el.getBoundingClientRect().height<main[0].getBoundingClientRect().height),
            colors:bars.map(el=>getComputedStyle(el.querySelector('.progress-fill')).backgroundColor)
          };
        }''')
        assert layout['below'] and layout['compact'], layout
        assert all(color == 'rgb(255, 255, 255)' for color in layout['colors']), layout

    # An existing journal needs no manual edits to pick up starter-food research.
    expect(page.locator('.secondary-nutrients')).to_be_visible()
    for key in SUMMARY_KEYS:
        expect(meter(key)).to_be_visible()
        expect(meter(key)).to_contain_text('Known subtotal')
    assert_compact_white_meters()
    sugar_explanation = meter('sugar').locator('[role="progressbar"]').get_attribute('aria-valuetext')
    assert 'carbohydrate budget reference' in sugar_explanation
    assert 'not a recommended sugar limit' in sugar_explanation
    expect(meter('addedSugar')).to_have_count(0)

    # Save once so validation's migrated state is written to browser storage.
    goto('goals')
    expect(page.locator('#insulinResistance')).not_to_be_checked()
    page.locator('#profile-form button[type="submit"]').click()
    migrated = state()
    oats = next(food for food in migrated['foods'] if food['id'] == 'oats')
    assert oats['fiber'] > 0
    assert migrated['days'][TODAY]['entries'][0]['food']['fiber'] == oats['fiber']
    assert migrated['days'][PAST]['entries'][0]['food']['saturatedFat'] > 0
    custom = next(food for food in migrated['foods'] if food['id'] == 'custom-legacy')
    assert all(custom[key] is None for key in KEYS)
    assert all(migrated['days'][TODAY]['entries'][1]['food'][key] is None for key in KEYS)
    assert not migrated['profile']['insulinResistance']

    # An unknown-only day shows dashes and missing-data copy, never measured zeros.
    goto('today')
    page.locator('#selected-date').fill('2026-10-17')
    page.locator('[data-action="pick-food"]').first.click()
    page.locator('#picker-search').fill('Legacy custom snack')
    page.locator('[data-action="food-portion"][data-id="custom-legacy"]').click()
    expect(page.locator('#portion-nutrients')).to_contain_text('—')
    page.locator('#portion-form button[type="submit"]').click()
    for key in SUMMARY_KEYS:
        expect(meter(key)).to_contain_text('Missing data')
        expect(meter(key)).to_contain_text('—')
    page.locator('#selected-date').fill(TODAY)

    # A custom legacy label stays unknown, distinct from a measured zero.
    edit_food('custom-legacy')
    for key in KEYS:
        expect(nutrient_input(key)).to_have_value('')
    page.get_by_role('button',name='Close dialog',exact=True).click()

    # A researched preset can be edited and scales between 100 g and one portion.
    edit_food('oats')
    for key in KEYS:
        value = oats[key]
        expect(nutrient_input(key)).to_have_value('' if value is None else str(value))
    page.get_by_role('button',name='Close dialog',exact=True).click()
    page.locator('[data-action="new-food"]').click()
    page.locator('#food-name').fill('Nutrition label test')
    page.locator('#portionGrams').fill('40')
    values = {'kcal': 400, 'protein': 10, 'carbs': 60, 'fat': 15,
              'fiber': 8, 'saturatedFat': 4, 'sugar': 20, 'addedSugar': 12, 'sodium': 500}
    for key, value in values.items():
        nutrient_input(key).fill(str(value))
    page.locator('#nutritionBasis').select_option('portion')
    for key, value in values.items():
        near(nutrient_input(key).input_value(), value * 0.4)
    page.locator('#portionGrams').fill('80')
    for key, value in values.items():
        near(nutrient_input(key).input_value(), value * 0.8)
    page.locator('#portionGrams').fill('40')
    for key, value in values.items():
        near(nutrient_input(key).input_value(), value * 0.4)
    page.locator('#nutritionBasis').select_option('100')
    for key, value in values.items():
        near(nutrient_input(key).input_value(), value)
    page.locator('#nutritionBasis').select_option('portion')
    save_food()
    test_food = next(food for food in state()['foods'] if food['name'] == 'Nutrition label test')
    for key, value in values.items():
        near(test_food[key], value)
    test_id = test_food['id']

    # Portion preview, a gram unit change, and saved log entries use the same label.
    page.locator('[data-action="food-portion"][data-id="' + test_id + '"]').click()
    page.locator('#amount').fill('2')
    preview = page.locator('#portion-nutrients')
    for label in ['Fiber', 'Saturated fat', 'Total sugar', 'Added sugar', 'Sodium']:
        expect(preview).to_contain_text(label)
    expect(preview.get_by_text('Fiber', exact=True).locator('..').locator('dd')).to_have_text('6.4 g')
    expect(preview.get_by_text('Sodium', exact=True).locator('..').locator('dd')).to_have_text('400 mg')
    page.locator('#unit').select_option('g')
    near(page.locator('#amount').input_value(), 80)
    page.locator('#amount').fill('25')
    for label, value in [('Fiber', '2 g'), ('Saturated fat', '1 g'), ('Total sugar', '5 g'),
                         ('Added sugar', '3 g'), ('Sodium', '125 mg')]:
        expect(preview.get_by_text(label, exact=True).locator('..').locator('dd')).to_have_text(value)
    page.locator('#portion-form button[type="submit"]').click()
    entry = state()['days'][TODAY]['entries'][-1]
    near(entry['amount'], 25)
    assert entry['unit'] == 'g'
    for key, value in values.items():
        near(entry['food'][key], value)
    goto('today')
    assert_compact_white_meters()
    page.screenshot(path='/tmp/caltrack-nutrition-desktop.png', full_page=True)

    # Past logs retain their own label when the saved preset is changed.
    original_entry = copy.deepcopy(entry)
    edit_food(test_id)
    nutrient_input('fiber').fill('10')
    nutrient_input('addedSugar').fill('')
    save_food()
    assert state()['days'][TODAY]['entries'][-1] == original_entry
    updated = next(food for food in state()['foods'] if food['id'] == test_id)
    near(updated['fiber'], 10)
    assert updated['addedSugar'] is None

    # Insulin resistance has a persistent opt-in with the guidance in the preview.
    goto('goals')
    before_insulin = {key: state()['days'][TODAY]['goals'][key] for key in KEYS}
    page.locator('#insulinResistance').check()
    expect(page.locator('#calc-preview')).to_contain_text('insulin resistance', ignore_case=True)
    page.locator('#profile-form button[type="submit"]').click()
    assert state()['profile']['insulinResistance']
    assert {key: state()['days'][TODAY]['goals'][key] for key in KEYS} == before_insulin
    page.reload()
    expect(page.locator('#insulinResistance')).to_be_checked()
    page.locator('#insulinResistance').uncheck()
    page.locator('#profile-form button[type="submit"]').click()
    assert not state()['profile']['insulinResistance']
    page.reload()
    expect(page.locator('#insulinResistance')).not_to_be_checked()

    # Formula-mode targets respond to measurements and the resting-energy sex setting.
    page.locator('#calorieMode').select_option('calculated')
    page.locator('#sex').select_option('male')
    page.locator('#weight').fill('75')
    page.locator('#height').fill('175')
    expect(page.locator('#calc-preview')).to_contain_text('At 1,825 kcal')
    page.locator('#profile-form button[type="submit"]').click()
    formula_goals = state()['days'][TODAY]['goals']
    near(formula_goals['kcal'], 1825)
    near(formula_goals['fiber'], 25.55)
    near(formula_goals['saturatedFat'], 1825 * 0.1 / 9)
    near(formula_goals['addedSugar'], 45.625)
    assert formula_goals['sodium'] == 2300
    assert state()['days'][PAST]['goals']['kcal'] == 1600
    page.locator('#calorieMode').select_option('manual')
    page.locator('#sex').select_option('female')
    page.locator('#weight').fill('70')
    page.locator('#height').fill('170')
    page.locator('#profile-form button[type="submit"]').click()

    # A day-budget preview scales fiber/limits without committing until change.
    goto('today')
    page.locator('#budget-slider').evaluate(
        '(el)=>{el.value=2000;el.dispatchEvent(new Event("input",{bubbles:true}));}')
    expect(meter('fiber').locator('[role="progressbar"]')).to_have_attribute('aria-valuemax', '28')
    expect(meter('sugar').locator('[role="progressbar"]')).to_be_visible()
    assert state()['days'][TODAY]['goals']['kcal'] == 1600
    page.locator('#budget-slider').dispatch_event('change')
    near(state()['days'][TODAY]['goals']['fiber'], 28)
    page.reload()
    expect(meter('fiber').locator('[role="progressbar"]')).to_have_attribute('aria-valuemax', '28')

    # The new fields and meters stay usable with larger text and phone widths.
    goto('today')
    for width in [768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1050})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        for key in SUMMARY_KEYS:
            expect(meter(key)).to_be_visible()
        if width == 390:
            page.screenshot(path='/tmp/caltrack-nutrition-mobile.png', full_page=True)
    edit_food(test_id)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    for key in KEYS:
        nutrient_input(key).scroll_into_view_if_needed()
        expect(nutrient_input(key)).to_be_visible()
    assert not errors, errors
    browser.close()

server.shutdown()
server.server_close()
print('PASS: starter and snapshot migration, unknown values, per-100-g and portion scaling, '
      'saved snapshots, compact white bars, insulin-resistance setting, reload and phone layouts')
