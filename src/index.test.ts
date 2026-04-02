import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILES } from "./lib/profiles.js";

describe("index meta-tools", () => {
  it("keeps luminus_discover backward-compatible with category filters", async () => {
    const indexSource = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");

    expect(indexSource).toContain('profile: z.string().optional().describe("Filter by profile name")');
    expect(indexSource).toContain('category: z.string().optional().describe("Deprecated alias for profile")');
    expect(indexSource).toContain("async ({ profile: filterProfile, category }) => {");
    expect(indexSource).toContain("const requestedProfile = filterProfile ?? category;");
  });

  it("registers the shortlist_bess_sites GIS tool", async () => {
    const indexSource = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");

    expect(indexSource).toContain('if (shouldRegister("shortlist_bess_sites"))');
    expect(indexSource).toContain('server.tool(');
    expect(indexSource).toContain('"shortlist_bess_sites"');
  });

  it("registers the distribution headroom tool", async () => {
    const indexSource = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");

    expect(indexSource).toContain('if (shouldRegister("get_distribution_headroom"))');
    expect(indexSource).toContain('"get_distribution_headroom"');
  });
});

describe("public docs", () => {
  const repoRoot = process.cwd();
  const read = (relativePath: string): string =>
    readFileSync(join(repoRoot, relativePath), "utf8");

  it("keeps README profile counts aligned with code", () => {
    const readme = read("README.md");

    expect(readme).toContain(
      `npx luminus-mcp --profile grid       # ${PROFILES.grid.length} tools: flows, outages, infrastructure`,
    );
    expect(readme).toContain(
      `npx luminus-mcp --profile regional   # ${PROFILES.regional.length} tools: country-specific sources`,
    );
  });

  it("uses the exported timingSafeCompare helper name in docs", () => {
    const security = read("SECURITY.md");
    const scope = read("docs/SCOPE.md");

    expect(security).toContain("timingSafeCompare");
    expect(security).not.toContain("timingSafeEqual");
    expect(scope).toContain("timingSafeCompare");
    expect(scope).not.toContain("timingSafeEqual");
  });

  it("keeps npm and Python release references distinct", () => {
    const readme = read("README.md");
    const pythonReadme = read("python/README.md");
    const packageJson = JSON.parse(read("package.json")) as { version: string };
    const pythonRelease021 = read("docs/releases/0.2.1.md");
    const pythonRelease022 = read("docs/releases/0.2.2.md");

    expect(packageJson.version).toBe("0.2.0");
    expect(readme).toContain(
      "Latest npm release: [v0.2.0 release notes](docs/releases/0.2.0.md)",
    );
    expect(readme).toContain(
      "Latest Python SDK release: [v0.2.2 release notes](docs/releases/0.2.2.md)",
    );
    expect(pythonReadme).toContain("npm install -g luminus-mcp");
    expect(pythonReadme).not.toContain("npm install -g luminus-mcp@0.2.0");
    expect(pythonRelease021).toContain("# luminus-py v0.2.1");
    expect(pythonRelease021).toContain("The npm MCP package remained `luminus-mcp@0.2.0`.");
    expect(pythonRelease022).toContain("# luminus-py v0.2.2");
    expect(pythonRelease022).toContain("The npm MCP package remained `luminus-mcp@0.2.0`.");
  });
});
