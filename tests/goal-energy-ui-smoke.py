"""Goal-weight energy planning stays separate from current maintenance estimates."""
import copy
import json
import re
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-10-16'
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState,calculateGoals,newEntry,validateFood} from './core.js';
const state=createInitialState();
state.profileReady=true;state.preferences.theme='dark';state.workouts.settings.autoRepeat=false;
state.profile.activity=1.55;state.profile.calorieMode='calculated';
state.intakeClosedThrough='2026-10-15';
state.weights=[{date:'2026-10-12',weight:70}];
const food=validateFood({id:'custom-goal-energy',name:'Goal energy test food',category:'Extras',
  portionGrams:100,portionUnit:'serving',kcal:100,protein:10,carbs:10,fat:2,
  fiber:1,saturatedFat:0.5,sugar:2,addedSugar:0,sodium:10,
  note:'Browser test label',source:'',verified:false,favorite:true});
state.foods.push(food);state.days={};
for(const [date,amount] of [['2026-10-12',1800],['2026-10-14',2400]])
  state.days[date]={entries:[newEntry(food,amount,'g','Other','goal-energy-'+date)],
    goals:calculateGoals(state.profile,date),note:''};
console.log(JSON.stringify(state));
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

    def amount(selector):
        text = page.locator(selector).inner_text()
        return float(re.search(r'[\d,.]+', text).group().replace(',', ''))

    def energy_cards(goal_rmr, goal_tdee, budget):
        near(amount('[data-goal-rmr]'), goal_rmr, 0.51)
        near(amount('[data-goal-tdee]'), goal_tdee, 0.51)
        near(amount('[data-goal-calorie-budget]'), budget)
        near(amount('[data-current-rmr]'), 1451.5, 0.51)
        near(amount('[data-current-tdee]'), 2249.825, 0.51)

    def goal_line(date, reference='rmr'):
        return page.locator('[data-weekly-date="' + date + '"] [data-weekly-goal-' + reference + ']')

    def reference_lines(rmr, tdee):
        maximum = 2400 * 1.1
        positions = {}
        for reference, value in [('rmr', rmr), ('tdee', tdee)]:
            line = goal_line('2026-10-12', reference)
            near(line.get_attribute('data-kcal'), value)
            position = line.evaluate('(el)=>parseFloat(el.style.bottom)')
            near(position, value / maximum * 100)
            assert 0 < position < 100, (reference, position)
            positions[reference] = position
        assert positions['tdee'] > positions['rmr']
        chart_description = goal_line('2026-10-12').locator('..').get_attribute('aria-label')
        assert all(label in chart_description for label in ['goal weight', 'RMR', 'TDEE'])
        styles = page.evaluate('''() => ['rmr','tdee'].map(reference => {
          const style=getComputedStyle(document.querySelector('[data-weekly-date="2026-10-12"] [data-weekly-goal-'+reference+']'));
          return [style.backgroundImage,style.borderTopStyle,style.borderTopWidth,style.borderTopColor].join('|');
        })''')
        assert styles[0] != styles[1], styles
        return positions

    # Current maintenance compares real intake with the current body's expenditure.
    expect(page.locator('[data-weekly-average]')).to_have_text('2,100')
    near(amount('[data-weekly-maintenance]'), 2249.825, 0.51)
    classification = page.locator('[data-weekly-classification]').inner_text()
    expect(page.locator('[data-weekly-classification]')).to_have_attribute('data-status', 'deficit')
    expect(page.locator('#weekly-intake input')).to_have_count(0)
    original_lines = reference_lines(1401.5, 2172.325)
    original_journal = copy.deepcopy(state()['days'])
    original_weights = copy.deepcopy(state()['weights'])

    # Goal-weight RMR and TDEE drive the formula budget, with a live unsaved preview.
    page.locator('[data-nav="goals"]').click()
    energy_cards(1401.5, 2172.325, 1950)
    page.locator('#goalWeight').fill('60')
    energy_cards(1351.5, 2094.825, 1875)
    assert state()['profile']['goalWeight'] == 65
    assert state()['profile']['weight'] == 70
    page.screenshot(path='/tmp/caltrack-goal-energy-preview.png', full_page=True)
    page.locator('#profile-form button[type="submit"]').click()
    saved = state()
    assert saved['profile']['goalWeight'] == 60
    assert saved['profile']['weight'] == 70
    assert saved['weights'] == original_weights
    assert saved['intakeClosedThrough'] == '2026-10-15'
    for date, day in original_journal.items():
        assert saved['days'][date] == day
    goals = saved['days'][TODAY]['goals']
    near(goals['kcal'], 1875)
    page.reload()
    expect(page.locator('#goalWeight')).to_have_value('60')
    energy_cards(1351.5, 2094.825, 1875)

    # Both goal references move; actual deficit/maintenance stays unchanged.
    page.locator('[data-nav="today"]').click()
    expect(page.locator('[data-base-calories]')).to_have_text('1,875 kcal')
    expect(page.locator('[data-weekly-average]')).to_have_text('2,100')
    near(amount('[data-weekly-maintenance]'), 2249.825, 0.51)
    expect(page.locator('[data-weekly-classification]')).to_have_text(classification, use_inner_text=True)
    moved_lines = reference_lines(1351.5, 2094.825)
    for reference in ['rmr', 'tdee']:
        assert moved_lines[reference] < original_lines[reference], (original_lines, moved_lines)
    expect(page.locator('[data-weekly-date="2026-10-12"]')).to_have_attribute('data-status', 'included')
    expect(page.locator('.weekly-count-badge')).to_contain_text('2 / 7')
    page.screenshot(path='/tmp/caltrack-goal-energy-week.png', full_page=True)

    # Manual budgets keep the selected calories when the goal reference changes.
    page.locator('[data-nav="goals"]').click()
    page.locator('#calorieMode').select_option('manual')
    page.locator('#calories').fill('1600')
    page.locator('#goalWeight').fill('65')
    energy_cards(1401.5, 2172.325, 1950)
    expect(page.locator('#calc-preview')).to_contain_text('manually selected 1,600 kcal')
    page.locator('#profile-form button[type="submit"]').click()
    near(state()['days'][TODAY]['goals']['kcal'], 1600)
    page.reload()
    energy_cards(1401.5, 2172.325, 1950)

    for width in [768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1050})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        for selector in ['[data-goal-rmr]', '[data-goal-tdee]', '[data-current-rmr]', '[data-current-tdee]']:
            expect(page.locator(selector)).to_be_visible()
        if width == 390:
            page.screenshot(path='/tmp/caltrack-goal-energy-mobile.png', full_page=True)

    page.locator('[data-nav="today"]').click()
    reference_lines(1401.5, 2172.325)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/caltrack-goal-energy-lines-mobile.png', full_page=True)

    assert not errors, errors
    browser.close()

server.shutdown()
server.server_close()
print('PASS: live goal-weight RMR/TDEE and formula budget, current-maintenance separation, '
      'both goal-energy chart references, persistence, historical snapshots, manual budget and phone layouts')
