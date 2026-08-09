import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryEntsoe } from "./entsoe-client.js";

const XML_A = `<?xml version="1.0" encoding="UTF-8"?>
<Balancing_MarketDocument>
  <TimeSeries>
    <Period>
      <timeInterval><start>2026-08-01T00:00Z</start><end>2026-08-01T00:15Z</end></timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><imbalance_Price.amount>10.5</imbalance_Price.amount></Point>
    </Period>
  </TimeSeries>
</Balancing_MarketDocument>`;

const XML_B = XML_A.replace("10.5", "20.5");

async function zipBuffer(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function stubFetch(body: ArrayBuffer | string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        typeof body === "string" ? new TextEncoder().encode(body).buffer : body,
      text: async () => (typeof body === "string" ? body : ""),
    }))
  );
}

describe("queryEntsoe ZIP handling", () => {
  beforeEach(() => {
    vi.stubEnv("ENTSOE_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses a plain XML response as before", async () => {
    stubFetch(XML_A);
    // Unique params per test: queryEntsoe caches by URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await queryEntsoe(
      { documentType: "A85", periodStart: "202608010000", periodEnd: "202608020000", test: "plain" },
      1
    );
    expect(result.Balancing_MarketDocument).toBeDefined();
  });

  it("detects and unzips a single-file ZIP response", async () => {
    stubFetch(await zipBuffer({ "001.xml": XML_A }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await queryEntsoe(
      { documentType: "A85", periodStart: "202608010000", periodEnd: "202608020000", test: "zip1" },
      1
    );
    const series = result.Balancing_MarketDocument.TimeSeries;
    expect(Array.isArray(series) ? series : [series]).toHaveLength(1);
  });

  it("merges TimeSeries across a multi-file ZIP response", async () => {
    stubFetch(await zipBuffer({ "001.xml": XML_A, "002.xml": XML_B }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await queryEntsoe(
      { documentType: "A85", periodStart: "202608010000", periodEnd: "202608020000", test: "zip2" },
      1
    );
    const series = result.Balancing_MarketDocument.TimeSeries;
    expect(series).toHaveLength(2);
  });
});
