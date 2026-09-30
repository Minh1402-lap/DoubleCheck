# Static-first architecture

```text
browser -> Next.js API -> PostgreSQL queue -> worker -> fixed-origin GitHub collector
                                                   -> deterministic static rules
                                                   -> static_complete report

static_complete -> explicit POST /api/scans/:id/ai -> AI queue (optional)
                                                    -> cost reservations
                                                    -> completed AI supplement
```

The static lifecycle is independent of AI configuration, provider availability, and billing. A scan resolves an immutable Git commit, stores bounded text blobs as untrusted data, runs versioned deterministic rules, and persists `staticReportJson`. Repository files are never executed. Static cache reuse requires normalized repository identity, commit SHA, and ruleset version; a cached public-repository result is copied into the requesting session's record rather than exposing another session.

Optional AI begins only through the explicit, same-origin `POST /api/scans/:id/ai` route after static completion. `disabled` is the default. `local` is accepted only under `NODE_ENV=development`. `server` is rejected until real application authentication exists. Duplicate running requests return a conflict, and completed results may be reused only for the same repository commit, prompt version, analysis model, and verifier model. AI failure returns the scan to `static_complete` and stores separate AI error fields, preserving the static report.

Before every provider request, PostgreSQL atomically checks both a per-scan ceiling and a UTC-day ceiling, then reserves a conservative maximum. Provider-reported token usage reconciles successful reservations; ambiguous dispatched failures are charged at the reservation. API keys remain server-side.

The anonymous session secret is stored only as an HttpOnly cookie; the database receives an HMAC. Every status, report, export, delete, and AI request verifies session ownership. Public repository content may be reused by copying sanitized output, never by granting access to another scan record.
