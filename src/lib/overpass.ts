const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export async function fetchOverpassJson<T>(query: string): Promise<T> {
  const errors: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = await response.text();
    errors.push(`${endpoint} -> ${response.status}: ${body.slice(0, 180)}`);

    if (!RETRYABLE_STATUS.has(response.status)) {
      throw new Error(`Overpass API returned ${response.status}: ${body.slice(0, 300)}`);
    }
  }

  throw new Error(`Overpass API failed across fallback endpoints: ${errors.join(' | ')}`);
}
