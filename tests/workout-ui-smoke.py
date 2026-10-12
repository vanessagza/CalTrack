"""Workout interactions and persistence in Chromium; no real user data or account calls."""
import base64
import json
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)+'/'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1100},color_scheme='dark',reduced_motion='reduce',accept_downloads=True)
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.install(time='2026-10-12T08:00:00Z')
    page.goto(url)
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')
    page.get_by_role('button',name='Save my goals',exact=True).click()
    page.locator('[data-nav="workouts"]').click()
    page.locator('#workout-equipment').select_option('dumbbells')
    def state():return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1"))')
    expect(page.locator('.week-day-card')).to_have_count(7)
    expect(page.locator('.week-exercise-list li')).to_have_count(22)
    expect(page.locator('.workout-detail')).to_have_count(5)
    expect(page.locator('.workout-warmup')).to_contain_text('five minutes of gentle warm-up')
    expect(page.locator('.week-day-card').nth(2)).to_contain_text('1–2 sets × 8–10 reps')
    expect(page.locator('.week-day-card').nth(1)).to_contain_text('15–20 min')
    assert all(page.locator('.week-exercise-list li').nth(i).is_visible() for i in range(22))
    def check_guides():
        for img in page.locator('.exercise-guide-grid img').all():
            img.scroll_into_view_if_needed()
            page.wait_for_function('(img)=>img.complete&&img.naturalWidth>0',arg=img.element_handle())
    check_guides()
    # Every day exposes technique inline and all bundled images load.
    for date,count in [('2026-10-13',2),('2026-10-14',5),('2026-10-16',7),('2026-10-18',0),('2026-10-12',5)]:
        page.locator('#workout-date').fill(date)
        expect(page.locator('.workout-detail')).to_have_count(count)
        check_guides()
    page.screenshot(path='/tmp/caltrack-expanded-workouts-desktop.png',full_page=True)
    # Check a workout directly on Wednesday without opening Wednesday.
    page.get_by_label('Mark Dumbbell floor chest press on Wednesday complete',exact=True).check()
    assert state()['workouts']['days']['2026-10-14'][1]['completed']
    page.get_by_label('Mark Goblet squat complete',exact=True).check()
    page.get_by_role('button',name='Edit Goblet squat',exact=True).click()
    page.locator('#exercise-sets').fill('3');page.locator('#exercise-sets-max').fill('4')
    page.locator('#exercise-reps').fill('10');page.locator('#exercise-reps-max').fill('12')
    page.locator('#exercise-load').fill('7.5');page.locator('#exercise-rest').fill('75')
    page.locator('#exercise-note').fill('Controlled <reps>')
    page.locator('#workout-form button[type="submit"]').click()
    expect(page.locator('.workout-detail').first).to_contain_text('3–4 sets × 10–12 reps · 7.5 kg')
    page.get_by_role('button',name='Move Goblet squat down',exact=True).click()
    page.reload()
    expect(page.locator('.workout-detail').nth(1)).to_contain_text('Goblet squat')
    assert state()['workouts']['days']['2026-10-12'][1]['completed']
    page.get_by_role('button',name='Edit session details',exact=True).click()
    page.locator('#session-title').fill('My leg practice')
    page.locator('#session-note').fill('Focus on controlled movement.')
    page.get_by_role('button',name='Save session',exact=True).click()
    # Create a personal reusable exercise, with uploaded illustration and per-side targets.
    page.locator('.workout-session [data-action="new-exercise"]').click()
    page.locator('#custom-name').fill('Low step-up')
    page.locator('#custom-reps').fill('8');page.locator('#custom-unilateral').check()
    page.locator('#custom-rest').fill('1')
    page.locator('#custom-instructions').fill('Step onto a stable low platform, then lower with control.')
    page.locator('#custom-avoid').fill('Avoid rushing.')
    png=page.evaluate('''() => {const c=document.createElement('canvas');c.width=80;c.height=40;
      const x=c.getContext('2d');x.fillStyle='#bbddee';x.fillRect(0,0,80,40);return c.toDataURL('image/png').split(',')[1];}''')
    page.locator('#custom-image').set_input_files({'name':'step.png','mimeType':'image/png','buffer':base64.b64decode(png)})
    expect(page.locator('#custom-image-preview img')).to_be_visible()
    page.get_by_role('button',name='Save exercise type',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    custom_id=state()['workouts']['exercises'][0]['id']
    assert state()['workouts']['exercises'][0]['image'].startswith('data:image/jpeg;base64,')
    page.locator('.workout-session [data-action="pick-exercise"]').click()
    page.locator('[data-action="choose-exercise"][data-id="'+custom_id+'"]').click()
    page.locator('#workout-form button[type="submit"]').click()
    expect(page.locator('.workout-detail').last).to_contain_text('2 sets × 8 reps / side')
    expect(page.locator('.workout-detail').last).to_contain_text('Step onto a stable low platform')
    page.locator('.workout-detail').last.get_by_role('button',name='Rest 1 sec',exact=True).click()
    expect(page.locator('#rest-timer')).to_have_class('rest-timer active')
    page.clock.run_for(1500)
    expect(page.locator('#rest-timer')).to_have_class('rest-timer')
    page.get_by_role('button',name='Save week as my routine',exact=True).click()
    page.get_by_role('button',name='Next workout week',exact=True).click()
    expect(page.locator('.week-exercise-list li')).to_have_count(23)
    assert state()['workouts']['days']['2026-10-19'][1]['load']==7.5
    assert not state()['workouts']['days']['2026-10-19'][1]['completed']
    expect(page.locator('.week-day-card').first).to_contain_text('My leg practice')
    page.get_by_role('button',name='Clear day',exact=True).click()
    expect(page.locator('.workout-detail')).to_have_count(0)
    page.reload();page.locator('#workout-date').fill('2026-10-19')
    expect(page.locator('.workout-detail')).to_have_count(0)
    page.get_by_role('button',name='Clear week',exact=True).click()
    page.reload();page.locator('#workout-date').fill('2026-10-19')
    expect(page.locator('.week-exercise-list li')).to_have_count(0)
    page.get_by_role('button',name='Suggest this week',exact=True).click()
    expect(page.locator('.week-exercise-list li')).to_have_count(23)
    # Export, clear everything, reload, restore: no automatic resurrection after clearing.
    with page.expect_download() as downloaded:page.locator('.workout-save-note [data-action="backup"]').click()
    backup=json.loads(Path(downloaded.value.path()).read_text())
    page.locator('[data-action="clear-workouts"][data-scope="all"]').click()
    page.locator('[data-action="confirm-clear-workouts"]').click()
    assert state()['workouts']['settings']['autoRepeat'] is False
    page.reload();expect(page.locator('.week-exercise-list li')).to_have_count(0)
    assert len(state()['workouts']['exercises'])==1
    page.locator('[data-nav="goals"]').click()
    page.locator('#backup-file').set_input_files({'name':'workouts.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
    page.locator('#dialog').get_by_role('button',name='Restore backup',exact=True).click()
    page.locator('[data-nav="workouts"]').click()
    expect(page.locator('.week-exercise-list li')).to_have_count(23)
    page.locator('#workout-view').select_option('list')
    expect(page.locator('.workout-week-board')).to_have_class('workout-week-board list-view')
    page.reload();expect(page.locator('#workout-view')).to_have_value('list')
    page.locator('#workout-view').select_option('grid')
    # The previous local snapshot can recover an unreadable primary journal.
    page.evaluate('localStorage.setItem("daily-balance-v1-recovery",localStorage.getItem("daily-balance-v1"));localStorage.setItem("daily-balance-v1","broken");')
    page.reload();expect(page.locator('.week-exercise-list li')).to_have_count(23)
    expect(page.locator('.journal-recovery')).to_contain_text('previous local snapshot was recovered')
    # Exercise library editing / archive keeps scheduled custom movements intact.
    page.get_by_role('button',name='Exercise library',exact=True).click()
    page.locator('[data-action="edit-custom-exercise"][data-id="'+custom_id+'"]').click()
    page.get_by_role('button',name='Archive exercise',exact=True).click()
    page.locator('#dialog [data-action="close-dialog"]').click()
    assert state()['workouts']['exercises'][0]['archived']
    expect(page.locator('.workout-detail').last).to_contain_text('Low step-up')
    # Desktop/tablet/phone with the largest personal text sizes and all targets visible.
    page.locator('[data-nav="settings"]').click()
    for role,value in [('title',56),('heading',36),('body',24),('subtext',20)]:
        page.locator('#text-size-'+role).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("change",{bubbles:true}));}',value)
    page.locator('[data-nav="workouts"]').click()
    expect(page.locator('.week-exercise-list li')).to_have_count(23)
    for width in [1440,768,390,320]:
        page.set_viewport_size({'width':width,'height':1100})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
        assert all(page.locator('.week-exercise-list li').nth(i).is_visible() for i in range(23)),f'Hidden exercises at {width}'
        if width==390:page.screenshot(path='/tmp/caltrack-expanded-workouts-mobile.png',full_page=True)
    # A failed browser write must never show a misleading "planned" success message.
    page.evaluate('()=>{Storage.prototype.setItem=function(){throw new DOMException("Storage is full","QuotaExceededError");};}')
    page.locator('#workout-date').fill('2026-10-26')
    expect(page.locator('#save-status')).to_have_text('Not saved · export backup')
    expect(page.locator('#toast')).to_contain_text('only in memory')
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: exact weekly routine, inline guides, custom exercise/image, strength editing, completion, order, repeat, clearing, backups, reload/recovery, quota failure and responsive layouts')
