import { ZodError, type z } from "zod";

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

interface NormalizedToolError {
  summary: string;
  details?: string;
}

const DEBUG_ENV_VAR = "LUMINUS_DEBUG";
const HELP_URL = "https://github.com/kitfunso/luminus#troubleshooting";

function isDebugEnabled(): boolean {
  return process.env[DEBUG_ENV_VAR] === "1";
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function normalizeError(error: unknown): NormalizedToolError {
  if (error instanceof ZodError) {
    return {
      summary: `Invalid parameters. ${formatZodIssues(error)}`,
      details: error.message,
    };
  }

  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.trim() || "Unknown error";
  const lower = message.toLowerCase();

  if (lower.includes("environment variable is required") || lower.includes("api key")) {
    return {
      summary:
        "Configuration error. Add the required API key to your MCP env or .env file, then retry.",
      details: message,
    };
  }

  if (lower.includes("unknown zone") || lower.includes("unknown corridor")) {
    return {
      summary: "Invalid market identifier. Check the zone, corridor, or EIC code and retry.",
      details: message,
    };
  }

  if (lower.includes("no ") && lower.includes(" data")) {
    return {
      summary: "No data returned for that request. Check the market, date range, and source coverage.",
      details: message,
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up")
  ) {
    return {
      summary: "Upstream request failed or timed out. Retry shortly. If it keeps happening, enable debug output and inspect the source-specific details.",
      details: message,
    };
  }

  if (lower.includes("returned 4") || lower.includes("returned 5") || lower.includes("status")) {
    return {
      summary: "Upstream source returned an error. The request was valid, but the data provider rejected or failed it.",
      details: message,
    };
  }

  return {
    summary:
      "Unexpected server error. Retry once. If it persists, enable debug output and inspect the raw error details.",
    details: message,
  };
}

function renderErrorMessage(error: unknown): string {
  const normalized = normalizeError(error);
  const debug = isDebugEnabled();

  if (debug) {
    return `${normalized.summary}\n\nRaw error: ${normalized.details ?? "n/a"}`;
  }

  return `${normalized.summary}\n\nSet ${DEBUG_ENV_VAR}=1 for raw error details. Troubleshooting: ${HELP_URL}`;
}

/**
 * Wrap an MCP tool handler with schema validation and consistent error formatting.
 * Keeps tool registration terse while making user-facing failures less cryptic.
 */
export function toolHandler<T extends z.ZodType>(
  schema: T,
  handler: (params: z.infer<T>) => Promise<unknown>
): (params: unknown) => Promise<ToolResult> {
  return async (params: unknown): Promise<ToolResult> => {
    try {
      const parsed = schema.parse(params);
      const result = await handler(parsed);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      if (isDebugEnabled()) {
        console.error("[luminus] tool error", error);
      }

      return {
        content: [{ type: "text", text: renderErrorMessage(error) }],
        isError: true,
      };
    }
  };
}
