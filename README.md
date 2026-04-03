# Sanctions Dashboard

A Node.js/Express dashboard that pulls sanctioned vessels and aircraft from [OpenSanctions](https://opensanctions.org) bulk data, caches results locally for 6 hours, and serves them through a dark-themed web UI.

## How it works

- **Vessels** — streamed from the OpenSanctions `maritime` collection CSV (~3 MB, no API calls)
- **Airplanes** — streamed from the `sanctions` FTM NDJSON export (~312 MB), filtered for `schema=Airplane`
- Results are cached in `cache/sanctions.json` for 6 hours; subsequent requests are instant
- `GET /api/sanctions` returns normalized JSON; `GET /` serves the dashboard UI

## Local development

```bash
cp .env.example .env
# add your key to .env
npm install
node index.js
# open http://localhost:3000
```

The `OPENSANCTIONS_API_KEY` env var is required by the service code but is **not used** for the bulk data download path — it is only needed if you switch back to the search API. Railway will still expect it to be set.

## Deploy to Railway

### 1. Push to GitHub

```bash
cd my-first-project
git init
git add .
git commit -m "Initial commit"
gh repo create my-sanctions-dashboard --public --source=. --push
```

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `my-sanctions-dashboard` repository
4. Railway detects Node.js automatically via Nixpacks

### 3. Set environment variables

In your Railway project dashboard:

1. Click your service → **Variables** tab
2. Add:

| Variable | Value |
|---|---|
| `OPENSANCTIONS_API_KEY` | your key from opensanctions.org |

`PORT` is set automatically by Railway — do not override it.

### 4. Deploy

Railway triggers a deploy on every push to `main`. To redeploy manually:

```bash
git push origin main
```

Or click **Deploy** in the Railway dashboard.

### 5. Get your URL

Once deployed, Railway assigns a public URL under **Settings → Networking → Public URL**. Open it to see the dashboard.

> **First-load note:** on a cold start the server streams ~315 MB of bulk data from OpenSanctions before responding. The healthcheck timeout in `railway.json` is set to 300 seconds to account for this. Subsequent requests within 6 hours serve from cache instantly.
