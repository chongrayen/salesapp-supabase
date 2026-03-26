# Deployment Guide

## 1. Publish this repo to GitHub

1. Initialise git (skip if already initialised):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create a GitHub repo (via the UI or the GitHub CLI):
   ```bash
   gh repo create your-org/salesapp --source=. --remote=origin --public --push
   ```
3. Keep private `.xlsx` files inside `workbooks/`; `.gitignore` already excludes everything except `fruit-purchases-sample.xlsx`, so you can safely push without leaking customer data.

## 2. Backend hosting (Render example)

1. In Render, create a **Web Service** attached to the GitHub repo.
2. Configure build & start commands:
   - Build: `npm install`
   - Start: `npm start`
3. Add environment variables:
   - `PORT=10000` (Render injects this automatically, but set a default locally if desired).
   - `WORKBOOKS_DIR=/data/workbooks`
   - `CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com` (comma-separate multiple origins; omit if frontend is served by the same host).
4. Add two persistent disks (or one multi-use volume) and mount them at:
   - `/data/workbooks` → place/upload fresh `.xlsx` files here.
   - `/app/data` → keeps `manual-entries.json` alive across deploys.
5. After Render builds the service, upload your spreadsheets to the mounted `workbooks` directory (SFTP or Render shell), then hit `<backend-url>/api/reload` to ingest.

> **Other hosts**: Railway, Fly.io, Azure Web Apps, etc., work the same way. Use the provided `Dockerfile` if the platform expects a container image. Mount/persist the same two paths and set the environment variables described above.

## 3. Frontend hosting (Netlify/Vercel/Cloudflare Pages)

The Express server already serves the static UI, so you can stop here if you don’t need separate hosting. If you do want to host the frontend on a static provider:

1. Copy the contents of `public/` into your static site (Netlify drop, Vercel project, etc.). No build step is required.
2. Add a snippet **before** the `<script src="app.js" type="module"></script>` line in `public/index.html`:
   ```html
   <script>
     window.__SALESAPP_API__ = 'https://your-backend-domain.onrender.com';
   </script>
   ```
   (Commit this change or inject it via your provider’s HTML transform feature.)
3. On the backend, set `CORS_ALLOWED_ORIGINS` to the exact origin of your static site (e.g. `https://salesapp.netlify.app`). Multiple origins can be comma-separated.
4. Redeploy both services. The static site will now call `https://your-backend-domain.../api/*` while the backend only answers requests from the allowed origins.

## 4. Smoke-test checklist

- `GET /api/parts` returns JSON in the backend logs.
- The static site loads records and the supplier badges are populated.
- Manual entry form works end-to-end (watch for `POST /api/parts` in backend logs).
- Hitting `/api/reload` after uploading a new workbook shows status `200` and the UI reflects the new rows after refresh.

Once all boxes are checked, share the frontend URL with your team. 🎉
