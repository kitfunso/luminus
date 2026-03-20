import { z } from "zod";
import { getGenerationMix, generationSchema } from "./generation.js";

export const carbonSchema = z.object({
  zone: generationSchema.shape.zone,
  date: generationSchema.shape.date,
});

/** Emission factors in gCO2/kWh by PSR code */
const EMISSION_FACTORS: Record<string, number> = {
  B01: 50, // Biomass
  B02: 900, // Lignite
  B03: 400, // Coal-derived gas
  B04: 400, // Gas
  B05: 900, // Hard coal
  B06: 650, // Oil
  B07: 650, // Oil shale
  B08: 900, // Peat
  B09: 0, // Geothermal
  B10: 0, // Hydro Pumped Storage (assumed zero at point of generation)
  B11: 0, // Hydro Run-of-river
  B12: 0, // Hydro Reservoir
  B13: 0, // Marine
  B14: 0, // Nuclear
  B15: 0, // Other renewable
  B16: 0, // Solar
  B17: 100, // Waste
  B18: 0, // Wind Offshore
  B19: 0, // Wind Onshore
  B20: 300, // Other (conservative estimate)
};

interface CarbonBreakdown {
  fuel_type: string;
  mw: number;
  emission_factor_gco2_kwh: number;
  contribution_gco2_kwh: number;
}

export async function getCarbonIntensity(
  params: z.infer<typeof carbonSchema>
): Promise<{
  zone: string;
  date: string;
  carbon_intensity_gco2_kwh: number;
  total_mw: number;
  breakdown: CarbonBreakdown[];
  renewable_pct: number;
  fossil_pct: number;
}> {
  const genData = await getGenerationMix(params);

  const breakdown: CarbonBreakdown[] = [];
  let totalEmissions = 0;

  for (const gen of genData.generation) {
    const factor = EMISSION_FACTORS[gen.psr_code] ?? 300;
    const contribution = (gen.mw / genData.total_mw) * factor;
    totalEmissions += contribution;

    breakdown.push({
      fuel_type: gen.fuel_type,
      mw: gen.mw,
      emission_factor_gco2_kwh: factor,
      contribution_gco2_kwh: Math.round(contribution * 100) / 100,
    });
  }

  const renewableCodes = new Set([
    "B01", "B09", "B10", "B11", "B12", "B13", "B15", "B16", "B18", "B19",
  ]);
  const fossilCodes = new Set(["B02", "B03", "B04", "B05", "B06", "B07", "B08"]);

  const renewableMw = genData.generation
    .filter((g) => renewableCodes.has(g.psr_code))
    .reduce((s, g) => s + g.mw, 0);
  const fossilMw = genData.generation
    .filter((g) => fossilCodes.has(g.psr_code))
    .reduce((s, g) => s + g.mw, 0);

  return {
    zone: genData.zone,
    date: genData.date,
    carbon_intensity_gco2_kwh: Math.round(totalEmissions * 100) / 100,
    total_mw: genData.total_mw,
    breakdown,
    renewable_pct:
      genData.total_mw > 0
        ? Math.round((renewableMw / genData.total_mw) * 10000) / 100
        : 0,
    fossil_pct:
      genData.total_mw > 0
        ? Math.round((fossilMw / genData.total_mw) * 10000) / 100
        : 0,
  };
}
