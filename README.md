# Daily Balance — GitHub Pages edition

A static calorie and macro tracker. This package contains the complete website:
HTML, CSS, JavaScript, and the icon. It does not need an OpenAI account, API key,
database, paid server, npm installation, or application build step.

The 27-food starter catalog, portion editor, calorie and macro progress bars,
energy formulas, daily history, weight journal, and backup/restore are included.
Use the **Dark mode** switch in the top bar to choose a light or dark theme.
It follows your device's theme initially and remembers your choice in this browser.

## 1. Export your existing journal first

1. Open your current tracker in the browser where you have been logging food.
2. Click **Export backup** at the bottom of the page, or use the export button
   in **Profile & goals**.
3. Keep the downloaded `.json` file on your own device. It contains your profile,
   personal food labels, goals, dated food logs, and weight history.
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
| `core.js` | Food catalog, formulas and validation |
| `theme.js` | Light/dark theme switching and saved preference |
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

1. Open your new GitHub Pages address.
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

## What is saved, and where?

- The public repository contains the website code and generic food values.
- Your personal settings and logs are saved in this browser's `localStorage`.
  The tracker does not send them to GitHub or OpenAI.
- The new website address has separate browser storage from the original
  ChatGPT address. Export and restore are necessary for migration.
- The same website on a different browser or device also has separate data.
  Export a backup and restore it there if you want to transfer the journal.
- Clearing the site's browser data can delete its journal. Private browsing
  generally discards stored data when its private session ends.
- Anyone with access to your device and browser profile can use its saved
  journal. This edition has no sign-in or password lock.

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
- **Blank screen:** verify that both JavaScript files were uploaded and that
  their exact names are `app.js` and `core.js`. Look at the browser console for
  the failing request if needed.
- **Old appearance after an update:** reload with `Ctrl + F5` on Windows.
- **Original journal missing:** use **Restore backup** on the new address.
  Hosting the source files does not migrate another site's browser storage.
- **Opening `index.html` by double-click does not work:** browser modules need
  an HTTP/HTTPS origin. Open the hosted Pages address. For local development,
  you can run `python -m http.server 8000` in this folder and open
  `http://localhost:8000/` instead.

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
backups from the original tracker. Live browser layout verification and an
actual deployment to your GitHub account were not performed for this package.
