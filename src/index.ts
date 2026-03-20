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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
