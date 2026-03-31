import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchOverpassJson, _getOverpassState, _resetOverpassState } from "./overpass.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: unknown = { elements: [] }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    }),
  );
}

function mockFetchStatus(status: number, body = "error"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(body),
    }),
  );
}

function mockFetchSequence(responses: Array<{ ok: boolean; status: number; body?: string; data?: unknown }>): void {
  const fn = vi.fn();
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status,
      json: () => Promise.resolve(r.data ?? {}),
      text: () => Promise.resolve(r.body ?? ""),
    });
  }
  vi.stubGlobal("fetch", fn);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetOverpassState();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Basic functionality
// ---------------------------------------------------------------------------

describe("fetchOverpassJson", () => {
  it("returns parsed JSON on success", async () => {
    const payload = { elements: [{ id: 1 }] };
    mockFetchOk(payload);

    const result = await fetchOverpassJson<{ elements: unknown[] }>("[out:json];node(1);out;");
    expect(result).toEqual(payload);
  });

  it("sends correct POST body", async () => {
    mockFetchOk();
    await fetchOverpassJson("[out:json];node(1);out;");

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].method).toBe("POST");
    expect(call[1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(call[1].body).toContain("data=");
  });
});

// ---------------------------------------------------------------------------
// Non-retryable errors (400, etc.) throw immediately
// ---------------------------------------------------------------------------

describe("non-retryable errors", () => {
  it("throws immediately on 400 without trying fallback endpoints", async () => {
    mockFetchStatus(400, "Bad request");

    await expect(fetchOverpassJson("bad query")).rejects.toThrow(
      /Overpass API returned 400/,
    );

    // Only 1 fetch call, no fallback
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("detects 'query too expensive' errors from body text", async () => {
    mockFetchStatus(400, "runtime error: Query timed out in some module");

    await expect(fetchOverpassJson("huge query")).rejects.toThrow(
      /query too expensive/i,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("detects out of memory as expensive query", async () => {
    mockFetchStatus(400, "runtime error: out of memory while processing query");

    await expect(fetchOverpassJson("huge query")).rejects.toThrow(
      /query too expensive/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Retryable errors fall through to next endpoint
// ---------------------------------------------------------------------------

describe("retryable errors and fallback", () => {
  it("falls back to second endpoint on 429", async () => {
    mockFetchSequence([
      { ok: false, status: 429, body: "rate limited" },
      { ok: true, status: 200, data: { elements: [{ id: 42 }] } },
    ]);

    const result = await fetchOverpassJson<{ elements: unknown[] }>("query");
    expect(result.elements[0]).toEqual({ id: 42 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to third endpoint when first two fail with 503", async () => {
    mockFetchSequence([
      { ok: false, status: 503, body: "unavailable" },
      { ok: false, status: 503, body: "unavailable" },
      { ok: true, status: 200, data: { ok: true } },
    ]);

    const result = await fetchOverpassJson<{ ok: boolean }>("query");
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("throws when all endpoints fail with retryable status", async () => {
    mockFetchSequence([
      { ok: false, status: 502, body: "bad gateway" },
      { ok: false, status: 503, body: "unavailable" },
      { ok: false, status: 504, body: "timeout" },
    ]);

    await expect(fetchOverpassJson("query")).rejects.toThrow(
      /failed across all endpoints/,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// AbortController timeout
// ---------------------------------------------------------------------------

describe("request timeout", () => {
  it("aborts fetch after timeout and tries next endpoint", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");

    const fn = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ recovered: true }),
        text: () => Promise.resolve(""),
      });

    vi.stubGlobal("fetch", fn);

    const result = await fetchOverpassJson<{ recovered: boolean }>("query");
    expect(result.recovered).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("includes timeout info in error when all endpoints time out", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(abortError),
    );

    await expect(fetchOverpassJson("query")).rejects.toThrow(/timeout/);
  });

  it("passes AbortSignal to fetch", async () => {
    mockFetchOk();
    await fetchOverpassJson("query");

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].signal).toBeInstanceOf(AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// Network errors are treated as retryable
// ---------------------------------------------------------------------------

describe("network errors", () => {
  it("retries on network error and succeeds on next endpoint", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve(""),
      });

    vi.stubGlobal("fetch", fn);

    const result = await fetchOverpassJson<{ ok: boolean }>("query");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter: concurrency
// ---------------------------------------------------------------------------

describe("rate limiter concurrency", () => {
  it("starts with clean state", () => {
    const s = _getOverpassState();
    expect(s.inFlight).toBe(0);
    expect(s.queueLength).toBe(0);
    expect(s.windowTimestamps.length).toBe(0);
  });

  it("limits concurrent requests to maxConcurrent", async () => {
    // Track concurrent fetch calls
    let peakConcurrent = 0;
    let currentConcurrent = 0;

    const fn = vi.fn().mockImplementation(() => {
      currentConcurrent++;
      if (currentConcurrent > peakConcurrent) peakConcurrent = currentConcurrent;

      return new Promise((resolve) => {
        setTimeout(() => {
          currentConcurrent--;
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ elements: [] }),
            text: () => Promise.resolve(""),
          });
        }, 10);
      });
    });

    vi.stubGlobal("fetch", fn);

    // Fire 4 requests simultaneously
    const promises = [
      fetchOverpassJson("q1"),
      fetchOverpassJson("q2"),
      fetchOverpassJson("q3"),
      fetchOverpassJson("q4"),
    ];

    await Promise.all(promises);

    // Peak concurrent fetches should not exceed MAX_CONCURRENT (2)
    expect(peakConcurrent).toBeLessThanOrEqual(2);
  });

  it("queued requests eventually complete", async () => {
    mockFetchOk({ done: true });

    const results = await Promise.all([
      fetchOverpassJson<{ done: boolean }>("q1"),
      fetchOverpassJson<{ done: boolean }>("q2"),
      fetchOverpassJson<{ done: boolean }>("q3"),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.done).toBe(true));
  });

  it("releases slot after request completes", async () => {
    mockFetchOk();
    await fetchOverpassJson("query");

    const s = _getOverpassState();
    expect(s.inFlight).toBe(0);
  });

  it("releases slot even on error", async () => {
    mockFetchStatus(400, "bad request");

    await expect(fetchOverpassJson("query")).rejects.toThrow();

    const s = _getOverpassState();
    expect(s.inFlight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter: sliding window
// ---------------------------------------------------------------------------

describe("rate limiter sliding window", () => {
  it("tracks request timestamps", async () => {
    mockFetchOk();
    await fetchOverpassJson("q1");
    await fetchOverpassJson("q2");

    const s = _getOverpassState();
    expect(s.windowTimestamps.length).toBe(2);
  });

  it("exposes correct config values", () => {
    const s = _getOverpassState();
    expect(s.maxConcurrent).toBe(2);
    expect(s.maxPerWindow).toBe(10);
    expect(s.windowMs).toBe(60_000);
    expect(s.requestTimeoutMs).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// Backoff delays between fallback attempts
// ---------------------------------------------------------------------------

describe("backoff and delays", () => {
  it("delays between fallback endpoint attempts", async () => {
    const callTimes: number[] = [];

    const fn = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("unavailable"),
      });
    });

    vi.stubGlobal("fetch", fn);

    await expect(fetchOverpassJson("query")).rejects.toThrow();

    // 3 endpoints called
    expect(callTimes).toHaveLength(3);

    // There should be a delay between the first and second call
    // (FALLBACK_DELAY_MS + backoffMs(0) = 200 + 500 = 700ms)
    const gap1 = callTimes[1] - callTimes[0];
    expect(gap1).toBeGreaterThanOrEqual(600); // allow some timer slack

    // Gap between second and third: 200 + 1000 = 1200ms
    const gap2 = callTimes[2] - callTimes[1];
    expect(gap2).toBeGreaterThanOrEqual(1100);
  });
});

// ---------------------------------------------------------------------------
// _resetOverpassState
// ---------------------------------------------------------------------------

describe("_resetOverpassState", () => {
  it("clears all internal state", async () => {
    mockFetchOk();
    await fetchOverpassJson("q1");

    _resetOverpassState();
    const s = _getOverpassState();
    expect(s.inFlight).toBe(0);
    expect(s.queueLength).toBe(0);
    expect(s.windowTimestamps.length).toBe(0);
  });
});
