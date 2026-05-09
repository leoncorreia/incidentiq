# Payments Service Runbook

## Symptoms
- p95 latency increase in checkout and payment flows
- DB timeout and connection pool saturation alerts

## Immediate Actions
1. Verify recent deploys and rollback if retry or connection logic changed.
2. Cap retry attempts to 2 and introduce jittered backoff.
3. Lower worker concurrency to protect DB pool.

## Deep Fix
- Add client-side concurrency budgeting per tenant.
- Introduce circuit breaker for DB timeout bursts.
- Add alert on retry amplification ratio.
