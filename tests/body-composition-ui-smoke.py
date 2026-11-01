"""Same-weight recomposition, measurement journal and activity-credit policy in the browser."""
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
import {createInitialState,calculateGoals,newEntry,validateWorkoutEntry} from './core.js';
const s=createInitialState();
s.profileReady=true;s.preferences.theme='dark';s.workouts.settings.autoRepeat=false;
Object.assign(s.profile,{birthDate:'1996-01-01',height:170,weight:80,startWeight:80,
  goalWeight:75,activity:1.325,calorieMode:'calculated',deficit:0});
for(const key of ['goalMode','bodyFatPercent','startBodyFatPercent','goalBodyFatPercent',
  'muscleMass','startMuscleMass','goalMuscleMass'])delete s.profile[key];
s.weights=[{date:'2026-10-12',weight:80}];
s.workouts.days={["2026-10-16"]:[validateWorkoutEntry({id:'composition-walk',
  exerciseId:'walking',sets:1,reps:30,completed:false})]};
s.days={};
for(const date of ['2026-10-12','2026-10-16'])s.days[date]={
  entries:[newEntry(s.foods.find(f=>f.id==='egg'),1,'portion','Lunch','food-'+date)],
  goals:calculateGoals(s.profile,date),note:'Keep this journal entry'};
s.intakeClosedThrough='2026-10-15';
console.log(JSON.stringify(s));
"""
], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(
        viewport={'width':1440, 'height':1050}, color_scheme='dark', reduced_motion='reduce')
    context.add_init_script(
        'if(!sessionStorage.getItem("initialized")){'
        'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));'
        'sessionStorage.setItem("initialized","yes");}')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.clock.install(time=TODAY + 'T08:00:00Z')
    page.goto(url + '#goals')
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')

    def state():
        return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')

    def amount(selector):
        return float(re.search(r'[\d,.]+', page.locator(selector).inner_text()).group().replace(',', ''))

    def near(actual, expected, tolerance=0.11):
        assert abs(actual - expected) < tolerance, (actual, expected)

    def save_goals():
        page.locator('#profile-form button[type="submit"]').click()
        expect(page.locator('#profile-error')).not_to_have_class(re.compile('visible'))

    def progress(value):
        for metric in ['fat','muscle']:
            expect(page.locator(f'[data-composition-progress="{metric}"]')).to_have_text(f'{value}%')
            expect(page.locator(f'[data-composition-metric="{metric}"] [role="progressbar"]')).to_have_attribute('aria-valuenow', str(value))

    original = state()
    historical = copy.deepcopy(original['days']['2026-10-12'])
    original_entries = copy.deepcopy(original['days'][TODAY]['entries'])
    expect(page.locator('#goalMode')).to_have_value('weight')
    expect(page.locator('#activity')).to_have_value('1.325')
    assert page.locator('#activity option').count() == 11
    assert set(page.locator('#activity option').evaluate_all('(els)=>els.map(el=>el.value)')) == {
        '1.2','1.25','1.3','1.375','1.45','1.55','1.65','1.725','1.8','1.9','1.325'}
    expect(page.locator('#activity-guide')).to_contain_text('30-minute workouts 4 times a week')
    expect(page.locator('#activity-guide')).to_contain_text('1.25–1.30')
    save_goals()
    assert state()['profile']['activity'] == 1.325

    # An incomplete new mode must clear the old weight-formula preview.
    page.locator('#goalMode').select_option('composition')
    expect(page.locator('[data-composition-inputs]')).to_be_visible()
    expect(page.locator('#goalWeight')).to_be_disabled()
    expect(page.locator('[data-weight-goal]')).to_be_hidden()
    expect(page.locator('[data-goal-rmr]')).to_have_count(0)
    expect(page.locator('#calc-preview')).to_contain_text('Complete your measurements and targets')
    assert state()['profile']['goalMode'] == 'weight'
    for name, value in {
        'weight':'80', 'startWeight':'80', 'height':'170',
        'bodyFatPercent':'30', 'startBodyFatPercent':'30', 'goalBodyFatPercent':'25',
        'muscleMass':'30', 'startMuscleMass':'30', 'goalMuscleMass':'34', 'deficit':'0',
    }.items():
        page.locator('#' + name).fill(value)
    near(amount('[data-derived-goal-weight]'), 80)
    near(amount('[data-goal-rmr]'), 1666, 0.51)
    near(amount('[data-current-rmr]'), 1579.6, 0.51)
    expect(page.locator('#calc-preview')).to_contain_text('not skeletal muscle alone')
    save_goals()
    progress(0)
    saved = state()
    assert saved['profile']['goalMode'] == 'composition'
    assert saved['profile']['goalWeight'] == saved['profile']['weight'] == 80
    assert saved['days']['2026-10-12'] == historical
    assert saved['days'][TODAY]['entries'] == original_entries
    goal_energy = amount('[data-goal-tdee]')
    page.reload()
    expect(page.locator('#goalMode')).to_have_value('composition')
    expect(page.locator('#bodyFatPercent')).to_have_value('30')
    expect(page.locator('#muscleMass')).to_have_value('30')
    progress(0)

    # Logging new fat/muscle readings advances both goals at unchanged scale weight.
    page.locator('[data-nav="history"]').click()
    progress(0)
    page.locator('[data-action="log-weight"]').first.click()
    page.locator('#weight-value').fill('80')
    page.locator('#weight-body-fat').fill('27.5')
    page.locator('#weight-muscle').fill('32')
    page.locator('#weight-form button[type="submit"]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    progress(50)
    expect(page.locator('.weight-table')).to_contain_text('27.5%')
    expect(page.locator('.weight-table')).to_contain_text('32 kg')
    measured = state()
    assert measured['profile']['weight'] == measured['profile']['goalWeight'] == 80
    assert measured['profile']['bodyFatPercent'] == 27.5
    assert measured['profile']['muscleMass'] == 32
    assert measured['weights'][0] == {'date':'2026-10-12','weight':80}
    assert measured['weights'][-1] == {'date':TODAY,'weight':80,'bodyFatPercent':27.5,'muscleMass':32}
    assert measured['days']['2026-10-12'] == historical
    assert measured['days'][TODAY]['entries'] == original_entries
    page.locator('[data-nav="today"]').click()
    progress(50)
    page.locator('[data-nav="goals"]').click()
    progress(50)
    near(amount('[data-goal-tdee]'), goal_energy)
    near(amount('[data-current-rmr]'), 1622.8, 0.51)

    # Invalid composition cannot save or leave a stale numeric preview behind.
    before_invalid = state()
    page.locator('#muscleMass').fill('60')
    expect(page.locator('#profile-error')).to_contain_text('cannot exceed')
    expect(page.locator('[data-goal-rmr]')).to_have_count(0)
    page.locator('#profile-form button[type="submit"]').click()
    expect(page.locator('#profile-error')).to_contain_text('cannot exceed')
    assert state() == before_invalid
    page.locator('#muscleMass').fill('32')

    # Weight-only records stay weight-only; removing the last fat/muscle
    # record restores the starting baseline instead of retaining deleted data.
    page.locator('[data-nav="history"]').click()
    page.locator('[data-action="log-weight"]').first.click()
    page.locator('#weight-date').fill('2026-10-15')
    page.locator('#weight-value').fill('80')
    page.locator('#weight-form button[type="submit"]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    assert next(w for w in state()['weights'] if w['date'] == '2026-10-15') == {
        'date':'2026-10-15', 'weight':80}
    progress(50)
    page.locator('[data-action="delete-weight"][data-date="' + TODAY + '"]').click()
    progress(0)
    assert state()['profile']['bodyFatPercent'] == 30
    assert state()['profile']['muscleMass'] == 30
    assert all('bodyFatPercent' not in w and 'muscleMass' not in w for w in state()['weights'])
    page.locator('[data-action="log-weight"]').first.click()
    page.locator('#weight-body-fat').fill('27.5')
    page.locator('#weight-muscle').fill('32')
    page.locator('#weight-form button[type="submit"]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    progress(50)
    page.locator('[data-nav="goals"]').click()

    # Habitual activity includes usual workouts, while 1.20 credits logged work.
    page.locator('#activity').select_option('1.3')
    expect(page.locator('[data-activity-policy]')).to_contain_text('does not add a second credit')
    save_goals()
    page.locator('[data-nav="today"]').click()
    base = amount('[data-base-calories]')
    page.locator('[data-action="view-calorie-workouts"]').click()
    page.get_by_label('Mark Comfortable walk complete', exact=True).check()
    near(amount('[data-workout-calorie-credit]'), 0)
    raw_burn = amount('[data-workout-calorie-estimate]')
    assert raw_burn > 0
    expect(page.locator('.workout-energy-summary')).to_contain_text('already includes usual workouts')
    page.locator('[data-action="workout-food-day"]').click()
    near(amount('[data-calorie-credit]'), 0)
    near(amount('[data-adjusted-calories]'), base)
    page.locator('[data-nav="goals"]').click()
    page.locator('#activity').select_option('1.2')
    save_goals()
    page.locator('[data-nav="today"]').click()
    base = amount('[data-base-calories]')
    near(amount('[data-calorie-credit]'), raw_burn)
    near(amount('[data-adjusted-calories]'), base + raw_burn)

    # Existing weight mode remains editable and uses its original formula.
    page.locator('[data-nav="goals"]').click()
    before_reset = state()
    page.locator('[data-action="composition-start"]').click()
    expect(page.locator('#startBodyFatPercent')).to_have_value('27.5')
    expect(page.locator('#startMuscleMass')).to_have_value('32')
    progress(0)
    assert state() == before_reset
    page.reload()
    expect(page.locator('#startBodyFatPercent')).to_have_value('30')
    expect(page.locator('#startMuscleMass')).to_have_value('30')
    progress(50)
    page.locator('#goalMode').select_option('weight')
    expect(page.locator('[data-composition-inputs]')).to_be_hidden()
    expect(page.locator('#goalWeight')).to_be_enabled()
    page.locator('#goalWeight').fill('76.5')
    near(amount('[data-goal-rmr]'), 1516.5, 0.51)
    save_goals()
    assert state()['profile']['goalMode'] == 'weight'
    assert state()['profile']['goalWeight'] == 76.5
    expect(page.locator('[data-composition-progress]')).to_have_count(0)
    page.reload()
    expect(page.locator('#goalMode')).to_have_value('weight')
    expect(page.locator('#goalWeight')).to_have_value('76.5')

    # Composition forms, journal table and guidance fit a narrow viewport.
    page.locator('#goalMode').select_option('composition')
    save_goals()
    page.clock.run_for(4000)
    page.evaluate('document.activeElement.blur(); window.scrollTo(0,0)')
    page.screenshot(path='/tmp/composition-profile-desktop.png', full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    for route in ['goals','today','history','workouts']:
        page.goto(url + '#' + route)
        expect(page.locator('#save-status')).to_have_text('Saved in this browser')
        if route == 'goals':
            page.get_by_text('Compare all activity levels', exact=True).click()
            page.evaluate('document.activeElement.blur(); window.scrollTo(0,0)')
            page.screenshot(path='/tmp/composition-profile-mobile.png', full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), route
    assert state()['days']['2026-10-12'] == historical
    assert state()['days'][TODAY]['entries'] == original_entries
    assert not errors, errors
    browser.close()

server.shutdown()
print('PASS: same-weight fat/muscle goals and progress, live formulas, invalid-input protection, '
      'journal/reload preservation, legacy mode, activity options and workout credits, mobile layout')
