const https = require('https');
const http = require('http');
const readline = require('readline');
const { parse } = require('csv-parse');
const db = require('./db');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const INDEX_BASE = 'https://data.opensanctions.org/datasets/latest';

// ── helpers ───────────────────────────────────────────────────────────────────

function first(arr) {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

async function resolveUrl(dataset, resourceName) {
  const indexUrl = `${INDEX_BASE}/${dataset}/index.json`;
  const index = await fetchJson(indexUrl);
  const resource = index.resources.find(r => r.name === resourceName);
  if (!resource) throw new Error(`Resource ${resourceName} not found in ${dataset}`);
  return resource.url;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getStream(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getStream(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      resolve(res);
    }).on('error', reject);
  });
}

// ── vessels (maritime CSV) ────────────────────────────────────────────────────

function normalizeVessel(row) {
  return {
    id: row.id,
    name: row.caption,
    type: 'ship',
    flag: row.flag || null,
    owner: null,
    sanctioningAuthority: row.risk ? row.risk.split(';') : [],
    imoNumber: row.imo ? row.imo.replace(/^IMO/, '') : null,
    registrationNumber: null,
    sanctionDate: null,
    sourceDataset: row.datasets ? row.datasets.split(';') : [],
  };
}

async function fetchVessels() {
  const url = await resolveUrl('maritime', 'maritime.csv');
  console.log(`Streaming vessels from ${url}`);
  const stream = await getStream(url);

  return new Promise((resolve, reject) => {
    const records = [];
    const parser = parse({ columns: true, skip_empty_lines: true });
    parser.on('readable', () => {
      let row;
      while ((row = parser.read()) !== null) {
        records.push(normalizeVessel(row));
      }
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(records));
    stream.pipe(parser);
  });
}

// ── airplanes (sanctions FTM NDJSON) ─────────────────────────────────────────

function normalizeAirplane(entity) {
  const p = entity.properties || {};
  return {
    id: entity.id,
    name: first(p.name) || entity.caption,
    type: 'plane',
    flag: first(p.country) || null,
    owner: null,
    sanctioningAuthority: p.programId || [],
    imoNumber: null,
    registrationNumber: first(p.registrationNumber) || null,
    sanctionDate: first(p.createdAt) || entity.first_seen?.split('T')[0] || null,
    sourceDataset: entity.datasets || [],
  };
}

async function fetchAirplanes() {
  const url = await resolveUrl('sanctions', 'entities.ftm.json');
  console.log(`Streaming airplanes from ${url} (filtering schema=Airplane)`);
  const stream = await getStream(url);

  return new Promise((resolve, reject) => {
    const records = [];
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', line => {
      if (!line.trim()) return;
      try {
        const entity = JSON.parse(line);
        if (entity.schema === 'Airplane') records.push(normalizeAirplane(entity));
      } catch { /* skip malformed lines */ }
    });
    rl.on('close', () => resolve(records));
    rl.on('error', reject);
  });
}

// ── public API ────────────────────────────────────────────────────────────────

async function getSanctions() {
  await db.initSchema();

  const lastFetchedAt = await db.getLastFetchedAt();
  if (lastFetchedAt && Date.now() - lastFetchedAt.getTime() < CACHE_TTL_MS) {
    const records = await db.getAllRecords();
    return { records, fromCache: true, fetchedAt: lastFetchedAt.getTime() };
  }

  console.log('DB cache miss — fetching bulk data from OpenSanctions...');
  const [vessels, airplanes] = await Promise.all([fetchVessels(), fetchAirplanes()]);
  console.log(`Fetched ${vessels.length} vessels, ${airplanes.length} airplanes — writing to DB...`);

  // merge duplicate ids — collect all IMO numbers for vessels that appear more than once
  const byId = new Map();
  for (const r of [...vessels, ...airplanes]) {
    if (byId.has(r.id)) {
      const existing = byId.get(r.id);
      if (r.imoNumber && !existing.imoNumber?.split(',').includes(r.imoNumber)) {
        existing.imoNumber = existing.imoNumber
          ? `${existing.imoNumber},${r.imoNumber}`
          : r.imoNumber;
      }
    } else {
      byId.set(r.id, { ...r });
    }
  }
  const records = [...byId.values()];
  await db.upsertRecords(records);
  console.log('DB write complete.');

  const fetchedAt = Date.now();
  return { records, fromCache: false, fetchedAt };
}

module.exports = { getSanctions };
