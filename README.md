# DoubleCheck

DoubleCheck helps you inspect an unfamiliar public GitHub repository before deciding whether to run it. It downloads a bounded, immutable snapshot through the GitHub API, analyzes the files as untrusted data, and produces an evidence-linked **Run / Review / Avoid** recommendation.

DoubleCheck does **not** clone, install, import, build, test, or execute code from the repository being reviewed.

Version 1 is a static-only product. It does not call OpenAI or any other AI provider. AI-assisted analysis is reserved for a separately reviewed version 2.

## What version 1 provides

- Strict validation for canonical public GitHub repository URLs.
- Authenticated GitHub API collection with useful authentication and rate-limit errors.
- Immutable commit pinning so every report refers to an exact repository state.
- Bounded file inventory and content collection with explicit skip reasons.
- Language-aware deterministic security rules with exact file and line evidence.
- Reduced-confidence disclosures for generated, vendor, and minified content.
- Deterministic risk scoring and a Run / Review / Avoid recommendation.
- Session-owned report pages with redacted JSON and Markdown exports.
- A separate worker with atomic job claiming, leases, heartbeats, and safe restart behavior.
- JSON API errors, CSP/security headers, secret redaction, and `noindex` report pages.

Static analysis cannot prove that a repository is safe. The report is decision support, not a guarantee.

## Architecture

```text
Browser
   |
   v
Next.js web/API -----> PostgreSQL queue and report storage
                              |
                              v
                           Worker
                              |
                              +-- GitHub metadata, commit, tree, and blobs
                              +-- deterministic static rules
                              `-- static report and export

queued -> collecting -> static_analyzing -> static_complete
```

The web process validates requests and owns reports through an anonymous HttpOnly session. The worker communicates with the fixed GitHub API origin, pins the resolved commit SHA, applies count and byte limits, stores selected text as inert data, and runs a versioned static ruleset.

With `AI_FEATURE_MODE=disabled`, the report UI contains no AI controls, the AI endpoint returns `AI_DISABLED`, and the worker never claims AI jobs.

## Requirements

- Node.js 22 or newer
- npm
- Docker Desktop
- PostgreSQL 16
- A GitHub token that can read public repository metadata and contents

No OpenAI key is required for version 1.

## Local setup on Windows

### 1. Start PostgreSQL 16

Choose a local password and use the same value later in `DATABASE_URL`.

```powershell
docker run --name doublecheck-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=<strong-local-password> `
  -e POSTGRES_DB=doublecheck `
  -p 5432:5432 `
  -d postgres:16
```

Wait until PostgreSQL is ready and verify the database from inside the container:

```powershell
docker exec doublecheck-postgres pg_isready -U postgres -d doublecheck
docker exec doublecheck-postgres psql -U postgres -d doublecheck -c "select current_database();"
```

For later sessions, reuse the same container:

```powershell
docker start doublecheck-postgres
```

Do not create another container if port `5432` is already used. Inspect the existing process or container first.

### 2. Install dependencies and create `.env`

```powershell
npm install
Copy-Item .env.example .env
```

Fill in the required values without committing `.env`:

```ini
DATABASE_URL="postgresql://postgres:<strong-local-password>@localhost:5432/doublecheck"
GITHUB_TOKEN="<your-token>"
SESSION_SECRET="<random-value-of-at-least-32-characters>"
AI_FEATURE_MODE="disabled"
```

Do not paste tokens into logs, issues, screenshots, or chat messages.

### 3. Generate Prisma Client and apply migrations

```powershell
npm run db:generate
npx prisma migrate deploy
npx prisma migrate status
```

Use the development migration command only when intentionally changing the schema:

```powershell
npm run db:migrate -- --name <migration-name>
```

### 4. Run web and worker in separate terminals

Terminal 1:

```powershell
npm run dev
```

Terminal 2:

```powershell
npm run worker
```

Open [http://localhost:3000](http://localhost:3000). The `/demo` route uses sanitized sample data; the normal scan route is never mocked.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `GITHUB_TOKEN` | For live scans | Server-side GitHub credential with read access to public metadata and contents |
| `SESSION_SECRET` | Yes | Random value of at least 32 characters used to protect anonymous ownership sessions |
| `AI_FEATURE_MODE` | Yes for v1 | Must remain `disabled` |
| `APP_BASE_URL` | No | Canonical origin; defaults to `http://localhost:3000` |
| `DEMO_MODE` | No | Enables explicit demo behavior when set to `true`; it does not replace the live scan path |
| `RAW_RETENTION_HOURS` | No | Selected raw-content retention window; defaults to 24 hours |
| `REPORT_RETENTION_DAYS` | No | Completed-report retention window; defaults to 30 days |

`.env.example` contains placeholders and safe defaults only. Never commit `.env`, database dumps, logs, tokens, API keys, or session secrets.

## Security boundaries

- Only canonical `https://github.com/{owner}/{repository}` URLs are accepted.
- Arbitrary hosts, embedded credentials, custom ports, file URLs, and non-HTTPS schemes are rejected.
- Repository text, documentation, filenames, and comments are untrusted data—not instructions.
- Target repository code and package-manager commands are never executed.
- Collection uses a fixed GitHub API origin, immutable commit pinning, content classification, and count/byte limits.
- Reports and mutations require the owning anonymous session.
- Exports redact secret-shaped values and report pages are marked `noindex`.
- Static recommendations are deterministic; repository content cannot instruct the analyzer to change its policy.
- The application must not receive a Docker socket or a host home-directory mount.

## Verification

Run the release checks from the project directory:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

The current version 1 regression suite contains 104 passing tests. The static-first flow has also been exercised end to end against a public repository: PostgreSQL migrations applied, GitHub metadata and 95 file records collected, 67 file contents selected, a deterministic report and both exports produced, with zero AI jobs, provider calls, usage records, or AI cost.

Optional browser tests are available with:

```powershell
npm run test:e2e
```

## Production-like startup

Build first, then run the web process and worker as separate non-root processes:

```powershell
npm run build
```

Terminal 1:

```powershell
npm run start
```

Terminal 2:

```powershell
npm run worker
```

Restrict worker egress to GitHub and PostgreSQL. Keep `AI_FEATURE_MODE=disabled` for the version 1 release.

## Known limitations

- Only public GitHub repositories are supported.
- Static rules are conservative heuristics and can produce false positives or miss behavior generated only at runtime.
- Binaries, encrypted or split payloads, environment-specific behavior, and transitive dependency behavior are not fully observable.
- Large repositories can reach bounded inventory, byte, or GitHub API limits.
- Generated, vendor, and minified files may be skipped for execution rules or analyzed with reduced confidence; the report discloses this.
- Credential-configuration blocks preserve evidence but cannot prove that referenced secrets exist or are later exfiltrated.
- GitHub request throttling is process-local.
- The worker has leases and stale-job recovery but no dead-letter queue or maximum-attempt policy yet.
- Retention deadlines are stored, but no bundled external scheduler is provided.
- Dependency advisory and provenance analysis are not comprehensive.
- Public report sharing, accounts, teams, appeals, and a retry/rescan endpoint are not implemented.

More detail is available in [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [limitations](docs/LIMITATIONS.md), and [benchmark status](docs/BENCHMARK.md).

## Version 2 roadmap

The repository retains experimental AI pipeline code, but it is not part of the version 1 product surface. Re-enabling it requires a separate review covering authentication, checkpointed retries, quality benchmarks, provider failure handling, cost accounting, privacy, and production operations. Do not enable it by changing only an environment variable.
