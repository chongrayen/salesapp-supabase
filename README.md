# Sales Overview Website

A lightweight Node.js + vanilla JS dashboard that ingests all of your supplier spreadsheets and turns them into an interactive sales command center. Drop Excel exports into `workbooks/`, hit reload, and the site recalculates supplier summaries, transaction timelines, and per-part drill‑downs. A manual entry form keeps the data set current between spreadsheet drops.

## Features at a glance

- **Multi-workbook ingestion**: every `.xlsx` inside `workbooks/` (or the folder pointed to by `WORKBOOKS_DIR`) is parsed and merged.
- **Supplier-aware summaries**: totals, average prices, and transaction counts grouped by supplier + source workbook.
- **Fast search & filters**: search by part number, PO, supplier, or free-text remark; sort by price or date.
- **Manual entries**: add transactions from the UI or `POST /api/parts`; they persist in `data/manual-entries.json`.
- **Hot reload**: call `/api/reload` to re-parse spreadsheets without restarting the server.
- **Docker + Procfile**: deploy to Docker hosts, Railway, Render, Fly.io, or any platform that runs Node 18+.

## Prerequisites

- Node.js 18+
- npm 9+
- At least one supplier workbook (`.xlsx`) copied into `workbooks/` (or wherever `WORKBOOKS_DIR` points).

## Quick start

```bash
# install dependencies once
npm install

# run the dev server (defaults to http://localhost:3000)
npm start
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the Express server |
| `WORKBOOKS_DIR` | `<repo>/workbooks` | Directory containing `.xlsx` files to ingest |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-delimited list of origins allowed to call the API |

## Feeding Excel data

1. Copy every supplier export (`.xlsx`) into `workbooks/`.
2. Place the relevant data on the first sheet of each workbook (the parser reads sheet 0).
3. Optional: rename files to make supplier identification easier (fallback is filename if headers are missing).
4. Hit <http://localhost:3000/api/reload> or restart the server to re-parse once new files arrive.

> **Note:** The original proprietary workbook is intentionally excluded from the repo. Add your own spreadsheets locally; Git ignores everything in `workbooks/` so private data stays off GitHub.

## Manual entries & API

- Click **“➕ Add manual entry”** in the UI to log purchases without touching Excel. Required inputs: supplier, date, part number, quantity, and unit price. Optional: PO + remarks.
- Data lands in `data/manual-entries.json` (gitignored). Persist that file/volume in production if you rely on manual entries.
- Programmatic inserts:

```bash
curl -X POST http://localhost:3000/api/parts \
  -H 'Content-Type: application/json' \
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

Endpoints of note:

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/parts` | GET | Full merged data set (workbooks + manual entries) |
| `/api/parts` | POST | Insert a manual entry (same payload as UI) |
| `/api/reload` | POST/GET | Re-parse every workbook and refresh cache |

## Deploying

### Docker

```bash
docker build -t sales-overview .

docker run -it --rm \
  -p 3000:3000 \
  -e PORT=3000 \
  -e WORKBOOKS_DIR=/data/workbooks \
  -v "$(pwd)/workbooks:/data/workbooks" \
  -v "$(pwd)/data:/app/data" \
  sales-overview
```

### Platform tips

1. **Persist spreadsheets**: mount a volume or S3 bucket to `/data/workbooks` and set `WORKBOOKS_DIR=/data/workbooks`.
2. **Persist manual entries**: mount `/app/data` (or store `data/manual-entries.json` elsewhere).
3. **Front-end hosting** elsewhere? Expose the API URL via `<script>window.__SALESAPP_API__="https://api.example.com";</script>` before `app.js` and set `CORS_ALLOWED_ORIGINS` accordingly.
4. **Zero-downtime reloads**: wire `/api/reload` to whatever automation drops fresh spreadsheets (Cron, GitHub Actions, etc.).

## Repository layout

```
SalesApp/
├── data/                     # runtime storage (gitignored)
├── public/                   # static assets (HTML/CSS/JS)
├── workbooks/                # place private Excel exports here (gitignored)
├── server.js                 # Express backend & ingestion logic
├── package.json / lock       # dependencies (Express, SheetJS, etc.)
├── Dockerfile                # container build
├── Procfile                  # optional Heroku/Render entrypoint
├── DEPLOYMENT.md             # extra hosting walkthroughs
└── README.md                 # you are here
```

## Next steps

- Drop your spreadsheets into `workbooks/`, reload, and watch the dashboard repopulate.
- Wire this repo to your hosting platform of choice (Docker, Railway, Render, Fly.io, etc.).
- Extend `public/app.js` or `server.js` to track the metrics that matter most to your team.

Happy selling! 📈
