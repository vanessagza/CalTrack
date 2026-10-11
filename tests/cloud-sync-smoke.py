"""Run with Python Playwright and Chromium; Supabase calls are mocked, not live."""
import base64
import copy
import json
import subprocess
import time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HOST = 'https://yryletdmkumpqfwwkpda.supabase.co'
ALICE = '11111111-1111-4111-8111-111111111111'
BOB = '22222222-2222-4222-8222-222222222222'
CAROL = '33333333-3333-4333-8333-333333333333'
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createInitialState} from './core.js'; const s=createInitialState();s.profileReady=true;s.profile.name='Sample Account';console.log(JSON.stringify(s));"], cwd=ROOT))
users = {id: {'id': id, 'email': name+'@example.test', 'aud': 'authenticated',
              'role': 'authenticated', 'created_at': '2026-10-11T00:00:00Z'}
         for id, name in [(ALICE,'alice'), (BOB,'bob'), (CAROL,'carol')]}
rows = {ALICE: {'user_id': ALICE, 'journal': copy.deepcopy(fixture), 'revision': 1}}
otp_requests = []
errors = []
hold_next_save = False
held_saves = []

def token(id):
    encode=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    return encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':id,'exp':int(time.time())+3600,'role':'authenticated'})+'.synthetic'

def session(id):
    return {'access_token': token(id), 'refresh_token': 'synthetic-refresh', 'token_type':'bearer',
            'expires_in':3600, 'expires_at':int(time.time())+3600, 'user':users[id]}

def response(route,status,body):
    route.fulfill(status=status,content_type='application/json',body=json.dumps(body))

def api(route):
    global hold_next_save
    request=route.request
    path=urlsplit(request.url).path
    bearer=request.headers.get('authorization','').removeprefix('Bearer ')
    owner=next((id for id in users if bearer==token(id)),None)
    # JWT expiry can change between requests, so identify synthetic subjects too.
    if owner is None:
        try:
            payload=bearer.split('.')[1];payload+='='*((4-len(payload)%4)%4)
            owner=json.loads(base64.urlsafe_b64decode(payload)).get('sub')
        except Exception:pass
    if path=='/auth/v1/otp':
        otp_requests.append({'url':request.url,'body':request.post_data_json})
        response(route,200,{})
    elif path=='/auth/v1/user':response(route,200,users[owner])
    elif path=='/auth/v1/logout':response(route,200,{})
    elif path=='/rest/v1/daily_balance_journals':
        if owner not in users:response(route,403,{'code':'42501','message':'Sign in required'})
        else:response(route,200,[rows[owner]] if owner in rows else [])
    elif path=='/rest/v1/rpc/save_daily_balance_journal':
        data=request.post_data_json;expected=data['p_expected_revision']
        if hold_next_save:
            hold_next_save=False;held_saves.append((route,owner,data));return
        if owner not in users:response(route,403,{'code':'42501','message':'Sign in required'})
        elif (rows.get(owner) or {'revision':0})['revision']!=expected:
            response(route,409,{'code':'40001','message':'Conflict'})
        else:
            rows[owner]={'user_id':owner,'journal':data['p_journal'],'revision':expected+1}
            response(route,200,rows[owner])
    else:raise AssertionError('Unexpected mocked endpoint: '+path)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)+'/'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    def context(id=None,guest=None,viewport=None):
        ctx=browser.new_context(color_scheme='dark',viewport=viewport or {'width':1440,'height':1000})
        ctx.route(HOST+'/**',api)
        values={}
        if id:values['daily-balance-auth']=session(id)
        if guest:values['daily-balance-v1']=guest
        ctx.add_init_script('if(!sessionStorage.getItem("test-initialized")){'+
            ''.join('localStorage.setItem('+json.dumps(k)+',JSON.stringify('+json.dumps(v)+'));' for k,v in values.items())+
            'sessionStorage.setItem("test-initialized","yes");}')
        page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(url)
        return ctx,page
    def synced(page):expect(page.locator('#save-status')).to_have_text('Synced to your account',timeout=15000)
    def log(page,food):
        page.locator('[data-nav="foods"]').click()
        page.locator('[data-action="food-portion"][data-id="'+food+'"]').click()
        page.locator('#portion-form button[type="submit"]').click()
    laptop_ctx,laptop=context(ALICE)
    synced(laptop);expect(laptop.locator('#sidebar-name')).to_have_text('Sample Account')
    phone_ctx,phone=context(ALICE,viewport={'width':375,'height':812})
    synced(phone)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    hold_next_save=True
    log(laptop,'egg')
    for _ in range(100):
        if held_saves:break
        laptop.wait_for_timeout(50)
    assert held_saves,'Expected a pending upload'
    log(laptop,'olive-oil')
    held_route,owner,data=held_saves.pop()
    rows[owner]={'user_id':owner,'journal':data['p_journal'],'revision':data['p_expected_revision']+1}
    response(held_route,200,rows[owner]);synced(laptop)
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('#sidebar-name')).to_have_text('Sample Account')
    phone.locator('[data-nav="history"]').click()
    expect(phone.locator('.history-row')).to_have_count(1,timeout=15000)
    phone_ctx.set_offline(True)
    log(phone,'white-bread')
    expect(phone.locator('#save-status')).to_have_text('Saved here · offline',timeout=10000)
    log(laptop,'chicken');synced(laptop)
    phone_ctx.set_offline(False);synced(phone)
    entries=[entry for day in rows[ALICE]['journal']['days'].values() for entry in day['entries']]
    assert {e['food']['id'] for e in entries}=={'egg','olive-oil','white-bread','chicken'}
    phone.reload();synced(phone)
    phone.locator('[data-nav="history"]').click();expect(phone.locator('.history-row')).to_have_count(1)
    # Same-field edits must require a choice and leave the server unchanged.
    phone_ctx.set_offline(True)
    phone.locator('[data-nav="goals"]').click();phone.locator('#name').fill('Phone edit')
    phone.get_by_role('button',name='Save my goals',exact=True).click()
    laptop.locator('[data-nav="goals"]').click();laptop.locator('#name').fill('Laptop edit')
    laptop.get_by_role('button',name='Save my goals',exact=True).click();synced(laptop)
    phone_ctx.set_offline(False)
    expect(phone.get_by_role('button',name='Use account copy',exact=True)).to_be_visible(timeout=15000)
    assert rows[ALICE]['journal']['profile']['name']=='Laptop edit'
    phone.get_by_role('button',name='Use account copy',exact=True).click();synced(phone)
    expect(phone.locator('#sidebar-name')).to_have_text('Laptop edit')
    # A new account must not inherit a different account's cloud records.
    bob_ctx,bob=context(BOB)
    synced(bob);expect(bob.locator('#sidebar-name')).to_have_text('You')
    assert BOB not in rows
    # Existing browser data needs a deliberate initial upload, and stays as a guest backup.
    carol_ctx,carol=context(CAROL,guest=fixture)
    expect(carol.get_by_role('button',name='Upload this journal',exact=True)).to_be_visible(timeout=15000)
    assert CAROL not in rows
    carol.get_by_role('button',name='Upload this journal',exact=True).click();synced(carol)
    assert rows[CAROL]['journal']['profile']['name']=='Sample Account'
    carol.locator('[data-action="sync-account"]').click()
    carol.get_by_role('button',name='Sign out on this device',exact=True).click()
    expect(carol.locator('#save-status')).to_have_text('Saved in this browser')
    assert carol.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).profile.name')=='Sample Account'
    carol.locator('[data-action="sync-account"]').click();carol.locator('#sync-email').fill('carol@example.test')
    carol.get_by_role('button',name='Email me a sign-in link',exact=True).click()
    expect(carol.locator('#sync-signin-result')).to_contain_text('Check your inbox')
    assert otp_requests[-1]['body']['email']=='carol@example.test'
    # The app router must preserve the sign-in fragment until the SDK handles it.
    callback_ctx=browser.new_context();callback_ctx.route(HOST+'/**',api)
    callback=callback_ctx.new_page();callback.on('pageerror',lambda error:errors.append(str(error)))
    callback.goto(url+'#access_token='+token(ALICE)+'&refresh_token=synthetic-refresh&token_type=bearer&expires_in=3600')
    synced(callback);expect(callback.locator('#sidebar-name')).to_have_text('Laptop edit')
    assert 'access_token=' not in callback.url
    # Exercise targets and completion must sync, merge and survive reload too.
    laptop.locator('[data-nav="workouts"]').click()
    laptop.get_by_role('button',name='Add exercise',exact=True).click()
    laptop.locator('[data-action="choose-exercise"][data-id="squat"]').click()
    laptop.locator('#exercise-sets').fill('4');laptop.locator('#exercise-reps').fill('12')
    laptop.locator('#exercise-load').fill('0')
    laptop.locator('#workout-form button[type="submit"]').click();synced(laptop)
    workout_day=next(iter(rows[ALICE]['journal']['workouts']['days']))
    exercise=rows[ALICE]['journal']['workouts']['days'][workout_day][0]
    assert exercise['sets']==4 and exercise['reps']==12 and exercise['load']==0
    phone.locator('[data-nav="workouts"]').click()
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('[data-workout-complete]')).to_have_count(1,timeout=15000)
    phone.locator('[data-workout-complete]').check();synced(phone)
    assert rows[ALICE]['journal']['workouts']['days'][workout_day][0]['completed']
    laptop.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(laptop.locator('[data-workout-complete]')).to_be_checked(timeout=15000)
    laptop.reload();synced(laptop)
    laptop.locator('[data-nav="workouts"]').click()
    expect(laptop.locator('[data-workout-complete]')).to_be_checked()
    # Appearance settings belong to the account and merge individual controls.
    laptop.locator('[data-nav="settings"]').click()
    laptop.locator('#appearance-mode').select_option('dark')
    laptop.get_by_label('Background red value',exact=True).fill('4')
    laptop.get_by_label('Background red value',exact=True).press('Tab');synced(laptop)
    phone.locator('[data-nav="settings"]').click()
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('#color-background-hex')).to_have_value('#041827',timeout=15000)
    phone_ctx.set_offline(True)
    phone.locator('#color-subtext-hex').fill('#ffc4dc');phone.locator('#color-subtext-hex').press('Tab')
    expect(phone.locator('#save-status')).to_have_text('Saved here · offline',timeout=10000)
    laptop.get_by_label('Background blue value',exact=True).fill('9')
    laptop.get_by_label('Background blue value',exact=True).press('Tab');synced(laptop)
    phone_ctx.set_offline(False);synced(phone)
    preferences=rows[ALICE]['journal']['preferences']
    assert preferences['palettes']['dark']['background']=='#041809'
    assert preferences['palettes']['dark']['subtext']=='#ffc4dc'
    laptop.locator('[data-nav="settings"]').click()
    laptop.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(laptop.locator('#color-subtext-hex')).to_have_value('#ffc4dc',timeout=15000)
    png=laptop.evaluate('''() => {const c=document.createElement('canvas');c.width=c.height=20;
      const ctx=c.getContext('2d');ctx.fillStyle='#cc99bb';ctx.fillRect(0,0,20,20);
      return c.toDataURL('image/png').split(',')[1];}''')
    laptop.locator('#avatar-file').set_input_files({'name':'sample.png','mimeType':'image/png','buffer':base64.b64decode(png)})
    expect(laptop.locator('.settings-avatar img')).to_be_visible();synced(laptop)
    assert rows[ALICE]['journal']['preferences']['avatar'].startswith('data:image/jpeg;base64,')
    phone.locator('[data-nav="settings"]').click()
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('.settings-avatar img')).to_be_visible(timeout=15000)
    # Signing out and switching accounts in the same browser restores that user's settings.
    laptop.locator('[data-action="sync-account"]').first.click()
    laptop.get_by_role('button',name='Sign out on this device',exact=True).click()
    expect(laptop.locator('#save-status')).to_have_text('Saved in this browser')
    assert laptop.evaluate('document.documentElement.style.getPropertyValue("--bg")')=='#111827'
    assert laptop.locator('.settings-avatar img').count()==0
    laptop.evaluate('(session) => localStorage.setItem("daily-balance-auth",JSON.stringify(session))',session(BOB))
    laptop.reload();synced(laptop)
    laptop.locator('[data-nav="settings"]').click()
    expect(laptop.locator('#color-background-hex')).to_have_value('#111827')
    assert laptop.locator('.settings-avatar img').count()==0
    laptop.evaluate('(session) => localStorage.setItem("daily-balance-auth",JSON.stringify(session))',session(ALICE))
    laptop.reload();synced(laptop)
    laptop.locator('[data-nav="settings"]').click()
    expect(laptop.locator('#color-background-hex')).to_have_value('#041809')
    expect(laptop.locator('.settings-avatar img')).to_be_visible()
    # An older account retains the browser's existing light/dark choice on upgrade.
    legacy_journal=copy.deepcopy(fixture);del legacy_journal['preferences']
    rows[BOB]={'user_id':BOB,'journal':legacy_journal,'revision':1}
    legacy_ctx=browser.new_context(color_scheme='light');legacy_ctx.route(HOST+'/**',api)
    legacy_ctx.add_init_script('localStorage.setItem("daily-balance-theme","dark");localStorage.setItem("daily-balance-auth",JSON.stringify('+json.dumps(session(BOB))+'));')
    legacy_page=legacy_ctx.new_page();legacy_page.on('pageerror',lambda error:errors.append(str(error)))
    legacy_page.goto(url+'#settings');synced(legacy_page)
    expect(legacy_page.locator('#appearance-mode')).to_have_value('dark')
    assert legacy_page.evaluate('document.documentElement.dataset.theme')=='dark'
    assert not errors,errors
    laptop.screenshot(path='/tmp/caltrack-sync-desktop.png')
    phone.screenshot(path='/tmp/caltrack-sync-mobile.png')
    browser.close()
server.shutdown()
print('PASS: two-device and offline journal sync, workout completion, independent color merges, photo sync, account switching and preference isolation, auth flow, conflict resolution, and mobile layout (mocked Supabase API)')
