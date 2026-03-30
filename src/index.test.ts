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
});
