# DoubleCheck

DoubleCheck is a pre-execution trust analyzer for unfamiliar public GitHub repositories. It fetches a bounded snapshot at an immutable commit, treats repository content as untrusted data, and produces an evidence-linked **Run / Review / Avoid** recommendation without cloning, installing, importing, building, testing, or executing the target repository.

The default product is static-first: a useful deterministic report completes without an OpenAI key. AI analysis is an optional, separately requested supplement with explicit per-scan and daily cost ceilings.

## Architecture

```text
browser -> Next.js web/API -> PostgreSQL queue -> worker
                                                |-> GitHub metadata, commit, tree, blobs
                                                |-> deterministic static rules
                                                `-> static_complete report + export

static_complete -> explicit AI request -> budget reservation -> optional AI supplement
```

The web process validates requests and owns reports through an anonymous HttpOnly session. The worker collects only from GitHub's fixed API origin, pins the resolved commit SHA, enforces file and byte limits, stores selected text as inert data, and runs a versioned static ruleset. Optional AI failure is recorded separately and does not destroy the static report.

## Features

- Strict public GitHub repository URL validation and authenticated GitHub API collection.
- Immutable commit pinning, bounded inventory/content collection, and explicit skipped-file reasons.
- Language-aware static rules with file/line evidence, deterministic scoring, and disclosure for generated, vendor, or minified files.
- Private session-owned report pages plus redacted JSON and Markdown exports.
- Static-only operation when AI is disabled or unavailable.
- Explicit opt-in AI mode with model pricing validation, per-scan limits, UTC-day limits, reservation/reconciliation accounting, and per-stage token/cost records.
- Safe JSON API errors, progress states, GitHub authentication/rate-limit diagnostics, CSP and other security headers.

## Local setup

Requirements: Node.js 22 or newer, npm, Docker Desktop, and PostgreSQL 16. A GitHub token is required for repository scans; OpenAI configuration is optional.

1. Start PostgreSQL 16. The example uses placeholders intentionally—choose a local password and use the same value in `DATABASE_URL`.

   ```powershell
   docker run --name doublecheck-postgres `
     -e POSTGRES_USER=postgres `
     -e POSTGRES_PASSWORD=<strong-local-password> `
     -e POSTGRES_DB=doublecheck `
     -p 5432:5432 `
     -d postgres:16

   docker exec doublecheck-postgres pg_isready -U postgres -d doublecheck
   docker exec doublecheck-postgres psql -U postgres -d doublecheck -c "select current_database();"
   ```

   On later runs, use `docker start doublecheck-postgres`. Do not create a second container if port 5432 already belongs to an existing database.

2. Install dependencies and create the local configuration.

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

3. Edit `.env`, then generate Prisma Client and apply the checked-in migrations.

   ```powershell
   npm run db:generate
   npx prisma migrate deploy
   npx prisma migrate status
   ```

4. Run the web app and worker in separate terminals from the project directory.

   ```powershell
   # Terminal 1
   npm run dev
   ```

   ```powershell
   # Terminal 2
   npm run worker
   ```

Open `http://localhost:3000`. The `/demo` page contains sanitized sample data; the normal scan path is never mocked.

## Environment variables

Never commit `.env`. Keep credentials server-side and use secret storage outside local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL URL, for example `postgresql://postgres:<password>@localhost:5432/doublecheck` |
| `GITHUB_TOKEN` | For scans | GitHub token with read access to public repository metadata and contents |
| `SESSION_SECRET` | Yes | Random value of at least 32 characters used to HMAC anonymous ownership sessions |
| `APP_BASE_URL` | No | Canonical origin; defaults to `http://localhost:3000` |
| `DEMO_MODE` | No | Explicit `true` or `false`; does not change the live scan path |
| `RAW_RETENTION_HOURS` | No | Raw-content retention window; defaults to 24 |
| `REPORT_RETENTION_DAYS` | No | Report retention window; defaults to 30 |
| `AI_FEATURE_MODE` | No | `disabled` (default), `local`, or future authenticated `server` mode |
| `OPENAI_API_KEY` | AI only | Server-side OpenAI credential |
| `AI_ANALYSIS_MODEL` | AI only | Explicit analysis model ID |
| `AI_VERIFIER_MODEL` | AI only | Explicit verifier/challenger model ID |
| `AI_MODEL_PRICING_JSON` | AI only | Model map containing USD-per-million `input`, `cachedInput`, and `output` prices |
| `AI_MAX_COST_PER_SCAN_USD` | AI only | Maximum reserved/actual AI cost for one scan |
| `AI_DAILY_BUDGET_USD` | AI only | Global UTC-day AI ceiling |

The checked-in `.env.example` contains non-secret development defaults. Pricing uses this shape:

```json
{
  "gpt-5.6-terra": { "input": 2, "cachedInput": 0.2, "output": 12 },
  "gpt-5-mini": { "input": 0.25, "cachedInput": 0.025, "output": 2 }
}
```

Every configured analysis and verifier model must resolve to an entry. Prices are USD per one million tokens; verify them against current provider pricing before enabling AI.

### Optional AI and cost controls

`AI_FEATURE_MODE=disabled` keeps the entire scan static. In development, `local` enables an explicit AI action after `static_complete`; it also requires the OpenAI key, both model IDs, valid pricing, and positive scan/day budgets. `server` is intentionally rejected until real application authentication exists.

Before each provider request, DoubleCheck atomically reserves a conservative maximum cost against both ceilings. Successful responses reconcile the reservation with provider-reported token counts. A dispatched request with an ambiguous failure retains its reservation as estimated spend because it may have been billed.

## Security boundaries

- Only canonical `https://github.com/{owner}/{repo}` URLs are accepted; arbitrary hosts, embedded credentials, custom ports, file links, and non-HTTPS schemes are rejected.
- Repository files are data only. DoubleCheck never runs target code or package-manager commands and never follows repository-supplied URLs.
- Collection uses a fixed GitHub API origin, commit pinning, content classification, and count/byte limits.
- Reports and mutations require the owning session; exports redact secret-shaped values and pages are marked `noindex`.
- AI receives bounded, explicitly delimited untrusted data. Structured output is schema-validated and evidence must match stored file ranges.
- Deterministic policy owns the recommendation. A result is decision support, not a guarantee that a repository is safe.

## Verification

Run the release checks with:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

The first-release candidate was exercised end to end against a public repository with AI disabled: PostgreSQL migrations applied, GitHub metadata and 95 file records collected, 67 contents selected, a deterministic report and both exports produced, and zero AI jobs, provider calls, usage records, or AI cost recorded. Automated unit/regression totals are reported from the current run rather than treated as a permanent claim in this document.

## Known limitations

- Static rules are conservative heuristics. Runtime-generated behavior, binaries, encrypted or split payloads, transitive dependency behavior, and environment-specific execution can be missed.
- A grouped configuration finding preserves its full line range, but it does not prove whether referenced credentials are sensitive, present, or later exfiltrated.
- Generated/vendor/minified static data without executable-language signals skips execution rules; executable generated content is analyzed with reduced confidence and disclosed in the report.
- Only public GitHub repositories are supported. Blob retrieval is sequential and large repositories may hit bounded collection limits.
- The worker lacks a production-grade atomic lease, heartbeat, retry counter, and multi-worker recovery protocol.
- Rate limiting is process-local, and retention deadlines exist without a bundled scheduler.
- Dependency advisory/provenance coverage, broad benign-corpus benchmarking, and live AI quality/cost benchmarking are incomplete.
- Authenticated multi-user AI mode, encrypted BYOK storage, public sharing, appeals, and a retry/rescan endpoint are not implemented.

More detail is available in [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [limitations](docs/LIMITATIONS.md), and [benchmark status](docs/BENCHMARK.md).

## Other commands

```powershell
npm run test:e2e
npm run start
npm run db:migrate -- --name <migration-name>  # development schema changes only
```

For production-like startup, build first and run the web and worker as separate non-root processes. Do not mount the Docker socket or a host home directory into either process; restrict worker egress to GitHub, PostgreSQL, and the explicitly configured AI provider.
