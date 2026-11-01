"""Observed goal timelines and temporary what-if controls in the browser."""
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
TODAY = '2026-11-01'
fixtures = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState,calculateGoals,newEntry,validateFood,validateProfile,shiftDate} from './core.js';
const base=createInitialState();
base.profileReady=true;base.preferences.theme='dark';base.workouts.settings.autoRepeat=false;
base.profile=validateProfile({...base.profile,birthDate:'1996-01-01',height:170,
  weight:78,startWeight:80,goalWeight:75,activity:1.55,calories:1900,calorieMode:'manual'});
base.weights=[{date:'2026-10-04',weight:80},{date:'2026-10-18',weight:79},
  {date:'2026-11-01',weight:78},{date:'2026-11-08',weight:30}];
const food=validateFood({id:'forecast-test-food',name:'Forecast test label',category:'Extras',
  portionGrams:100,portionUnit:'portion',kcal:100,protein:10,carbs:10,fat:2,
  note:'Browser fixture',favorite:true});
base.foods.push(food);base.days={};
for(let i=0;i<7;i++){
  const date=shiftDate('2026-10-25',i);
  base.days[date]={entries:[newEntry(food,1800,'g','Other','closed-'+date)],
    goals:calculateGoals(base.profile,date),note:'Keep this saved day'};
}
for(const [date,kcal] of [['2026-11-01',500],['2026-11-04',9000]])
  base.days[date]={entries:[newEntry(food,kcal,'g','Other','excluded-'+date)],
    goals:calculateGoals(base.profile,date),note:'Not a closed day'};
base.intakeClosedThrough='2026-10-31';
const composition=structuredClone(base);
composition.profile=validateProfile({...base.profile,goalMode:'composition',weight:80,startWeight:80,
  bodyFatPercent:28,startBodyFatPercent:30,goalBodyFatPercent:25,
  muscleMass:31,startMuscleMass:30,goalMuscleMass:34});
composition.weights=[
  {date:'2026-10-04',weight:80,bodyFatPercent:30,muscleMass:30},
  {date:'2026-10-18',weight:80,bodyFatPercent:29,muscleMass:30.5},
  {date:'2026-11-01',weight:80,bodyFatPercent:28,muscleMass:31},
  {date:'2026-11-08',weight:80,bodyFatPercent:3,muscleMass:60}];
const emptyWeight=structuredClone(base);emptyWeight.weights=[];emptyWeight.days={};emptyWeight.intakeClosedThrough=null;
const emptyComposition=structuredClone(composition);emptyComposition.weights=[];emptyComposition.days={};emptyComposition.intakeClosedThrough=null;
console.log(JSON.stringify({weight:base,composition,emptyWeight,emptyComposition}));
"""
], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'


def numeric_text(page, selector):
    text = page.locator(selector).inner_text()
    match = re.search(r'[\d,.]+', text)
    assert match, (selector, text)
    return float(match.group().replace(',', ''))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    contexts = []
    errors = []

    def open_fixture(name):
        context = browser.new_context(viewport={'width':1440, 'height':1050},
                                      color_scheme='dark', reduced_motion='reduce')
        contexts.append(context)
        context.add_init_script('if(!sessionStorage.getItem("forecast-test-ready")){'
            'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixtures[name]) + '));'
            'sessionStorage.setItem("forecast-test-ready","yes");}')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time=TODAY + 'T08:00:00Z')
        page.goto(url + '#goals')
        expect(page.locator('#save-status')).to_have_text('Saved in this browser')
        expect(page.locator('#goal-forecast')).to_be_visible()
        return page

    def saved(page):
        return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')

    def status(page, kind, value):
        expect(page.locator(f'[data-forecast-{kind}-status]')).to_have_attribute('data-status', value)

    page = open_fixture('weight')
    original = saved(page)
    status(page, 'history', 'estimated')
    assert numeric_text(page, '[data-forecast-history-days]') == 42
    # Only seven finished days contribute: today's incomplete and future logs stay out.
    expect(page.locator('#forecast-calories')).to_have_value('1800')
    status(page, 'scenario', 'estimated')
    default_days = numeric_text(page, '[data-forecast-scenario-days]')
    page.locator('#forecast-calories').fill('1500')
    faster_days = numeric_text(page, '[data-forecast-scenario-days]')
    assert faster_days < default_days, (default_days, faster_days)
    expect(page.locator('[data-forecast-difference]')).to_contain_text('sooner')
    page.locator('[data-forecast-reset]').click()
    expect(page.locator('#forecast-calories')).to_have_value('1800')
    assert numeric_text(page, '[data-forecast-scenario-days]') == default_days
    page.locator('#forecast-activity').select_option('1.725')
    assert numeric_text(page, '[data-forecast-scenario-days]') < default_days
    assert saved(page) == original
    # Separate exercise assumptions apply only to the seated baseline.
    page.locator('#forecast-calories').fill('1500')
    page.locator('#forecast-activity').select_option('1.2')
    expect(page.locator('#forecast-exercise')).to_be_visible()
    seated_days = numeric_text(page, '[data-forecast-scenario-days]')
    page.locator('#forecast-exercise').fill('100')
    assert numeric_text(page, '[data-forecast-scenario-days]') < seated_days
    page.locator('#forecast-activity').select_option('1.55')
    expect(page.locator('#forecast-exercise')).to_be_hidden()
    assert numeric_text(page, '[data-forecast-scenario-days]') == faster_days
    assert saved(page) == original

    # Blank or invalid variables clear the previous result instead of showing stale numbers.
    page.locator('#forecast-calories').fill('')
    status(page, 'scenario', 'invalid')
    expect(page.locator('[data-forecast-scenario-days]')).to_have_text('—')
    expect(page.locator('[data-forecast-error]')).not_to_be_empty()
    assert saved(page) == original
    page.locator('[data-forecast-reset]').click()
    page.locator('#forecast-calories-range').fill('1600')
    expect(page.locator('#forecast-calories')).to_have_value('1600')
    assert numeric_text(page, '[data-forecast-scenario-days]') < default_days
    assert saved(page) == original
    page.reload()
    expect(page.locator('#forecast-calories')).to_have_value('1800')
    assert numeric_text(page, '[data-forecast-scenario-days]') == default_days
    assert saved(page) == original

    # Both routes use the same saved data; scenarios remain temporary on navigation.
    page.locator('[data-nav="history"]').click()
    status(page, 'history', 'estimated')
    assert numeric_text(page, '[data-forecast-history-days]') == 42
    page.locator('#forecast-calories').fill('1500')
    assert saved(page) == original
    page.locator('[data-nav="goals"]').click()
    expect(page.locator('#forecast-calories')).to_have_value('1800')
    assert saved(page) == original
    page.locator('#goal-forecast').scroll_into_view_if_needed()
    page.evaluate('document.activeElement.blur()')
    page.locator('#goal-forecast').screenshot(path='/tmp/forecast-desktop.png')
    page.set_viewport_size({'width':390,'height':844})
    for route in ['goals','history']:
        page.goto(url + '#' + route)
        expect(page.locator('#goal-forecast')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), route
        if route == 'history':
            page.evaluate('document.activeElement.blur()')
            page.locator('#goal-forecast').screenshot(path='/tmp/forecast-mobile.png')
    assert saved(page) == original

    # Composition progress cannot finish just because scale weight stays unchanged.
    comp = open_fixture('composition')
    comp_original = saved(comp)
    status(comp, 'history', 'estimated')
    assert numeric_text(comp, '[data-forecast-history-days]') == 84
    expect(comp.locator('[data-forecast-metric="bodyFatPercent"]')).to_contain_text('42')
    expect(comp.locator('[data-forecast-metric="muscleMass"]')).to_contain_text('84')
    expect(comp.locator('#forecast-muscle-rate')).to_have_value('0.25')
    default_muscle_result = comp.locator('[data-scenario-metric="muscleMass"]').inner_text()
    comp.locator('#forecast-calories').fill('1500')
    assert comp.locator('[data-scenario-metric="muscleMass"]').inner_text() == default_muscle_result
    assert saved(comp) == comp_original
    comp.locator('#forecast-muscle-rate').fill('')
    status(comp, 'scenario', 'insufficient')
    expect(comp.locator('[data-forecast-scenario-days]')).to_have_text('—')
    assert saved(comp) == comp_original
    comp.locator('#forecast-muscle-rate').fill('0.25')
    status(comp, 'scenario', 'estimated')
    comp.locator('#forecast-muscle-rate').fill('0.5')
    assert numeric_text(comp, '[data-forecast-scenario-days]') < 84
    assert saved(comp) == comp_original
    comp.set_viewport_size({'width':390,'height':844})
    for route in ['goals','history']:
        comp.goto(url + '#' + route)
        expect(comp.locator('#goal-forecast')).to_be_visible()
        assert comp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), route

    # Without measurements, a calorie model can estimate scale weight; it cannot invent muscle growth.
    empty = open_fixture('emptyWeight')
    status(empty, 'history', 'insufficient')
    status(empty, 'scenario', 'estimated')
    expect(empty.locator('#forecast-calories')).to_have_value('1900')
    empty_comp = open_fixture('emptyComposition')
    empty_original = saved(empty_comp)
    status(empty_comp, 'history', 'insufficient')
    expect(empty_comp.locator('#forecast-muscle-rate')).to_have_value('')
    status(empty_comp, 'scenario', 'insufficient')
    empty_comp.locator('#forecast-muscle-rate').fill('0.25')
    status(empty_comp, 'scenario', 'estimated')
    assert saved(empty_comp) == empty_original
    assert not errors, errors
    for context in contexts:
        context.close()
    browser.close()

server.shutdown()
print('PASS: observed timelines, closed-day intake, future exclusions, temporary scenario controls, '
      'independent composition estimates, missing-history states, reset/reload/navigation and mobile layout')
