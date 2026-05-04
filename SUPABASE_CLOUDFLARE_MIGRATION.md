# Supabase + Cloudflare Migration

This migration keeps the current explorer frontend intact and moves the heavy `data/**` payloads off GitHub Pages.

## Resulting stack

- Cloudflare Pages serves `index.html`, `app.js`, and `styles.css`
- Cloudflare Pages Functions intercept `/data/*`
- Supabase Storage stores the generated dataset bundles and manifests

The frontend still requests the same relative paths such as `/data/vendor/d1_year_manifest.js`, but those requests are now fulfilled by Cloudflare from Supabase Storage instead of from the repository itself.

## Files added

- `functions/data/[[path]].js`: proxies dataset assets from Supabase Storage with Cloudflare caching
- `functions/api/health.js`: small runtime check endpoint
- `scripts/build-pages-output.mjs`: builds a lean `dist/` without bundling the local `data/` tree
- `scripts/sync-supabase-storage.mjs`: uploads the current `data/` directory into Supabase Storage
- `wrangler.toml`: Cloudflare Pages config

## Supabase setup

1. Create a Supabase project.
2. Create a storage bucket named `multi-explorer-data` or choose another name and set `SUPABASE_STORAGE_BUCKET`.
3. Mark the bucket as public.
4. Export these environment variables before upload:

```powershell
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
$env:SUPABASE_STORAGE_BUCKET="multi-explorer-data"
$env:SUPABASE_STORAGE_PREFIX=""
```

5. Upload the generated data assets:

```powershell
npm run sync:supabase:data
```

## Cloudflare setup

1. Create a Cloudflare Pages project from this repo.
2. Set the build command to:

```text
npm run build:pages
```

3. Set the build output directory to:

```text
dist
```

4. Add these Pages environment variables:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_STORAGE_BUCKET=multi-explorer-data
SUPABASE_STORAGE_PREFIX=
```

5. Deploy the Pages project.

## Local verification

Build the deployable Pages output:

```powershell
npm run build:pages
```

Run the Cloudflare Pages dev server:

```powershell
npm run cf:dev
```

Then verify:

- `/` loads the app shell
- `/api/health` returns `ok: true`
- `/data/vendor/d1_year_manifest.js` streams from Supabase

## Operational notes

- The local `data/` directory remains the canonical generated source in this repo.
- `dist/` intentionally excludes the local `data/` tree so Pages does not redeploy those large files as static assets.
- Cache headers are set at the Cloudflare function layer for edge reuse.
- If you regenerate data, rerun `npm run sync:supabase:data` before the next Pages deploy.
- For the GitHub Pages deployment, leave `window.__DATA_ASSET_BASE__` empty in `index.html` to serve versioned local `data/` assets and avoid Supabase bandwidth/quota pressure. Set it only for a Cloudflare/Supabase deployment.
- Supabase uploads default to `Cache-Control: public, max-age=31536000, immutable`; override with `SUPABASE_UPLOAD_CACHE_CONTROL` if needed.
