import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";

import { generationSchema, getGenerationMix } from "./tools/generation.js";
import { pricesSchema, getDayAheadPrices } from "./tools/prices.js";
import { flowsSchema, getCrossBorderFlows } from "./tools/flows.js";
import { carbonSchema, getCarbonIntensity } from "./tools/carbon.js";

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
