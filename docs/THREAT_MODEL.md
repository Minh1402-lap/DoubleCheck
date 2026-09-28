# Threat model

## Assets

GitHub and AI credentials, model instructions, user/session ownership, repository evidence, verdict integrity, service availability, and cost budget.

## Adversaries and paths

- A repository author embeds prompt injection, delimiter imitation, misleading comments, hidden Unicode, huge/minified content, or split payloads.
- A requester submits an SSRF-shaped URL, probes reports, floods expensive scans, or attempts cross-origin state changes.
- A dependency or external link tries to redirect collection to an untrusted origin.
- A model invents evidence, commands, links, or a verdict unsupported by input.

## Controls

Fixed GitHub API origin; strict URL grammar; immutable commit pinning; no code execution; byte/file/call bounds; safe Unicode rendering; server-only secrets; random data boundaries; strict schemas; exact excerpt verification; deterministic verdict gates; mandatory production Avoid verification; independent Run challenge; HMAC session ownership; unguessable report IDs; rate limiting; CSP and secure headers; export redaction; retention deadlines.

## Residual risk

Static analysis cannot observe runtime-only, generated, encrypted, binary, dependency-transitive, or environment-dependent behavior. AI stages can miss relationships or misclassify intent. In-memory rate limits do not coordinate multiple web replicas. Worker claim locking and cost accounting require additional production hardening. A Run result is never a guarantee.
