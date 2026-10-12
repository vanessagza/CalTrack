"""Reproduce a stalled database and lost appearance with mocked Supabase requests."""
import base64
import copy
import json
import subprocess
import time
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs,urlsplit
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
HOST='https://yryletdmkumpqfwwkpda.supabase.co'
ALICE='11111111-1111-4111-8111-111111111111'
BOB='22222222-2222-4222-8222-222222222222'
current=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createInitialState,newEntry} from './core.js';let s=createInitialState();s.profileReady=true;s.days['2026-10-12']={entries:[newEntry(s.foods[0],1,'portion','Lunch','recent-food')],note:''};console.log(JSON.stringify(s));"],cwd=ROOT))
previous=copy.deepcopy(current);previous['days']={}
previous['preferences']['theme']='dark'
previous['preferences']['palettes']['dark']['background']='#030509'
previous['preferences']['palettes']['dark']['subtext']='#ffc4dc'
previous['preferences']['typography']['body']=20
row={'user_id':ALICE,'journal':copy.deepcopy(current),'revision':1}
outage=True
reads=0
held=[]
errors=[]
def session(id):
    encode=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    token=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':id,'exp':int(time.time())+3600,'role':'authenticated'})+'.synthetic'
    return {'access_token':token,'refresh_token':'synthetic-refresh','token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'user':{'id':id,'email':'sample@example.test','aud':'authenticated','role':'authenticated'}}
def response(route,status,body):route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
def api(route):
    global reads,row
    path=urlsplit(route.request.url).path
    bearer=route.request.headers['authorization'].removeprefix('Bearer ')
    payload=bearer.split('.')[1];payload+='='*((4-len(payload)%4)%4)
    owner=json.loads(base64.urlsafe_b64decode(payload))['sub']
    if path=='/rest/v1/daily_balance_journals':
        reads+=1
        if outage:held.append(route);return
        if owner!=ALICE:response(route,200,[]);return
        select=parse_qs(urlsplit(route.request.url).query)['select'][0]
        response(route,200,[row if 'journal' in select else {'user_id':owner,'revision':row['revision']}])
    elif path=='/rest/v1/rpc/save_daily_balance_journal':
        data=route.request.post_data_json
        assert owner==ALICE
        if data['p_expected_revision']!=row['revision']:response(route,409,{'code':'40001','message':'Conflict'});return
        row={'user_id':owner,'journal':data['p_journal'],'revision':row['revision']+1}
        response(route,200,row)
    else:raise AssertionError(path)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)+'/'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1000},color_scheme='dark')
    ctx.route(HOST+'/**',api)
    # Deliver the production module with a shorter deadline for this test only.
    ctx.route(url+'cloud-sync.js?*',lambda route:route.fulfill(content_type='application/javascript',body=(ROOT/'cloud-sync.js').read_text().replace('timeoutMs=45000','timeoutMs=500')))
    cached={'journal':current,'base':current,'revision':1,'approved':True,'dirty':False,'protocol':2}
    old={'journal':previous,'base':previous,'revision':1,'approved':True,'dirty':False,'protocol':1}
    values={'daily-balance-auth':session(ALICE),'daily-balance-account-'+ALICE:cached,'daily-balance-account-'+ALICE+'-before-sync-update':old}
    ctx.add_init_script('if(!sessionStorage.getItem("initialized")){'+''.join('localStorage.setItem('+json.dumps(key)+',JSON.stringify('+json.dumps(value)+'));' for key,value in values.items())+'sessionStorage.setItem("initialized","yes");}')
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url+'#settings')
    expect(page.locator('#save-status')).to_have_text('Sync unavailable · editing paused')
    expect(page.locator('#sync-error-details')).to_contain_text('SYNC_TIMEOUT')
    assert page.evaluate('document.querySelector("#main").inert')
    count=reads
    for _ in range(5):page.evaluate('window.dispatchEvent(new Event("focus"))')
    page.wait_for_timeout(2300)
    assert reads==count
    expect(page.locator('#save-status')).to_have_text('Sync unavailable · editing paused')
    page.locator('#recover-appearance').click()
    expect(page.locator('#color-background-hex')).to_have_value('#030509')
    assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(3, 5, 9)'
    key='daily-balance-account-'+ALICE
    stored=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',key)
    assert stored['journal']['days']['2026-10-12']['entries'][0]['id']=='recent-food'
    assert stored['dirty']
    # A stale/default full cache cannot erase the independent pending appearance.
    page.evaluate('(key)=>{const c=JSON.parse(localStorage.getItem(key));c.journal.preferences=c.base.preferences;c.dirty=false;localStorage.setItem(key,JSON.stringify(c));}',key)
    page.reload()
    expect(page.locator('#save-status')).to_have_text('Sync unavailable · editing paused')
    expect(page.locator('#color-background-hex')).to_have_value('#030509')
    expect(page.locator('#text-size-body')).to_have_value('20')
    page.set_viewport_size({'width':390,'height':950})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/caltrack-sync-outage-mobile.png',full_page=True)
    for route in held:route.abort('aborted')
    held.clear();outage=False
    page.locator('#sync-lock [data-action="sync-refresh"]').click()
    expect(page.locator('#save-status')).to_have_text('Synced to your account')
    assert row['journal']['preferences']['palettes']['dark']['background']=='#030509'
    assert row['journal']['days']['2026-10-12']['entries'][0]['id']=='recent-food'
    # A different account in the same browser cannot inherit the recovered palette.
    page.evaluate('(session)=>localStorage.setItem("daily-balance-auth",JSON.stringify(session))',session(BOB))
    page.reload();expect(page.locator('#save-status')).to_have_text('Synced to your account')
    expect(page.locator('#color-background-hex')).to_have_value('#111827')
    assert not errors,errors
    browser.close()
server.shutdown();server.server_close()
print('PASS: stalled database stays paused without retries; appearance-only recovery preserves logs, survives default-cache reload, syncs after recovery and stays private to its account')
