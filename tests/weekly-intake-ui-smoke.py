"""Weekly intake uses closed food days, dated maintenance and journal corrections."""
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
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState,calculateGoals,newEntry,validateFood} from './core.js';
const state=createInitialState();
state.profileReady=true;state.preferences.theme='dark';state.workouts.settings.autoRepeat=false;
state.profile.activity=1.55;state.profile.calories=1600;
state.intakeClosedThrough='2026-10-14';
const food=validateFood({id:'custom-weekly',name:'Weekly test food',category:'Extras',
  portionGrams:100,portionUnit:'serving',kcal:100,protein:10,carbs:10,fat:2,
  fiber:1,saturatedFat:0.5,sugar:2,addedSugar:0,sodium:10,
  note:'Browser test label',source:'',verified:false,favorite:true});
state.foods.push(food);state.days={};
const add=(date,kcal)=>{state.days[date]={entries:[newEntry(food,kcal,'g','Other','weekly-'+date)],
  goals:calculateGoals(state.profile,date),note:''};};
for(let day=5;day<=11;day++)add('2026-10-'+String(day).padStart(2,'0'),1800);
add('2026-10-12',1900);add('2026-10-14',2000);add('2026-10-15',2100);
console.log(JSON.stringify(state));
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
        viewport={'width': 1440, 'height': 1100}, color_scheme='dark', reduced_motion='reduce')
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

    def row(date):
        return page.locator('[data-weekly-date="' + date + '"]')

    def average(value):
        expect(page.locator('[data-weekly-average]')).to_contain_text(f'{value:,}')

    def action(name):
        page.locator('[data-action="weekly-' + name + '"]').click()

    def add_food(date, kcal):
        page.locator('#selected-date').fill(date)
        page.locator('[data-action="pick-food"]').first.click()
        page.locator('#picker-search').fill('Weekly test food')
        page.locator('[data-action="food-portion"][data-id="custom-weekly"]').click()
        page.locator('#unit').select_option('g')
        page.locator('#amount').fill(str(kcal))
        page.locator('#portion-form button[type="submit"]').click()

    weekly = page.locator('#weekly-intake')
    expect(weekly).to_be_visible()
    expect(weekly.locator('[data-weekly-date]')).to_have_count(7)
    expect(weekly.locator('input,select,textarea')).to_have_count(0)
    average(1950)
    expect(row('2026-10-12')).to_contain_text('1,900')
    expect(row('2026-10-14')).to_contain_text('2,000')
    expect(row('2026-10-15')).to_contain_text('—')
    expect(row('2026-10-16')).to_contain_text('—')
    for date, status in [('2026-10-12', 'included'), ('2026-10-13', 'missing'),
                         ('2026-10-14', 'included'), ('2026-10-15', 'open'),
                         ('2026-10-17', 'future')]:
        expect(row(date)).to_have_attribute('data-status', status)

    # An 1,800 kcal average exceeds the 1,600 kcal budget but is below maintenance.
    # Classification must use estimated TDEE, rather than the selected calorie target.
    journal_before = copy.deepcopy(state()['days'])
    action('prev')
    average(1800)
    expect(page.locator('[data-weekly-classification]')).to_contain_text('deficit', ignore_case=True)
    for day in range(5, 12):
        expect(row(f'2026-10-{day:02}')).to_contain_text('1,800')
        expect(row(f'2026-10-{day:02}')).to_have_attribute('data-status', 'included')
    page.screenshot(path='/tmp/caltrack-weekly-intake-desktop.png', full_page=True)
    expect(page.locator('#selected-date')).to_have_value(TODAY)
    action('next')
    average(1950)
    action('next')
    expect(page.locator('[data-weekly-average]')).to_contain_text('—')
    action('current')
    average(1950)
    assert state()['days'] == journal_before

    # Visiting a later date does not complete previous days; neither does a future log.
    page.locator('#selected-date').fill('2026-10-17')
    average(1950)
    assert state()['intakeClosedThrough'] == '2026-10-14'
    add_food('2026-10-20', 500)
    assert state()['intakeClosedThrough'] == '2026-10-14'
    action('current')
    average(1950)

    # The first real Friday log closes Thursday, while Friday remains excluded.
    add_food(TODAY, 900)
    average(2000)
    expect(row(TODAY)).to_contain_text('—')
    expect(row(TODAY)).to_have_attribute('data-status', 'open')
    expect(row('2026-10-15')).to_have_attribute('data-status', 'included')
    assert state()['intakeClosedThrough'] == '2026-10-15'
    page.reload()
    average(2000)

    # A real next-day log includes Friday, and closure persists after removing it.
    page.clock.set_fixed_time('2026-10-17T08:00:00Z')
    add_food('2026-10-17', 1200)
    average(1725)
    assert state()['intakeClosedThrough'] == TODAY
    page.locator('[data-action="remove-entry"]').click()
    assert not state()['days']['2026-10-17']['entries']
    assert state()['intakeClosedThrough'] == TODAY
    average(1725)
    page.reload()
    average(1725)

    # Daily totals are read-only here. Open a date's journal to correct its food.
    row('2026-10-14').locator('[data-action="weekly-open-day"]').click()
    expect(page.locator('#selected-date')).to_have_value('2026-10-14')
    page.locator('[data-action="edit-entry"][data-id="weekly-2026-10-14"]').click()
    page.locator('#amount').fill('2200')
    page.locator('#portion-form button[type="submit"]').click()
    average(1775)
    expect(row('2026-10-14')).to_contain_text('2,200')
    page.reload()
    average(1775)

    # Both sides of the maintenance comparison render their own clear result.
    for intake, expected_class in [(2250, 'maintenance'), (2600, 'surplus')]:
        alternate = copy.deepcopy(fixture)
        for day in range(5, 12):
            alternate['days'][f'2026-10-{day:02}']['entries'][0]['amount'] = intake
        alternate_context = browser.new_context(viewport={'width': 1280, 'height': 900})
        alternate_context.add_init_script(
            'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(alternate) + '));')
        alternate_page = alternate_context.new_page()
        alternate_page.on('pageerror', lambda error: errors.append(str(error)))
        alternate_page.clock.install(time=TODAY + 'T08:00:00Z')
        alternate_page.goto(url + '#today')
        expect(alternate_page.locator('#save-status')).to_have_text('Saved in this browser')
        alternate_page.locator('[data-action="weekly-prev"]').click()
        expect(alternate_page.locator('[data-weekly-average]')).to_contain_text(f'{intake:,}')
        expect(alternate_page.locator('[data-weekly-classification]')).to_contain_text(
            expected_class, ignore_case=True)
        alternate_context.close()

    # Undoing a backup restore returns to the original journal's closure marker.
    # A different journal's later marker must not silently close its open days.
    original = copy.deepcopy(fixture)
    original['days'] = {'2026-10-12': copy.deepcopy(fixture['days']['2026-10-12'])}
    original['intakeClosedThrough'] = None
    backup = copy.deepcopy(original)
    backup['intakeClosedThrough'] = '2026-10-15'
    restore_context = browser.new_context(viewport={'width': 1280, 'height': 900})
    restore_context.add_init_script(
        'if(!sessionStorage.getItem("initialized")){'
        'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(original) + '));'
        'sessionStorage.setItem("initialized","yes");}')
    restore_page = restore_context.new_page()
    restore_page.on('pageerror', lambda error: errors.append(str(error)))
    restore_page.clock.install(time=TODAY + 'T08:00:00Z')
    restore_page.goto(url + '#today')
    expect(restore_page.locator('#save-status')).to_have_text('Saved in this browser')
    expect(restore_page.locator('[data-weekly-average]')).to_have_text('—')
    expect(restore_page.locator('[data-weekly-date="2026-10-12"]')).to_have_attribute('data-status', 'open')
    restore_page.locator('[data-nav="goals"]').click()
    restore_page.locator('#backup-file').set_input_files({
        'name': 'different-journal.json', 'mimeType': 'application/json',
        'buffer': json.dumps(backup).encode()})
    restore_page.locator('[data-action="restore-confirm"]').click()
    assert restore_page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).intakeClosedThrough') == '2026-10-15'
    restore_page.get_by_role('button', name='Undo', exact=True).click()
    assert restore_page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).intakeClosedThrough') is None
    restore_page.locator('[data-nav="today"]').click()
    expect(restore_page.locator('[data-weekly-average]')).to_have_text('—')
    expect(restore_page.locator('[data-weekly-date="2026-10-12"]')).to_have_attribute('data-status', 'open')
    expect(restore_page.locator('.weekly-count-badge')).to_contain_text('0 / 7')
    restore_page.reload()
    expect(restore_page.locator('[data-weekly-average]')).to_have_text('—')
    assert restore_page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).intakeClosedThrough') is None
    restore_context.close()

    # Editing a budget cannot change recorded weekly intake or its TDEE comparison.
    classification = page.locator('[data-weekly-classification]').inner_text()
    page.locator('#budget-number').fill('1400')
    page.locator('#budget-number').dispatch_event('change')
    average(1775)
    expect(page.locator('[data-weekly-classification]')).to_have_text(classification, use_inner_text=True)
    expect(weekly.locator('input,select,textarea')).to_have_count(0)

    # On a phone the calorie circle sits above its text and all seven days fit.
    for width in [768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1050})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        expect(weekly.locator('[data-weekly-date]')).to_have_count(7)
        for day in range(12, 19):
            expect(row(f'2026-10-{day:02}')).to_be_visible()
        if width <= 390:
            assert page.evaluate('''() => {
              const ring=document.querySelector('.calorie-area .ring').getBoundingClientRect();
              const copy=document.querySelector('.calorie-copy').getBoundingClientRect();
              return copy.top>=ring.bottom-1;
            }'''), f'Calorie circle/text are not stacked at {width}'
        if width == 390:
            page.screenshot(path='/tmp/caltrack-weekly-intake-mobile.png', full_page=True)

    assert not errors, errors
    browser.close()

server.shutdown()
server.server_close()
print('PASS: closed-week averages and maintenance comparison, missing/open/future exclusions, '
      'real-day closure persistence, journal corrections, navigation and mobile layout')
