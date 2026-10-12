# Supabase setup for private journal sync

The Supabase project and its GitHub connection do not automatically add sync to
the website. The website needs authentication, a private table, and its public
project connection settings. The database password is not needed by the browser.

## 1. Public project settings

Open the project's **Connect** dialog or **Settings → Data API / API Keys** and
copy the Project URL and publishable key (`sb_publishable_…`). A legacy `anon`
key is also suitable. These are browser configuration, not administrator secrets.
Do not share or put a secret key, `service_role` key, or database password in the
public repository.

## 2. Authentication

Under **Authentication → Sign In / Providers**, enable **Email**. Keep email
confirmation enabled. You do not need to configure GitHub as a login provider
for the tracker; the GitHub login used to manage Supabase is separate.

Under **Authentication → URL Configuration**, set:

- **Site URL:** `https://vanessagza.github.io/CalTrack/`
- **Redirect URLs:** add `https://vanessagza.github.io/CalTrack/`

The intended tracker login uses an email sign-in link. Keep the default email
templates initially. Supabase's built-in email sender has limits and is intended
for testing; if delivery is restricted to team-member emails or hits a rate
limit, configure custom SMTP before relying on it for regular use.

## 3. Database

Open **SQL Editor → New query**, paste the complete contents of
[supabase/setup.sql](supabase/setup.sql), and click **Run**. This creates the
journal table, enables RLS, explicitly grants the required Data API permissions,
and adds policies restricting every signed-in user to their own row. A save
function checks revisions so an older device cannot silently overwrite a newer
journal. No personal records are embedded in the script.

You can rerun the script. It does not delete existing journals.

Refreshing the SQL editor does not delete the table or save function previously
created by a successful run. The query text does not have to remain in the editor.
The setup script is retained in this repository.

If sync times out or the dashboard reports high resource usage, run the three
read-only checks in [supabase/diagnostics.sql](supabase/diagnostics.sql), one at a
time. They report whether the table and function exist, total database size, the
journal table's disk size, estimated old row versions awaiting cleanup, and
connection states with active request durations. They do not show query text,
read personal journal contents or change records. Estimates, cleanup timestamps
and connection snapshots help investigation; they do not establish the cause of
an outage.

Copy the exact dashboard usage label too: CPU percentage, database size, disk
allocation and network transfer are different resources. Built-in exercise SVGs
are hosted with the website on GitHub Pages. Uploaded profile and custom exercise
images are resized and included in the private journal; exercise images are
stored once in the library rather than copied into every scheduled workout.
Database updates can leave old row versions until PostgreSQL cleans them up, so
disk use can exceed the size of current records. Confirm the measurements before
choosing a cleanup, storage migration or plan change.

A project can be marked **Healthy** while high CPU usage makes database requests
time out. Refresh the app on every device to load the changes that stop retries
after a failure. Reloading the SQL editor is separate from restarting the project.
If the database remains unresponsive, use Supabase's **Restart project** control,
wait for it to become healthy again, and choose **Retry sync** in the app. Restart
controls and database usage are managed in Supabase, not by publishing the site.

## 4. Website integration

The Project URL and public key must be added to the website's browser
configuration, then the sign-in and sync integration must be tested and deployed.
Creating the project or running the SQL alone does not enable syncing.

After deployment, sign in on the laptop containing the restored journal, upload
that journal to your account, and then sign into the same account on your phone.
Keep your existing JSON backup until you have verified the journal on both
devices. The GitHub connection is optional for this GitHub Pages workflow; no
Supabase paid plan, storage bucket, Edge Function, or database password in Codex
is required.

## 5. Codex network access for live validation

In this Codex environment's **Internet access → Additional allowed domains**, add
`yryletdmkumpqfwwkpda.supabase.co`, keeping `api.github.com` and any other existing
entries. Save the change and publish the environment. This allows Codex to test
Supabase; visitors' browsers connect directly to Supabase and do not use this
Codex network policy.

An attempted draft update from this original setup chat was rejected because its
base version is stale after publication. The domain addition has not been saved
by that tool. Apply it in the current environment settings. The proposed domain
list and setup files are available separately for transfer if a new setup chat
is required.

## Development checks

From the checkout root, run:

```sh
node --test tests/journal-merge.test.mjs
python3 tests/cloud-sync-smoke.py
```

The browser smoke test uses Python Playwright, `/usr/bin/chromium`, a temporary
HTTP server and a simulated Supabase API. It checks two devices, offline editing
locks, automatic rebasing, same-browser tabs, settings preservation, per-account
caches, email login requests and sign-in callbacks. It does
not send email or prove connectivity to the configured live project.

For SQL/RLS checks using an isolated PostgreSQL-compatible PGlite database:

```sh
npm --cache /tmp/caltrack-npm-cache install --prefix /tmp/caltrack-sql-validation --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
cp tests/supabase-rls.mjs /tmp/caltrack-sql-validation/validate.mjs
node /tmp/caltrack-sql-validation/validate.mjs
```

This checks repeatable setup, ownership policies, anonymous access denial and
atomic revision conflicts using synthetic users. Live email delivery and RLS in
the actual Supabase project still need validation after the setup is applied.
