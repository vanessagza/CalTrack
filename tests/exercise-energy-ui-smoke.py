"""Completed exercise calorie credit through editing, reloads and day navigation."""
import copy
import json
import math
import re
import subprocess
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
TODAY='2026-10-13'
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createInitialState,calculateGoals,newEntry,validateWorkoutEntry,validateExercise,exerciseCatalog} from './core.js';
let s=createInitialState();s.profileReady=true;s.preferences.theme='dark';s.preferences.palettes.dark.background='#030509';s.preferences.palettes.dark.subtext='#ffc4dc';s.preferences.typography.body=18;
s.weights=[{date:'2026-10-12',weight:65},{date:'2026-10-13',weight:70}];s.workouts.settings.autoRepeat=false;
s.workouts.exercises=[validateExercise({id:'custom-exercise-steps',name:'Gentle step practice',group:'Cardio',equipment:'bodyweight',unit:'reps',sets:3,reps:12,unilateral:true})];
const e=(id,exerciseId,sets,reps,completed=false)=>validateWorkoutEntry({id,exerciseId,sets,reps,load:null,completed},exerciseCatalog(s.workouts));
s.workouts.days={'2026-10-12':[e('past-walk','walking',1,10,true)],'2026-10-13':[e('squat-one','goblet-squat',2,10),e('walk-one','walking',1,20),e('plank-one','modified-side-plank',2,30),e('custom-one','custom-exercise-steps',3,12)],'2026-10-14':[e('wall-one','wall-push-up',2,10)]};
s.days['2026-10-13']={entries:[newEntry(s.foods.find(f=>f.id==='egg'),1,'portion','Lunch','food-one')],goals:calculateGoals(s.profile,'2026-10-13'),note:''};
console.log(JSON.stringify(s));
"""],cwd=ROOT))
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)+'/'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1050},color_scheme='dark',reduced_motion='reduce')
    ctx.add_init_script('if(!sessionStorage.getItem("initialized")){localStorage.setItem("daily-balance-v1",JSON.stringify('+json.dumps(fixture)+'));sessionStorage.setItem("initialized","yes");}')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.clock.install(time='2026-10-13T08:00:00Z')
    page.goto(url+'#today');expect(page.locator('#save-status')).to_have_text('Saved in this browser')
    def state():return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')
    def amount(selector):return float(re.search(r'[\d,.]+',page.locator(selector).inner_text()).group().replace(',',''))
    def near(actual,expected):assert abs(actual-expected)<0.11,(actual,expected)
    def day_credit():return amount('[data-workout-calorie-credit]')
    def energy(met,minutes,weight=70):return (met-1)*3.5*weight/200*minutes
    base=state()['days'][TODAY]['goals'];preferences=copy.deepcopy(state()['preferences'])
    near(amount('[data-calorie-credit]'),0);near(amount('.remaining-number'),1528)
    page.locator('[data-action="view-calorie-workouts"]').click()
    expect(page.locator('#workout-date')).to_have_value(TODAY)
    near(day_credit(),0)
    page.get_by_label('Mark Goblet squat complete',exact=True).check()
    squat=energy(5,80/60);near(day_credit(),squat)
    page.locator('[data-action="workout-food-day"]').click()
    near(amount('[data-calorie-credit]'),squat);near(amount('[data-adjusted-calories]'),1600+squat)
    near(amount('.remaining-number'),math.floor(1528+squat+0.5))
    expect(page.locator('#budget-number')).to_have_value('1600')
    assert state()['days'][TODAY]['goals']==base
    # Changing exact sets and reps updates the live preview and completed credit.
    page.locator('[data-action="view-calorie-workouts"]').click()
    page.get_by_role('button',name='Edit Goblet squat',exact=True).click()
    page.locator('#exercise-sets').fill('4');page.locator('#exercise-reps').fill('20')
    expect(page.locator('#exercise-sets-max')).to_have_value('4')
    expect(page.locator('#exercise-reps-max')).to_have_value('20')
    near(amount('#workout-energy-preview'),squat*4)
    page.get_by_role('button',name='Save changes',exact=True).click();squat*=4
    near(day_credit(),squat);assert state()['workouts']['days'][TODAY][0]['completed']
    page.get_by_label('Mark Goblet squat complete',exact=True).uncheck();near(day_credit(),0)
    page.get_by_label('Mark Goblet squat complete',exact=True).check();near(day_credit(),squat)
    page.reload();near(day_credit(),squat)
    # Minutes and seconds/side use durations; editing a completed walk changes credit.
    page.get_by_label('Mark Comfortable walk complete',exact=True).check();walk=energy(2.8,20)
    near(day_credit(),squat+walk)
    page.get_by_role('button',name='Edit Comfortable walk',exact=True).click()
    page.locator('#exercise-reps').fill('10');near(amount('#workout-energy-preview'),walk/2)
    page.get_by_role('button',name='Save changes',exact=True).click();walk/=2
    page.get_by_label('Mark Modified side plank complete',exact=True).check();plank=energy(2.8,2)
    page.get_by_label('Mark Gentle step practice complete',exact=True).check();custom=energy(3.5,3*12*2*3/60)
    credit=squat+walk+plank+custom;near(day_credit(),credit)
    expect(page.locator('.workout-detail').last).to_contain_text('estimate for this exercise type')
    # A completion on another day changes only that day's calendar credit.
    page.get_by_label('Mark Wall or incline push-up on Wednesday complete',exact=True).check()
    near(day_credit(),credit)
    expect(page.locator('[data-workout-day="2026-10-14"]')).to_contain_text('+2.2 kcal added')
    page.locator('#workout-date').fill('2026-10-12')
    near(day_credit(),energy(2.8,10,65));near(amount('[data-workout-calorie-remaining]'),1600+energy(2.8,10,65))
    page.locator('#workout-date').fill(TODAY)
    # Repeated plans start unchecked; credit stays on the performed date.
    page.get_by_role('button',name='Copy plan to next week',exact=False).click()
    page.locator('#workout-date').fill('2026-10-20');near(day_credit(),0)
    page.locator('#workout-date').fill(TODAY);near(day_credit(),credit)
    # Editing the base budget keeps completion credits separate and persistent.
    page.locator('[data-action="workout-food-day"]').click()
    page.locator('#budget-slider').evaluate('(el)=>{el.value=1800;el.dispatchEvent(new Event("input",{bubbles:true}));}')
    near(amount('[data-adjusted-calories]'),1800+credit)
    assert state()['days'][TODAY]['goals']['kcal']==1600
    page.locator('#budget-slider').dispatch_event('change')
    assert state()['days'][TODAY]['goals']['kcal']==1800
    page.reload();near(amount('[data-adjusted-calories]'),1800+credit)
    near(amount('.remaining-number'),math.floor(1800+credit-72+0.5))
    assert state()['preferences']==preferences
    page.screenshot(path='/tmp/caltrack-exercise-calories-daily.png',full_page=True)
    # Moving a completed entry clears its checkbox; clearing and Undo update credit.
    page.locator('[data-action="view-calorie-workouts"]').click()
    page.get_by_role('button',name='Edit Gentle step practice',exact=True).click()
    page.locator('#exercise-date').fill('2026-10-14')
    page.get_by_role('button',name='Save changes',exact=True).click()
    assert not state()['workouts']['days']['2026-10-14'][-1]['completed']
    page.locator('#workout-date').fill(TODAY);credit-=custom;near(day_credit(),credit)
    page.get_by_role('button',name='Clear day',exact=True).click();near(day_credit(),0)
    page.get_by_role('button',name='Undo',exact=True).click();near(day_credit(),credit)
    page.set_viewport_size({'width':390,'height':950})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.workout-energy-summary').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/caltrack-exercise-calories-workouts-mobile.png')
    page.locator('[data-action="workout-food-day"]').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # A new historical food day keeps its own calculated base after its first save.
    past='2020-01-01'
    historical=copy.deepcopy(fixture)
    historical['profile']['calorieMode']='calculated'
    historical['days']={}
    historical['workouts']['days']={}
    history_ctx=browser.new_context()
    history_ctx.add_init_script('if(!sessionStorage.getItem("initialized")){localStorage.setItem("daily-balance-v1",JSON.stringify('+json.dumps(historical)+'));sessionStorage.setItem("initialized","yes");}')
    history_page=history_ctx.new_page()
    history_page.on('pageerror',lambda error:errors.append(str(error)))
    history_page.clock.install(time='2026-10-13T08:00:00Z')
    history_page.goto(url+'#today')
    expect(history_page.locator('#save-status')).to_have_text('Saved in this browser')
    def history_state():return history_page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')
    expected=history_page.evaluate('''async date=>{
        const {calculateGoals,todayKey}=await import('./core.js?v=13');
        const state=JSON.parse(localStorage.getItem('daily-balance-v1'));
        return {past:calculateGoals(state.profile,date),today:calculateGoals(state.profile,todayKey())};
    }''',past)
    assert expected['past']['age']==24 and expected['today']['age']==30
    assert expected['past']['kcal']==1600 and expected['today']['kcal']==1575
    profile=copy.deepcopy(history_state()['profile'])
    history_page.locator('#selected-date').fill(past)
    expect(history_page.locator('[data-base-calories]')).to_have_text('1,600 kcal')
    assert past not in history_state()['days']
    history_page.locator('[data-action="pick-food"]').first.click()
    history_page.locator('#picker-search').fill('egg')
    history_page.locator('[data-action="food-portion"][data-id="egg"]').click()
    history_page.locator('#portion-form button[type="submit"]').click()
    expect(history_page.locator('[data-base-calories]')).to_have_text('1,600 kcal')
    assert history_state()['days'][past]['goals']['kcal']==expected['past']['kcal']
    history_page.reload()
    history_page.locator('#selected-date').fill(past)
    expect(history_page.locator('[data-base-calories]')).to_have_text('1,600 kcal')
    # A historical budget preview stays unsaved until change and never edits the profile.
    history_page.locator('#budget-slider').evaluate('(el)=>{el.value=1800;el.dispatchEvent(new Event("input",{bubbles:true}));}')
    expect(history_page.locator('[data-base-calories]')).to_have_text('1,800 kcal')
    assert history_state()['days'][past]['goals']['kcal']==1600
    assert history_state()['profile']==profile
    history_page.locator('#budget-slider').dispatch_event('change')
    assert history_state()['days'][past]['goals']['kcal']==1800
    assert history_state()['profile']==profile
    history_page.reload()
    history_page.locator('#selected-date').fill(past)
    expect(history_page.locator('[data-base-calories]')).to_have_text('1,800 kcal')
    expect(history_page.locator('.remaining-number')).to_have_text('1,728 kcal')
    assert history_state()['profile']==profile
    assert not errors,errors
    browser.close()
server.shutdown();server.server_close()
print('PASS: completed-only calorie credits, editing/preview, timed and custom exercise units, separate dates/weights, copying, moving, clearing/Undo, base budgets, historical calculated budgets, reloads, appearance and mobile layout')
