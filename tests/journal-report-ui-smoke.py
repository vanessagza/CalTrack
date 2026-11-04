"""Exercise the History PDF-report action and render a printable PDF."""
import json
import subprocess
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-11-04'
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState,newEntry,validateWorkoutEntry} from './core.js';
const state=createInitialState();state.profileReady=true;state.profile.name='Report test';
const food={...state.foods.find(item=>item.id==='egg'),id:'report-egg',name:'Report test egg'};
state.foods.push(food);
state.days['2026-11-02']={entries:[newEntry(food,2,'portion','Breakfast','report-food-entry')],note:'Report day note',goals:{kcal:1600,protein:120,carbs:170,fat:48.9}};
state.weights=[{date:'2026-11-01',weight:70,bodyFatPercent:30,muscleMass:38}];
state.workouts.days['2026-11-03']=[validateWorkoutEntry({id:'report-workout-entry',exerciseId:'walking',sets:1,setsMax:1,reps:15,repsMax:15,restSeconds:0,load:null,note:'Report workout note',completed:true})];
state.workouts.notes['2026-11-03']={title:'Report walk',goal:'Move gently',note:'All good'};
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
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440,'height':1050}, reduced_motion='reduce')
    context.add_init_script('localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));'
        '(()=>{const open=window.open.bind(window);window.open=function(...args){const child=open(...args);'
        'if(child)child.print=()=>{child.__reportPrintCalls=(child.__reportPrintCalls||0)+1;};return child;}})();')
    page = context.new_page()
    page.clock.install(time=TODAY + 'T08:00:00Z')
    page.goto(url + '#history')
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')
    button = page.get_by_role('button', name='Export report PDF')
    expect(button).to_be_visible()
    with page.expect_popup() as popup_info:
        button.click()
    report = popup_info.value
    expect(report.locator('h1')).to_have_text('Complete history report')
    expect(report.get_by_role('heading', name='Goal timeline & saved scenario')).to_be_visible()
    expect(report.get_by_role('heading', name='Measured-history estimate')).to_be_visible()
    expect(report.get_by_text('Report test egg', exact=True).first).to_be_visible()
    expect(report.get_by_text('Report day note', exact=False)).to_be_visible()
    expect(report.get_by_text('30%', exact=False).first).to_be_visible()
    expect(report.get_by_text('Report walk', exact=False)).to_be_visible()
    expect(report.get_by_text('Report workout note', exact=False)).to_be_visible()
    report.wait_for_function('window.__reportPrintCalls > 0')
    with tempfile.NamedTemporaryFile(suffix='.pdf') as pdf:
        report.pdf(path=pdf.name, format='A4', print_background=True)
        with open(pdf.name,'rb') as saved:
            assert saved.read(5) == b'%PDF-', 'print-ready report should render as a PDF'
    assert page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).days["2026-11-02"].entries.length') == 1
    report.close()
    page.set_viewport_size({'width':320,'height':720})
    expect(button).to_be_visible()
    button_box=button.bounding_box()
    assert button_box['x'] >= 0 and button_box['x'] + button_box['width'] <= 320
    assert page.evaluate('document.documentElement.scrollWidth') <= 320
    context.close()
    browser.close()
server.shutdown()
print('PASS: History export opens complete report, starts PDF print flow and renders a valid PDF without changing journal data')
