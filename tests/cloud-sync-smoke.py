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
from urllib.parse import urlsplit,parse_qs
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
hold_next_fetch = False
held_fetches = []
blocked_accounts = set()
requests=[]

def token(id):
    encode=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    return encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':id,'exp':int(time.time())+3600,'role':'authenticated'})+'.synthetic'

def session(id):
    return {'access_token': token(id), 'refresh_token': 'synthetic-refresh', 'token_type':'bearer',
            'expires_in':3600, 'expires_at':int(time.time())+3600, 'user':users[id]}

def response(route,status,body):
    route.fulfill(status=status,content_type='application/json',body=json.dumps(body))

def api(route):
    global hold_next_save,hold_next_fetch
    request=route.request
    path=urlsplit(request.url).path
    requests.append((path,request.method))
    bearer=request.headers.get('authorization','').removeprefix('Bearer ')
    owner=next((id for id in users if bearer==token(id)),None)
    # JWT expiry can change between requests, so identify synthetic subjects too.
    if owner is None:
        try:
            payload=bearer.split('.')[1];payload+='='*((4-len(payload)%4)%4)
            owner=json.loads(base64.urlsafe_b64decode(payload)).get('sub')
        except Exception:pass
    if owner in blocked_accounts:
        route.abort('internetdisconnected');return
    if path=='/auth/v1/otp':
        otp_requests.append({'url':request.url,'body':request.post_data_json})
        response(route,200,{})
    elif path=='/auth/v1/user':response(route,200,users[owner])
    elif path=='/auth/v1/logout':response(route,200,{})
    elif path=='/rest/v1/daily_balance_journals':
        if hold_next_fetch:
            hold_next_fetch=False;held_fetches.append((route,owner));return
        if owner not in users:response(route,403,{'code':'42501','message':'Sign in required'})
        else:
            row=rows.get(owner)
            select=parse_qs(urlsplit(request.url).query).get('select',[''])[0]
            if row and 'journal' not in select:row={k:row[k] for k in ['user_id','revision']}
            response(route,200,[row] if row else [])
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
    # Initial account loading must not allow a guest plan to overwrite the account journal.
    hold_next_fetch=True
    loading_ctx,loading=context(ALICE,guest=fixture)
    loading.locator('[data-nav="workouts"]').click()
    loading.wait_for_function('document.querySelector("#main").inert')
    expect(loading.locator('#theme-toggle')).to_be_disabled()
    loading.evaluate('document.querySelector("[data-action=suggest-workout-week]").click()')
    assert loading.evaluate('Object.keys(JSON.parse(localStorage.getItem("daily-balance-v1")).workouts.days).length')==0
    assert held_fetches
    fetch_route,owner=held_fetches.pop();response(fetch_route,200,[rows[owner]])
    synced(loading)
    assert not loading.evaluate('document.querySelector("#main").inert')
    loading_ctx.close()
    laptop_ctx,laptop=context(ALICE)
    synced(laptop);expect(laptop.locator('#sidebar-name')).to_have_text('Sample Account')
    phone_ctx,phone=context(ALICE,viewport={'width':375,'height':812})
    synced(phone)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # A second tab shares the account cache without generating save/refresh storms.
    peer=laptop_ctx.new_page();peer.on('pageerror',lambda error:errors.append(str(error)))
    peer.goto(url);synced(peer)
    writes_before=len([r for r in requests if r[0].endswith('save_daily_balance_journal')])
    hold_next_save=True
    log(laptop,'egg')
    for _ in range(100):
        if held_saves:break
        laptop.wait_for_timeout(50)
    assert held_saves,'Expected a pending upload'
    assert laptop.evaluate('document.querySelector("#main").inert')
    expect(laptop.locator('#theme-toggle')).to_be_disabled()
    held_route,owner,data=held_saves.pop()
    rows[owner]={'user_id':owner,'journal':data['p_journal'],'revision':data['p_expected_revision']+1}
    response(held_route,200,rows[owner]);synced(laptop)
    synced(peer)
    assert len([r for r in requests if r[0].endswith('save_daily_balance_journal')])==writes_before+1
    stable_requests=len(requests);peer.wait_for_timeout(500)
    assert len(requests)<=stable_requests+2
    peer.close()
    log(laptop,'olive-oil');synced(laptop)
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('#sidebar-name')).to_have_text('Sample Account')
    phone.locator('[data-nav="history"]').click()
    expect(phone.locator('.history-row')).to_have_count(1,timeout=15000)
    phone_ctx.set_offline(True)
    expect(phone.locator('#save-status')).to_have_text('Offline · editing paused',timeout=10000)
    assert phone.evaluate('document.querySelector("#main").inert')
    log(laptop,'chicken');synced(laptop)
    phone_ctx.set_offline(False);synced(phone)
    log(phone,'white-bread');synced(phone)
    entries=[entry for day in rows[ALICE]['journal']['days'].values() for entry in day['entries']]
    assert {e['food']['id'] for e in entries}=={'egg','olive-oil','white-bread','chicken'}
    phone.reload();synced(phone)
    phone.locator('[data-nav="history"]').click();expect(phone.locator('.history-row')).to_have_count(1)
    # Competing saves automatically rebase changed fields; no whole-copy choice.
    phone.locator('[data-nav="goals"]').click();phone.locator('#name').fill('Phone edit')
    hold_next_save=True
    phone.get_by_role('button',name='Save my goals',exact=True).click()
    for _ in range(100):
        if held_saves:break
        phone.wait_for_timeout(50)
    assert held_saves
    laptop.locator('[data-nav="goals"]').click();laptop.locator('#name').fill('Laptop edit')
    laptop.locator('#height').fill('180')
    laptop.get_by_role('button',name='Save my goals',exact=True).click();synced(laptop)
    held_route,owner,data=held_saves.pop();response(held_route,409,{'code':'40001','message':'Conflict'})
    synced(phone)
    assert rows[ALICE]['journal']['profile']['name']=='Phone edit'
    assert rows[ALICE]['journal']['profile']['height']==180
    assert phone.get_by_role('button',name='Use account copy',exact=True).count()==0
    laptop.evaluate('window.dispatchEvent(new Event("focus"))');synced(laptop)
    expect(laptop.locator('#sidebar-name')).to_have_text('Phone edit')
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
    synced(callback);expect(callback.locator('#sidebar-name')).to_have_text('Phone edit')
    assert 'access_token=' not in callback.url
    # Exercise targets and completion must sync, merge and survive reload too.
    laptop.locator('[data-nav="workouts"]').click()
    laptop.get_by_role('button',name='Add exercise',exact=True).first.click()
    laptop.locator('[data-action="choose-exercise"][data-id="squat"]').click()
    laptop.locator('#exercise-sets').fill('4');laptop.locator('#exercise-reps').fill('12')
    laptop.locator('#exercise-load').fill('0')
    laptop.locator('#workout-form button[type="submit"]').click();synced(laptop)
    workout_day=next(iter(rows[ALICE]['journal']['workouts']['days']))
    exercise=rows[ALICE]['journal']['workouts']['days'][workout_day][0]
    assert exercise['sets']==4 and exercise['reps']==12 and exercise['load']==0
    phone.locator('[data-nav="workouts"]').click()
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('.workout-session [data-workout-complete]')).to_have_count(1,timeout=15000)
    phone.locator('.workout-session [data-workout-complete]').check();synced(phone)
    assert rows[ALICE]['journal']['workouts']['days'][workout_day][0]['completed']
    laptop.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(laptop.locator('.workout-session [data-workout-complete]')).to_be_checked(timeout=15000)
    laptop.reload();synced(laptop)
    laptop.locator('[data-nav="workouts"]').click()
    expect(laptop.locator('.workout-session [data-workout-complete]')).to_be_checked()
    # Reloading a suggested week before upload acknowledgement keeps the dirty local journal.
    laptop.get_by_role('button',name='Next workout week',exact=True).click()
    future_day=laptop.locator('#workout-date').input_value()
    hold_next_save=True
    laptop.get_by_role('button',name='Load glutes & chest starter plan',exact=True).click()
    laptop.locator('[data-action="confirm-starter-routine"]').click()
    for _ in range(50):
        if held_saves:break
        laptop.wait_for_timeout(100)
    assert held_saves
    account_key='daily-balance-account-'+ALICE
    cached=laptop.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',account_key)
    assert cached['dirty'] and len([e for day in cached['journal']['workouts']['days'].values() for e in day])==23
    blocked_accounts.add(ALICE)
    save_route,owner,data=held_saves.pop();save_route.abort('internetdisconnected')
    laptop.reload()
    expect(laptop.locator('#save-status')).to_have_text('Offline · editing paused',timeout=15000)
    assert laptop.evaluate('document.querySelector("#main").inert')
    restored=laptop.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',account_key)
    assert len([e for day in restored['journal']['workouts']['days'].values() for e in day])==23
    blocked_accounts.remove(ALICE)
    laptop.locator('#sync-lock [data-action="sync-refresh"]').click();synced(laptop)
    laptop.locator('#workout-date').fill(future_day)
    expect(laptop.locator('.week-exercise-list li')).to_have_count(22)
    assert len([e for day in rows[ALICE]['journal']['workouts']['days'].values() for e in day])==23
    laptop.get_by_role('button',name='Clear week',exact=True).click();synced(laptop)
    laptop.reload();synced(laptop)
    laptop.locator('#workout-date').fill(future_day)
    expect(laptop.locator('.week-exercise-list li')).to_have_count(0)
    # A malformed latest cache falls back to the preceding valid local snapshot.
    laptop.evaluate('(key)=>{localStorage.setItem(key+"-recovery",localStorage.getItem(key));localStorage.setItem(key,"broken");}',account_key)
    blocked_accounts.add(ALICE);laptop.reload()
    expect(laptop.locator('#save-status')).to_have_text('Offline · editing paused',timeout=15000)
    restored=laptop.evaluate('(key)=>JSON.parse(localStorage.getItem(key+"-recovery"))',account_key)
    assert future_day not in restored['journal']['workouts']['days']
    blocked_accounts.remove(ALICE)
    laptop.locator('#sync-lock [data-action="sync-refresh"]').click();synced(laptop)
    # Personal exercise types, instructions, timed targets and completion travel with the account.
    laptop.locator('.workout-session [data-action="new-exercise"]').click()
    laptop.locator('#custom-name').fill('Reach and hold')
    laptop.locator('#custom-unit').select_option('seconds')
    laptop.locator('#custom-reps').fill('45')
    laptop.locator('#custom-instructions').fill('Reach gently and hold while breathing normally.')
    laptop.get_by_role('button',name='Save exercise type',exact=True).click();synced(laptop)
    custom_id=rows[ALICE]['journal']['workouts']['exercises'][0]['id']
    laptop.locator('#workout-date').fill(workout_day)
    laptop.locator('.workout-session [data-action="pick-exercise"]').click()
    laptop.locator('[data-action="choose-exercise"][data-id="'+custom_id+'"]').click()
    laptop.locator('#workout-form button[type="submit"]').click()
    laptop.get_by_label('Mark Reach and hold complete',exact=True).check();synced(laptop)
    assert rows[ALICE]['journal']['workouts']['days'][workout_day][-1]['reps']==45
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.get_by_label('Mark Reach and hold complete',exact=True)).to_be_checked(timeout=15000)
    expect(phone.locator('.workout-detail').last).to_contain_text('hold while breathing normally')
    # Appearance settings belong to the account and merge individual controls.
    laptop.locator('[data-nav="settings"]').click()
    laptop.locator('#appearance-mode').select_option('dark');synced(laptop)
    laptop.get_by_label('Background red value',exact=True).fill('4')
    # A focused palette form must not starve refresh or lose its valid preview.
    laptop.evaluate('window.dispatchEvent(new Event("focus"))');synced(laptop)
    laptop.get_by_label('Background red value',exact=True).press('Tab');synced(laptop)
    phone.locator('[data-nav="settings"]').click()
    phone.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(phone.locator('#color-background-hex')).to_have_value('#041827',timeout=15000)
    phone_ctx.set_offline(True)
    expect(phone.locator('#save-status')).to_have_text('Offline · editing paused',timeout=10000)
    assert phone.evaluate('document.querySelector("#main").inert')
    laptop.get_by_label('Background blue value',exact=True).fill('9')
    laptop.get_by_label('Background blue value',exact=True).press('Tab');synced(laptop)
    phone_ctx.set_offline(False);synced(phone)
    phone.locator('#color-subtext-hex').fill('#ffc4dc');phone.locator('#color-subtext-hex').press('Tab');synced(phone)
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
    # The reported regression: logging food keeps every saved color, size and photo.
    laptop.locator('#text-size-body').evaluate('(el)=>{el.value=20;el.dispatchEvent(new Event("change",{bubbles:true}));}')
    synced(laptop)
    before_preferences=copy.deepcopy(rows[ALICE]['journal']['preferences'])
    log(laptop,'egg');synced(laptop)
    assert rows[ALICE]['journal']['preferences']==before_preferences
    assert laptop.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(4, 24, 9)'
    laptop.reload();synced(laptop)
    assert laptop.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(4, 24, 9)'
    phone.evaluate('window.dispatchEvent(new Event("focus"))');synced(phone)
    assert phone.evaluate('JSON.parse(localStorage.getItem("daily-balance-account-'+ALICE+'")).journal.preferences')==before_preferences
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
    # Accelerate the five-minute interval only in this isolated traffic check.
    for ctx in browser.contexts:ctx.close()
    rows[BOB]={'user_id':BOB,'journal':copy.deepcopy(fixture),'revision':1}
    traffic_reads=[]
    def counted_api(route):
        if urlsplit(route.request.url).path=='/rest/v1/daily_balance_journals':
            traffic_reads.append(route.request.frame.page)
        api(route)
    traffic_ctx=browser.new_context(color_scheme='dark');traffic_ctx.route(HOST+'/**',counted_api)
    traffic_ctx.route(url+'cloud-sync.js?*',lambda route:route.fulfill(content_type='application/javascript',
        body=(ROOT/'cloud-sync.js').read_text().replace('pollMs=300000','pollMs=1000')))
    traffic_ctx.add_init_script('if(!localStorage.getItem("daily-balance-auth"))localStorage.setItem("daily-balance-auth",JSON.stringify('+json.dumps(session(BOB))+'));')
    first=traffic_ctx.new_page();first.on('pageerror',lambda error:errors.append(str(error)));first.goto(url);synced(first)
    second=traffic_ctx.new_page();second.on('pageerror',lambda error:errors.append(str(error)));second.goto(url);synced(second)
    second.wait_for_timeout(600)
    read_count=lambda:len(traffic_reads)
    start=read_count();second.wait_for_timeout(2300)
    assert 2<=read_count()-start<=3,('Tabs must share routine account checks',read_count()-start)
    traffic_ctx.close()
    # A confirmed save reaches the peer through storage without any server read.
    # Use the normal interval here so a scheduled check is outside this assertion;
    # returning to the first tab is allowed to check before editing.
    ack_ctx,first=context(BOB);ack_ctx.route(HOST+'/**',counted_api);synced(first)
    second=ack_ctx.new_page();second.on('pageerror',lambda error:errors.append(str(error)));second.goto(url);synced(second)
    first.bring_to_front();first.wait_for_timeout(250);synced(first)
    start=traffic_reads.count(second)
    log(first,'egg');synced(first)
    second.wait_for_function('Object.values(JSON.parse(localStorage.getItem("daily-balance-account-'+BOB+'")).journal.days).some(day=>day.entries.some(entry=>entry.food.id==="egg"))')
    second.evaluate('location.hash="history"')
    expect(second.locator('.history-row')).to_have_count(1)
    assert traffic_reads.count(second)==start,('Confirmed save caused an extra peer read',traffic_reads.count(second)-start)
    assert not second.evaluate('document.querySelector("#main").inert')
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: synced-only editing, automatic device conflicts, shared background checks and confirmed saves across tabs, food logging preserves colors/text/photo, interrupted RGB edits, pending upload reload, recovery, workouts, auth and account isolation (mocked Supabase API)')
