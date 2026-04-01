export function parseProfileArg(argv: string[]): string {
  const idx = argv.indexOf("--profile");
  if (idx === -1) return "full";

  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for --profile.");
  }

  return value;
}
