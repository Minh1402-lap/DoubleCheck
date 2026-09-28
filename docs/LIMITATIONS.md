# Limitations

This implementation is a production-minded MVP, not a completed public service.

- Dependency manifest parsing, OSV/provider advisory lookup, shared cache, and malicious-package provenance are not yet implemented; the policy records dependency intelligence as unavailable and therefore prevents High-confidence Run.
- The worker loop does not yet use an atomic lease/claim, heartbeat, retry counter, or multi-worker recovery protocol.
- Provider token/cost usage and a global UTC-day cap are persisted and enforced; per-stage latency persistence is not complete. Dollar accounting depends on operators keeping `AI_MODEL_PRICING_JSON` aligned with provider pricing.
- Retention deadlines are stored, but a scheduled deletion process is not included.
- Current rate limiting is process-local. Use Redis or a database-backed limiter before horizontal scaling.
- No stale-head check, retry/rescan endpoint, bot challenge, public sharing, appeal workflow, Terms of Service, or security-contact workflow is shipped.
- The OpenAI adapter validates parsed JSON with Zod but does not yet use provider-native JSON Schema response formatting or a bounded repair attempt.
- GitHub tree collection reads blobs sequentially and needs bounded concurrency/backoff for larger repositories.
- Mixed-script confusable detection, entropy scoring, split-payload reconstruction, and full manifest parsing remain incomplete.
- The fixture set covers policy primitives but not all 30 required evaluation repositories. No 100-repository benign corpus was run.
- No live provider scan, deployment, latency benchmark, token benchmark, or cost benchmark has been claimed.
