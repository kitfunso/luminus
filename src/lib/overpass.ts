const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Rate limiter (module-level singleton, shared across all callers)
// ---------------------------------------------------------------------------

interface RateLimiterState {
  /** Timestamps of recent requests (sliding window) */
  readonly windowTimestamps: number[];
  /** Currently in-flight requests */
  inFlight: number;
  /** Queue of waiters blocked by the rate limiter */
  readonly queue: Array<() => void>;
}

const MAX_CONCURRENT = 2;
const MAX_PER_WINDOW = 10;
const WINDOW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 4_000;
const FALLBACK_DELAY_MS = 200;

const state: RateLimiterState = {
  windowTimestamps: [],
  inFlight: 0,
  queue: [],
};

/** Exposed for testing only. */
export function _getOverpassState(): Readonly<{
  windowTimestamps: readonly number[];
  inFlight: number;
  queueLength: number;
  maxConcurrent: number;
  maxPerWindow: number;
  windowMs: number;
  requestTimeoutMs: number;
}> {
  return {
    windowTimestamps: state.windowTimestamps,
    inFlight: state.inFlight,
    queueLength: state.queue.length,
    maxConcurrent: MAX_CONCURRENT,
    maxPerWindow: MAX_PER_WINDOW,
    windowMs: WINDOW_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  };
}

/** Exposed for testing: reset internal state between test runs. */
export function _resetOverpassState(): void {
  state.windowTimestamps.length = 0;
  state.inFlight = 0;
  state.queue.length = 0;
}

function pruneWindow(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (state.windowTimestamps.length > 0 && state.windowTimestamps[0] < cutoff) {
    state.windowTimestamps.shift();
  }
}

function canProceed(now: number): boolean {
  pruneWindow(now);
  return state.inFlight < MAX_CONCURRENT && state.windowTimestamps.length < MAX_PER_WINDOW;
}

function drainQueue(): void {
  while (state.queue.length > 0 && canProceed(Date.now())) {
    const next = state.queue.shift();
    next?.();
  }
}

async function acquireSlot(): Promise<void> {
  if (canProceed(Date.now())) {
    state.inFlight++;
    state.windowTimestamps.push(Date.now());
    return;
  }

  // Wait in queue until a slot opens
  await new Promise<void>((resolve) => {
    state.queue.push(() => {
      state.inFlight++;
      state.windowTimestamps.push(Date.now());
      resolve();
    });
  });
}

function releaseSlot(): void {
  state.inFlight--;
  drainQueue();
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const EXPENSIVE_QUERY_PATTERNS = [
  "runtime error",
  "out of memory",
  "timed out",
  "Query run out of memory",
  "Query timed out",
  "The server is probably too busy",
  "load average",
] as const;

function isQueryTooExpensive(body: string): boolean {
  const lower = body.toLowerCase();
  return EXPENSIVE_QUERY_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

// ---------------------------------------------------------------------------
// Public API  (signature unchanged)
// ---------------------------------------------------------------------------

export async function fetchOverpassJson<T>(query: string): Promise<T> {
  await acquireSlot();

  try {
    return await fetchWithFallbacks<T>(query);
  } finally {
    releaseSlot();
  }
}

async function fetchWithFallbacks<T>(query: string): Promise<T> {
  const errors: string[] = [];

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];

    // Brief delay between fallback endpoint attempts (not before the first)
    if (i > 0) {
      await sleep(FALLBACK_DELAY_MS);
    }

    // Exponential backoff: attempt index drives the delay
    if (i > 0) {
      await sleep(backoffMs(i - 1));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await response.text();
      errors.push(`${endpoint} -> ${response.status}: ${body.slice(0, 180)}`);

      // Non-retryable status: throw immediately, no fallback
      if (!RETRYABLE_STATUS.has(response.status)) {
        if (isQueryTooExpensive(body)) {
          throw new Error(
            `Overpass query too expensive (${response.status} from ${endpoint}): ${body.slice(0, 300)}`,
          );
        }
        throw new Error(
          `Overpass API returned ${response.status}: ${body.slice(0, 300)}`,
        );
      }
    } catch (err) {
      clearTimeout(timeout);

      // Re-throw non-retryable errors (our own thrown errors above)
      if (err instanceof Error && err.message.startsWith("Overpass")) {
        throw err;
      }

      // AbortController timeout
      if (err instanceof DOMException && err.name === "AbortError") {
        errors.push(`${endpoint} -> timeout after ${REQUEST_TIMEOUT_MS}ms`);
        continue;
      }

      // AbortError can also come as a plain Error in some runtimes
      if (err instanceof Error && err.name === "AbortError") {
        errors.push(`${endpoint} -> timeout after ${REQUEST_TIMEOUT_MS}ms`);
        continue;
      }

      // Network error or other transient failure
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${endpoint} -> network error: ${msg}`);
    }
  }

  throw new Error(
    `Overpass API failed across all endpoints:\n  ${errors.join("\n  ")}`,
  );
}
