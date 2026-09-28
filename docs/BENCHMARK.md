# Benchmark and evaluation status

Date: 2026-09-28

No live AI/GitHub benchmark has been run because no provider credentials or PostgreSQL service were supplied. Latency, token, cost, benign-corpus distribution, and three-run model stability are therefore **not measured** and are intentionally not fabricated.

The local deterministic suite currently covers URL/SSRF validation, file classification, exact evidence validation, redaction, hidden Unicode rendering, documented-command provenance, Run gating, verifier downgrade, prompt-injection Run blocking, and preservation of verified Avoid under partial coverage.

Before a public launch, run small, medium, and limit-near immutable fixtures three times each with the configured model IDs. Record mean/p50/p95 duration, input/output tokens and estimated cost per stage; critical-chain recall; false Run/Avoid counts; evidence-location accuracy; schema validity; injection resistance; judge/verifier agreement; challenger block/miss rates; two-gate correctness; and Run/Review/Avoid distribution across at least 100 documented benign repositories. Always publish sample counts beside rates.
