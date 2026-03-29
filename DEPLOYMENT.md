# Deployment Guide

## 1. Publish this repo to GitHub

1. Initialize git if needed:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create a GitHub repo and push the project:
   ```bash
   gh repo create your-org/salesapp --source=. --remote=origin --public --push
   ```
3. Keep private `.xlsx` files inside `workbooks/`. The repo ignores local workbook files and the manual entry data file.

## 2. Deploy on Render

1. Create a Render Web Service connected to this repo.
2. Use:
   - Build command: `npm install`
   - Start command: `npm start`
3. Configure environment variables:
   - `PORT=10000` if you want a local default in Render configs
   - `WORKBOOKS_DIR=/data/workbooks` if you are mounting workbook storage
   - `CORS_ALLOWED_ORIGINS` only if your frontend is hosted on a different origin
4. Add persistent storage if you need data to survive redeploys:
   - mount workbook storage at `/data/workbooks` for local file ingestion
   - mount `/app/data` to persist `manual-entries.json`
5. After uploading new workbook files, call `GET /api/reload`.

If you use Supabase Storage instead of a mounted workbook folder, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`

## 3. Separate frontend hosting

Render already serves the frontend from `public/`, so this is optional.

If you decide to host the frontend somewhere else later:

1. Serve the contents of `public/` from your static host.
2. Add this snippet before `app.js` in `public/index.html`:
   ```html
   <script>
     window.__SALESAPP_API__ = 'https://your-backend-domain.onrender.com';
   </script>
   ```
3. Set `CORS_ALLOWED_ORIGINS` on the backend to the exact frontend origin.

## 4. Smoke test

- `GET /health` returns status JSON
- `GET /api/parts` returns data
- the UI loads on your Render URL
- manual entry creation works end to end
- `GET /api/reload` refreshes workbook data after uploads
