# Security Policy

## Supported versions

This repo is currently maintained on the latest published line only.
If you are not on the latest npm release or latest `main`, upgrade first.

## Reporting a vulnerability

Please do not open a public issue for a suspected security problem.

Email the maintainer directly with:
- a short summary
- impact
- reproduction steps
- any proof-of-concept or logs
- whether the issue is already public

If you do not have a private contact path, open a minimal GitHub issue asking for a security contact without disclosing exploit details.

## Security baseline for this repo

Luminus is a read-only MCP server that aggregates public energy data. It should not:
- execute shell commands from tool input
- write outside its own process state
- expose secrets in normal tool responses
- publish `.env` or other local config files

Current guardrails:
- runtime dependency audit in CI via `npm audit --omit=dev`
- tests plus TypeScript build in CI
- publish dry-run in CI to catch accidental package contents
- `dist/` is cleaned before each build to avoid stale files being published
- raw upstream error details are hidden by default and only exposed with `LUMINUS_DEBUG=1`

## Local secrets

Keep secrets in `.env` or the MCP host's env block only.
Never commit real keys.
Use `.env.example` for placeholders only.

## Release checklist

Before publishing:
1. `npm test`
2. `npm run build`
3. `npm audit --omit=dev`
4. `npm pack --dry-run`
5. confirm the tarball contains only expected files
6. publish from a clean git state
