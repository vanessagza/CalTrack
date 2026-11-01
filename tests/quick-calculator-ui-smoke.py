"""The quick calculator stays inside spare header space without shifting existing content."""
import json
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-11-01'
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e', """
import {createInitialState} from './core.js';
const state=createInitialState();state.profileReady=true;state.preferences.theme='dark';state.workouts.settings.autoRepeat=false;
console.log(JSON.stringify(state));
"""
], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'


def measured(page):
    return page.evaluate('''() => {
      const selectors={heading:'.page-heading',copy:'.page-heading>div:first-child',title:'.page-heading h1',subtitle:'.heading-sub',eyebrow:'.page-heading .eyebrow',actions:'.heading-actions',date:'.date-control',add:'.heading-actions [data-action="pick-food"]',summary:'.summary-card'};
      const out={};
      for(const [name,sel] of Object.entries(selectors)) {const r=document.querySelector(sel).getBoundingClientRect();out[name]={x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};}
      const range=document.createRange();range.selectNodeContents(document.querySelector('h1'));const r=range.getBoundingClientRect();out.titleText={x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
      out.scrollWidth=document.documentElement.scrollWidth;return out;
    }''')


def same_boxes(actual, expected, label):
    for name in ['heading', 'copy', 'title', 'subtitle', 'eyebrow', 'actions', 'date', 'add', 'summary', 'titleText']:
        for key in ['x', 'y', 'width', 'height']:
            assert abs(actual[name][key] - expected[name][key]) < .1, (label, name, key, actual[name], expected[name])


def overlaps(a, b):
    return a['x'] < b['right'] - .1 and a['right'] > b['x'] + .1 and a['y'] < b['bottom'] - .1 and a['bottom'] > b['y'] + .1


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    errors = []
    for width in [1440, 1280, 1024, 768, 390, 320]:
        context = browser.new_context(viewport={'width':width, 'height':1050}, color_scheme='dark', reduced_motion='reduce')
        context.add_init_script('if(!sessionStorage.getItem("quick-test-ready")) {'
            'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));'
            'sessionStorage.setItem("quick-test-ready","yes");}')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time=TODAY + 'T08:00:00Z')
        page.goto(url + '#today')
        expect(page.locator('#save-status')).to_have_text('Saved in this browser')
        expect(page.locator('[data-quick-calculator]')).to_be_visible()
        initial = measured(page)
        # Compare against the same header with the new absolute widget and
        # its positioning class disabled. This stays reproducible without a
        # machine-specific screenshot or external coordinate snapshot.
        page.evaluate("document.querySelector('[data-quick-calculator]').hidden=true;document.querySelector('.page-heading').classList.remove('has-quick-calculator')")
        without_calculator = measured(page)
        page.evaluate("document.querySelector('.page-heading').classList.add('has-quick-calculator');document.querySelector('[data-quick-calculator]').hidden=false")
        same_boxes(initial, without_calculator, f'calculator absent {width}')
        assert initial['scrollWidth'] <= width
        trigger = page.locator('.quick-calc-trigger')
        rect = trigger.evaluate('el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}')
        for name in ['titleText', 'subtitle', 'eyebrow', 'date', 'add']:
            assert not overlaps(rect, initial[name]), (width, 'trigger overlap', name, rect, initial[name])
        saved = page.evaluate('localStorage.getItem("daily-balance-v1")')

        # Opening and operating the calculator does not change any existing header/card box.
        trigger.click()
        panel = page.locator('#quick-calc-panel')
        expect(panel).to_be_visible()
        same_boxes(measured(page), initial, f'open {width}')
        bounds = panel.bounding_box()
        assert 0 <= bounds['x'] and bounds['x'] + bounds['width'] <= width
        assert 0 <= bounds['y'] and bounds['y'] + bounds['height'] <= 1050
        expr = page.locator('#quick-calc-expression')
        expr.fill('(12 + 8) * 1.5')
        expr.press('Enter')
        expect(expr).to_have_value('30')
        expect(page.locator('.quick-calc-result')).to_have_text('30')
        expr.fill('1 / 0')
        expr.press('Enter')
        expect(page.locator('.quick-calc-error')).to_be_visible()
        expect(page.locator('.quick-calc-result')).to_have_text('—')
        page.get_by_role('button', name='Clear', exact=True).click()
        expect(page.locator('.quick-calc-error')).to_be_hidden()
        for key in ['2', '0', '0', 'Multiply', '1', '0', 'Percent', 'Equals']:
            page.get_by_role('button', name=key, exact=True).click()
        expect(expr).to_have_value('20')
        expect(page.locator('.quick-calc-result')).to_have_text('20')
        # A following operator chains from the result rather than replacing it.
        for key in ['Add', '5', 'Equals']:
            page.get_by_role('button', name=key, exact=True).click()
        expect(expr).to_have_value('25')
        expr.press('Escape')
        expect(panel).to_be_hidden()
        expect(trigger).to_be_focused()
        same_boxes(measured(page), initial, f'closed {width}')
        trigger.click()
        page.locator('.page-heading h1').click()
        expect(panel).to_be_hidden()

        # Wide-screen inline entry shares the expression and supports keyboard equals.
        inline = page.locator('.quick-calc-inline')
        if inline.is_visible():
            inline.fill('2.5 * 4')
            inline.press('=')
            expect(inline).to_have_value('10')
        assert page.evaluate('localStorage.getItem("daily-balance-v1")') == saved

        # Captures and light mode must fit without changing positions.
        trigger.click()
        page.evaluate('document.activeElement.blur()')
        if width in [1440, 320]:
            page.screenshot(path=f'/tmp/quick-calc-{"desktop" if width == 1440 else "mobile320"}.png')
        page.locator('#theme-toggle').click()
        expect(panel).to_be_hidden()
        same_boxes(measured(page), initial, f'light {width}')
        trigger.click()
        expect(panel).to_be_visible()
        same_boxes(measured(page), initial, f'light open {width}')
        expr.fill('7 - 9')
        expr.press('Enter')
        expect(expr).to_have_value('-2')
        expr.press('Escape')

        # Existing controls still work; rerenders/route changes discard old listeners.
        page.get_by_role('button', name='Previous day', exact=True).click()
        expect(page.locator('#selected-date')).to_have_value('2026-10-31')
        expect(page.locator('[data-quick-calculator]')).to_have_count(1)
        page.get_by_role('button', name='Next day', exact=True).click()
        expect(page.locator('#selected-date')).to_have_value(TODAY)
        page.locator('.heading-actions [data-action="pick-food"]').click()
        expect(page.locator('#dialog')).to_be_visible()
        page.locator('#dialog [data-action="close-dialog"]').first.click()
        expect(page.locator('#dialog')).to_be_hidden()
        page.locator('[data-nav="history"]').click()
        expect(page.locator('[data-quick-calculator]')).to_have_count(0)
        page.locator('[data-nav="today"]').click()
        expect(page.locator('[data-quick-calculator]')).to_have_count(1)
        page.locator('.quick-calc-trigger').click()
        expect(page.locator('#quick-calc-panel')).to_be_visible()
        page.locator('#quick-calc-expression').fill('6 * 7')
        page.locator('#quick-calc-expression').press('Enter')
        expect(page.locator('.quick-calc-result')).to_have_text('42')
        assert page.evaluate('document.documentElement.scrollWidth') <= width
        context.close()
    assert not errors, errors
    browser.close()
server.shutdown()
print('PASS: unchanged title/date/Add food/card positions at six widths; keyboard and keypad calculations, errors, percentages, chaining, dismissal, no journal writes, dark/light, navigation and mobile fit')
