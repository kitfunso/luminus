#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import { toolHandler } from "./lib/tool-handler.js";
import { hasRequiredKeys, isKeyConfigured, preloadKeyFile, TOOL_KEY_REQUIREMENTS } from "./lib/auth.js";
import { logToolCall } from "./lib/audit.js";
import { parseProfileArg } from "./lib/cli.js";
import {
  resolveProfile,
  getProfileNames,
  getProfileDescription,
  isValidProfile,
  PROFILES,
  TOTAL_TOOLS,
} from "./lib/profiles.js";

import { generationSchema, getGenerationMix } from "./tools/generation.js";
import { pricesSchema, getDayAheadPrices } from "./tools/prices.js";
import { flowsSchema, getCrossBorderFlows } from "./tools/flows.js";
import { carbonSchema, getCarbonIntensity } from "./tools/carbon.js";
import { gasStorageSchema, getGasStorage } from "./tools/gas-storage.js";
import { weatherSchema, getWeatherForecast } from "./tools/weather.js";
import { usGasSchema, getUsGasData } from "./tools/us-gas.js";
import { ukCarbonSchema, getUkCarbonIntensity } from "./tools/uk-carbon.js";
import { ukGridSchema, getUkGridDemand } from "./tools/uk-grid.js";
import { balancingSchema, getBalancingPrices } from "./tools/balancing.js";
import { renewableForecastSchema, getRenewableForecast } from "./tools/renewable-forecast.js";
import { demandForecastSchema, getDemandForecast } from "./tools/demand-forecast.js";
import { powerPlantsSchema, getPowerPlants } from "./tools/power-plants.js";
import { auctionSchema, getAuctionResults } from "./tools/auctions.js";
import { outagesSchema, getOutages } from "./tools/outages.js";
import { lngTerminalsSchema, getLngTerminals } from "./tools/lng-terminals.js";
import { solarSchema, getSolarIrradiance } from "./tools/solar.js";
import { netPositionsSchema, getNetPositions } from "./tools/net-positions.js";
import { transferCapacitySchema, getTransferCapacity } from "./tools/transfer-capacity.js";
import { frequencySchema, getEuFrequency } from "./tools/frequency.js";
import { hydroSchema, getHydroReservoir } from "./tools/hydro.js";
import { transmissionSchema, getTransmissionLines } from "./tools/transmission.js";
import { intradayPricesSchema, getIntradayPrices } from "./tools/intraday-prices.js";
import { imbalancePricesSchema, getImbalancePrices } from "./tools/imbalance-prices.js";
import { intradaySpreadSchema, getIntradayDaSpread } from "./tools/intraday-spread.js";
import { realtimeGenerationSchema, getRealtimeGeneration } from "./tools/realtime-generation.js";
import { balancingActionsSchema, getBalancingActions } from "./tools/balancing-actions.js";
import { ancillaryPricesSchema, getAncillaryPrices } from "./tools/ancillary-prices.js";
import { remitMessagesSchema, getRemitMessages } from "./tools/remit-messages.js";
import { priceSpreadAnalysisSchema, getPriceSpreadAnalysis } from "./tools/price-spread-analysis.js";
import { euGasPriceSchema, getEuGasPrice } from "./tools/eu-gas-price.js";
import { energyChartsSchema, getEnergyCharts } from "./tools/energy-charts.js";
import { commodityPricesSchema, getCommodityPrices } from "./tools/commodity-prices.js";
import { nordpoolSchema, getNordpoolPrices } from "./tools/nordpool-prices.js";
import { smardSchema, getSmardData } from "./tools/smard-data.js";
import { entsogSchema, getEntsogData } from "./tools/entsog.js";
import { elexonBmrsSchema, getElexonBmrs } from "./tools/elexon-bmrs.js";
import { era5WeatherSchema, getEra5Weather } from "./tools/era5-weather.js";
import { regelleistungSchema, getRegelleistung } from "./tools/regelleistung.js";
import { rteFranceSchema, getRteFrance } from "./tools/rte-france.js";
import { energiDataSchema, getEnergiData } from "./tools/energi-data.js";
import { fingridSchema, getFingridData } from "./tools/fingrid.js";
import { hydroInflowsSchema, getHydroInflows } from "./tools/hydro-inflows.js";
import { acerRemitSchema, getAcerRemit } from "./tools/acer-remit.js";
import { ternaSchema, getTernaData } from "./tools/terna.js";
import { reeEsiosSchema, getReeEsios } from "./tools/ree-esios.js";
import { stormglassSchema, getStormglass } from "./tools/stormglass.js";
import { terrainAnalysisSchema, getTerrainAnalysis } from "./tools/terrain-analysis.js";
import { gridProximitySchema, getGridProximity } from "./tools/grid-proximity.js";
import { gridConnectionQueueSchema, getGridConnectionQueue } from "./tools/grid-connection-queue.js";
import { gridConnectionIntelligenceSchema, getGridConnectionIntelligence } from "./tools/grid-connection-intelligence.js";
import { ngedConnectionSignalSchema, getNgedConnectionSignal } from "./tools/nged-connection-signal.js";
import { distributionHeadroomSchema, getDistributionHeadroom } from "./tools/distribution-headroom.js";
import { landConstraintsSchema, getLandConstraints } from "./tools/land-constraints.js";
import { landCoverSchema, getLandCover } from "./tools/land-cover.js";
import { agriculturalLandSchema, getAgriculturalLand } from "./tools/agricultural-land.js";
import { floodRiskSchema, getFloodRisk } from "./tools/flood-risk.js";
import { screenSiteSchema, screenSite } from "./tools/screen-site.js";
import { verifyGisSourcesSchema, verifyGisSources } from "./tools/verify-gis-sources.js";
import { compareSitesSchema, compareSites } from "./tools/compare-sites.js";
import { siteRevenueSchema, estimateSiteRevenue } from "./tools/site-revenue.js";
import { bessShortlistSchema, shortlistBessSites } from "./tools/bess-shortlist.js";

// ---------------------------------------------------------------------------
// Startup configuration
// ---------------------------------------------------------------------------

dotenv.config();

let profile = "full";
try {
  profile = parseProfileArg(process.argv);
} catch (err) {
  process.stderr.write(
    `[luminus] ${err instanceof Error ? err.message : String(err)} ` +
      `Valid profiles: full, ${getProfileNames().join(", ")}\n`,
  );
  process.exit(1);
}

if (!isValidProfile(profile)) {
  process.stderr.write(
    `[luminus] Unknown profile "${profile}". ` +
      `Valid profiles: full, ${getProfileNames().join(", ")}\n`,
  );
  process.exit(1);
}

const allowedTools = resolveProfile(profile) ?? null; // null = all tools

const skippedByProfile: string[] = [];
const skippedByKeys: string[] = [];

function shouldRegister(toolName: string): boolean {
  if (allowedTools && !allowedTools.includes(toolName)) {
    skippedByProfile.push(toolName);
    return false;
  }
  if (!hasRequiredKeys(toolName)) {
    skippedByKeys.push(toolName);
    return false;
  }
  return true;
}

/** Track registered data tool names for discovery/status meta-tools. */
const registeredToolNames: string[] = [];

const server = new McpServer({
  name: "luminus",
  version: "0.3.0",
});

// ---------------------------------------------------------------------------
// Audited tool handler wrapper
// ---------------------------------------------------------------------------

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Wrap toolHandler with audit logging. Logs tool name and params
 * before delegating to the actual handler.
 */
function auditedToolHandler<T extends z.ZodType>(
  toolName: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<unknown>,
): (params: unknown) => Promise<ToolResult> {
  const inner = toolHandler(schema, handler);
  return async (params: unknown): Promise<ToolResult> => {
    logToolCall(toolName, (params ?? {}) as Record<string, unknown>);
    return inner(params);
  };
}

// ---------------------------------------------------------------------------
// Conditional tool registration
// ---------------------------------------------------------------------------

function registerDataTools(): void {

// --- Generation & Prices ---

if (shouldRegister("get_generation_mix")) {
  registeredToolNames.push("get_generation_mix");
  server.tool(
    "get_generation_mix",
    "Current generation mix by fuel type (MW) for a European zone. Wind, solar, gas, nuclear, hydro, coal, etc.",
    generationSchema.shape,
    auditedToolHandler("get_generation_mix", generationSchema, getGenerationMix),
  );
}

if (shouldRegister("get_day_ahead_prices")) {
  registeredToolNames.push("get_day_ahead_prices");
  server.tool(
    "get_day_ahead_prices",
    "Day-ahead hourly prices (EUR/MWh) for a European zone. Includes min/max/mean stats.",
    pricesSchema.shape,
    auditedToolHandler("get_day_ahead_prices", pricesSchema, getDayAheadPrices),
  );
}

if (shouldRegister("get_cross_border_flows")) {
  registeredToolNames.push("get_cross_border_flows");
  server.tool(
    "get_cross_border_flows",
    "Cross-border electricity flows (MW) between two European zones. Hourly data with stats.",
    flowsSchema.shape,
    auditedToolHandler("get_cross_border_flows", flowsSchema, getCrossBorderFlows),
  );
}

if (shouldRegister("get_carbon_intensity")) {
  registeredToolNames.push("get_carbon_intensity");
  server.tool(
    "get_carbon_intensity",
    "Carbon intensity (gCO2/kWh) for a European zone. Fuel breakdown, emission factors, renewable/fossil %.",
    carbonSchema.shape,
    auditedToolHandler("get_carbon_intensity", carbonSchema, getCarbonIntensity),
  );
}

if (shouldRegister("get_gas_storage")) {
  registeredToolNames.push("get_gas_storage");
  server.tool(
    "get_gas_storage",
    "Gas storage levels (TWh, % fill, injection/withdrawal, YoY trend) from GIE AGSI+.",
    gasStorageSchema.shape,
    auditedToolHandler("get_gas_storage", gasStorageSchema, getGasStorage),
  );
}

if (shouldRegister("get_weather_forecast")) {
  registeredToolNames.push("get_weather_forecast");
  server.tool(
    "get_weather_forecast",
    "Weather forecast: hourly temperature, wind speed, solar radiation. Accepts country code or lat/lon.",
    weatherSchema.shape,
    auditedToolHandler("get_weather_forecast", weatherSchema, getWeatherForecast),
  );
}

if (shouldRegister("get_us_gas_data")) {
  registeredToolNames.push("get_us_gas_data");
  server.tool(
    "get_us_gas_data",
    "US gas data from EIA: weekly storage (Bcf), Henry Hub prices (USD/MMBtu).",
    usGasSchema.shape,
    auditedToolHandler("get_us_gas_data", usGasSchema, getUsGasData),
  );
}

// --- UK Specific ---

if (shouldRegister("get_uk_carbon_intensity")) {
  registeredToolNames.push("get_uk_carbon_intensity");
  server.tool(
    "get_uk_carbon_intensity",
    "UK carbon intensity (gCO2/kWh) and generation mix from National Grid ESO. National, regional, or historical.",
    ukCarbonSchema.shape,
    auditedToolHandler("get_uk_carbon_intensity", ukCarbonSchema, getUkCarbonIntensity),
  );
}

if (shouldRegister("get_uk_grid_demand")) {
  registeredToolNames.push("get_uk_grid_demand");
  server.tool(
    "get_uk_grid_demand",
    "UK demand (MW actual + forecast) and grid frequency (Hz) from National Grid ESO.",
    ukGridSchema.shape,
    auditedToolHandler("get_uk_grid_demand", ukGridSchema, getUkGridDemand),
  );
}

// --- Balancing & Forecasts ---

if (shouldRegister("get_balancing_prices")) {
  registeredToolNames.push("get_balancing_prices");
  server.tool(
    "get_balancing_prices",
    "Balancing/imbalance prices (EUR/MWh) per settlement period for a European zone. Min/max/mean stats.",
    balancingSchema.shape,
    auditedToolHandler("get_balancing_prices", balancingSchema, getBalancingPrices),
  );
}

if (shouldRegister("get_renewable_forecast")) {
  registeredToolNames.push("get_renewable_forecast");
  server.tool(
    "get_renewable_forecast",
    "Day-ahead wind/solar forecast (MW) for a European zone. Hourly, per source (onshore, offshore, solar).",
    renewableForecastSchema.shape,
    auditedToolHandler("get_renewable_forecast", renewableForecastSchema, getRenewableForecast),
  );
}

if (shouldRegister("get_demand_forecast")) {
  registeredToolNames.push("get_demand_forecast");
  server.tool(
    "get_demand_forecast",
    "Day-ahead demand forecast (MW) for a European zone. Hourly with min/max/mean and total energy.",
    demandForecastSchema.shape,
    auditedToolHandler("get_demand_forecast", demandForecastSchema, getDemandForecast),
  );
}

// --- Grid Infrastructure ---

if (shouldRegister("get_power_plants")) {
  registeredToolNames.push("get_power_plants");
  server.tool(
    "get_power_plants",
    "European power plant registry from OPSD. Name, capacity (MW), fuel, location, year. Filter by country/fuel/capacity.",
    powerPlantsSchema.shape,
    auditedToolHandler("get_power_plants", powerPlantsSchema, getPowerPlants),
  );
}

if (shouldRegister("get_auction_results")) {
  registeredToolNames.push("get_auction_results");
  server.tool(
    "get_auction_results",
    "Cross-border capacity auction results from JAO. Allocated MW, price (EUR/MW), offered capacity per corridor.",
    auctionSchema.shape,
    auditedToolHandler("get_auction_results", auctionSchema, getAuctionResults),
  );
}

if (shouldRegister("get_outages")) {
  registeredToolNames.push("get_outages");
  server.tool(
    "get_outages",
    "Generation/transmission outages from ENTSO-E. Unit, fuel, available/unavailable MW, dates, reason.",
    outagesSchema.shape,
    auditedToolHandler("get_outages", outagesSchema, getOutages),
  );
}

if (shouldRegister("get_lng_terminals")) {
  registeredToolNames.push("get_lng_terminals");
  server.tool(
    "get_lng_terminals",
    "LNG terminal data from GIE ALSI. Inventory (mcm), send-out, capacity, days-to-storage per terminal.",
    lngTerminalsSchema.shape,
    auditedToolHandler("get_lng_terminals", lngTerminalsSchema, getLngTerminals),
  );
}

if (shouldRegister("get_solar_irradiance")) {
  registeredToolNames.push("get_solar_irradiance");
  server.tool(
    "get_solar_irradiance",
    "Solar irradiance and PV yield from PVGIS. Monthly kWh/m2, optimal angle, annual yield. No API key.",
    solarSchema.shape,
    auditedToolHandler("get_solar_irradiance", solarSchema, getSolarIrradiance),
  );
}

if (shouldRegister("get_net_positions")) {
  registeredToolNames.push("get_net_positions");
  server.tool(
    "get_net_positions",
    "Net import/export position (MW) for a European zone. Total + per-border breakdown. Positive = net importer.",
    netPositionsSchema.shape,
    auditedToolHandler("get_net_positions", netPositionsSchema, getNetPositions),
  );
}

if (shouldRegister("get_transfer_capacities")) {
  registeredToolNames.push("get_transfer_capacities");
  server.tool(
    "get_transfer_capacities",
    "Net transfer capacity (MW) between two European zones from ENTSO-E. Hourly NTC with min/max/mean.",
    transferCapacitySchema.shape,
    auditedToolHandler("get_transfer_capacities", transferCapacitySchema, getTransferCapacity),
  );
}

if (shouldRegister("get_eu_frequency")) {
  registeredToolNames.push("get_eu_frequency");
  server.tool(
    "get_eu_frequency",
    "Real-time EU grid frequency (Hz), deviation (mHz), status. Deviations signal supply-demand imbalance.",
    frequencySchema.shape,
    auditedToolHandler("get_eu_frequency", frequencySchema, getEuFrequency),
  );
}

if (shouldRegister("get_hydro_reservoir")) {
  registeredToolNames.push("get_hydro_reservoir");
  server.tool(
    "get_hydro_reservoir",
    "Hydro reservoir fill (MWh) from ENTSO-E. Weekly data. Best coverage: NO, SE, AT, CH, ES, PT.",
    hydroSchema.shape,
    auditedToolHandler("get_hydro_reservoir", hydroSchema, getHydroReservoir),
  );
}

if (shouldRegister("get_transmission_lines")) {
  registeredToolNames.push("get_transmission_lines");
  server.tool(
    "get_transmission_lines",
    "HV transmission lines from OSM. Voltage (kV), operator, cables, coordinates. Filter by country/bbox. 220kV+ default. Rate-limited.",
    transmissionSchema.shape,
    auditedToolHandler("get_transmission_lines", transmissionSchema, getTransmissionLines),
  );
}

// --- Intraday & Balancing ---

if (shouldRegister("get_intraday_prices")) {
  registeredToolNames.push("get_intraday_prices");
  server.tool(
    "get_intraday_prices",
    "Intraday continuous electricity prices (EUR/MWh) for a European zone. Hourly with stats.",
    intradayPricesSchema.shape,
    auditedToolHandler("get_intraday_prices", intradayPricesSchema, getIntradayPrices),
  );
}

if (shouldRegister("get_imbalance_prices")) {
  registeredToolNames.push("get_imbalance_prices");
  server.tool(
    "get_imbalance_prices",
    "Imbalance settlement prices (EUR/MWh) per period. Price for deviations from scheduled position.",
    imbalancePricesSchema.shape,
    auditedToolHandler("get_imbalance_prices", imbalancePricesSchema, getImbalancePrices),
  );
}

if (shouldRegister("get_intraday_da_spread")) {
  registeredToolNames.push("get_intraday_da_spread");
  server.tool(
    "get_intraday_da_spread",
    "Intraday vs day-ahead spread per hour. Directional signal: premium = post-auction change (outage, forecast miss, demand spike).",
    intradaySpreadSchema.shape,
    auditedToolHandler("get_intraday_da_spread", intradaySpreadSchema, getIntradayDaSpread),
  );
}

if (shouldRegister("get_realtime_generation")) {
  registeredToolNames.push("get_realtime_generation");
  server.tool(
    "get_realtime_generation",
    "Real-time generation by fuel type (MW). ENTSO-E for EU, Elexon BMRS for GB. 5-15 min resolution.",
    realtimeGenerationSchema.shape,
    auditedToolHandler("get_realtime_generation", realtimeGenerationSchema, getRealtimeGeneration),
  );
}

if (shouldRegister("get_balancing_actions")) {
  registeredToolNames.push("get_balancing_actions");
  server.tool(
    "get_balancing_actions",
    "Activated balancing energy (MW): up/down regulation per period. ENTSO-E for EU, Elexon BOD for GB.",
    balancingActionsSchema.shape,
    auditedToolHandler("get_balancing_actions", balancingActionsSchema, getBalancingActions),
  );
}

// --- BESS & Ancillary ---

if (shouldRegister("get_ancillary_prices")) {
  registeredToolNames.push("get_ancillary_prices");
  server.tool(
    "get_ancillary_prices",
    "FCR/aFRR/mFRR reserve prices (EUR/MW) per period. Key BESS revenue stream (30-50%, often 3-5x arbitrage).",
    ancillaryPricesSchema.shape,
    auditedToolHandler("get_ancillary_prices", ancillaryPricesSchema, getAncillaryPrices),
  );
}

if (shouldRegister("get_remit_messages")) {
  registeredToolNames.push("get_remit_messages");
  server.tool(
    "get_remit_messages",
    "REMIT urgent market messages: forced outages, capacity reductions, market-moving events. Early spike signal.",
    remitMessagesSchema.shape,
    auditedToolHandler("get_remit_messages", remitMessagesSchema, getRemitMessages),
  );
}

if (shouldRegister("get_price_spread_analysis")) {
  registeredToolNames.push("get_price_spread_analysis");
  server.tool(
    "get_price_spread_analysis",
    "BESS arbitrage analysis: optimal charge/discharge schedule, revenue per MW, signal strength.",
    priceSpreadAnalysisSchema.shape,
    auditedToolHandler("get_price_spread_analysis", priceSpreadAnalysisSchema, getPriceSpreadAnalysis),
  );
}

// --- Gas & LNG ---

if (shouldRegister("get_eu_gas_price")) {
  registeredToolNames.push("get_eu_gas_price");
  server.tool(
    "get_eu_gas_price",
    "EU gas prices (EUR/MWh): TTF or NBP. Latest + daily history. No API key. Spark spread, gas-power switching.",
    euGasPriceSchema.shape,
    auditedToolHandler("get_eu_gas_price", euGasPriceSchema, getEuGasPrice),
  );
}

// --- Regional Specialists ---

if (shouldRegister("get_energy_charts")) {
  registeredToolNames.push("get_energy_charts");
  server.tool(
    "get_energy_charts",
    "Energy-Charts (Fraunhofer ISE): prices (15-min), generation by fuel, cross-border flows. All EU except GB. No API key. Faster than ENTSO-E.",
    energyChartsSchema.shape,
    auditedToolHandler("get_energy_charts", energyChartsSchema, getEnergyCharts),
  );
}

if (shouldRegister("get_commodity_prices")) {
  registeredToolNames.push("get_commodity_prices");
  server.tool(
    "get_commodity_prices",
    "EU commodity prices: EUA carbon, Brent crude, TTF gas. Latest + 5-day history + stats. No API key.",
    commodityPricesSchema.shape,
    auditedToolHandler("get_commodity_prices", commodityPricesSchema, getCommodityPrices),
  );
}

if (shouldRegister("get_nordpool_prices")) {
  registeredToolNames.push("get_nordpool_prices");
  server.tool(
    "get_nordpool_prices",
    "Nordic/Baltic day-ahead prices (15-min) from Nordpool. SE1-4, NO1-5, DK1-2, FI. No API key.",
    nordpoolSchema.shape,
    auditedToolHandler("get_nordpool_prices", nordpoolSchema, getNordpoolPrices),
  );
}

if (shouldRegister("get_smard_data")) {
  registeredToolNames.push("get_smard_data");
  server.tool(
    "get_smard_data",
    "German electricity from SMARD (BNetzA): hourly generation, consumption, market data. No API key.",
    smardSchema.shape,
    auditedToolHandler("get_smard_data", smardSchema, getSmardData),
  );
}

if (shouldRegister("get_entsog_data")) {
  registeredToolNames.push("get_entsog_data");
  server.tool(
    "get_entsog_data",
    "ENTSOG gas pipeline data: physical flows (GWh/d), nominations, interruptions, capacities. All EU TSOs. No API key.",
    entsogSchema.shape,
    auditedToolHandler("get_entsog_data", entsogSchema, getEntsogData),
  );
}

if (shouldRegister("get_elexon_bmrs")) {
  registeredToolNames.push("get_elexon_bmrs");
  server.tool(
    "get_elexon_bmrs",
    "GB balancing mechanism from Elexon BMRS: cashout prices, generation by fuel, bids/offers, system warnings, interconnectors. No API key.",
    elexonBmrsSchema.shape,
    auditedToolHandler("get_elexon_bmrs", elexonBmrsSchema, getElexonBmrs),
  );
}

if (shouldRegister("get_era5_weather")) {
  registeredToolNames.push("get_era5_weather");
  server.tool(
    "get_era5_weather",
    "ERA5 weather reanalysis via Open-Meteo: hourly wind (10m/100m), solar (GHI/DNI), temperature. 1940 to ~5 days ago. No API key.",
    era5WeatherSchema.shape,
    auditedToolHandler("get_era5_weather", era5WeatherSchema, getEra5Weather),
  );
}

if (shouldRegister("get_regelleistung")) {
  registeredToolNames.push("get_regelleistung");
  server.tool(
    "get_regelleistung",
    "Regelleistung.net: FCR/aFRR/mFRR reserve tender prices and volumes. Primary BESS revenue data source.",
    regelleistungSchema.shape,
    auditedToolHandler("get_regelleistung", regelleistungSchema, getRegelleistung),
  );
}

if (shouldRegister("get_rte_france")) {
  registeredToolNames.push("get_rte_france");
  server.tool(
    "get_rte_france",
    "French electricity from RTE (eco2mix): real-time generation, consumption, exchanges, outages. No API key.",
    rteFranceSchema.shape,
    auditedToolHandler("get_rte_france", rteFranceSchema, getRteFrance),
  );
}

if (shouldRegister("get_energi_data")) {
  registeredToolNames.push("get_energi_data");
  server.tool(
    "get_energi_data",
    "Danish electricity from Energi Data Service: CO2 emissions, production, spot prices (DK1/DK2), balance. No API key.",
    energiDataSchema.shape,
    auditedToolHandler("get_energi_data", energiDataSchema, getEnergiData),
  );
}

if (shouldRegister("get_fingrid_data")) {
  registeredToolNames.push("get_fingrid_data");
  server.tool(
    "get_fingrid_data",
    "Finnish grid from Fingrid: consumption, generation, imports/exports, frequency, reserve prices. 3-min resolution. Requires FINGRID_API_KEY.",
    fingridSchema.shape,
    auditedToolHandler("get_fingrid_data", fingridSchema, getFingridData),
  );
}

// --- Hydropower ---

if (shouldRegister("get_hydro_inflows")) {
  registeredToolNames.push("get_hydro_inflows");
  server.tool(
    "get_hydro_inflows",
    "Hydro inflow proxy from ERA5-Land: precipitation, snowfall, snowmelt, temperature for NO/SE/CH/AT/FR/IT/ES/PT/FI/RO. No API key.",
    hydroInflowsSchema.shape,
    auditedToolHandler("get_hydro_inflows", hydroInflowsSchema, getHydroInflows),
  );
}

if (shouldRegister("get_acer_remit")) {
  registeredToolNames.push("get_acer_remit");
  server.tool(
    "get_acer_remit",
    "ACER REMIT: UMMs and outage events from Inside Information Platforms. Forced outages, capacity reductions under EU REMIT.",
    acerRemitSchema.shape,
    auditedToolHandler("get_acer_remit", acerRemitSchema, getAcerRemit),
  );
}

if (shouldRegister("get_terna_data")) {
  registeredToolNames.push("get_terna_data");
  server.tool(
    "get_terna_data",
    "Italian electricity from Terna: generation, demand, exchanges, zonal prices. NORD/CNOR/CSUD/SUD/SICI/SARD zones.",
    ternaSchema.shape,
    auditedToolHandler("get_terna_data", ternaSchema, getTernaData),
  );
}

if (shouldRegister("get_ree_esios")) {
  registeredToolNames.push("get_ree_esios");
  server.tool(
    "get_ree_esios",
    "Spanish electricity from REE ESIOS: prices, demand, generation, wind/solar forecast, interconnectors. Requires ESIOS_API_TOKEN.",
    reeEsiosSchema.shape,
    auditedToolHandler("get_ree_esios", reeEsiosSchema, getReeEsios),
  );
}

// --- Weather ---

if (shouldRegister("get_stormglass")) {
  registeredToolNames.push("get_stormglass");
  server.tool(
    "get_stormglass",
    "Marine/offshore weather from Storm Glass: wind, waves, swell, SST, visibility. 48h forecast. Requires STORMGLASS_API_KEY. 10 req/day free.",
    stormglassSchema.shape,
    auditedToolHandler("get_stormglass", stormglassSchema, getStormglass),
  );
}

// --- GIS Site Prospecting ---

if (shouldRegister("get_terrain_analysis")) {
  registeredToolNames.push("get_terrain_analysis");
  server.tool(
    "get_terrain_analysis",
    "Terrain analysis for a location: elevation (m), slope (degrees), aspect (cardinal), flatness score. Uses Open-Meteo elevation API (Copernicus EU-DEM). No API key.",
    terrainAnalysisSchema.shape,
    auditedToolHandler("get_terrain_analysis", terrainAnalysisSchema, getTerrainAnalysis),
  );
}

if (shouldRegister("get_grid_proximity")) {
  registeredToolNames.push("get_grid_proximity");
  server.tool(
    "get_grid_proximity",
    "Nearest grid infrastructure (substations, HV lines) within a radius. Distance, voltage, operator. Uses OSM Overpass. No API key.",
    gridProximitySchema.shape,
    auditedToolHandler("get_grid_proximity", gridProximitySchema, getGridProximity),
  );
}

if (shouldRegister("get_grid_connection_queue")) {
  registeredToolNames.push("get_grid_connection_queue");
  server.tool(
    "get_grid_connection_queue",
    "GB transmission connection-register signal from NESO's public TEC register. Search by connection site, project, host TO, technology, status, or agreement type and get matched projects plus aggregated MW by connection site. This is not a DNO headroom map or a guaranteed connection offer. No API key.",
    gridConnectionQueueSchema.shape,
    auditedToolHandler("get_grid_connection_queue", gridConnectionQueueSchema, getGridConnectionQueue),
  );
}

if (shouldRegister("get_grid_connection_intelligence")) {
  registeredToolNames.push("get_grid_connection_intelligence");
  server.tool(
    "get_grid_connection_intelligence",
    "GB grid connection intelligence: resolves the containing GSP region when NESO boundaries match, otherwise falls back to the nearest GSP, then adds TEC register context, nearby substations, SSEN distribution headroom where public SSEN data resolves, and NGED public queue and TD-limit context where that GSP is covered. Not a connection offer or capacity guarantee.",
    gridConnectionIntelligenceSchema.shape,
    auditedToolHandler("get_grid_connection_intelligence", gridConnectionIntelligenceSchema, getGridConnectionIntelligence),
  );
}

if (shouldRegister("get_distribution_headroom")) {
  registeredToolNames.push("get_distribution_headroom");
  server.tool(
    "get_distribution_headroom",
    "SSEN-only distribution headroom lookup. Finds nearby SSEN GSP/BSP/primary sites, estimated generation and demand headroom, constraints, and reinforcement timing from SSEN's public headroom dashboard. Not a connection offer or firm capacity right.",
    distributionHeadroomSchema.shape,
    auditedToolHandler("get_distribution_headroom", distributionHeadroomSchema, getDistributionHeadroom),
  );
}

if (shouldRegister("get_nged_connection_signal")) {
  registeredToolNames.push("get_nged_connection_signal");
  server.tool(
    "get_nged_connection_signal",
    "NGED-only public connection signal. Resolves a GB site to its NESO GSP, then returns NGED's public per-GSP connection queue and TD-limit records where that GSP is covered. Not headroom, a connection offer, or a firm capacity right.",
    ngedConnectionSignalSchema.shape,
    auditedToolHandler("get_nged_connection_signal", ngedConnectionSignalSchema, getNgedConnectionSignal),
  );
}

if (shouldRegister("get_land_constraints")) {
  registeredToolNames.push("get_land_constraints");
  server.tool(
    "get_land_constraints",
    "Land-constraint screening within a radius. GB uses Natural England protected areas, EU member states use EEA Natura 2000 protected sites. Hard exclusion check for PV/BESS siting. No API key.",
    landConstraintsSchema.shape,
    auditedToolHandler("get_land_constraints", landConstraintsSchema, getLandConstraints),
  );
}

if (shouldRegister("get_land_cover")) {
  registeredToolNames.push("get_land_cover");
  server.tool(
    "get_land_cover",
    "Land-cover classification for a point using CORINE Land Cover 2018. Returns the 3-digit CLC code, human label, top-level land-cover group, and a conservative planning-exclusion flag for wetlands, water bodies, and woodland. EU27 + EEA/EFTA only. Great Britain is not covered by CORINE 2018. No API key.",
    landCoverSchema.shape,
    auditedToolHandler("get_land_cover", landCoverSchema, getLandCover),
  );
}

if (shouldRegister("get_agricultural_land")) {
  registeredToolNames.push("get_agricultural_land");
  server.tool(
    "get_agricultural_land",
    "Agricultural Land Classification for an English site. Prefers detailed post-1988 Natural England surveys, falls back to provisional ALC, and flags Best and Most Versatile land risk. GB input, England coverage only. No API key.",
    agriculturalLandSchema.shape,
    auditedToolHandler("get_agricultural_land", agriculturalLandSchema, getAgriculturalLand),
  );
}

if (shouldRegister("get_flood_risk")) {
  registeredToolNames.push("get_flood_risk");
  server.tool(
    "get_flood_risk",
    "Flood-planning screen for an English site. Checks Environment Agency Flood Zone 2, Flood Zone 3, and flood storage areas, then summarises planning risk. GB input, England coverage only. No API key.",
    floodRiskSchema.shape,
    auditedToolHandler("get_flood_risk", floodRiskSchema, getFloodRisk),
  );
}

if (shouldRegister("screen_site")) {
  registeredToolNames.push("screen_site");
  server.tool(
    "screen_site",
    "Composite PV/BESS site screening for GB and EU locations. GB: terrain, grid, solar, land constraints, agricultural land, flood risk. EU: terrain, grid, solar, land constraints (Natura 2000), land cover (CORINE). Returns pass/warn/fail verdict with layers_available/layers_unavailable. No API key.",
    screenSiteSchema.shape,
    auditedToolHandler("screen_site", screenSiteSchema, screenSite),
  );
}

if (shouldRegister("verify_gis_sources")) {
  registeredToolNames.push("verify_gis_sources");
  server.tool(
    "verify_gis_sources",
    "Health check for GIS data sources. Pings each upstream provider or dataset endpoint (Open-Meteo, Overpass, NESO TEC register, Natural England protected areas, EEA Natura 2000, CORINE Land Cover, Natural England ALC, Environment Agency Flood Map, PVGIS) and reports status, response time, and source metadata. Use before relying on GIS tool results.",
    verifyGisSourcesSchema.shape,
    auditedToolHandler("verify_gis_sources", verifyGisSourcesSchema, verifyGisSources),
  );
}

if (shouldRegister("compare_sites")) {
  registeredToolNames.push("compare_sites");
  server.tool(
    "compare_sites",
    "Compare and rank 2-10 candidate PV/BESS sites. Runs screen_site on each point, then scores and ranks by verdict, solar resource, grid proximity, and terrain. Returns transparent heuristic reasoning. GB and EU member states supported. No API key.",
    compareSitesSchema.shape,
    auditedToolHandler("compare_sites", compareSitesSchema, compareSites),
  );
}

if (shouldRegister("estimate_site_revenue")) {
  registeredToolNames.push("estimate_site_revenue");
  server.tool(
    "estimate_site_revenue",
    "Estimate annual PV generation revenue or BESS arbitrage revenue for a candidate site. Combines solar resource with day-ahead prices (PV) or spread analysis (BESS). Not a financial model.",
    siteRevenueSchema.shape,
    auditedToolHandler("estimate_site_revenue", siteRevenueSchema, estimateSiteRevenue),
  );
}

if (shouldRegister("shortlist_bess_sites")) {
  registeredToolNames.push("shortlist_bess_sites");
  server.tool(
    "shortlist_bess_sites",
    "GB-only BESS shortlist flow. Combines compare_sites, screening-level BESS revenue estimates, GB transmission queue intelligence, and SSEN distribution headroom where public SSEN data resolves into a transparent ranked shortlist. Not a capacity guarantee, connection offer, or investment model.",
    bessShortlistSchema.shape,
    auditedToolHandler("shortlist_bess_sites", bessShortlistSchema, shortlistBessSites),
  );
}

} // end registerDataTools

// ---------------------------------------------------------------------------
// Discovery meta-tools (always registered regardless of profile)
// ---------------------------------------------------------------------------

function registerMetaTools(): void {

server.tool(
  "luminus_discover",
  "List available Luminus tools and profiles",
  {
    profile: z.string().optional().describe("Filter by profile name"),
    category: z.string().optional().describe("Deprecated alias for profile"),
  },
  async ({ profile: filterProfile, category }) => {
    const requestedProfile = filterProfile ?? category;
    if (requestedProfile) {
      const profileTools = PROFILES[requestedProfile];
      if (!profileTools) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `Unknown profile "${requestedProfile}"`,
              validProfiles: ["full", ...getProfileNames()],
            }, null, 2),
          }],
        };
      }

      const tools = profileTools.map((name) => ({
        name,
        registered: registeredToolNames.includes(name),
        hasKeys: hasRequiredKeys(name),
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            profile: requestedProfile,
            description: getProfileDescription(requestedProfile),
            toolCount: tools.length,
            tools,
          }, null, 2),
        }],
      };
    }

    // List all profiles with summary info
    const profiles = ["full", ...getProfileNames()].map((name) => {
      const tools = name === "full" ? null : PROFILES[name];
      return {
        name,
        description: getProfileDescription(name),
        toolCount: tools ? tools.length : TOTAL_TOOLS,
      };
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          activeProfile: profile,
          registeredToolCount: registeredToolNames.length,
          profiles,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "luminus_status",
  "Server status: registered tools, active profile, configured API keys",
  {},
  async () => {
    const allKeyNames = new Set<string>();
    const configuredKeys: string[] = [];
    const missingKeys: string[] = [];

    for (const keys of Object.values(TOOL_KEY_REQUIREMENTS)) {
      for (const key of keys) {
        allKeyNames.add(key);
      }
    }

    for (const key of allKeyNames) {
      if (isKeyConfigured(key)) {
        configuredKeys.push(key);
      } else {
        missingKeys.push(key);
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          profile,
          registeredTools: registeredToolNames.length,
          totalAvailable: TOTAL_TOOLS,
          skippedByProfile: skippedByProfile.length,
          skippedByMissingKeys: skippedByKeys.length,
          configuredKeys: configuredKeys.sort(),
          missingKeys: missingKeys.sort(),
        }, null, 2),
      }],
    };
  },
);

} // end registerMetaTools

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Pre-load key file BEFORE registration so hasRequiredKeys sees file-based keys
  await preloadKeyFile();

  // Register data tools (after key file is loaded)
  registerDataTools();

  // Register discovery meta-tools (always, regardless of profile)
  registerMetaTools();

  process.stderr.write(
    `[luminus] Profile: ${profile} | ` +
      `Registered: ${registeredToolNames.length + 2} tools ` +
      `(${registeredToolNames.length} data + 2 meta)\n`,
  );

  if (skippedByProfile.length > 0) {
    process.stderr.write(
      `[luminus] Skipped by profile: ${skippedByProfile.length} tools\n`,
    );
  }

  if (skippedByKeys.length > 0) {
    process.stderr.write(
      `[luminus] Skipped (missing API keys): ${skippedByKeys.join(", ")}\n`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[luminus] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
