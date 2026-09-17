# Research and development roadmap

Status: proposal, not a commitment. Drafted 2026-09-17.

The direction is to move Luminus from an electricity-data MCP server towards an energy
research platform: fragmented grid and market data turned into reproducible analyses,
forecasts and decision support. More tools is not the goal.

Three strands:

1. **Research infrastructure.** Make historical data, forecasting, backtesting and simulation reliable.
2. **Energy intelligence.** Build analysis on top of the data that is worth more than the data.
3. **Differentiation.** Build what cannot be reproduced by pointing an LLM at the same public APIs.

## 1. What the repository already says

**Foundation.** 40+ source integrations, conditional tool registration, profiles, a Python
SDK, GIS composites and automated release checks. [`gis-roadmap.md`](gis-roadmap.md) records
14 completed sprints including Scotland coverage and GB connection intelligence.

**Biggest architectural gap.** The README describes a data-access layer and says historical
availability depends on upstream providers. There is no persistent, point-in-time research
data store. Nothing Luminus returns can be replayed or checked after the fact.

**Most important model limitation.** [`src/tools/site-revenue.ts`](../src/tools/site-revenue.ts)
annualises a single day of prices (`daily_revenue_eur * 365`). The BESS path assumes perfect
foresight, fixed round-trip efficiency and two cycles a day. Fine as disclosed screening
heuristics, not fine as revenue estimation.

**Correctness is the credibility risk.** v0.7.0 fixed `get_imbalance_prices` reading ENTSO-E
imbalance *volumes* as prices. Semantic validation of upstream data matters more than the
next integration.

### A concrete defect to fix first

[`src/tools/prices.ts`](../src/tools/prices.ts) maps ENTSO-E point positions to
`hour: position - 1` and keeps neither the period start timestamp nor the resolution.
Verified consequences:

- **Currency is mislabelled.** Line 80 reads `currency_Unit.name` into a local that is never
  used; line 107 returns the literal `"EUR"`. GB prices in GBP are returned labelled EUR.
- **15-minute data is mislabelled as hours.** At PT15M, positions run 1-96, so `hour` becomes
  0-95. GB and DE day-ahead now trade on a 15-minute MTU.
- **Multi-day requests collide.** Positions restart per period, so day 2 position 1 duplicates
  day 1 position 1. Line 93 sorts them together and line 98 averages the result, so `stats` on
  any multi-day call is not meaningful.
- **It propagates.** [`price-spread-analysis.ts`](../src/tools/price-spread-analysis.ts) builds
  its charge and discharge schedule from those `hour` identifiers.

The fix already exists in the repo: `extractSeriesPoints` in
[`src/lib/entsoe-timeseries.ts`](../src/lib/entsoe-timeseries.ts) does timestamp-anchored,
resolution-aware expansion. It was written for the 0.7.0 imbalance fix and `prices.ts` never
adopted it.

A more ambitious forecasting model will not fix misaligned input data.

## 2. Twelve-month sequence

September 2026 to September 2027. Suggested priorities and timings, not a schedule anyone has
committed to. The phases overlap deliberately: data engineering gates the modelling, but user
discovery and research validation run throughout.

| Phase | When | Objective |
|---|---|---|
| 0. Data correctness | Weeks 1-2 | Validate timestamps, units, price semantics and API behaviour |
| 1. Historical research infrastructure | Weeks 3-6 | Reproducible, point-in-time historical datasets |
| 2. BESS optimisation | Months 2-3 | Replace heuristic arbitrage with constrained optimisation |
| 3. Power market forecasting | Months 3-5 | Probabilistic price and system-imbalance models |
| 4. Grid and asset economics | Months 4-7 | Connect site characteristics, network evidence and revenue simulation |
| 5. Advanced energy intelligence | Months 7-9 | Cross-border dynamics, outage impact, regime change |
| 6. Validation and productisation | Months 9-12 | Validate with users, package one differentiated workflow |

## 3. Phase 0: fix data semantics before building models

Priority P0. The objective is output fit for quantitative research, not merely readable by an LLM.

| Workstream | Development |
|---|---|
| Time series | Replace `hour` with delivery-interval start/end timestamps, duration and timezone metadata |
| Units | Preserve source currency, power versus energy units and price units. Explicit conversion functions |
| Coverage | Detect missing, duplicate and overlapping settlement periods |
| Data status | Distinguish unavailable, zero, provisional and revised values |
| Testing | Upstream golden fixtures plus independent cross-source reconciliation |
| Schema | A versioned, normalised time-series record |

Standardise observations around a record like this:

```typescript
interface EnergyObservation {
  source: string;
  zone: string;
  metric: string;

  interval_start_utc: string;
  interval_end_utc: string;

  value: number | null;
  unit: string;
  currency?: string;

  published_at?: string;
  fetched_at: string;

  quality: "verified" | "provisional" | "missing";
  source_revision?: string;
}
```

For reproducible forecasts, also store when each observation first became available and how it
was later revised. A `published_at` is only useful when it reflects the source's real
publication history.

**Completion gate.** Fixtures pass for 15-minute and hourly prices across normal days, 23-hour
and 25-hour daylight-saving days, multi-day responses and changing market resolutions. No
observation is silently duplicated or mislabelled.

## 4. Phase 1: the historical research engine

Priority P0. This is the work that makes almost everything else possible.

The Python SDK exposes MCP tools, DataFrames, GeoDataFrames and batch helpers, and
[`python-sdk-roadmap.md`](python-sdk-roadmap.md) deliberately keeps Python thin rather than
reimplementing Node business logic. Keep that design.

### Architecture

```
Data providers        ENTSO-E · Elexon · NESO · weather · gas · GIS
        |
TypeScript layer      collection · parsing · normalisation · provenance
        |
Historical store      Parquet + DuckDB · point-in-time records · quality flags
        |
Python R&D            forecasting · simulation · optimisation
        |
MCP interface         data, research results, agent access
        |
Applications          notebooks · reports · maps · research workflows
```

Parquet and DuckDB are enough for a local start. Introduce a database service or PostGIS only
when workload, spatial-query complexity or multi-user access justify it.

### Research dataset MVP

Three markets first: GB, Germany, France.

| Dataset | Purpose |
|---|---|
| Day-ahead prices | Price modelling and BESS optimisation |
| Actual demand and forecasts | Demand forecast error |
| Wind/solar forecasts and actuals | Renewable forecast error |
| Generation by technology | Fundamental supply balance |
| Cross-border flows and capacity | Interconnector economics |
| Imbalance prices and volumes | Balancing research |
| Gas and carbon prices | Thermal generation economics |

Backfill as far as each licensed source history allows, rather than assuming every provider
offers the same depth. A reproducible dataset states its sources, retrieval dates, revision
policy, resolution, missing-data policy and the exact feature-generation code.

**Completion gate.** One Python command reconstructs the same GB research dataset from a
pinned snapshot and produces an identical dataset hash.

### Time-sensitive exception

Most of the above can be backfilled whenever the work starts. The NESO TEC register cannot:
it is a live register with no public history, so today's state is gone next month. Start
snapshotting it in week 1, alongside the Phase 0 parser fix. It costs a scheduled job and a
Parquet file, and it is the only way the labelled dataset behind a future connection-outcome
study ever comes into existence.

## 5. Phase 2: a real BESS optimisation engine

Priority P1. The most obvious research upgrade to an existing capability.

`get_price_spread_analysis` picks cheap and expensive hours and applies fixed efficiency and
cycle assumptions. It is not a state-of-charge optimisation. The upgrade answers:

> How much could a real battery earn, under operational constraints, using only the
> information available at each decision time?

### Formulation

Maximise `Σ_t [ p_t (P_t^dis − P_t^ch) Δt − C_t^deg − C_t^fees ]`

subject to:

- `E_{t+1} = E_t + η_c P_t^ch Δt − (1/η_d) P_t^dis Δt`
- `E_min ≤ E_t ≤ E_max`
- `0 ≤ P_t^ch, P_t^dis ≤ P_max`

Add charge/discharge exclusivity, terminal state of charge, cycling limits, grid import and
export limits, and outages. A mixed-integer formulation enforces mutually exclusive actions
where that matters.

### Experiments

| Experiment | Research question |
|---|---|
| Perfect-foresight optimisation | What is the theoretical historical gross-value benchmark? |
| Naive scheduled dispatch | How much value does simple fixed-time charging capture? |
| Forecast-driven optimisation | How much value survives without future information? |
| Degradation sensitivity | How does cycle-dependent wear change optimal dispatch? |
| Market-access scenarios | How do fees, product eligibility and executable prices change the economics? |

Do not treat historical imbalance prices as automatically executable revenue. Every strategy
needs an explicit market-access and decision-timing assumption.

**Deliverables.** `simulate_bess_dispatch()`, `optimise_bess_schedule()`,
`backtest_bess_strategy()`.

**Success measure.** Dispatch respects every physical constraint, the simulator reconciles its
energy and cash flows, and the forecast-driven strategy is compared against naive and
hindsight benchmarks on held-out periods.

**Sequencing note.** The forecast-driven variant depends on Phase 3. Phase 2 on its own can
only deliver hindsight versus naive, which is still the first honest number this repo has ever
produced about its own revenue estimates.

## 6. Phase 3: a power market forecasting laboratory

Priority P1. Three falsifiable programmes rather than one general-purpose model.

**A. Day-ahead prices.** Hypothesis: residual load, weather, thermal fuel costs and
interconnector conditions improve on calendar and autoregressive baselines. Build
seasonal-naive and regularised regression baselines, then gradient boosting and probabilistic
models. Try neural architectures only once simpler models show a clear ceiling.
Evaluation: MAE, pinball loss, interval calibration, simulated economic value.

**B. System imbalance.** Hypothesis: wind forecast error, demand forecast error, outages and
system conditions carry information about subsequent imbalance. Start with directional
classification and magnitude regression; model extremes separately only if the data justify it.
Evaluation: balanced accuracy, calibration, tail performance, cost-adjusted results under
explicit execution assumptions.

**C. Price spikes and negative prices.** Hypothesis: scarcity and surplus indicators explain
event likelihood better than historical price patterns alone. Rare-event classification,
quantile regression, regime-specific models.
Evaluation: precision-recall, probabilistic calibration, tail loss, economic cost of misses.

The non-negotiable requirement is point-in-time walk-forward evaluation: every feature must
have been publicly available before the simulated decision. Publish negative results as well as
improvements, and keep a model registry with dataset hashes, training windows,
hyperparameters and evaluation output.

## 7. Phase 4: grid and asset economics

Priority P1. Where Luminus becomes more than a trading-research library.

[`gis-roadmap.md`](gis-roadmap.md) already has site comparison, BESS shortlisting, DNO signals,
connection reports and the Gate 2 checklist, and warns that grid proximity is not connection
capacity and queue signals are not connection offers. The next objective is to connect those
tools to defensible asset economics.

| Research area | Capability |
|---|---|
| Site economics | Multi-year PV/BESS revenue scenarios, capex, opex, degradation, financing, uncertainty |
| Connection costs | User-supplied or documented project-specific cost scenarios |
| Curtailment | Historical and scenario-based curtailment analysis where data permit |
| Cannibalisation | Effect of additional renewable and BESS capacity on capture prices |
| Land constraints | Wider source coverage, with unknown coverage represented explicitly |
| Portfolio analysis | Geographic, price and technology diversification |

Cannibalisation is the most interesting of these: how the value of additional solar or wind
changes as more capacity enters a market. Build scenarios rather than pretending to predict a
project's future price curve. For GB, keep market-wide wholesale exposure separate from
site-specific network costs and constraints.

**Output.** An asset research report: technology, duration, P10/P50/P90 revenue scenarios,
connection evidence, historical dispatch simulation, grid and land evidence, sensitivity and
assumption analysis. A report specification, not a financial projection.

## 8. Phase 5: advanced energy intelligence

Priority P2.

| Programme | Objective | Differentiation |
|---|---|---|
| Cross-border modelling | Explain regional price spreads from interconnector capacity, outages, flows and fundamentals | Understanding of interconnected European markets |
| Outage intelligence | How generation and transmission outages move subsequent prices and volatility | Event data joined to reproducible outcomes |
| Market simulation | Simplified supply-stack and interconnector-constrained scenarios | Counterfactuals rather than extrapolation |

The interesting question is not what prices did, but why, through which mechanism, and what a
different system configuration would have produced. For example: what happens to the
French-German spread if French nuclear availability falls while German wind beats forecast?

Start with transparent fundamental models and document their simplifications. Defer market
foundation models, autonomous trading agents and an all-Europe digital twin until the simple
models produce useful, reproducible results.

## 9. Phase 6: productisation and commercial validation

Priority P2. Two directions. Building both at once splits the work across different customers
and different technical requirements.

**A. Luminus Quant.** Power market research and trading infrastructure for quantitative
researchers, power analysts and trading teams: historical datasets, forecasting, optimisation,
reproducible backtesting, fundamental analysis. The research challenge is showing incremental
economic value after data availability, execution and costs.

**B. Luminus Grid Intelligence.** Renewable and battery project research for developers,
investors and consultancies: site screening, grid evidence, project economics, scenarios,
portfolio research. The research challenge is whether public and customer data can support
decisions customers will pay to improve.

One shared research stack, one initial customer workflow. Keep the open-source MCP server as
the distribution and data-access layer; differentiation would come later from proprietary
research, licensed datasets, validated models or tailored workflows. Test both workflows with
real users before building hosted software. [`gis-roadmap.md`](gis-roadmap.md) deliberately
excludes hosting, persistence and auth, so productisation is an explicit change of scope, not
routine maintenance.

## 10. First 30 days

| Week | Deliverable | Acceptance criterion |
|---|---|---|
| 1 | Correct the market-data foundation: interval-timestamped day-ahead schema, currency handling, DST fixtures, resolution tests | Golden fixtures pass for selected GB/DE/FR market dates |
| 1 | Start the NESO TEC register snapshot job | A dated snapshot lands in the store on schedule |
| 2 | Historical collection: GB prices, demand, wind, imbalance; Parquet/DuckDB storage; provenance metadata | A pinned dataset reproduces with no silent gaps or duplicate intervals |
| 3 | BESS optimiser in Python: state of charge, efficiency, cycling, perfect-foresight benchmark | Energy-balance and dispatch constraints pass independent tests |
| 4 | First research experiment: one GB BESS notebook comparing naive dispatch against hindsight optimisation | Reproducible held-out result with fees, uncertainty and assumptions disclosed |

## 11. How to judge the programme

Not by the number of new MCP tools.

| Dimension | Measurement |
|---|---|
| Data quality | Temporal coverage, unit correctness, missingness, reconciliation errors |
| Reproducibility | Ability to reconstruct historical datasets and results |
| Forecasting | Out-of-sample performance against simple baselines, and calibration |
| Optimisation | Constraint violations, economic value, sensitivity to assumptions |
| Commercial | Active research users, repeat usage, willingness to pay |
| Engineering | Integration reliability, release regressions, maintainability |

These are acceptance criteria to establish, not results the repository has achieved.

## 12. Proposed next release

**v0.8.0, historical market data and research foundation.** Not another expansion of tool count.

Ship corrected interval-based market data, reproducible historical collection, point-in-time
metadata, a simple Python data interface, and the first battery dispatch benchmark. That turns
the existing tool surface into something on which forecasting, optimisation and asset research
can be built and independently checked, and gives one concrete experiment to show users
instead of a longer list of API integrations.

## Provenance

The structure and most of the content of this roadmap came from an external review by ChatGPT
(shared conversation, 2026-09-17), which read the public repository. The `prices.ts` defect it
reported was independently verified against the source in this repo before being written down
here, and the currency, 15-minute and multi-day consequences listed in section 1 are that
verification, not the original report. The TEC snapshot note in section 4 and the Phase 2
sequencing note in section 5 are additions.
