// Kleine sleutel/waarde-opslag.
// Op Replit (ook in een deployment) gebruiken we de Replit Database via REPLIT_DB_URL,
// anders een JSON-bestand in ./data. Er worden hier GEEN klantadressen opgeslagen.
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.REPLIT_DB_URL;
const FILE = path.join(__dirname, 'data', 'store.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

async function get(key, fallback = null) {
  if (DB_URL) {
    const res = await fetch(`${DB_URL}/${encodeURIComponent(key)}`);
    if (res.status === 404) return fallback;
    const text = await res.text();
    if (!text) return fallback;
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }
  const data = readFile();
  return key in data ? data[key] : fallback;
}

async function set(key, value) {
  if (DB_URL) {
    await fetch(DB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`,
    });
    return;
  }
  const data = readFile();
  data[key] = value;
  writeFile(data);
}

async function del(key) {
  if (DB_URL) {
    await fetch(`${DB_URL}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return;
  }
  const data = readFile();
  delete data[key];
  writeFile(data);
}

module.exports = { get, set, del };
