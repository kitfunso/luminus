import { z } from "zod";
import {
  GIS_SOURCES,
  GIS_HEALTH_CHECKS,
  type GisSourceMetadata,
} from "../lib/gis-sources.js";

export const verifyGisSourcesSchema = z.object({
  source_id: z
    .string()
    .optional()
    .describe(
      'Check a single source by ID (e.g. "natural-england"). Omit to check all GIS sources.',
    ),
});

interface SourceCheckResult {
  source_id: string;
  name: string;
  status: "ok" | "degraded" | "unreachable";
  response_time_ms: number | null;
  error: string | null;
  metadata: GisSourceMetadata;
}

interface VerifyGisSourcesResult {
  checked_at: string;
  sources: SourceCheckResult[];
  summary: {
    total: number;
    ok: number;
    degraded: number;
    unreachable: number;
  };
}

async function checkSource(
  sourceId: string,
): Promise<SourceCheckResult> {
  const metadata = GIS_SOURCES[sourceId];
  if (!metadata) {
    return {
      source_id: sourceId,
      name: "Unknown",
      status: "unreachable",
      response_time_ms: null,
      error: `No metadata defined for source "${sourceId}"`,
      metadata: {} as GisSourceMetadata,
    };
  }

  const healthCheck = GIS_HEALTH_CHECKS.find((h) => h.source_id === sourceId);
  if (!healthCheck) {
    return {
      source_id: sourceId,
      name: metadata.name,
      status: "degraded",
      response_time_ms: null,
      error: "No health check configured for this source",
      metadata,
    };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      healthCheck.timeout_ms,
    );

    const fetchOptions: RequestInit = {
      method: healthCheck.method,
      signal: controller.signal,
    };

    if (healthCheck.method === "POST" && healthCheck.body) {
      fetchOptions.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      fetchOptions.body = healthCheck.body;
    }

    const response = await fetch(healthCheck.url, fetchOptions);
    clearTimeout(timeout);

    const elapsed = Date.now() - start;
    const body = await response.text();
    const validationError = healthCheck.validate(response.status, body);

    if (validationError) {
      return {
        source_id: sourceId,
        name: metadata.name,
        status: "degraded",
        response_time_ms: elapsed,
        error: validationError,
        metadata,
      };
    }

    return {
      source_id: sourceId,
      name: metadata.name,
      status: "ok",
      response_time_ms: elapsed,
      error: null,
      metadata,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message =
      err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort");

    return {
      source_id: sourceId,
      name: metadata.name,
      status: "unreachable",
      response_time_ms: isTimeout ? null : elapsed,
      error: isTimeout
        ? `Timed out after ${healthCheck.timeout_ms}ms`
        : message,
      metadata,
    };
  }
}

export async function verifyGisSources(
  params: z.infer<typeof verifyGisSourcesSchema>,
): Promise<VerifyGisSourcesResult> {
  const sourceIds = params.source_id
    ? [params.source_id]
    : Object.keys(GIS_SOURCES);

  if (params.source_id && !GIS_SOURCES[params.source_id]) {
    throw new Error(
      `Unknown source ID "${params.source_id}". Valid IDs: ${Object.keys(GIS_SOURCES).join(", ")}`,
    );
  }

  const results = await Promise.allSettled(
    sourceIds.map((id) => checkSource(id)),
  );

  const sources: SourceCheckResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      source_id: sourceIds[i],
      name: GIS_SOURCES[sourceIds[i]]?.name ?? "Unknown",
      status: "unreachable" as const,
      response_time_ms: null,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      metadata: GIS_SOURCES[sourceIds[i]] ?? ({} as GisSourceMetadata),
    };
  });

  const ok = sources.filter((s) => s.status === "ok").length;
  const degraded = sources.filter((s) => s.status === "degraded").length;
  const unreachable = sources.filter((s) => s.status === "unreachable").length;

  return {
    checked_at: new Date().toISOString(),
    sources,
    summary: {
      total: sources.length,
      ok,
      degraded,
      unreachable,
    },
  };
}
