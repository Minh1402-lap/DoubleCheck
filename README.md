# DoubleCheck

DoubleCheck is a pre-execution trust analyzer for unfamiliar public GitHub repositories. It collects an immutable, bounded snapshot through GitHub APIs, treats every repository byte as untrusted data, runs staged AI-assisted static analysis, verifies evidence against stored line ranges, and applies an authoritative deterministic **Run / Review / Avoid** policy.

It never clones, installs, imports, builds, tests, or executes the analyzed repository.

## Quick start

Requirements: Node.js 22+, PostgreSQL 16+, an OpenAI API key, and optionally a GitHub token for higher API limits.

```text
npm install
copy .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npm run dev
```

In a second terminal, start the database-backed worker:

```text
npm run worker
```

Open `http://localhost:3000`. `/demo` is a sanitized, explicitly labeled report that needs no live malicious repository. The normal scan path is never mocked.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `GITHUB_TOKEN` | Optional server-side GitHub token |
| `OPENAI_API_KEY` | Server-side Responses API credential |
| `AI_ANALYSIS_MODEL` | Explicit provider-supported model ID for mapping/analysis/judging |
| `AI_VERIFIER_MODEL` | Explicit provider-supported verifier/challenger model ID |
| `APP_BASE_URL` | Canonical application origin |
| `SESSION_SECRET` | At least 32 characters; hashes anonymous ownership sessions |
| `DEMO_MODE` | Must be explicitly `true` or `false`; does not affect the live path |
| `MAX_DAILY_AI_USD` | Configured cost ceiling |
| `RAW_RETENTION_HOURS` | Raw content retention, default 24 |
| `REPORT_RETENTION_DAYS` | Redacted report retention, default 30 |

Model IDs have no silent default. Invalid or absent configuration fails clearly.

## Commands

```text
npm run dev
npm run worker
npm test
npm run test:e2e
npm run lint
npm run build
npm run db:generate
npm run db:migrate -- --name init
```

## Safety boundaries

- GitHub URLs are canonicalized to `https://github.com/{owner}/{repo}`; arbitrary hosts, ports, credentials, file links, PR links, and non-HTTPS schemes are rejected.
- The collector only calls the fixed GitHub API origin, pins a commit SHA, downloads blobs as inert bytes, applies simultaneous count/size budgets, and never follows repository-supplied URLs.
- Files are not imported or executed. Dependencies are not installed.
- Each AI stage starts with an explicit untrusted-data boundary and uses a random delimiter. Structured outputs are schema-validated.
- Evidence is accepted only if the file exists and the exact line range matches stored content.
- The model proposes a verdict. The deterministic two-gate policy owns the stored verdict. Verified Avoid chains are evaluated before Run blockers.
- Avoid needs a high-confidence High/Critical chain with confirmed edges, valid excerpts, and verifier confirmation. Run needs every coverage gate and an independent challenge.
- Reports use unguessable IDs, session ownership, `noindex`, safe text rendering, secret redaction, same-origin mutation checks, and security headers.

See [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [limitations](docs/LIMITATIONS.md), and [benchmark status](docs/BENCHMARK.md).

## Privacy and retention

Reports are private to the creating browser session. Public sharing is intentionally absent until terms, appeal/removal operations, and a security contact are deployed. Raw source and raw AI payloads are scheduled for deletion within 24 hours. Redacted evidence and report metadata may remain for 30 days. A retry after raw deletion must re-fetch the immutable commit.

## Deployment

Run the web and worker as separate non-root processes. Give the worker a read-only root filesystem, isolated temporary storage, no host-home or Docker-socket mount, no cloud instance credential access, and egress only to GitHub, the configured AI provider, PostgreSQL, and explicitly implemented advisory providers. Use managed PostgreSQL, TLS, encrypted secrets, daily budget alerts, and a scheduled retention cleanup job. The current implementation is an MVP and should not be exposed publicly before the limitations below are addressed.
