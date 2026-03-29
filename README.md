# SalesApp

SalesApp is a lightweight Node.js app for browsing part purchase history from supplier Excel exports. It loads workbook rows into a simple web UI, lets you search and sort purchase records, and supports manual entry for transactions that have not made it into the spreadsheets yet.

The app can read `.xlsx` files from either:

- a local `workbooks/` folder
- a Supabase Storage bucket

It also stores manual entries in `data/manual-entries.json`.

## What the app does

- Parses supplier workbook data from the first sheet of each `.xlsx` file
- Detects header rows even when column labels vary slightly
- Extracts part number, PO, supplier, quantity, unit price, and total price
- Skips adjustment-style rows such as exchange gain/loss entries
- Displays records in a searchable, sortable single-page UI
- Supports manual entry creation through the UI or API
- Optionally exposes a shared folder link in the UI

## Tech stack

- Node.js
- Express
- SheetJS (`xlsx`)
- Supabase Storage (optional)
- Vanilla HTML, CSS, and JavaScript

## Prerequisites

- Node.js 18 or newer
- npm
- Excel workbooks in `.xlsx` format if you are using local file ingestion

## Quick start

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` by default.

## Configuration

SalesApp works in two ingestion modes:

1. Local workbook mode
2. Supabase Storage mode

If Supabase credentials are present, the app reads workbooks from Supabase Storage. Otherwise it falls back to the local workbook directory.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the Express server |
| `WORKBOOKS_DIR` | `workbooks` | Local directory for `.xlsx` files when Supabase is not configured |
| `CORS_ALLOWED_ORIGINS` | not set | Comma-separated allowlist for cross-origin API requests |
| `SHARED_FOLDER_URL` | empty | If set, shows an "Open Data Folder" button in the UI |
| `SUPABASE_URL` | empty | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Service role key used to read from Storage |
| `SUPABASE_BUCKET` | empty | Storage bucket containing Excel files |

### Local workbook mode

1. Put `.xlsx` files in `workbooks/`, or set `WORKBOOKS_DIR` to another folder.
2. Start the server.
3. Open `http://localhost:3000`.
4. Call `GET /api/reload` after adding or changing workbooks.

Workbook files are ignored by Git through `.gitignore`.

### Supabase Storage mode

Set all three of these variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`

When all three are present, the app lists `.xlsx` files from the configured bucket, downloads them in memory, and parses them at startup and on reload.

## Expected workbook structure

The parser scans for a header row and maps common aliases to these canonical fields:

- `date`
- `transactionType`
- `po`
- `product`
- `memo`
- `quantity`
- `rate`
- `amount`
- `balance`

The required fields for parsing are:

- `date`
- `product`
- `memo`
- `quantity`
- `rate`
- `amount`

Part numbers are extracted primarily from:

- `memo`
- the trailing segment of `product` when it contains a colon
- `product` directly when it already looks like a part number

The app expects transaction dates in `DD/MM/YYYY` format inside workbook rows.

## Manual entries

Manual entries can be added from the web form or by calling the API directly.

They are saved to:

- `data/manual-entries.json`

This file is not committed and should be persisted separately in production if you rely on manual data.

Example request:

```bash
curl -X POST http://localhost:3000/api/parts \
  -H "Content-Type: application/json" \
  -d '{
    "supplier": "Arrow",
    "date": "2026-03-18",
    "partNo": "10AS066H3F34I2SG",
    "qty": 5,
    "price": 725,
    "po": "PO212445",
    "remark": "Spare lot"
  }'
```

## API

### `GET /health`

Returns service health plus whether Supabase mode is active.

### `GET /api/parts`

Returns the merged data set:

- parsed workbook entries
- manual entries

Response shape:

```json
{
  "total": 123,
  "distinctParts": 45,
  "data": []
}
```

### `POST /api/parts`

Creates a manual entry.

Expected JSON body:

```json
{
  "supplier": "Arrow",
  "date": "2026-03-18",
  "partNo": "10AS066H3F34I2SG",
  "qty": 5,
  "price": 725,
  "po": "PO212445",
  "remark": "Spare lot"
}
```

### `GET /api/reload`

Re-parses workbook data and refreshes the in-memory cache.

## Frontend behavior

The UI is served directly by the Express app from `public/`.

It includes:

- summary stats for record count, unique parts, and total spend
- quick search by part number, PO, supplier, or remark
- sort by date or unit price
- detail panel for the selected record
- manual entry form

If you host the frontend separately, set:

```html
<script>
  window.__SALESAPP_API__ = "https://your-api-domain.com";
</script>
```

before loading `app.js`, and configure `CORS_ALLOWED_ORIGINS` on the backend.

## Deployment

This repository already includes deployment artifacts:

- `Dockerfile`
- `Procfile`
- `render.yaml`
- `DEPLOYMENT.md`

### Docker

```bash
docker build -t salesapp .

docker run -it --rm \
  -p 3000:3000 \
  -e PORT=3000 \
  -e WORKBOOKS_DIR=/data/workbooks \
  -v "$(pwd)/workbooks:/data/workbooks" \
  -v "$(pwd)/data:/app/data" \
  salesapp
```

### Notes for production

- Persist the workbook source, whether that is a mounted local folder or Supabase Storage
- Persist `data/manual-entries.json` if manual entries matter
- Restrict `CORS_ALLOWED_ORIGINS` when the frontend is hosted on another domain
- Call `GET /api/reload` after uploading new workbook files

## Repository layout

```text
salesapp-supabase/
|-- data/                # runtime storage for manual entries
|-- public/              # static frontend
|-- workbooks/           # local Excel source directory
|-- server.js            # Express server and workbook parsing logic
|-- package.json         # dependencies and start script
|-- Dockerfile           # container build
|-- Procfile             # process entrypoint for compatible hosts
|-- render.yaml          # Render service definition
|-- DEPLOYMENT.md        # extra deployment notes
`-- README.md
```

## Development notes

- The app has no frontend build step
- Static assets are served from `public/`
- Workbook parsing happens at startup and on `GET /api/reload`
- Search and sort are handled client-side after the initial data load
