# Daily Balance — GitHub Pages edition

A static nutrition and weekly workout tracker. This package contains the complete website:
HTML, CSS, JavaScript, and the icon. It does not need an OpenAI account, API key,
paid server, npm installation, or application build step. Optional private sync
uses a Supabase account and database; see [Supabase setup](SUPABASE_SETUP.md).

The 27-food starter catalog, portion editor, calorie and macro progress bars,
energy formulas, daily history, weight journal, and backup/restore are included.
The **Workouts** section adds a calendar listing every exercise, 28 presets,
personal exercise types, illustrated instructions, editable target ranges and
rest periods, repeating routines, and completion checkboxes.
Use the **Dark mode** switch in the top bar to choose a light or dark theme.
It follows your device's theme initially and remembers your choice in this browser.
Use **Sync devices** to sign into your journal on your laptop and phone once
Supabase is configured. Signed-out use continues to save in this browser.
Open **Settings** to customize your own light and dark palettes, text sizes,
spacing, animations and profile photo.

## 1. Export your existing journal first

1. Open your current tracker in the browser where you have been logging food.
2. Click **Export backup** at the bottom of the page, or use the export button
   in **Profile & goals**.
3. Keep the downloaded `.json` file on your own device. It contains your profile,
   personal food labels, goals, dated food logs, weight history, and workout plans.
4. Do not upload that JSON backup to the public GitHub repository.

The package deliberately has no embedded personal name, actual birth date,
weight records, or meal history. It starts with clearly marked placeholder
profile values. Restore your backup after publishing to bring back your exact
settings and history without putting them in the public source files.

## 2. Extract this ZIP

On Windows, right-click the downloaded ZIP and choose **Extract All**. Open the
extracted folder. Its files should include:

| File | Purpose |
| --- | --- |
| `index.html` | Website entry page |
| `styles.css` | Layout and appearance |
| `app.js` | Website interactions and browser storage |
| `core.js` | Food and exercise catalogs, formulas and validation |
| `workout-plan.js`, `workout-view.js` | Starter routine, technique instructions and workout dashboard |
| `assets/exercises/` | Bundled exercise illustrations |
| `theme.js` | Light/dark theme switching and saved preference |
| `preferences.js`, `appearance.js` | Personal colors, text sizes, layout settings and profile photos |
| `cloud-sync.js`, `journal-merge.js`, `sync-journal.js`, `sync-config.js` | Private account sync, automatic rebasing, schema upgrades and public connection settings |
| `vendor/` | Locally bundled Supabase browser SDK and licenses |
| `favicon.svg` | Browser-tab icon |
| `.nojekyll` | Publishes the files without Jekyll processing |
| `README.md` | These instructions |

Upload the extracted files, not the ZIP. `index.html` must be at the root of the
publishing folder. Do not place all the files inside an extra nested directory.

## 3. Create a repository

1. Sign in to GitHub and open https://github.com/new.
2. Select your own account as the owner.
3. Name the repository `daily-balance` (or choose another name).
4. For the free GitHub Pages route, choose **Public**.
5. Enable **Add README** so the repository has an initial branch.
6. Create the repository. GitHub will open its main page.

You need a GitHub account to upload or change the website. Visitors do not need
an account to open the resulting public Pages website and log their food.

## 4. Upload the website files

1. In the repository's **Code** view, open **Add file**, then **Upload files**.
2. Drag in the extracted files listed above. Replace the initial README with the
   included one when you upload it.
3. Enter a short commit message, for example `Add nutrition tracker`.
4. Commit to the default branch, usually `main`.
5. Check that `index.html`, `styles.css`, `app.js`, and `core.js` appear directly
   in the repository's main file list.

If `.nojekyll` was not uploaded, use **Add file → Create new file**, enter
`.nojekyll` as the filename, and commit it with empty content.

## 5. Enable GitHub Pages

1. Open the repository's **Settings** tab.
2. Choose **Pages** in the left sidebar.
3. In the deployment section, set **Source** to **Deploy from a branch**.
4. Select the branch containing your files, normally **main**.
5. Select **/(root)** as the folder, then save the selection.
6. Allow GitHub to finish deployment. Changes can take up to 10 minutes to
   appear. Revisit the Pages settings and use the displayed **Visit site** link.

For a repository named `daily-balance`, the usual address is:

`https://YOUR_USERNAME.github.io/daily-balance/`

Use the exact link shown by GitHub. No custom domain is required.

## 6. Restore your measurements and journal

1. Open your new GitHub Pages address. If using cloud sync, sign in via **Sync devices** first.
2. On first use, **Profile & goals** opens with a setup notice. The displayed
   measurements are placeholders, not your personalized targets.
3. In that page's backup panel, click **Restore backup**.
4. Select the JSON file exported from the original tracker.
5. Review the record counts and click **Restore backup** in the dialog.
6. Open **Daily intake** and **History** to confirm that your profile, goals,
   foods, and recorded days are present.

If you do not have a backup, enter your measurements and goals in the profile
form and save them. That creates a fresh journal; it does not transfer the old
records. Days follow Asia/Tashkent, matching the original tracker.

## Plan and track your workouts

1. Save your measurements and calorie target in **Profile & goals**, then open
   **Workouts** in the navigation.
2. Choose **Training purpose**: muscle preservation, muscle building, increased
   strength, or general fitness. Select your experience and available equipment.
3. Every Monday–Sunday card lists its exercises, sets, target ranges and rest
   without opening it. Check off exercises directly in the week. Select a day
   for its full goal, notes, written technique and illustrations. Choose week
   cards or a full-width day list with **Calendar layout**.
4. Click **Add exercise** on the desired day. Search or filter the preset list.
   Review the suggested sets and reps, including optional maximums for ranges
   such as 2 sets of 8–12 reps. Enter rest periods, lifting weight and notes
   if useful, then save. For dumbbells, weight means each dumbbell's weight;
   bodyweight can be recorded as 0 kg. Planks use seconds instead of reps, and
   unilateral exercises show targets per side. Walking and mobility use minutes.
5. Check the exercise's box when you complete it. Use its edit button to adjust
   sets, reps, weight, notes, or scheduled date as your training progresses.
   Moving an exercise to another date resets its completion checkbox.

With **Muscle preservation**, **Starting out**, and **Dumbbells & bodyweight**,
the default routine is the supplied glutes, chest and core schedule: resistance
on Monday, Wednesday and Friday; easy walks on Tuesday, Thursday and Saturday;
mobility on Tuesday and Saturday; and rest on Sunday. It includes the exact
sets, rep ranges, rest times, session goals and recovery notes. A five-minute
warm-up reminder appears above the calendar. **Load glutes & chest starter plan**
loads the complete seven-day plan after reviewing replacement of the displayed
week. Other weeks are kept, and Undo is available.

**Suggest this week** fills empty upcoming days with your saved personal routine,
the preservation starter routine for the matching configuration, or general
full-body sessions for other configurations: two sessions for beginners (Monday
and Thursday), or three for regular trainees (Monday, Wednesday and Friday).
It preserves occupied days and skips past dates. Changing preferences preserves
existing sessions. The supplied preservation routine keeps its original targets.

Use **Create a new exercise** to save a reusable name, type, equipment, default
sets and target, target unit (reps/seconds/minutes), rest, per-side option,
instructions, common mistakes and an optional image. **Exercise library** shows
all presets and personal exercises, with guides and controls to edit or archive
your own types. Archiving hides a type from the picker while preserving scheduled
entries. Uploaded JPEG, PNG and WebP illustrations retain their proportions and
save privately with the exercise. Built-in guides use bundled schematic images.

Reorder exercises with the up/down controls, edit session titles and goals, and
start the rest timer from any resistance exercise. **Save week as my routine**
remembers the displayed week's targets and notes for the current configuration.
When **Repeat my routine each week** is enabled, opening an empty upcoming week
fills it with that routine and fresh unchecked boxes. Edited weeks stay intact.

**Clear day**, **Clear week** and **Clear all scheduled workouts** speed up editing
and offer Undo. Cleared weeks stay empty on return. Clearing all dates asks you
to confirm the count, retains your library and saved routine, and pauses repeat.
Use **Suggest this week** to explicitly refill a cleared week.

**Copy plan to next week** carries forward your edited targets and notes, gives
each copied exercise a fresh unchecked box, and fills only empty upcoming days.
Use the week arrows or date field to view previous and future weeks. Deleting an
exercise, suggesting a week, and copying a week offer an **Undo** button.

General suggestions are adjustable starting points. Training purpose, experience and
exercise type guide sets and reps. The existing Mifflin–St Jeor estimate uses
weight, height, age, formula sex and activity to estimate maintenance calories.
When the saved calorie target is more than 10% below estimated maintenance, the
planner reduces the suggested sets by one, with a minimum of two. It uses each
day's saved calorie target when available, otherwise the profile target. Partial
food logs are not treated as complete calorie intake. Measurements alone cannot
predict strength or determine a lifting weight; the planner leaves weight for
you to choose. Preference and profile updates do not rewrite saved workouts.

Workout settings, dates, target ranges, rest, session notes, personal exercise
types and images, saved routines and completion are included in JSON backups.
Older Daily Balance backups still restore normally and start with an empty
workout calendar.
When signed in, workout plans and checkboxes sync with the rest of your journal.
Concurrent exercise changes combine automatically. Each save changes only its
edited fields on the latest account revision, preserving unrelated settings.

## Make the app your own

Open **Settings** in the side menu. Choose **Light**, **Dark**, or **Follow my
device**. Each theme keeps five independent colors: background, cards and
panels, main text, secondary text, and titles and accents. Use each color's red,
green and blue sliders (0–255), number fields, color picker, or hex field.
Changes preview immediately and save when you finish the adjustment. Switching
themes loads that theme's own palette. **Reset light/dark colors** resets only
the palette currently being edited. The contrast readout can help when choosing
readable text colors.

Use the four text sliders to size page titles, section headings, main text, and
secondary text and labels independently. These apply throughout the app,
including forms and mobile layouts. Small text starts at a more readable 12 px.
**Reset text sizes** restores the defaults. You can also choose comfortable or
compact spacing and reduce animation. Device reduced-motion settings continue
to be respected.

Choose **Upload photo** for a JPEG, PNG or WebP image up to 10 MB. The app makes a
small centered portrait for your profile; **Remove photo** clears it. Your photo
is stored with your journal, not in the public repository.

Signed in, these preferences and your photo belong to your account and sync
between devices. Signing out restores your browser's separate local settings;
signing into another account loads that account's own appearance. Independent
settings changes merge during sync. Preferences and photos are also included in
JSON backups; older backups restore with the default appearance.

## What is saved, and where?

- The public repository contains website code, generic food values and public
  Supabase connection settings. It contains no personal journal records.
- Signed out, settings, food logs and workout plans are saved in this browser's `localStorage`.
- Signed in, your journal is saved to your private Supabase account and cached
  separately on each device. Sign in with the same email on your laptop and
  phone. Cloud records are restricted to their owner by database policies.
- The first time you sign in with an existing local journal and an empty account,
  choose **Upload this journal**. Other devices can then load it without restoring
  your backup again. Your original signed-out browser copy is retained.
- Changes save locally immediately and sync automatically. The site checks for
  revision updates every 30 seconds while visible and when you return to it. **Sync now**
  requests a check immediately. Wait for **Synced to your account** before closing
  a device if you need those changes available elsewhere right away.
- Signed-in editing is enabled only after this device confirms the account copy.
  Loading, saving, connection failures and returning from a hidden tab pause
  editing. Already-staged changes remain cached across reloads and reconnects.
  Signed-out journals continue to work locally.
- Competing saves automatically replay their changed fields on the latest server
  revision. Independent edits are preserved; for the same field, cloud commit
  order decides the result. You no longer choose between entire journal copies.
  The database revision check rejects stale writes before they can overwrite data.
- Unchanged checks fetch only the revision and do not upload the journal. Normal
  edits use one atomic save. Database requests have a 45-second overall deadline.
  A failed attempt stops automatic retries and polling, including on tab focus,
  so an unavailable service does not cause a retry loop. **Retry sync** makes one
  fresh attempt. Reconnecting a device also permits one new attempt. Error details
  show the code and the operation that failed. Hidden tabs stop polling.
  Tabs in the same browser share a writer lock when supported.
- Older tabs omitting newer appearance or workout fields retain the account's
  known values. Pre-update local snapshots are retained: **Sync devices → Export
  previous local save** downloads one for recovery. Keep your current backup too.
  A failed browser write shows **Not saved** and offers backup export.
- Appearance changes have a separate per-account local checkpoint. Unsynced
  colors, sizes and photos can survive a stale full-journal cache on reload.
  When an older snapshot is available, **Recover saved appearance** restores only
  appearance and preserves current food, workout and weight records. It saves
  locally while the database is unavailable and uploads after a successful retry.
  Current clients identify deliberate appearance edits and resets, preventing
  older clients stripping that information from silently replacing a custom
  palette with defaults.
- Clearing browser data removes cached journals, pending unsynced changes and
  sign-in sessions. Synced account data can be loaded after signing in again.
  Private browsing may discard its local cache when closed.
- Sign out on shared devices. The signed-in cache is separate from the original
  local journal; browser storage remains readable by someone with access to that
  browser profile. A different account does not inherit another account's cache.

Keep periodic JSON backups. Do not commit personal backups to the repository.

## Updating or keeping the site

Edit or replace the website files and commit to the publishing branch to update
it. Keeping the repository name preserves the usual project URL. Do not delete
the repository or disable Pages if you want to keep the site available.

No third-party host provides a promise of availability forever. Keeping this
ZIP and your JSON backups lets you move the tracker to another static host.

## Troubleshooting

- **404:** check that Pages finished deploying and that `index.html` is in
  `main` at the root, not inside a second folder.
- **Blank screen:** verify that all JavaScript files and the `vendor/` folder were uploaded.
  Keep their relative paths intact. Look at the browser console for
  the failing request if needed.
- **Old appearance after an update:** reload with `Ctrl + F5` on Windows.
- **Sync setup incomplete:** follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md). The
  GitHub connection alone does not enable the database or email sign-in.
- **Original journal missing:** sign in with the same email used on the other
  device, or use **Restore backup** on the new address.
  Hosting the source files does not migrate another site's browser storage.
- **Database request timeout:** editing stays paused and repeated requests stop.
  If you manage the Supabase project, check its database status and restart the
  project if it is unresponsive, then click **Retry sync**. Publishing the static
  website does not restart the database. Keep browser storage and export backups
  while the service is unavailable.
- **Opening `index.html` by double-click does not work:** browser modules need
  an HTTP/HTTPS origin. Open the hosted Pages address. For local development,
  you can run `python -m http.server 8000` in this folder and open
  `http://localhost:8000/` instead.

## Development checks

No build step or dependency installation is required to run the app. With Node.js
22 or newer, run the journal, workout and appearance checks with:

```sh
node --test tests/*.test.mjs
```

These cover backup migration and round trips, calendar boundaries, workout
suggestions, copying, color validation, independent palettes and text sizes,
and merging records and preferences between devices. With Python Playwright
and Chromium installed, `python3 tests/workout-ui-smoke.py` checks the supplied
routine, guides, custom exercises/images, repeating and clearing, reloads,
backup recovery, storage failure and responsive layouts. Run
`python3 tests/cloud-sync-smoke.py` for mocked two-device sync, editing locks,
automatic conflict handling, same-browser tabs, pending workouts across reloads,
food logging with custom colors/text/photo, photos and account isolation.
`python3 tests/sync-outage-smoke.py` reproduces a stalled database, verifies that
retries stop, and checks appearance-only recovery, reloads and account isolation.

## References

- Creating a Pages site:
  https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Publishing configuration:
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Uploading files:
  https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Browser storage:
  https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

The calculation and storage logic was checked, including compatibility with
backups from the original tracker. The workout flow was also checked in Chromium,
including desktop and mobile layouts, dark mode, completion, editing, reload,
and backup/restore.
