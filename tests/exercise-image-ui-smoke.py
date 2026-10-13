"""Exercise image drafts survive delayed decoding without overwriting later choices."""
import base64
import json
import subprocess
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createInitialState} from './core.js';const s=createInitialState();s.profileReady=true;"
    "s.workouts.settings.autoRepeat=false;console.log(JSON.stringify(s));"], cwd=ROOT))
IMAGE_MAX_LENGTH = int(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {EXERCISE_IMAGE_MAX_LENGTH} from './core.js';console.log(EXERCISE_IMAGE_MAX_LENGTH);"], cwd=ROOT))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:' + str(server.server_port) + '/'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000})
    ctx.add_init_script('if(!sessionStorage.getItem("initialized")){localStorage.setItem("daily-balance-v1",'
                        'JSON.stringify(' + json.dumps(fixture) + '));sessionStorage.setItem("initialized","yes");}')
    ctx.add_init_script('''const originalDecode=window.createImageBitmap.bind(window);
      window.exerciseImageDecodes=[];window.holdExerciseImageDecodes=false;
      window.createImageBitmap=(...args)=>window.holdExerciseImageDecodes
        ?new Promise((resolve,reject)=>window.exerciseImageDecodes.push({
          release:()=>originalDecode(...args).then(resolve,reject),
          fail:()=>reject(new Error('Synthetic cancelled image decoding failure'))}))
        :originalDecode(...args);''')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url + '#exercises')
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')

    def image_file(color, name):
        png = page.evaluate('''color=>{const c=document.createElement('canvas');c.width=80;c.height=40;
          const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,80,40);
          return c.toDataURL('image/png').split(',')[1];}''', color)
        return {'name': name + '.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(png)}

    def exercises():
        return page.evaluate('JSON.parse(localStorage.getItem("daily-balance-v1")).workouts.exercises')

    def open_editor(exercise_id):
        page.locator('.exercise-library-card[data-exercise-id="' + exercise_id + '"] '
                     '[data-action="edit-custom-exercise"]').first.click()

    def save():
        page.locator('#custom-exercise-form button[type="submit"]').click()
        expect(page.locator('#dialog')).not_to_be_visible()

    def cancel():
        page.locator('#dialog [data-action="close-dialog"]').first.click()

    def hold_upload(file):
        index = page.evaluate('window.exerciseImageDecodes.length')
        page.evaluate('window.holdExerciseImageDecodes=true')
        page.locator('#custom-image').set_input_files(file)
        expect(page.locator('#custom-exercise-form')).to_have_attribute('data-image-pending', 'true')
        expect(page.locator('#custom-exercise-form button[type="submit"]')).to_be_disabled()
        return index

    def release_decode(index):
        page.evaluate('index=>window.exerciseImageDecodes[index].release()', index)

    blue = image_file('#1166cc', 'blue')
    red = image_file('#ee2233', 'red')
    page.locator('[data-action="new-exercise"]').first.click()
    page.locator('#custom-name').fill('My illustrated exercise')
    page.locator('#custom-image').set_input_files(blue)
    expect(page.locator('#custom-image-preview img')).to_be_visible()
    blue_image = page.locator('#custom-image-preview img').get_attribute('src')
    save()
    exercise_id = exercises()[0]['id']
    assert exercises()[0]['image'] == blue_image

    # Pending images cannot be saved. Removing one invalidates its delayed result.
    open_editor(exercise_id)
    pending = hold_upload(red)
    page.locator('#custom-exercise-form').evaluate(
        'form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
    expect(page.locator('#custom-exercise-error')).to_contain_text('finish loading')
    assert exercises()[0]['image'] == blue_image
    page.locator('[data-action="remove-exercise-image"]').click()
    expect(page.locator('#custom-image-preview img')).to_have_count(0)
    expect(page.locator('#custom-exercise-form button[type="submit"]')).to_be_enabled()
    release_decode(pending)
    expect(page.locator('#custom-image')).to_be_enabled()
    expect(page.locator('#custom-image-preview img')).to_have_count(0)
    assert page.locator('#custom-exercise-form').get_attribute('data-image-pending') is None
    save()
    assert exercises()[0]['image'] == ''

    # A new selection after removal wins even when its older decode completes last.
    open_editor(exercise_id)
    earlier = hold_upload(blue)
    page.locator('[data-action="remove-exercise-image"]').click()
    expect(page.locator('#custom-image')).to_be_enabled()
    later = hold_upload(red)
    release_decode(later)
    expect(page.locator('#custom-image-preview img')).to_be_visible()
    latest_image = page.locator('#custom-image-preview img').get_attribute('src')
    release_decode(earlier)
    expect(page.locator('#custom-image-preview img')).to_have_attribute('src', latest_image)
    expect(page.locator('#custom-exercise-form button[type="submit"]')).to_be_enabled()
    save()
    assert exercises()[0]['image'] == latest_image

    # A cancelled decoder cannot replace the image chosen in a reopened form.
    open_editor(exercise_id)
    cancelled = hold_upload(blue)
    cancel()
    open_editor(exercise_id)
    page.evaluate('window.holdExerciseImageDecodes=false')
    page.locator('#custom-image').set_input_files(red)
    expect(page.locator('#custom-image-status')).to_have_text('Image ready to save.')
    red_image = page.locator('#custom-image-preview img').get_attribute('src')
    assert red_image != blue_image
    release_decode(cancelled)
    expect(page.locator('#custom-image-preview img')).to_have_attribute('src', red_image)
    expect(page.locator('#custom-exercise-form button[type="submit"]')).to_be_enabled()
    save()
    assert exercises()[0]['image'] == red_image

    # A stale decode failure must not appear as an error in a newer exercise form.
    open_editor(exercise_id)
    cancelled_error = hold_upload(blue)
    cancel()
    page.locator('[data-action="new-exercise"]').first.click()
    page.locator('#custom-name').fill('Another illustrated exercise')
    page.evaluate('window.holdExerciseImageDecodes=false')
    page.locator('#custom-image').set_input_files(blue)
    expect(page.locator('#custom-image-preview img')).to_have_attribute('src', blue_image)
    page.evaluate('index=>window.exerciseImageDecodes[index].fail()', cancelled_error)
    expect(page.locator('#custom-exercise-error')).to_be_empty()
    expect(page.locator('#custom-image-preview img')).to_have_attribute('src', blue_image)
    save()
    assert exercises()[0]['image'] == red_image
    assert exercises()[1]['image'] == blue_image

    # An unreadable replacement preserves the current draft and allows the same filename to retry.
    open_editor(exercise_id)
    page.locator('#custom-image').set_input_files(
        {'name': 'retry.jpg', 'mimeType': 'image/jpeg', 'buffer': b'This is not a decodable image.'})
    expect(page.locator('#custom-exercise-error')).to_contain_text('could not be opened')
    expect(page.locator('#custom-image-preview img')).to_have_attribute('src', red_image)
    expect(page.locator('#custom-image')).to_be_enabled()
    expect(page.locator('#custom-exercise-form button[type="submit"]')).to_be_enabled()
    assert page.locator('#custom-image').input_value() == ''
    assert page.locator('#custom-exercise-form').get_attribute('data-image-pending') is None
    page.locator('#custom-image').set_input_files(
        {'name': 'retry.jpg', 'mimeType': 'image/jpeg', 'buffer': base64.b64decode(blue_image.split(',', 1)[1])})
    expect(page.locator('#custom-image-status')).to_have_text('Image ready to save.')
    expect(page.locator('#custom-exercise-error')).not_to_be_visible()
    retry_image = page.locator('#custom-image-preview img').get_attribute('src')
    assert retry_image != red_image
    save()
    assert exercises()[0]['image'] == retry_image

    # A detailed image must be compressed to a valid journal image and survive reload.
    noisy = page.evaluate('''()=>{const c=document.createElement('canvas');c.width=c.height=640;
      const x=c.getContext('2d'),pixels=x.createImageData(640,640);let seed=123456789;
      const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;};
      for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=random()>127?255:0;
        pixels.data[i+1]=random()>127?255:0;pixels.data[i+2]=random()>127?255:0;
        pixels.data[i+3]=255;}x.putImageData(pixels,0,0);
      return {png:c.toDataURL('image/png').split(',')[1],originalJpegLength:c.toDataURL('image/jpeg',0.8).length};}''')
    assert noisy['originalJpegLength'] > IMAGE_MAX_LENGTH, 'Fixture must exercise the saved-image size limit'
    page.locator('[data-action="new-exercise"]').first.click()
    page.locator('#custom-name').fill('Detailed photo exercise')
    page.locator('#custom-image').set_input_files(
        {'name': 'detailed.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(noisy['png'])})
    expect(page.locator('#custom-image-status')).to_have_text('Image ready to save.')
    detailed_image = page.locator('#custom-image-preview img').get_attribute('src')
    assert len(detailed_image) <= IMAGE_MAX_LENGTH
    assert page.locator('#custom-image-preview img').evaluate('async image=>{await image.decode();return image.naturalWidth>0;}')
    save()
    detailed = exercises()[2]
    assert detailed['image'] == detailed_image
    page.reload()
    expect(page.locator('#save-status')).to_have_text('Saved in this browser')
    detailed_card = page.locator('.exercise-library-card[data-exercise-id="' + detailed['id'] + '"]')
    expect(detailed_card.locator('img')).to_have_attribute('src', detailed_image)
    detailed_card.locator('img').scroll_into_view_if_needed()
    assert detailed_card.locator('img').evaluate('async image=>{await image.decode();return image.naturalWidth>0;}')
    assert not errors, errors
    browser.close()

server.shutdown()
print('PASS: exercise image drafts respect pending saves, removal, newer selections and cancel/reopen; invalid replacements preserve images and retry; detailed photos save and reload')
