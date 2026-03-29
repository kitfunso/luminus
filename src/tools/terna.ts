import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://api.terna.it/transparency/v1.0";
const TERNA_PUBLIC = "https://www.terna.it/en/electric-system";
const cache = new TtlCache();

export const ternaSchema = z.object({
  dataset: z
    .enum(["generation", "demand", "exchanges", "market_data"])
    .describe(
      '"generation" = Italian electricity generation by source (MW). ' +
        '"demand" = Italian electricity demand (MW). ' +
        '"exchanges" = cross-border exchange flows with neighbours. ' +
        '"market_data" = Italian zonal electricity market data.'
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
  zone: z
    .string()
    .optional()
    .describe(
      "Italian market zone: NORD, CNOR, CSUD, SUD, SICI, SARD, or ITALY (national). " +
        "Defaults to ITALY."
    ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTerna(endpoint: string): Promise<any> {
  const cached = cache.get(endpoint);
  if (cached) return cached;

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "luminus-mcp/0.1",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Terna API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  cache.set(endpoint, json, TTL.REALTIME);
  return json;
}

interface GenerationRecord {
  timestamp: string;
  thermal_mw: number;
  hydro_mw: number;
  wind_mw: number;
  solar_mw: number;
  geothermal_mw: number;
  biomass_mw: number;
  total_mw: number;
  renewable_pct: number;
}

interface TernaGenerationResult {
  dataset: "generation";
  source: string;
  date: string;
  zone: string;
  records: GenerationRecord[];
  latest: GenerationRecord | null;
}

interface DemandRecord {
  timestamp: string;
  demand_mw: number;
  forecast_mw: number;
}

interface TernaDemandResult {
  dataset: "demand";
  source: string;
  date: string;
  zone: string;
  records: DemandRecord[];
}

interface ExchangeRecord {
  border: string;
  flow_mw: number;
  direction: string;
}

interface TernaExchangesResult {
  dataset: "exchanges";
  source: string;
  date: string;
  exchanges: ExchangeRecord[];
  net_import_mw: number;
}

interface MarketRecord {
  zone: string;
  timestamp: string;
  price_eur_mwh: number;
}

interface TernaMarketResult {
  dataset: "market_data";
  source: string;
  date: string;
  zone: string;
  records: MarketRecord[];
}

type TernaResult =
  | TernaGenerationResult
  | TernaDemandResult
  | TernaExchangesResult
  | TernaMarketResult;

export async function getTernaData(
  params: z.infer<typeof ternaSchema>
): Promise<TernaResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const zone = params.zone?.toUpperCase() ?? "ITALY";

  try {
    // Try Terna developer API first
    const url = `${API_BASE}/${params.dataset}?date=${date}&zone=${zone}`;
    const data = await fetchTerna(url);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.records ?? [];

    switch (params.dataset) {
      case "generation": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: GenerationRecord[] = items.slice(0, 24).map((r: any) => {
          const thermal = Number(r.thermal ?? r.termoelettrico ?? 0);
          const hydro = Number(r.hydro ?? r.idroelettrico ?? 0);
          const wind = Number(r.wind ?? r.eolico ?? 0);
          const solar = Number(r.solar ?? r.fotovoltaico ?? 0);
          const geo = Number(r.geothermal ?? r.geotermico ?? 0);
          const bio = Number(r.biomass ?? r.bioenergie ?? 0);
          const total = thermal + hydro + wind + solar + geo + bio;
          const renewable = hydro + wind + solar + geo + bio;

          return {
            timestamp: r.timestamp ?? r.datetime ?? "",
            thermal_mw: Math.round(thermal),
            hydro_mw: Math.round(hydro),
            wind_mw: Math.round(wind),
            solar_mw: Math.round(solar),
            geothermal_mw: Math.round(geo),
            biomass_mw: Math.round(bio),
            total_mw: Math.round(total),
            renewable_pct: total > 0 ? Math.round((renewable / total) * 1000) / 10 : 0,
          };
        });

        return {
          dataset: "generation",
          source: "Terna Transparency (developer.terna.it)",
          date,
          zone,
          records,
          latest: records.length > 0 ? records[0] : null,
        };
      }

      case "demand": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: DemandRecord[] = items.slice(0, 24).map((r: any) => ({
          timestamp: r.timestamp ?? r.datetime ?? "",
          demand_mw: Math.round(Number(r.demand ?? r.fabbisogno ?? 0)),
          forecast_mw: Math.round(Number(r.forecast ?? r.previsione ?? 0)),
        }));

        return {
          dataset: "demand",
          source: "Terna Transparency (developer.terna.it)",
          date,
          zone,
          records,
        };
      }

      case "exchanges": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exchanges: ExchangeRecord[] = items.slice(0, 20).map((r: any) => {
          const flow = Number(r.flow ?? r.value ?? 0);
          return {
            border: r.border ?? r.country ?? r.confine ?? "Unknown",
            flow_mw: Math.round(flow),
            direction: flow >= 0 ? "import" : "export",
          };
        });

        const netImport = exchanges.reduce((s, e) => s + e.flow_mw, 0);

        return {
          dataset: "exchanges",
          source: "Terna Transparency (developer.terna.it)",
          date,
          exchanges,
          net_import_mw: netImport,
        };
      }

      case "market_data": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: MarketRecord[] = items.slice(0, 24).map((r: any) => ({
          zone: r.zone ?? r.zona ?? zone,
          timestamp: r.timestamp ?? r.datetime ?? "",
          price_eur_mwh: Math.round((Number(r.price ?? r.prezzo ?? 0)) * 100) / 100,
        }));

        return {
          dataset: "market_data",
          source: "Terna Transparency (developer.terna.it)",
          date,
          zone,
          records,
        };
      }
    }
  } catch {
    // Fallback with reference info
    const description =
      `Italian ${params.dataset} data for ${date}. ` +
      `Terna publishes real-time data at ${TERNA_PUBLIC}. ` +
      "Developer API: developer.terna.it. " +
      "Also available via ENTSO-E (get_generation_mix, get_day_ahead_prices) with zone IT.";

    switch (params.dataset) {
      case "generation":
        return {
          dataset: "generation",
          source: "Terna Transparency (reference)",
          date,
          zone,
          records: [],
          latest: null,
        };
      case "demand":
        return { dataset: "demand", source: "Terna (reference)", date, zone, records: [] };
      case "exchanges":
        return { dataset: "exchanges", source: "Terna (reference)", date, exchanges: [], net_import_mw: 0 };
      case "market_data":
        return { dataset: "market_data", source: "Terna (reference)", date, zone, records: [] };
    }
  }
}
