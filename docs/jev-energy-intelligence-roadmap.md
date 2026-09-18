# Jev + Luminus: energy intelligence research and product roadmap

Status: **research proposal, not an implemented feature or evidence of trading alpha**. Reviewed 2026-09-18. Companion to [R&D roadmap](rnd-roadmap.md), [GIS roadmap](gis-roadmap.md) and [scope](SCOPE.md). Target initial market: Great Britain; Germany and France after data-quality and licensing gates.

## Executive decision

Build Luminus as a **point-in-time energy intelligence and decision-support system**. Use physical/statistical forecasting for numbers, deterministic code for mathematics and market rules, an LLM for extracting complex documents and explaining research, and Jev only for bounded semantic judgments that demonstrate incremental value in controlled tests. **Do not make Jev a compulsory dependency or market-forecasting oracle.** No autonomous real-money trading, unsupervised battery dispatch or grid-safety control in the proposed releases.

The repository already exposes weather (`get_weather_forecast`, `get_era5_weather`), demand and renewable forecasts, prices, balancing/imbalance, REMIT/outages, gas and carbon, flows, GIS and BESS screens. It also has a thin Python SDK and MCP profiles. Existing [R&D roadmap](rnd-roadmap.md) documents lack of point-in-time storage, BESS hindsight/perfect-foresight limitations and the `src/tools/prices.ts` timestamp/currency/resolution issue. Correct these **before** fitting models: `prices.ts` labels a source currency as EUR, treats each position as an hour, sorts different periods by repeated positions and can corrupt downstream spread analysis. Adopt the existing `extractSeriesPoints` interval expansion and add coverage/DST/multi-period fixtures. None of this is solved by Jev.

## 1. What Jev is and is not (verified against primary documentation)

TypeSafe Jev (early access, September 2026) takes `state` and independently evaluated typed questions. Its primitives are Choice (option + option probabilities + confidence), Score (ordered rubric levels + probabilities + confidence), and Noul (yes-probability). Multiple independent questions can share a request. TypeSafe recommends atomic questions and control flow in code. Official JavaScript SDK is `@typesafe-ai/sdk` with `TypeSafeClient.systemOne(...)`; Python SDK is `typesafe_sdk` with `TypeSafeClient.system_one(...)`; authenticate using `TYPESAFE_API_KEY`. Model availability, limits, schema, rates and terms must be checked and pinned before implementation. See [official introduction](https://docs.typesafe.ai/introduction), [Choice API](https://docs.typesafe.ai/primitives/choice), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [API](https://docs.typesafe.ai/api), and [model jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

Critical documented caveats (Jev 1.13): **poor numerical precision, counting, exact date comparisons and multi-hop reasoning**; irrelevant context reduces accuracy; adversarial text can influence it; score levels are not numerically calibrated for reconstructing physical quantities; logically related independently evaluated questions need not obey probability identities. A valid output *type* is NOT a true statement or calibrated event probability. Vendor workflow benchmarks compare outputs with larger models' answers, not ground-truth forecasts or investment returns. The advertised $0.042 per million input tokens and 70–500 ms are vendor claims, not our production cost/latency SLA. Source: [launch and evaluation caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev) and [limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13). Never call a Jev probability a market-event probability without separate held-out calibration.

**Allocation by task:**

| Task | Owner | Jev role |
|---|---|---|
| Numerical weather, MW/MWh, market price, volume, dispatch | NWP, statistical models, calibrated regressors, optimisers | Optional *semantic feature* or event classifier; not the forecaster |
| Time, timezone, interval, currency, unit, FX, energy balance, P&L | Code / validated data model | None |
| REMIT/outage/free-text extraction | Parser/LLM with verbatim evidence, codes and citations | Verify candidate class, map event to bounded taxonomy, route ambiguities |
| Model selection and routing | Rules + contextual bandit/validated gating | Candidate regime/quality feature only, shadow-test against deterministic gate |
| Risk limit, permission, market access, order sizing | Deterministic code and human mandate | No override; possible context alert |
| Explanations and reports | LLM grounded in dataset snapshots and calculations | Evidence relevance/contradiction screening, optional only |

## 2. Product architecture, integration boundaries and data contracts

```
ENTSO-E / Elexon / NESO / Open-Meteo / REMIT / licensed prices
  -> TS adapters: immutable raw payloads, publication/ingestion stamps, validation
  -> versioned canonical intervals + point-in-time snapshot store (Parquet/DuckDB)
  -> Python: forecasting, calibration, backtesting, scenario and optimisation engines
  -> optional Jev decision service: filtered compact state + versioned question set
  -> validated probabilities/features + gate decisions + decision trace
  -> experiment registry and independent economic/risk evaluation
  -> MCP tools and Python SDK, then optional hosted app when a customer workflow is validated
```

Keep Node/TypeScript as adapter and MCP source of truth and Python as quantitative R&D, consistent with [python-sdk-roadmap.md](python-sdk-roadmap.md). Start Jev as **optional sidecar** rather than adding a dependency to all 69 tools: `src/lib/decision-engine.ts` interface (provider-agnostic, with `disabled | shadow | advisory` mode); `src/lib/decisions/jev.ts` adapter; `src/lib/decisions/schemas.ts` with runtime validation and canonical labels; `src/lib/decisions/audit.ts` decision trace; Python `python/.../research/` feature builders/backtest code (exact location after SDK audit). The Python SDK may own offline batch experimentation directly, but do not duplicate market-data parsing in it. A model-provider interface permits rule-only and small-LLM challengers.

**Canonical record additions** beyond existing R&D `EnergyObservation`: `delivery_start_utc`, `delivery_end_utc`, `timezone`, `settlement_period`, `market`, `product`, `unit`, `currency`, `source`, `source_document_id`, `source_event_time`, `published_at`, `available_at`, `ingested_at`, `revision_id`, `forecast_issue_time`, `forecast_valid_time`, `lead_minutes`, `source_license`, `quality_status`. Separate event time, issue time, public availability and ingestion; if exact availability is unavailable, mark the feature `availability_unknown` and EXCLUDE it from historical tradable backtests. Do not infer publication time from a file's last-modified timestamp. Use interval duration to convert MW -> MWh; daylight saving and 15-/30-/60-minute contract resolution must be explicit. Keep NESO ND distinct from TSD and gross consumer demand; embedded generation can suppress measured ND.

**Decision trace (append-only, no secret raw payloads):** `decision_id`, `question_set_version`, `model_version` (pin Jev version, not floating alias in experiments), `market`, `target_interval`, `decision_asof_utc`, `source_snapshot_hashes`, `feature_set_hash`, `sanitised_state_hash`, `answer_type`, `answer`, `option_probabilities`, `vendor_confidence`, `calibration_version`, `threshold_policy_version`, `route`, `latency_ms`, `input_tokens`, `estimated_cost`, `fallback_reason`, `realised_label_available_at`, `realised_label`, `reviewer_override`. Encrypt and limit retention for licensed/customer data; never send secrets, confidential trading positions or unlicensed redistribution to the hosted model. Review vendor data-use terms and geographic processing.

**Hard quality gates:** missing/stale source -> abstain; non-finite values -> fail; contradictory source units -> quarantine; low held-out calibration or drift -> disable advisory; timeout/429/5xx -> deterministic fallback and log; malformed response -> reject. Set cost budgets, concurrency, retries with jitter, circuit breaker and cache on source snapshot+model+question version (never cache across changing states). Do not block ingestion or trading on an external AI outage. Batch only decisions sharing a relevant compact state; parallel independent questions are not a substitute for dependent sequential workflow.

## 3. Evidence and data-source feasibility

| Source | What it supports | Point-in-time caveat |
|---|---|---|
| [NESO historical day-ahead demand forecasts](https://www.neso.energy/data-portal/1-day-ahead-demand-forecast/historic_day_ahead_demand_forecasts) | Forecast values since 2018 and `FORECAST_TIMESTAMP` | Historical cardinal points are not automatically an entire half-hour curve; NESO notes some recovered timestamps postdate forecast creation. Check half-hourly performance and 2–14-day products separately. |
| [NESO historic demand](https://www.neso.energy/data-portal/historic-demand-data/historic_demand_data_2026) | ND/TSD, embedded renewables, actual-vs-forecast flags | Define target precisely and inspect missing/revised rows; not gross final consumption. |
| [Elexon developer portal](https://developer.data.elexon.co.uk/) | Publication-time filtered datasets, superseded historic forecasts, BMRS APIs | Test endpoint-specific first-availability and publication history; a historical final value may not have existed at decision time. |
| [Elexon MID volume specification](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/MID/stream) | Market Index Volume/Price by market provider and settlement period | MID volume is provider-specific; not total GB exchange, OTC or order-book liquidity. Must obtain licensed venue trades/order books for execution or depth modelling. |
| [Open-Meteo historical forecast](https://open-meteo.com/en/docs/historical-forecast-api) | NWP forecasts and forecast-run archives | Historical Forecast API *stitches* short leads, not a complete as-of run. Use [single runs](https://open-meteo.com/en/docs/historical-forecast-api) / Previous Runs for real vintage/lead-time tests and check availability/licence. ERA5 reanalysis is not information available to a trader beforehand. |
| [ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data) | Open NWP subset, commercial use under conditions | Rolling ~12-run archive, not a complete historical vintage archive. Snapshot live feeds immediately or licence archive where needed. |
| ENTSO-E and REMIT existing Luminus integrations | Prices, generation, outages, cross-border, fundamental events | Preserve original document ids/publication times; apply correction rules and verify commercial redistribution terms. |

Acquisition priorities: GB half-hourly actual+vintage demand; weather individual forecast runs (temperature/wind/solar at representative weighted locations); wind forecasts/outturn; authoritative imbalance/NIV series and publication timestamps; wholesale market prices with explicit tradability; REMIT events. Start snapshot collectors *now* for volatile feeds and NESO TEC register (as already stipulated in main roadmap). GIS and Europe should use the same contracts after GB validation, not be assumed equivalent.

## 4. Research programme A — weather forecast-error intelligence

**Deliverable:** probabilistic post-processing of wind speed, irradiance and temperature at relevant grid/location aggregates; convert via independently calibrated wind/solar power curves into generation MW. Physical prediction baseline = raw NWP, ensemble mean, climatology/persistence, quantile gradient boosting/EMOS or other calibrated statistical post-processing. Weather forecasts require exact run+lead+valid timestamps.

Jev candidates: classify an outage/weather bulletin into a bounded meteorological hazard; classify whether a forecast disagreement is described as frontal passage / ramp / persistent calm / other from a *precomputed* compact meteorological synopsis; choose candidate expert *only as an untrusted feature*; assess whether qualitative bulletin contradicts numerical forecast after evidence is retrieved. **Do not use Jev to compute error in m/s, choose the smallest absolute error by arithmetic, extrapolate a weather field or replace atmospheric simulation.** Quantitative model weighting uses realised hindcast skill or dynamic mixture-of-experts with calibration.

Experiments: raw NWP vs rolling-bias correction vs probabilistic ensemble vs same+Jev semantic event features vs small classifier from same features. Targets: wind speed (m/s), irradiance (W/m²), temperature (°C), generation MW for explicit horizon. Metrics: lead-time MAE/RMSE, CRPS/pinball, coverage by weather regime, ramp-event precision/recall and cost. Block splits by weather event and chronological season; no revisions or ERA5 analysis as ex-ante features. **Gate:** only ship if held-out gain and calibration survives at least two distinct seasonal periods; otherwise event triage only.

## 5. Research programme B — demand forecasting and residual correction

Targets: GB NESO National Demand MW at matching delivery resolution; explicitly separate alternative TSD and optional reconstructed gross-load targets. Horizons: intraday 30 min–6 h, day-ahead D+1, 2–7 days. Models: seasonal naive, NESO published forecast, GAM/linear, LightGBM/CatBoost, quantile residual forecaster; calendar, forecast-vintage temperature, lagged demand observed by as-of, holiday, daylight and embedded-generation estimates. The published NESO forecast itself is a benchmark and legal ex-ante feature only when actually available.

Jev candidates: categorical calendar/special-event interpretation from verified announcement text; classification of unusual demand context with explicit unknown; whether a source weather bulletin implies disruption; semantic disagreement between operational commentary and structured forecasts. For **residual error sign or magnitude bands**, use Jev only as an experimental, empirically calibrated feature and compare with a multinomial CatBoost/LightGBM trained on exactly the same input. Calibrator maps held-out Jev outputs to target error-bin frequencies; numerical residual estimate comes from a separate regression, NOT Score interpolation. Formula: final demand = baseline MW + validated residual-model prediction MW. Do not assume one day's MW equals MWh; integrate over intervals.

Metrics: MAE, RMSE, pinball/CRPS, coverage, calibration by horizon and seasonal cohort, feature ablation. Include high-load days, holidays, heat/cold events, and high embedded-solar conditions. **Gate:** significant/repeated forecast gain against published NESO forecast and conventional residual learner, not just attractive Jev narrative; else retain Jev for annotation/alert routing.

## 6. Research programme C — three distinct 'volume' products

**C1 Physical demand/generation volume:** output MW per time step, MWh = MW × interval hours. Use demand/generation models above, add outage and wind-ramp distributions. Jev is event taxonomy/verification only.

**C2 Traded market volume/liquidity:** first specify venue, contract, auction vs continuous, horizon, target (MWh traded / trade count / spread / executable depth). Elexon MID provides market-provider price and volume per settlement period, **not full venue trades/order-book liquidity**. Start with provider MID volume forecasts and a descriptive market-activity dashboard; acquire licensed trade/book history for execution-cost forecasts later. Models: seasonal/zero-inflated count, gradient boosting, quantiles, event-study. Jev: classify venue notices and outage/event intensity (predefined categories), route sparse-data anomalies for review. Never claim a MID proxy permits reliable order execution or a complete GB volume estimate.

**C3 System imbalance/NIV:** define exactly the selected Elexon NIV measure, sign convention, settlement period, preliminary vs final vintage and when each input/label was published. Forecast direction (long/short/near-zero) with logistic/LightGBM, signed magnitude and tails conditional on direction with calibrated regressors/quantiles. Features: **as-of** demand/wind/solar forecast errors (actual only once observed), outages, physical notifications, balancing offers, interconnectors, intraday prices. Jev: interpret conflicting outage/REMIT notices; classify context into bounded regimes; tag ambiguous causes. Do not classify sign using actual future balance or final balancing actions. Separately assess sign calibration, MAE and tails, false-short costs and actual execution feasibility. Never conflate balancing requirement with ex-post NIV or imbalance price.

Gate for any volume product: target and instrument definition published; source licence vetted; independently reconciled labels; same-input non-Jev challenger; walk-forward skill and a documented customer workflow.

## 7. Research programme D — price forecasting and trading decision support

Separate products: GB day-ahead auction prices; continuous intraday *timestamped executable quote/trade* prices; balancing/settlement prices, which are not interchangeable; DE/FR zones have their own rules, currency, granularity and data rights. First correct `prices.ts`, then create seasonal-naive/AR, fuel/residual-load regression, LightGBM, quantile and event-based baselines. Split targets by horizon and delivery interval. Study negative prices, scarcity tails, renewable capture price and cross-border spreads without mixing units/currencies.

**Jev candidate decisions (narrow and independent):** `event_type` (generator outage / network constraint / demand / weather / rule change / other / unknown), `evidence_conflict` (supported / conflicting / insufficient), `market_context` (scarcity / surplus / ordinary / uncertain, based on semantic evidence), `research_route` (reprice / retrieve more data / analyst review / no action). Avoid asking it to predict exact EUR/MWh, perform spark-spread arithmetic, identify causality merely from co-movement, determine buy/sell from anecdotes, or assign a market event probability without calibration. Candidate features flow to a numerical pricing model and are separately ablated.

**Hypothesis-to-trade pipeline:** source event -> provenance/availability checks -> deterministic event timing and capacity reconciliation -> optional LLM extraction -> Jev semantic verification/triage -> baseline and challenger scenario forecast *distributions* -> observable market quote -> expected gross edge -> fees, bid/ask, slippage, liquidity, impact, margin and risk -> constrained strategy suggestion -> human approval / paper execution -> outcomes ledger. Treat ex-post imbalance prices as settlement labels, not automatically tradable quotes. Incorporate gate closure, permitted market participation, market conduct and licences before any claim of profitability.

Evaluation: strict historical decision clock and purged walk-forward splits for overlapping horizons; honest price-availability, currency and contract granularity; MAE/pinball/CRPS, Brier/log-loss/ECE for categorical events, tail accuracy, precision at fixed alert budget, net paper P&L, turnover, drawdown, market-impact sensitivity and worst-case missing-data tests. Compare no Jev, rules, standard classifiers, same-context small LLM, Jev alone as classification, and Jev+calibrator+quant model. Require uncertainty intervals and bootstrap across days/events. Do NOT repeatedly tune on the held-out period.

## 8. Cross-cutting Jev opportunities (beyond four headline models)

| Location in Luminus | Specific useful decision | Alternative / acceptance test |
|---|---|---|
| Source quality and revisions | Semantic unit/source-description mismatch flag for unknown feeds; NOT numeric validation | Parser + schema rules first; human-verified rare mismatch cases |
| REMIT/outages | Candidate document-to-asset match; event type; planned vs forced; ambiguous/duplicate notice | Exact identifiers and timestamps in code; precision/recall at fixed review rate |
| Weather bulletin | Bounded hazard/regime tag from text | Keyword/rule/finetuned baseline; accuracy by season |
| Forecast health | Disagreement explanation tag / route to analyst | Quantitative disagreement computed in code; event recall vs noise |
| Research RAG | Assess passage relevance, contradiction and citation support | Reference exact source snippets, independent review, do not certify truth |
| MCP agent routing | Decide which specialist research tool or report type fits user's request | Tool registry + deterministic access check; latency/cost vs fixed routing |
| Research alert feed | Route to trader, analyst, BESS owner, site developer with a reason taxonomy | User-defined alert policy; precision at fixed daily alert capacity |
| BESS operations | Flag prose operational constraints or site-status exceptions | Hard asset feasibility, dispatch maths and safety in optimiser/code |
| Grid/GIS | Link planning notices to candidate asset/site and flag contradictory evidence | Geospatial joins and published DNO capacity remain authoritative |
| Explainability | Evaluate whether an LLM statement is supported by evidence | Claim-level citation checker + customer review; no ungrounded causal explanation |

Prioritise by `expected value = frequency × avoided loss or time × measured incremental accuracy − inference/integration/review cost`; this is a *business evaluation formula*, not something Jev computes. Reject low-frequency novelty features without labels or buyers.

## 9. Jev question contracts, probabilities and policy

Use question-set versions with explicit instructions, exclusive criteria, `other/unknown/insufficient_evidence` options, example edge cases and single-purpose labels. Example proposed **event** questions using official SDK (illustrative, not a production-ready contract):

```typescript
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: {
    source_text: sanitisedNotice,
    asset_id: verifiedAssetId,
    published_at_utc: verifiedPublicationTime,
    candidate_delivery_interval_utc: intervalStart,
  },
  questions: {
    event_type: choice('What event does the notice explicitly describe?', {
      generation_outage: 'A generation asset is unavailable or capacity reduced',
      transmission_constraint: 'A network asset or transfer capacity is constrained',
      schedule_change: 'Timing has changed without explicit loss of capacity',
      other: 'Another explicit event',
      insufficient_evidence: 'Notice does not establish an event type',
    }),
  },
});
// Store response and apply versioned policy outside the model;
// confidence != proof, and the SDK response must be runtime-validated.
```

Do not ask multiple questions that need one another's answers in one batch; run the follow-up after the first result. Distinguish Jev's *choice probability distribution*, its *vendor confidence*, and an *empirically calibrated probability of a real outcome*. The first two are not interchangeable with the third. Use temperature/isotonic/Platt calibration only where fitted out of sample with enough independent events, monitor reliability bins, class prior drift, Brier and expected calibration error, and require abstention rather than force-picking a direction. Never interpolate rubric scores into MW/MWh/GBP/MWh. Use Jev's `jev-1.13` (or an explicitly pinned available version) for reproducible evaluation, log future migration tests, keep feature flag off by default and leave the rule-only pathway complete.

## 10. Sequenced implementation with dependencies and deliverables

| Gate / indicative time | Delivery / repo changes | Acceptance / stop condition |
|---|---|---|
| **G0 Weeks 1–2: trustworthy data** | Fix `src/tools/prices.ts` using `src/lib/entsoe-timeseries.ts`, propagate interval/currency changes to `price-spread-analysis.ts` and `site-revenue.ts`, golden fixtures for DST/15-min/GB GBP/DE EUR/multi-day; capture NESO TEC and live weather run snapshots | Unit/resolution/currency reconciled, no look-ahead; existing test/build pass |
| **G1 Weeks 3–6: research foundation** | TS collectors + Parquet/DuckDB historical vintage store; data-source inventory/licensing; pinned dataset snapshots; Python `build_dataset(asof=...)`; report availability gaps | Reconstruct identical dataset hash; historical as-of excludes unknown-publication features |
| **G2 Months 2–3: quantitative baseline** | GB weather model-run and observed weather joins; demand/NESO forecast baselines; generation MW/MWh; market price and NIV benchmarks; BESS mathematically constrained hindsight baseline | Published baseline leaderboard and honest chronologic CV; independent physical checks |
| **G3 Months 3–4: optional Jev feasibility** | `decision-engine` provider abstraction; official SDK adapter; question registry and trace; 300–1000+ labelled *independent events* where feasible (sample-size design from label prevalence); shadow event taxonomy, relevant-passage and forecast-context tests | No secret/customer/licence breach; latency, calibration and accuracy reported vs rules + small model; ship nothing if no lift |
| **G4 Months 4–6: four forecasting tracks** | A weather correction/ramp, B demand residuals, C1/2/3 volume targets, D price/imbalance tails; identical-input Jev ablations; model registry | Genuine held-out improvement in at least one customer-useful task; publish negative results and disable losing modules |
| **G5 Months 6–8: decision research** | Event-to-fundamental-impact engine, scenario distributions, executable price feed only if licensed, constrained paper trading; BESS forecast-driven dispatch with full economics | Point-in-time paper ledger reconciles; cost and risk analyses, zero live orders; variance estimates by distinct events |
| **G6 Months 8–10: focused beta** | One customer workflow: GB outage/forecast revision intelligence for power desks OR GB BESS forecast-and-dispatch research; alerts with source citations and uncertainty; access/tenancy/privacy controls if hosted | 3–5 design partners is a discovery target, not a claimed result; track verified signal usefulness and repeat usage |
| **G7 Months 10–12: product** | SLA/monitoring, replay, drift triggers, re-training/versioning, licensed distribution, billing if validated; consider DE/FR only after zonal data QA | Paying pilot or evidence to change wedge; no claim of alpha absent independent realistic results |

**Release mapping:** Keep planned v0.8.0 as historical-data correctness + store + BESS baseline, not Jev marketing. Propose v0.9 research preview (baseline forecasting + Jev offline/shadow); v1.0 candidate only after validated workflows, stable APIs, permissions/licensing, monitoring and customer demand. These labels are suggestions, not release commitments.

## 11. First 30 days: executable backlog

1. **P0 data correctness:** change prices schema as in [main roadmap](rnd-roadmap.md) and test downstream BESS/price spread, day boundaries and 15-minute MTUs; do not launch new forecasts on `hour` arrays.
2. **P0 live capture:** timestamp and store weather forecast *runs*, REMIT revisions, NESO demand forecast vintages, TEC register, source hashes and publication evidence; inventory source terms.
3. **P0 dataset:** pin a small GB historical event set and implement an `asof` test ensuring future weather reanalysis, outturn and final settlement cannot leak into decisions.
4. **P1 baseline:** build published NESO vs seasonal-naive vs LightGBM demand experiment, plus raw NWP vs simple bias correction for wind/temperature; choose consistent delivery interval and horizon.
5. **P1 Jev spike:** gate on actual early-access API availability, authentication and confidentiality review; implement local fake provider + a few versioned event questions; test latency, cost, schema, adversarial notices, retries and fail-closed behaviour in **shadow mode only**.
6. **P1 decision dataset:** manually label a diverse set of outage and weather bulletins with original source and outcomes; pre-register comparison with simple rules and small classifier; inspect false negatives.
7. **P2 product interviews:** ask one power trader and one BESS operator to walk through their last five costly forecast/event mistakes, decision timestamps and executable actions. Choose one launch workflow from evidence rather than broad dashboard ambitions.

## 12. Required experiment report template and production gates

Every Jev feature PR must include: task and customer decision; exact target, unit and horizon; source snapshot/licence; label provenance; as-of construction; baseline and identical-input challengers; split strategy; sample size / event diversity / prevalence; objective and loss of mistakes; calibration curve; precision-recall; uncertainty estimates; latency/cost and privacy; robustness (missing/stale/adversarial inputs); acceptance threshold pre-specified; observed negative results; rollback owner. Never silently turn model judgments into hard-coded physical facts.

Release-facing outputs: `get_forecast_vintages`, `get_forecast_skill`, `get_demand_forecast_research`, `get_renewable_forecast_research`, `get_imbalance_research`, `get_market_event_intelligence`, `get_bess_dispatch_research` are **candidate tool contracts only**; choose fewer after customer validation. Each should return interval timestamps, units, model/dataset versions, as-of, predictive distribution, baseline comparison, data coverage and limitations. Advanced paid delivery may add alerting and API, but open-source MCP continues as the distribution/access layer. No website is currently present or assumed.

## Primary references and limitations

- [TypeSafe introduction and architecture](https://docs.typesafe.ai/introduction); [official Jev 1.13 failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13); [Choice probabilities](https://docs.typesafe.ai/primitives/choice); [SDK](https://docs.typesafe.ai/sdk/javascript); [vendor evaluation caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
- [NESO historical day-ahead demand dataset](https://www.neso.energy/data-portal/1-day-ahead-demand-forecast/historic_day_ahead_demand_forecasts); [NESO historical demand definitions](https://www.neso.energy/data-portal/historic-demand-data/historic_demand_data_2026); [Elexon API and publication-filter semantics](https://developer.data.elexon.co.uk/); [Elexon MID volume definition](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/MID/stream).
- [Open-Meteo forecast archive types](https://open-meteo.com/en/docs/historical-forecast-api); [ECMWF open-data retention/licensing](https://www.ecmwf.int/en/forecasts/datasets/open-data).
- Research proposed here is not a live Jev integration, empirical benchmark, profitable strategy, or guaranteed accurate prediction. API access, detailed licences, local and connector changes and claims must be revalidated at implementation time.
