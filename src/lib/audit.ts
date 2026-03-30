import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const AUDIT_DIR = join(homedir(), ".luminus");
const AUDIT_FILE = join(AUDIT_DIR, "audit.jsonl");

const SENSITIVE_PATTERN = /key|token|secret|password|auth|credential/i;

interface AuditEntry {
  readonly ts: string;
  readonly tool: string;
  readonly params: Record<string, unknown>;
}

function redactParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    redacted[k] = SENSITIVE_PATTERN.test(k) ? "[REDACTED]" : v;
  }
  return redacted;
}

let dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    dirEnsured = true;
  } catch {
    // swallow — dir may already exist or be uncreatable
  }
}

function debugLog(message: string): void {
  if (process.env.LUMINUS_DEBUG === "1") {
    process.stderr.write(`[luminus-audit] ${message}\n`);
  }
}

export function logToolCall(
  tool: string,
  params: Record<string, unknown>,
): void {
  const entry: AuditEntry = {
    ts: new Date().toISOString(),
    tool,
    params: redactParams(params),
  };
  const line = JSON.stringify(entry) + "\n";

  // Fire-and-forget: never throw, never reject to caller
  void (async () => {
    try {
      await ensureDir();
      await appendFile(AUDIT_FILE, line, "utf-8");
    } catch (err: unknown) {
      debugLog(
        `write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
}

export function getAuditLogPath(): string {
  return AUDIT_FILE;
}

export function rotateIfNeeded(maxSizeMB: number = 50): void {
  const maxBytes = maxSizeMB * 1024 * 1024;

  void (async () => {
    try {
      const info = await stat(AUDIT_FILE);
      if (info.size <= maxBytes) return;
      await rename(AUDIT_FILE, AUDIT_FILE + ".1");
    } catch (err: unknown) {
      debugLog(
        `rotate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
}
