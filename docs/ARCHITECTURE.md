# Architecture

```text
browser -> Next.js intake/API -> PostgreSQL queue -> worker
                                             |
                                             +-> fixed-origin GitHub collector
                                             +-> mapper -> file analyzer -> correlator
                                             +-> intent comparison -> judge proposal
                                             +-> Avoid verifier / Run challenger
                                             +-> deterministic two-gate policy
                                             +-> private report + sanitized export
```

The database is the durable job boundary. Web requests only validate, authorize, rate-limit, and enqueue scans. A separately runnable worker claims queued work and persists every meaningful status, including `verifying`, `challenging`, `cancelling`, and `cancelled`.

Collection uses repository metadata, a resolved immutable commit, a recursive tree, and individual blob reads. Inventory, file, selected-byte, and total-byte limits are enforced before model input. No archive extraction exists, which removes zip-slip, symlink, device-file, and decompression-bomb exposure from this version.

The AI provider is a small structured-output interface. Prompts are versioned independently of UI copy. The mapper, file analyzer, correlator, intent analyzer, judge, verifier, and challenger receive different contracts. Repository text is enclosed as untrusted data and cannot choose tools or destinations.

Before each provider request, the worker atomically reserves a conservative maximum cost against a PostgreSQL UTC-day ledger. Completed responses reconcile that reservation using provider-reported input, cached-input, and output tokens plus operator-configured model prices. Per-stage usage is retained with the scan; ambiguous failures are charged at the reserved estimate so concurrent or failing workers cannot bypass the daily ceiling.

Evidence validation and policy are deterministic. Unsupported excerpts are dropped. The Avoid gate executes first; coverage limitations cannot dilute a verified critical chain. The Run gate then requires complete applicable coverage, no unresolved material findings, no prompt injection, zero unclassified auto-run surfaces, judge agreement, and a passing independent challenge.

The anonymous session secret is stored only as an HttpOnly cookie; the database receives an HMAC. Report public IDs use 24 random URL-safe characters. Every read and write checks session ownership.
