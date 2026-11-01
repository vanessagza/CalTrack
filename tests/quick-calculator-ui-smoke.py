"""A phone-style keypad replaces the sidebar quote and stays inside its card."""
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


def rect(locator):
    return locator.evaluate('el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};}')


def fits(inner, outer, label):
    assert inner['x'] >= outer['x'] - .2, (label, inner, outer)
    assert inner['y'] >= outer['y'] - .2, (label, inner, outer)
    assert inner['right'] <= outer['right'] + .2, (label, inner, outer)
    assert inner['bottom'] <= outer['bottom'] + .2, (label, inner, outer)


def same_box(actual, expected, label):
    for key in ['x', 'y', 'width', 'height']:
        assert abs(actual[key] - expected[key]) < .2, (label, key, actual, expected)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    errors = []
    for width, height in [(1440, 1050), (1440, 900), (1280, 720), (1024, 768), (768, 1024)]:
        context = browser.new_context(viewport={'width':width, 'height':height}, color_scheme='dark', reduced_motion='reduce')
        context.add_init_script('if(!sessionStorage.getItem("quick-test-ready")) {'
            'localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));'
            'sessionStorage.setItem("quick-test-ready","yes");}')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time=TODAY + 'T08:00:00Z')
        page.goto(url + '#today')
        expect(page.locator('#save-status')).to_have_text('Saved in this browser')
        expect(page.locator('.page-heading [data-quick-calculator]')).to_have_count(0)
        expect(page.locator('.quick-calc-dock')).to_have_count(0)
        expect(page.get_by_text('ONE DAY AT A TIME', exact=True)).to_have_count(0)
        expect(page.get_by_text('Know what you ate.', exact=True)).to_have_count(0)
        calc = page.locator('.sidebar-note [data-quick-calculator]')
        expect(calc).to_have_count(1)
        expect(calc).to_be_visible()
        calc.scroll_into_view_if_needed()
        note = page.locator('.sidebar-note')
        original_box = rect(note)
        fits(rect(calc), original_box, f'calculator {width}x{height}')
        expr = calc.locator('#quick-calc-expression')
        output = calc.locator('.quick-calc-result')
        expect(expr).to_be_visible()
        for key in ['0','1','2','3','4','5','6','7','8','9','±','+','−','×','÷','.','C','⌫','%','=']:
            button = calc.locator('[data-calc-key="' + key + '"]')
            expect(button).to_be_visible()
            fits(rect(button), original_box, f'key {key} at {width}x{height}')
        fits(rect(expr), original_box, f'input {width}')
        fits(rect(output), original_box, f'output {width}')
        nav = rect(page.locator('.sidebar nav'))
        person = rect(page.locator('.sidebar-bottom .person'))
        assert original_box['y'] >= nav['bottom'] - .2, ('nav overlap', width, nav, original_box)
        assert original_box['bottom'] <= person['y'] + .2, ('profile overlap', width, person, original_box)
        assert page.evaluate('document.documentElement.scrollWidth') <= width
        saved = page.evaluate('localStorage.getItem("daily-balance-v1")')

        def key(value):
            calc.locator('[data-calc-key="' + value + '"]').click()

        # Every digit is an actual button, and normal phone-calculator arithmetic works.
        for digit in map(str, range(10)):
            key('C'); key(digit); key('=')
            expect(expr).to_have_value(digit)
        key('C')
        for value in ['2','0','0','×','1','0','%','=']:
            key(value)
        expect(expr).to_have_value('20')
        expect(output).to_have_text('20')
        for value in ['+','5','=']:
            key(value)
        expect(expr).to_have_value('25')
        key('C')
        for value in ['4','±','=']:
            key(value)
        expect(expr).to_have_value('-4')
        expect(output).to_have_text('-4')
        key('C')
        for value in ['8','÷','2','=']:
            key(value)
        expect(expr).to_have_value('4')
        key('⌫')
        expect(expr).to_have_value('')
        for expression, answer in [('2.5 × 4','10'),('(12 + 8) ÷ 2','10'),('7 − 9','-2')]:
            expr.fill(expression); expr.press('Enter')
            expect(expr).to_have_value(answer)
            expect(output).to_have_text(answer)
        expr.fill('1 / 0'); expr.press('Enter')
        expect(calc.locator('.quick-calc-error')).to_be_visible()
        expect(output).to_have_text('—')
        same_box(rect(note), original_box, f'error does not expand card {width}')
        fits(rect(calc.locator('.quick-calc-error')), original_box, f'error {width}')
        key('C')
        expect(calc.locator('.quick-calc-error')).to_be_hidden()
        expr.fill('6 * 7'); expr.press('=')
        expect(expr).to_have_value('42')
        same_box(rect(note), original_box, f'operations {width}')
        assert page.evaluate('localStorage.getItem("daily-balance-v1")') == saved

        # The sidebar calculator remains present and keeps scratch work on every dashboard.
        for route in ['history','foods','goals','workouts','exercises','today']:
            page.locator('[data-nav="' + route + '"]').click()
            expect(calc).to_have_count(1)
            expect(expr).to_have_value('42')
            expect(page.locator('.page-heading [data-quick-calculator]')).to_have_count(0)
        same_box(rect(note), original_box, f'route persistence {width}')
        page.locator('#theme-toggle').click()
        expect(calc).to_be_visible()
        same_box(rect(note), original_box, f'light theme {width}')
        for key_value in ['−','2','=']:
            key(key_value)
        expect(expr).to_have_value('40')
        page.locator('#theme-toggle').click()
        page.evaluate('document.activeElement.blur()')
        if (width,height) in [(1440,1050),(768,1024)]:
            page.screenshot(path='/tmp/sidebar-calculator-' + ('desktop' if width==1440 else 'tablet') + '.png')

        # The original date and Add food controls still work with the header restored.
        page.get_by_role('button', name='Previous day', exact=True).click()
        expect(page.locator('#selected-date')).to_have_value('2026-10-31')
        expect(expr).to_have_value('40')
        page.get_by_role('button', name='Next day', exact=True).click()
        page.locator('.heading-actions [data-action="pick-food"]').click()
        expect(page.locator('#dialog')).to_be_visible()
        page.locator('#dialog [data-action="close-dialog"]').first.click()
        expect(page.locator('#dialog')).to_be_hidden()
        context.close()

    # On phones the sidebar collapses, so its navigation control opens the
    # same square calculator as a fixed overlay without adding another nav row.
    for width, height in [(390,844),(320,568)]:
        context = browser.new_context(viewport={'width':width, 'height':height}, color_scheme='dark', reduced_motion='reduce')
        context.add_init_script('localStorage.setItem("daily-balance-v1",JSON.stringify(' + json.dumps(fixture) + '));')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time=TODAY + 'T08:00:00Z')
        page.goto(url + '#today')
        expect(page.locator('#save-status')).to_have_text('Saved in this browser')
        toggle = page.locator('.sidebar-calculator-toggle')
        expect(toggle).to_be_visible()
        expect(toggle).to_have_attribute('aria-expanded','false')
        expect(page.locator('.sidebar-bottom')).to_have_css('display','none')
        nav = rect(page.locator('.sidebar nav'))
        nav_rows = page.locator('.sidebar nav').evaluate('el => getComputedStyle(el).gridTemplateRows.split(" ").length')
        assert nav_rows == 2, ('mobile calculator adds a navigation row', width, nav)
        assert page.evaluate('document.documentElement.scrollWidth') <= width, ('mobile nav overflow', width)
        toggle.click()
        expect(toggle).to_have_attribute('aria-expanded','true')
        calc = page.locator('#sidebar-calculator [data-quick-calculator]')
        expect(calc).to_be_visible()
        panel = rect(page.locator('.sidebar-bottom'))
        card = rect(page.locator('#sidebar-calculator'))
        bounds = {'x':0, 'y':0, 'right':width, 'bottom':height}
        if width == 390:
            page.screenshot(path='/tmp/sidebar-calculator-phone.png')
        fits(panel, bounds, f'mobile panel {width}x{height}')
        fits(card, panel, f'mobile card {width}x{height}')
        fits(rect(calc), card, f'mobile calculator {width}x{height}')
        assert abs(card['width'] - card['height']) < .2, ('mobile calculator square', width, card)
        expr = calc.locator('#quick-calc-expression')
        for key_value in ['0','1','2','3','4','5','6','7','8','9','±','+','−','×','÷','.','C','⌫','%','=']:
            button = calc.locator('[data-calc-key="' + key_value + '"]')
            expect(button).to_be_visible()
            fits(rect(button), panel, f'mobile key {key_value} at {width}x{height}')
        for value in ['2','×','3','=']:
            calc.locator('[data-calc-key="' + value + '"]').click()
        expect(expr).to_have_value('6')
        toggle.click()
        expect(toggle).to_have_attribute('aria-expanded','false')
        expect(page.locator('.sidebar-bottom')).to_have_css('display','none')
        toggle.click()
        page.keyboard.press('Escape')
        expect(toggle).to_have_attribute('aria-expanded','false')
        context.close()
    assert not errors, errors
    browser.close()
server.shutdown()
print('PASS: phone-style sidebar keypad replaces quote; digits/operators/keyboard/errors, unchanged card bounds, all-dashboard scratch persistence, no journal writes, dark/light and restored header controls')
