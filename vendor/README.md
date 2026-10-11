# Supabase browser SDK

`supabase.js` is the locally bundled browser build of `@supabase/supabase-js`
2.117.3, built with esbuild 0.28.2. The app has no runtime CDN dependency and no
npm install requirement for serving it. Third-party licenses are in `licenses/`.

To reproduce the bundle, install the pinned build tools outside the checkout:

```sh
npm --cache /tmp/caltrack-npm-cache install --prefix /tmp/caltrack-sync-build --no-audit --no-fund --save-exact @supabase/supabase-js@2.117.3 esbuild@0.28.2
```

Create `/tmp/caltrack-sync-build/entry.js` containing:

```js
export { createClient } from '@supabase/supabase-js';
```

Then, from the repository root:

```sh
/tmp/caltrack-sync-build/node_modules/.bin/esbuild /tmp/caltrack-sync-build/entry.js --bundle --minify --format=esm --platform=browser --legal-comments=external --outfile=vendor/supabase.js
```

When updating dependencies, retain the corresponding package license files.
