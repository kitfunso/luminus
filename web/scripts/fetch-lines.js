#!/usr/bin/env node
/**
 * Fetch major EU cross-border transmission lines from OpenStreetMap Overpass API.
 * Saves simplified polyline data to public/data/transmission-lines.json.
 *
 * Usage: node scripts/fetch-lines.js
 *
 * Note: Overpass queries for EU-wide 220kV+ lines can be slow (30-60s).
 * A static fallback dataset is bundled in transmission-lines.json.
 */
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'transmission-lines.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 90_000;

// Bounding box: roughly covers EU (south, west, north, east)
const BBOX = '35.0,-12.0,72.0,35.0';

// Query for high-voltage cross-border lines (voltage >= 220kV)
const OVERPASS_QUERY = `
[out:json][timeout:120][bbox:${BBOX}];
way["power"="line"]["voltage"~"^(220000|275000|380000|400000|500000|750000)$"];
out geom;
`;

async function fetchLines() {
  console.log('fetch-lines: querying Overpass for HV transmission lines...');
  console.log('  This may take 30-90 seconds...');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = new URLSearchParams({ data: OVERPASS_QUERY });
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Overpass returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const elements = data.elements || [];
    console.log(`  -> ${elements.length} line segments from Overpass`);

    // Simplify: extract polylines with voltage
    const lines = [];
    for (const el of elements) {
      if (!el.geometry || el.geometry.length < 2) continue;

      const voltageStr = el.tags?.voltage || '';
      const voltage = Math.round(parseInt(voltageStr, 10) / 1000); // kV

      // Simplify geometry: keep every Nth point for long lines
      const geom = el.geometry;
      const step = geom.length > 20 ? Math.ceil(geom.length / 10) : 1;
      const simplified = [];
      for (let i = 0; i < geom.length; i += step) {
        simplified.push([
          Math.round(geom[i].lon * 10000) / 10000,
          Math.round(geom[i].lat * 10000) / 10000,
        ]);
      }
      // Always include last point
      const last = geom[geom.length - 1];
      const lastPt = [
        Math.round(last.lon * 10000) / 10000,
        Math.round(last.lat * 10000) / 10000,
      ];
      if (
        simplified[simplified.length - 1][0] !== lastPt[0] ||
        simplified[simplified.length - 1][1] !== lastPt[1]
      ) {
        simplified.push(lastPt);
      }

      if (simplified.length >= 2) {
        lines.push({
          voltage,
          path: simplified,
          name: el.tags?.name || el.tags?.ref || `Line ${el.id}`,
        });
      }
    }

    console.log(`  -> ${lines.length} lines after simplification`);

    fs.writeFileSync(OUT_PATH, JSON.stringify(lines));
    console.log(`  -> Saved to ${OUT_PATH}`);
    return lines;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('  Overpass query timed out. Keeping existing static data.');
    } else {
      console.warn(`  Overpass query failed: ${err.message}`);
      console.warn('  Keeping existing static data.');
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

fetchLines().catch((err) => {
  console.error('fetch-lines: fatal:', err);
  process.exit(1);
});
