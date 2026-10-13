"""Exercise dashboard and user-calibrated calorie credits using an isolated journal."""
import base64
import copy
import json
import re
import subprocess
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-10-13'
PAST = '2026-10-12'
NAME = 'Push & pull <img src=x onerror="window.testNameInjected=1">'
DESCRIPTION = 'Slow steady practice for balance.'
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {createInitialState,calculateGoals} from './core.js';
const s=createInitialState();s.profileReady=true;s.profile.weight=70;
s.preferences.theme='dark';s.preferences.palettes.dark.subtext='#ffc4dc';
s.workouts.settings.autoRepeat=false;
s.weights=[{date:'2026-10-12',weight:65},{date:'2026-10-13',weight:70}];
s.days['2026-10-13']={entries:[],goals:calculateGoals(s.profile,'2026-10-13'),note:''};
console.log(JSON.stringify(s));
"""], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:' + str(server.server_port) + '/'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1050}, color_scheme='dark',
                              reduced_motion='reduce', accept_downloads=True)
    ctx.add_init_script('if(!sessionStorage.getItem("initialized")){localStorage.setItem("daily-balance-v1",JSON.stringify(' +
                        json.dumps(fixture) + '));sessionStorage.setItem("initialized","yes");}')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.clock.install(time='2026-10-13T08:00:00Z')
    page.goto(url + '#exercises')
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')
    expect(page.locator('[data-nav="exercises"]')).to_have_class(re.compile(r'active'))
    expect(page.locator('.exercise-library-card')).to_have_count(28)

    def state():
        return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')

    def amount(selector):
        value = page.locator(selector).inner_text()
        return float(re.search(r'[\d,.]+', value).group().replace(',', ''))

    def near(actual, expected):
        assert abs(actual - expected) < 0.11, (actual, expected)

    def credit():
        return amount('[data-workout-calorie-credit]')

    def library():
        page.locator('[data-nav="exercises"]').click()
        expect(page.locator('#library-search')).to_be_visible()

    def reset_filters():
        page.locator('#library-search').fill('')
        for selector in ['#library-group', '#library-equipment', '#library-source']:
            page.locator(selector).select_option('all')
        page.locator('#library-status').select_option('active')

    def card(exercise_id):
        return page.locator('.exercise-library-card[data-exercise-id="' + exercise_id + '"]')

    def edit(exercise_id):
        card(exercise_id).locator('[data-action="edit-custom-exercise"]').first.click()
        expect(page.locator('#custom-exercise-form')).to_be_visible()

    def save_definition():
        page.locator('#custom-exercise-form button[type="submit"]').click()
        expect(page.locator('#dialog')).not_to_be_visible()

    def add_to_day(exercise_id, date, sets=None, reps=None):
        definition_name = card(exercise_id).locator('h2').inner_text()
        card(exercise_id).locator('[data-action="library-add-workout"]').click()
        expect(page.locator('#dialog .dialog-heading p')).to_contain_text(definition_name)
        assert page.locator('#dialog img[src="x"]').count() == 0
        assert not page.evaluate('Boolean(window.testNameInjected)')
        page.locator('#exercise-date').fill(date)
        if sets is not None:
            page.locator('#exercise-sets').fill(str(sets))
        if reps is not None:
            page.locator('#exercise-reps').fill(str(reps))
        page.locator('#workout-form button[type="submit"]').click()
        expect(page.locator('#workout-date')).to_have_value(date)

    def delete_definition(exercise_id):
        definition_name = card(exercise_id).locator('h2').inner_text()
        card(exercise_id).locator('[data-action="delete-library-exercise"]').click()
        expect(page.locator('#dialog-title')).to_have_text('Delete ' + definition_name + '?')
        assert page.locator('#dialog img[src="x"]').count() == 0
        assert not page.evaluate('Boolean(window.testNameInjected)')
        page.locator('[data-action="confirm-delete-library-exercise"]').click()
        expect(card(exercise_id)).to_have_count(0)

    original_preferences = copy.deepcopy(state()['preferences'])
    original_goals = copy.deepcopy(state()['days'][TODAY]['goals'])
    png = page.evaluate('''() => {const c=document.createElement('canvas');c.width=80;c.height=40;
        const x=c.getContext('2d');x.fillStyle='#bbddee';x.fillRect(0,0,80,40);
        return c.toDataURL('image/png').split(',')[1];}''')
    image_file = {'name': 'exercise.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)}

    # Add a fully reusable definition with user-entered burn and an uploaded local image.
    page.locator('[data-action="new-exercise"]').first.click()
    expect(page.locator('#custom-calorie-mode')).to_have_value('automatic')
    page.locator('#custom-name').fill(NAME)
    page.locator('#custom-description').fill(DESCRIPTION)
    page.locator('#custom-group').select_option('Cardio')
    page.locator('#custom-equipment').select_option('dumbbells')
    page.locator('#custom-sets').fill('2')
    page.locator('#custom-reps').fill('10')
    page.locator('#custom-muscles').fill('Balance and legs')
    page.locator('#custom-instructions').fill('Step slowly. <img src=x onerror="window.testInjected=1">')
    page.locator('#custom-avoid').fill('Avoid rushing or uneven footing.')
    page.locator('#custom-calorie-mode').select_option('manual')
    expect(page.locator('#custom-calories')).to_be_enabled()
    page.locator('#custom-exercise-form button[type="submit"]').click()
    expect(page.locator('#custom-exercise-form')).to_be_visible()
    assert not state()['workouts']['exercises']
    page.locator('#custom-calories').fill('200')
    expect(page.locator('#custom-calorie-weight')).to_have_value('70')
    page.locator('#custom-image').set_input_files(image_file)
    expect(page.locator('#custom-image-preview img')).to_be_visible()
    save_definition()
    custom = state()['workouts']['exercises'][0]
    custom_id = custom['id']
    assert custom['energy']['kcal'] == 200 and custom['energy']['weightKg'] == 70
    assert custom['image'].startswith('data:image/jpeg;base64,')
    expect(card(custom_id)).to_contain_text(NAME)
    expect(card(custom_id)).to_contain_text(DESCRIPTION)
    near(amount('.exercise-library-card[data-exercise-id="' + custom_id + '"] .library-energy-value'), 200)
    assert not page.evaluate('Boolean(window.testInjected)')
    assert not page.evaluate('Boolean(window.testNameInjected)')

    # Search includes description and focus; narrowing every independent filter is reversible.
    page.locator('#library-search').fill('steady practice')
    expect(page.locator('.exercise-library-card')).to_have_count(1)
    expect(page.locator('#library-search')).to_be_focused()
    page.locator('#library-search').press('End')
    page.locator('#library-search').press('Space')
    expect(page.locator('#library-search')).to_be_focused()
    expect(page.locator('.exercise-library-card')).to_have_count(1)
    page.locator('#library-group').select_option('Core')
    expect(page.locator('.exercise-library-card')).to_have_count(0)
    page.locator('#library-group').select_option('Cardio')
    page.locator('#library-equipment').select_option('bodyweight')
    expect(page.locator('.exercise-library-card')).to_have_count(0)
    page.locator('#library-equipment').select_option('dumbbells')
    page.locator('#library-source').select_option('preset')
    expect(page.locator('.exercise-library-card')).to_have_count(0)
    page.locator('#library-source').select_option('custom')
    expect(page.locator('.exercise-library-card')).to_have_count(1)
    reset_filters()
    card(custom_id).locator('[data-action="library-guide"]').click()
    expect(page.locator('#dialog')).to_contain_text('Step slowly.')
    assert page.locator('#dialog img[src="x"]').count() == 0
    assert not page.evaluate('Boolean(window.testInjected)')
    page.locator('#dialog [data-action="close-dialog"]').first.click()

    # Only checking Done changes the budget; default 2×10 credits 200 and 4×10 credits 400.
    add_to_day(custom_id, TODAY)
    near(credit(), 0)
    page.get_by_label('Mark ' + NAME + ' complete', exact=True).check()
    near(credit(), 200)
    page.get_by_role('button', name='Edit ' + NAME, exact=True).click()
    page.locator('#exercise-sets').fill('4')
    near(amount('#workout-energy-preview'), 400)
    page.locator('#workout-form button[type="submit"]').click()
    near(credit(), 400)
    page.get_by_label('Mark ' + NAME + ' complete', exact=True).uncheck()
    near(credit(), 0)
    page.get_by_label('Mark ' + NAME + ' complete', exact=True).check()

    # Editing a library calibration recalculates existing completed workouts; clearing images persists.
    library()
    edit(custom_id)
    page.locator('#custom-calories').fill('240')
    page.locator('[data-action="remove-exercise-image"]').click()
    expect(page.locator('#custom-image-preview img')).to_have_count(0)
    save_definition()
    assert state()['workouts']['exercises'][0]['image'] == ''
    page.locator('[data-nav="workouts"]').click()
    near(credit(), 480)
    page.reload()
    near(credit(), 480)
    page.locator('[data-action="workout-food-day"]').click()
    near(amount('[data-calorie-credit]'), 480)
    near(amount('[data-adjusted-calories]'), 2080)
    near(amount('.remaining-number'), 2080)
    assert state()['days'][TODAY]['goals'] == original_goals

    # An older workout uses the dated weight; copied weekly plans always start unchecked.
    library()
    add_to_day(custom_id, PAST)
    near(credit(), 0)
    page.get_by_label('Mark ' + NAME + ' complete', exact=True).check()
    near(credit(), 240 * 65 / 70)
    page.locator('#workout-date').fill(TODAY)
    near(credit(), 480)
    page.get_by_role('button', name='Copy plan to next week', exact=False).click()
    page.locator('#workout-date').fill('2026-10-20')
    near(credit(), 0)
    assert not state()['workouts']['days']['2026-10-20'][0]['completed']

    # Presets expose the same editable fields, illustration and manual burn as personal exercises.
    library()
    edit('walking')
    page.locator('#custom-name').fill('Measured stroll')
    page.locator('#custom-description').fill('A comfortable ten-minute walk.')
    page.locator('#custom-instructions').fill('Walk on level ground at a comfortable pace.')
    page.locator('#custom-sets').fill('1')
    page.locator('#custom-reps').fill('10')
    page.locator('#custom-calorie-mode').select_option('manual')
    page.locator('#custom-calories').fill('80')
    page.locator('#custom-calorie-weight').fill('70')
    page.locator('#custom-image').set_input_files(image_file)
    expect(page.locator('#custom-image-preview img')).to_be_visible()
    save_definition()
    expect(card('walking')).to_contain_text('Measured stroll')
    expect(card('walking').locator('img')).to_have_attribute('src', re.compile(r'^data:image/jpeg;base64,'))
    add_to_day('walking', TODAY, sets=1, reps=10)
    near(credit(), 480)
    page.get_by_label('Mark Measured stroll complete', exact=True).check()
    near(credit(), 560)
    expect(page.locator('.workout-detail').last).to_contain_text('Walk on level ground')
    library()
    edit('walking')
    page.locator('[data-action="remove-exercise-image"]').click()
    save_definition()
    page.reload()
    expect(card('walking').locator('img')).to_have_attribute('src', './assets/exercises/custom.svg')
    edit('walking')
    expect(page.locator('#custom-image-preview img')).to_have_count(0)
    expect(page.locator('#custom-calories')).to_have_value('80')
    page.locator('#dialog [data-action="close-dialog"]').first.click()

    # Delete means remove from the reusable library, with history intact, Undo and later restore.
    delete_definition(custom_id)
    assert state()['workouts']['exercises'][0]['archived']
    page.get_by_role('button', name='Undo', exact=True).click()
    expect(card(custom_id)).to_be_visible()
    assert not state()['workouts']['exercises'][0]['archived']
    delete_definition(custom_id)
    page.locator('[data-nav="workouts"]').click()
    page.locator('#workout-date').fill(TODAY)
    near(credit(), 560)
    expect(page.get_by_label('Mark ' + NAME + ' complete', exact=True)).to_be_checked()
    page.locator('.workout-session [data-action="pick-exercise"]').click()
    page.locator('#exercise-equipment').select_option('All')
    expect(page.locator('[data-action="choose-exercise"][data-id="' + custom_id + '"]')).to_have_count(0)
    page.locator('#dialog [data-action="close-dialog"]').first.click()
    library()
    page.locator('#library-status').select_option('archived')
    expect(page.locator('.exercise-library-card')).to_have_count(1)
    card(custom_id).locator('[data-action="restore-library-exercise"]').click()
    expect(page.locator('.exercise-library-card')).to_have_count(0)
    reset_filters()
    expect(card(custom_id)).to_be_visible()
    delete_definition('walking')
    page.locator('[data-nav="workouts"]').click()
    page.locator('#workout-date').fill(TODAY)
    near(credit(), 560)
    library()
    page.locator('#library-status').select_option('archived')
    card('walking').locator('[data-action="restore-library-exercise"]').click()
    reset_filters()

    # Dashboard preferences, every edited definition, and credits travel through backup and reload.
    page.locator('[data-nav="settings"]').click()
    with page.expect_download() as downloaded:
        page.locator('.settings-panel [data-action="backup"]').click()
    backup = json.loads(Path(downloaded.value.path()).read_text())
    expected_workouts = copy.deepcopy(state()['workouts'])
    library()
    edit(custom_id)
    page.locator('#custom-description').fill('Temporary changed overview.')
    page.locator('#custom-calories').fill('1')
    save_definition()
    page.locator('[data-nav="goals"]').click()
    page.locator('#backup-file').set_input_files({'name': 'exercises.json', 'mimeType': 'application/json',
                                                'buffer': json.dumps(backup).encode()})
    page.locator('#dialog').get_by_role('button', name='Restore backup', exact=True).click()
    assert state()['workouts'] == expected_workouts
    assert state()['preferences'] == original_preferences
    page.reload()
    library()
    expect(card(custom_id)).to_contain_text(DESCRIPTION)
    expect(card('walking')).to_contain_text('Measured stroll')
    page.screenshot(path='/tmp/caltrack-exercises-desktop.png', full_page=True)
    page.locator('[data-nav="settings"]').click()
    for role, value in [('title', 56), ('heading', 36), ('body', 24), ('subtext', 20)]:
        page.locator('#text-size-' + role).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("change",{bubbles:true}));}', value)
    library()
    for width in [1440, 768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1050})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Overflow at ' + str(width)
        expect(page.locator('#library-search')).to_be_visible()
        expect(card(custom_id).locator('[data-action="edit-custom-exercise"]').first).to_be_visible()
        if width == 390:
            page.screenshot(path='/tmp/caltrack-exercises-mobile.png', full_page=True)
    edit(custom_id)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(page.locator('#custom-calories')).to_have_value('240')
    expect(page.locator('#custom-description')).to_have_value(DESCRIPTION)
    assert not page.evaluate('Boolean(window.testInjected)')
    assert not errors, errors

    # Old schedules retain their original units after library edits. The suggestion
    # shortcut must not reinterpret a new 100-rep default as 100 scheduled minutes.
    unit_ctx = browser.new_context(viewport={'width': 1100, 'height': 950}, reduced_motion='reduce')
    unit_ctx.add_init_script('if(!sessionStorage.getItem("initialized")){localStorage.setItem("daily-balance-v1",JSON.stringify(' +
                             json.dumps(fixture) + '));sessionStorage.setItem("initialized","yes");}')
    unit_page = unit_ctx.new_page()
    unit_page.on('pageerror', lambda error: errors.append(str(error)))
    unit_page.clock.install(time='2026-10-13T08:00:00Z')
    unit_page.goto(url + '#exercises')
    expect(unit_page.locator('#save-status')).to_have_text('Saved in this browser')
    unit_card = unit_page.locator('.exercise-library-card[data-exercise-id="walking"]')
    unit_card.locator('[data-action="library-add-workout"]').click()
    unit_page.locator('#exercise-sets').fill('1')
    unit_page.locator('#exercise-reps').fill('20')
    unit_page.locator('#workout-form button[type="submit"]').click()
    unit_page.get_by_label('Mark Comfortable walk complete', exact=True).check()
    expect(unit_page.locator('[data-workout-calorie-credit]')).to_have_text('+44.1 kcal')
    unit_page.locator('[data-nav="exercises"]').click()
    unit_card.locator('[data-action="edit-custom-exercise"]').first.click()
    unit_page.locator('#custom-unit').select_option('reps')
    unit_page.locator('#custom-sets').fill('1')
    unit_page.locator('#custom-reps').fill('100')
    unit_page.locator('#custom-exercise-form button[type="submit"]').click()
    unit_page.locator('[data-nav="workouts"]').click()
    expect(unit_page.locator('.workout-detail')).to_contain_text('20 min')
    expect(unit_page.locator('[data-workout-calorie-credit]')).to_have_text('+44.1 kcal')
    unit_page.get_by_role('button', name='Edit Comfortable walk', exact=True).click()
    expect(unit_page.get_by_label('Minutes per set', exact=True)).to_have_value('20')
    expect(unit_page.locator('[data-action="workout-use-suggestion"]')).to_have_count(0)
    expect(unit_page.locator('#workout-form')).to_contain_text('keeps its original target unit and side count')
    unit_page.locator('#exercise-reps').fill('10')
    unit_page.locator('#workout-form button[type="submit"]').click()
    expect(unit_page.locator('.workout-detail')).to_contain_text('10 min')
    expect(unit_page.locator('[data-workout-calorie-credit]')).to_have_text('+22 kcal')
    unit_page.reload()
    expect(unit_page.locator('[data-workout-calorie-credit]')).to_have_text('+22 kcal')
    unit_page.locator('[data-nav="exercises"]').click()
    unit_card.locator('[data-action="edit-custom-exercise"]').first.click()
    unit_page.locator('#custom-unit').select_option('minutes')
    unit_page.locator('#custom-reps').fill('20')
    unit_page.locator('#custom-unilateral').check()
    unit_page.locator('#custom-exercise-form button[type="submit"]').click()
    unit_page.locator('[data-nav="workouts"]').click()
    unit_page.get_by_role('button', name='Edit Comfortable walk', exact=True).click()
    expect(unit_page.locator('[data-action="workout-use-suggestion"]')).to_have_count(0)
    expect(unit_page.get_by_label('Minutes per set', exact=True)).to_have_value('10')
    assert not errors, errors
    browser.close()

server.shutdown()
server.server_close()
print('PASS: Exercises dashboard creation/editing, custom and preset images/descriptions/calories, filters/search focus, completed-only and scaled manual credits, dated weights, unchecked copies, deletion/Undo/restore/history, backup/reload, safe names in workout/deletion dialogs, original schedule units and responsive layouts')
