#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";

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
import { emberSchema, getEmberData } from "./tools/ember-data.js";

dotenv.config();

const server = new McpServer({
  name: "luminus",
  version: "0.1.0",
});

server.tool(
  "get_generation_mix",
  "Get the current electricity generation mix for a European country/zone. " +
    "Returns MW output per fuel type (wind, solar, gas, nuclear, hydro, coal, etc). " +
    "Useful for understanding what powers the grid right now.",
  generationSchema.shape,
  async (params) => {
    try {
      const result = await getGenerationMix(generationSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_day_ahead_prices",
  "Get day-ahead electricity prices (EUR/MWh) for a European bidding zone. " +
    "Returns hourly prices with min/max/mean stats. " +
    "Useful for energy cost analysis and trading signals.",
  pricesSchema.shape,
  async (params) => {
    try {
      const result = await getDayAheadPrices(pricesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_cross_border_flows",
  "Get physical electricity flows between two European zones in MW. " +
    "Returns hourly flow data with statistics. " +
    "Useful for understanding interconnection utilization and energy trade.",
  flowsSchema.shape,
  async (params) => {
    try {
      const result = await getCrossBorderFlows(flowsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_carbon_intensity",
  "Calculate carbon intensity (gCO2/kWh) for a European zone based on its current generation mix. " +
    "Returns intensity, fuel breakdown with emission factors, and renewable/fossil percentages. " +
    "Useful for carbon footprint analysis and green energy comparison.",
  carbonSchema.shape,
  async (params) => {
    try {
      const result = await getCarbonIntensity(carbonSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_gas_storage",
  "Get European gas storage levels from GIE AGSI+. " +
    "Returns gas in storage (TWh), fill level (%), injection/withdrawal rates, and year-on-year trend. " +
    "Useful for energy supply security analysis and gas market fundamentals.",
  gasStorageSchema.shape,
  async (params) => {
    try {
      const result = await getGasStorage(gasStorageSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_weather_forecast",
  "Get weather forecast for a European location with data relevant to energy markets. " +
    "Returns hourly temperature, wind speed (for wind generation), and solar radiation (for solar generation). " +
    "Accepts country code (uses capital city) or custom lat/lon coordinates.",
  weatherSchema.shape,
  async (params) => {
    try {
      const result = await getWeatherForecast(weatherSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_us_gas_data",
  "Get US natural gas market data from the EIA. " +
    "Supports weekly storage levels (Bcf) and Henry Hub futures prices (USD/MMBtu). " +
    "Useful for transatlantic gas market analysis and LNG flow context.",
  usGasSchema.shape,
  async (params) => {
    try {
      const result = await getUsGasData(usGasSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_uk_carbon_intensity",
  "Get UK carbon intensity and generation mix from National Grid ESO. " +
    "Returns gCO2/kWh intensity, index (very low to very high), and fuel-type percentages. " +
    "Supports current national, regional breakdown, and historical by date.",
  ukCarbonSchema.shape,
  async (params) => {
    try {
      const result = await getUkCarbonIntensity(ukCarbonSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_uk_grid_demand",
  "Get UK electricity demand and grid frequency from National Grid ESO. " +
    "Demand returns actual MW + forecast for recent settlement periods. " +
    "Frequency returns real-time Hz (~50 Hz nominal; deviations = grid stress).",
  ukGridSchema.shape,
  async (params) => {
    try {
      const result = await getUkGridDemand(ukGridSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_balancing_prices",
  "Get imbalance/balancing prices (EUR/MWh) for a European bidding zone. " +
    "Returns settlement period prices with min/max/mean stats. " +
    "Useful for understanding real-time balancing market costs.",
  balancingSchema.shape,
  async (params) => {
    try {
      const result = await getBalancingPrices(balancingSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_renewable_forecast",
  "Get day-ahead wind and solar generation forecast (MW) for a European zone. " +
    "Returns hourly forecasts per source (Wind Onshore, Wind Offshore, Solar) with peak MW. " +
    "Useful for renewable energy planning and residual load analysis.",
  renewableForecastSchema.shape,
  async (params) => {
    try {
      const result = await getRenewableForecast(renewableForecastSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_demand_forecast",
  "Get day-ahead total load/demand forecast (MW) for a European zone. " +
    "Returns hourly demand with min/max/mean stats and total energy. " +
    "Useful for supply-demand balance analysis and peak planning.",
  demandForecastSchema.shape,
  async (params) => {
    try {
      const result = await getDemandForecast(demandForecastSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_power_plants",
  "Get European power plant data from Open Power System Data. " +
    "Returns plant name, capacity (MW), fuel type, location, and commissioning year. " +
    "Covers conventional and renewable plants. Filter by country, fuel type, or minimum capacity.",
  powerPlantsSchema.shape,
  async (params) => {
    try {
      const result = await getPowerPlants(powerPlantsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_auction_results",
  "Get cross-border capacity auction results from JAO (Joint Allocation Office). " +
    "Returns allocated capacity (MW), auction price (EUR/MW), and offered capacity for a border corridor. " +
    "Useful for interconnection value and congestion rent analysis.",
  auctionSchema.shape,
  async (params) => {
    try {
      const result = await getAuctionResults(auctionSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_outages",
  "Get generation or transmission outages for a European zone from ENTSO-E. " +
    "Returns unit name, fuel type, available/unavailable MW, start/end dates, and reason. " +
    "Useful for supply risk analysis and maintenance planning.",
  outagesSchema.shape,
  async (params) => {
    try {
      const result = await getOutages(outagesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_lng_terminals",
  "Get European LNG terminal data from GIE ALSI. " +
    "Returns LNG inventory (mcm), send-out rate, capacity, and days to reach storage per terminal. " +
    "Useful for gas supply security and LNG market analysis.",
  lngTerminalsSchema.shape,
  async (params) => {
    try {
      const result = await getLngTerminals(lngTerminalsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_solar_irradiance",
  "Get solar irradiance and PV yield estimates for any location from PVGIS. " +
    "Returns monthly irradiance (kWh/m2), optimal panel angle, and annual yield estimate. " +
    "No API key needed. Useful for solar project assessment.",
  solarSchema.shape,
  async (params) => {
    try {
      const result = await getSolarIrradiance(solarSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_net_positions",
  "Calculate net import/export position (MW) for a European zone by summing all cross-border flows. " +
    "Returns total net position (positive = net importer) and per-border breakdown. " +
    "Useful for understanding a country's energy trade balance.",
  netPositionsSchema.shape,
  async (params) => {
    try {
      const result = await getNetPositions(netPositionsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_transfer_capacities",
  "Get net transfer capacity (NTC) in MW between two European zones from ENTSO-E. " +
    "Returns hourly NTC values (max allowed commercial flow) with min/max/mean stats. " +
    "Useful for interconnection utilization and congestion analysis.",
  transferCapacitySchema.shape,
  async (params) => {
    try {
      const result = await getTransferCapacity(transferCapacitySchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_eu_frequency",
  "Get real-time European grid frequency (~50 Hz). " +
    "Returns frequency in Hz, deviation in mHz, and status (normal/deviation). " +
    "Deviations indicate grid stress from supply-demand imbalance.",
  frequencySchema.shape,
  async (params) => {
    try {
      const result = await getEuFrequency(frequencySchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_hydro_reservoir",
  "Get hydro reservoir filling levels (stored energy in MWh) for a European zone from ENTSO-E. " +
    "Returns weekly reservoir data. Best coverage: NO, SE, AT, CH, ES, PT. " +
    "Useful for hydropower supply analysis and price forecasting.",
  hydroSchema.shape,
  async (params) => {
    try {
      const result = await getHydroReservoir(hydroSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_transmission_lines",
  "Get high-voltage transmission line routes from OpenStreetMap. " +
    "Returns line voltage (kV), operator, cable count, and lat/lon coordinates. " +
    "Filter by country or bounding box. Defaults to 220kV+ lines. Rate-limited.",
  transmissionSchema.shape,
  async (params) => {
    try {
      const result = await getTransmissionLines(transmissionSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_intraday_prices",
  "Get intraday/continuous electricity prices for a European bidding zone. " +
    "Returns hourly prices from the intraday market with stats. " +
    "Compare with day-ahead prices to spot market moves and trading opportunities.",
  intradayPricesSchema.shape,
  async (params) => {
    try {
      const result = await getIntradayPrices(intradayPricesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_imbalance_prices",
  "Get real-time imbalance/settlement prices for a European zone. " +
    "Returns per-period imbalance prices (EUR/MWh) — the price paid for deviations from scheduled position. " +
    "Key signal for balancing market traders and BRP risk management.",
  imbalancePricesSchema.shape,
  async (params) => {
    try {
      const result = await getImbalancePrices(imbalancePricesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_intraday_da_spread",
  "Get the spread between intraday and day-ahead prices for a European zone. " +
    "Returns per-hour spread (intraday minus day-ahead) with a directional signal. " +
    "Intraday premium = something changed since auction (outage, forecast miss, demand spike). " +
    "Core signal for directional and spread traders.",
  intradaySpreadSchema.shape,
  async (params) => {
    try {
      const result = await getIntradayDaSpread(intradaySpreadSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_realtime_generation",
  "Get actual real-time generation by fuel type (MW) for a European zone. " +
    "Returns generation per source (wind, solar, gas, nuclear, etc.) with total. " +
    "Uses ENTSO-E for EU zones, Elexon BMRS for GB. 5-15 min resolution.",
  realtimeGenerationSchema.shape,
  async (params) => {
    try {
      const result = await getRealtimeGeneration(realtimeGenerationSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_balancing_actions",
  "Get activated balancing energy actions (MW) for a European zone. " +
    "Returns upward and downward regulation volumes per period. " +
    "Uses ENTSO-E for EU zones, Elexon BMRS BOD for GB. " +
    "Indicates real-time grid stress and TSO intervention.",
  balancingActionsSchema.shape,
  async (params) => {
    try {
      const result = await getBalancingActions(balancingActionsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_ancillary_prices",
  "Get FCR/aFRR/mFRR reserve procurement prices for a European zone. " +
    "Returns per-period prices in EUR/MW. " +
    "BESS operators use reserve markets for 30-50% of revenue — often 3-5x more profitable than energy arbitrage.",
  ancillaryPricesSchema.shape,
  async (params) => {
    try {
      const result = await getAncillaryPrices(ancillaryPricesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_remit_messages",
  "Get REMIT urgent market messages for a European zone. " +
    "Returns forced outages, capacity reductions, and market-moving events. " +
    "Early detection of large outages signals imminent price spikes.",
  remitMessagesSchema.shape,
  async (params) => {
    try {
      const result = await getRemitMessages(remitMessagesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_price_spread_analysis",
  "Analyze daily price spread for BESS arbitrage. " +
    "Returns optimal charge/discharge schedule, expected revenue per MW, and a signal strength. " +
    "Built for battery storage operators evaluating arbitrage opportunities.",
  priceSpreadAnalysisSchema.shape,
  async (params) => {
    try {
      const result = await getPriceSpreadAnalysis(priceSpreadAnalysisSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_eu_gas_price",
  "Get European natural gas prices (TTF or NBP). " +
    "Returns latest price in EUR/MWh with daily history. No API key needed. " +
    "Use for spark spread calculations, BESS revenue comparisons, and gas-power switching signals.",
  euGasPriceSchema.shape,
  async (params) => {
    try {
      const result = await getEuGasPrice(euGasPriceSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_energy_charts",
  "Query energy-charts.info (Fraunhofer ISE) for European electricity data. " +
    "No API key needed. Returns prices (15-min resolution), real-time generation by fuel type, " +
    "or cross-border flows. Covers all EU countries except GB. " +
    "Faster and more reliable than ENTSO-E.",
  energyChartsSchema.shape,
  async (params) => {
    try {
      const result = await getEnergyCharts(energyChartsSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_commodity_prices",
  "Get European energy commodity prices: EUA carbon (CO2.L), Brent crude (BZ=F), TTF gas (TTF=F). " +
    "No API key needed. Returns latest price, 5-day history, and stats.",
  commodityPricesSchema.shape,
  async (params) => {
    try {
      const result = await getCommodityPrices(commodityPricesSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_nordpool_prices",
  "Get Nordic and Baltic day-ahead prices from Nordpool at 15-min resolution. " +
    "Covers SE1-SE4, NO1-NO5, DK1-DK2, FI. No API key needed.",
  nordpoolSchema.shape,
  async (params) => {
    try {
      const result = await getNordpoolPrices(nordpoolSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_smard_data",
  "Get high-resolution German electricity data from SMARD (Bundesnetzagentur). " +
    "Hourly generation, consumption, and market data. No API key needed.",
  smardSchema.shape,
  async (params) => {
    try {
      const result = await getSmardData(smardSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_ember_data",
  "Get power sector data from EMBER Climate. " +
    "Yearly electricity generation, capacity, emissions, and demand by country. Free, no API key.",
  emberSchema.shape,
  async (params) => {
    try {
      const result = await getEmberData(emberSchema.parse(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
