# Scotland coverage for screening tools — v0.6.0 plan

**Drafted:** 2026-04-21
**Target release:** `luminus-mcp@0.6.0`
**Estimated effort:** ~3 days CC time

## Goal

Extend three GB-only screening tools to cover Scotland using Scottish public equivalents, so that `screen_site`, `compare_sites`, and `get_site_connection_report` return meaningful constraint/flood/agriculture data for any GB coordinate (not just England).

In scope:
- `get_land_constraints`: add NatureScot-published SSSI / SAC / SPA / Ramsar / National Park data
- `get_flood_risk`: add SEPA Flood Risk Management Maps
- `get_agricultural_land`: add James Hutton Institute Land Capability for Agriculture (LCA)

Out of scope for 0.6.0:
- Wales (NRW data has a separate tranche worth of work)
- Northern Ireland (not covered by any existing Luminus upstream)
- EU TYNDP integration
- NGED internal signals (blocked on SIF Discovery, see pitch primer)

## Step 0 — verify upstreams (half day)

Before writing any code, confirm each endpoint is publicly queryable and the schema maps usably.

| Source | URL to probe | Confirm |
|---|---|---|
| NatureScot protected areas | https://gateway.snh.gov.uk/natural-spaces/ (or ArcGIS REST equivalent) | Point-in-polygon query returns SSSI / SAC / SPA / Ramsar with a designation code we can normalise |
| SEPA flood maps | SEPA Flood Risk Management Maps ArcGIS REST (public) | Point query returns flood extent layers (fluvial / coastal / surface water) at 1-in-10, 1-in-200, 1-in-1000 year return periods |
| James Hutton LCA | https://www.hutton.ac.uk/learning/natural-resource-datasets/soilshutton/soils-maps-scotland/land-capability-agriculture | Available as a queryable feature service (not only WMS raster). If only WMS, scope reduces to documenting the gap. |

**Deliverable of step 0:** 3-bullet memo in this plan file saying "yes/no/partial" for each, with the confirmed endpoint URL.

## Proposed implementation

### New library modules

- `src/lib/nature-scot.ts` — protected-areas fetch + parse, mirror of `src/lib/natural-england.ts`
- `src/lib/sepa-flood.ts` — flood-extent fetch + parse, mirror of the England flood service calls in `src/tools/flood-risk.ts`
- `src/lib/james-hutton-lca.ts` — LCA fetch + parse, mirror of `src/lib/natural-england-alc.ts`

### Tool-level merges

Each of the three tools gains a country-routing layer. Rather than adding a `country` enum (breaking change), detect Scotland by lat/lon bounding region inside the tool:

```ts
function isScottishCoord(lat: number, lon: number): boolean {
  // Approximate: Scotland sits roughly lat > 54.65 with longitude constraints
  // Use a coarse bbox; upstream "no match" handles edge cases (Borders, islands).
  return lat > 54.65 && lat < 61.0 && lon > -8.5 && lon < 0.5;
}
```

For any coordinate that could be Scottish, query both English + Scottish upstreams in parallel (`Promise.allSettled`). Union non-empty results. Existing country-specific caveats in the response stay — we add matching Scottish caveats alongside.

### Classification mapping

LCA grades 1 to 7 are not ALC 1 to 5. Mapping decision (to be validated with a Scottish land-agent if possible):

| LCA class | ALC equivalent | BMV? |
|---|---|---|
| 1 | Grade 1 | yes |
| 2 | Grade 2 | yes |
| 3.1 | Grade 3a | yes |
| 3.2 | Grade 3b | no |
| 4 | Grade 4 | no |
| 5, 6, 7 | Grade 5 | no |

Output keeps both the raw LCA class and the ALC-equivalent field so downstream tools don't need new code paths.

### Source metadata + health checks

Add to `src/lib/gis-sources.ts`:
- `nature-scot-protected-areas`
- `sepa-flood-map`
- `james-hutton-lca`

Each gets a health check in `GIS_HEALTH_CHECKS` following the existing pattern (CKAN `package_show` or ArcGIS `query?where=1=1&resultRecordCount=1&f=json`).

## Testing

- Unit tests (mocked fetch) per new library module, mirroring `natural-england.test.ts` patterns
- Tool-level tests: add Scottish coordinate fixtures to `land-constraints.test.ts`, `flood-risk.test.ts`, `agricultural-land.test.ts`
- Live integration test (env-gated behind `LUMINUS_RUN_INTEGRATION=1`): real coordinates at Edinburgh, Glasgow, Isle of Skye resolve to sensible Scottish results

No changes to `site-connection-report.ts` required — its GB bounding box already includes Scotland (49.5 to 61.0 lat).

## Risks and unknowns

- **LCA queryability.** If James Hutton only publishes raster WMS (not vector feature service), point-in-polygon queries are hard. Fallback: download the raster, serve it via a small static asset. Worst case: defer LCA to 0.7.0 and ship just flood + protected areas as 0.6.0.
- **SEPA schema mismatch.** Scottish flood categories may not map 1:1 to EA Flood Zone 2/3. Keep raw SEPA fields in the response and document the translation in the tool's caveats.
- **Border coordinates.** The Scottish/English border is not a latitude line. For sites in the Scottish Borders or Northumberland, both upstreams may return data. Union-first policy handles this cleanly.

## Milestones

- **M1 (day 0.5):** Step 0 verification complete. Update this file with confirmed endpoints. If any upstream is a blocker, reduce scope and replan.
- **M2 (day 1):** NatureScot integration shipped + tests green
- **M3 (day 2):** SEPA flood integration shipped + tests green
- **M4 (day 2.5):** LCA integration shipped (or deferred with documented reason) + tests green
- **M5 (day 3):** CHANGELOG, roadmap, release notes written. 0.6.0 shipped.

## Open questions to resolve at M1

1. Does NatureScot expose an ArcGIS FeatureServer or is it CKAN-only? Affects polygon-query pattern.
2. Does SEPA publish under OGL or a more restrictive licence? Affects attribution text.
3. Is the LCA dataset a national raster or a vector feature collection? Determines M4 feasibility.

---

## Verification results (M1, 2026-04-21)

All three upstreams GREEN or workable AMBER. Proceeding to M2-M4 in parallel.

### NatureScot protected areas — GREEN
- Host: `services1.arcgis.com/LM9GyVFsughzHdbO`
- Services: `Sites_of_Special_Scientific_Interest`, `Special_Areas_of_Conservation`, `Special_Protection_Areas`, `RAMSAR_Wetlands_of_International_Importance`, `National_Nature_Reserves`, `Marine_Protected_Areas`, `Local_Nature_Reserves`, `Biosphere_Reserves` — all FeatureServer layer 0
- Pattern matches Natural England exactly (ArcGIS point-in-polygon via `inSR=4326`, `spatialRel=esriSpatialRelIntersects`)
- Licence: OGL v3
- Key fields: `NAME`, `PA_CODE`, `STATUS`, `TYPE`, `SITE_HA`, `EUROPEAN_CODE` (for SAC/SPA)
- Verified live with Arthur's Seat (55.9434, -3.1733) — returns `Arthur's Seat Volcano` SSSI

### SEPA Flood Risk Management Maps — GREEN (with layer-ID discovery)
- Host: `map.sepa.org.uk/server/rest/services/Open`
- Per-likelihood services: `River_Flooding_{High,Medium,Low}_Likelihood`, `Coastal_Flooding_*`, `Surface_Water_and_Small_Watercourses_Flooding_*`. Return periods: High=1-in-10yr, Medium=1-in-200yr, Low=1-in-1000yr.
- Layer IDs inside each service are NOT uniformly 0 — must call `/layers?f=json` once per service and cache the map (e.g. River_Medium layer is `/1`)
- Licence: OGL v3
- Approximate mapping to EA zones: SEPA Medium (1-in-200yr) ≈ EA Zone 3; SEPA Low (1-in-1000yr) ≈ EA Zone 2

### James Hutton LCA — AMBER
- Hosts: `druid.hutton.ac.uk/arcgis/rest/services/Hutton_LCA_50K_OSGB/MapServer/0` (1:50k, partial cover — improved/arable only, ~1/3 of Scotland) and `Hutton_LCA250K_UKSO/MapServer/0` (1:250k, full Scotland)
- **Strategy:** query 50k first; if no match, fall back to 250k. Matches our existing "detailed-first, provisional-fallback" pattern from English ALC.
- Classes: numeric `LCCODE` including 1, 2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7, plus non-agri codes (888 = built-up, etc.). Client-side lookup table required.
- Licence: 1:50k dataset registered on data.gov.uk as OGL v3 (per listing); layer metadata itself does not embed a licence string. Verify via data.gov.uk record before final ship.
- Host is a single institutional server (no CDN) — slower response expected; use the standard TtlCache and consider longer timeout than Esri-hosted services.
- BMV mapping decision: LCCODE 1, 2, 3.1 -> BMV (equivalent of ALC Grade 1/2/3a). LCCODE 3.2 and above -> non-BMV. Non-agricultural codes (888 etc.) -> null classification with explanatory text.

Proceeding now to M2 (NatureScot) + M3 (SEPA) + M4 (LCA) in parallel.
