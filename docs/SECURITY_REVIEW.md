# Backend Security Review

Date: 2026-08-25
Scope: NestJS API, WebSocket gateway, auth/session flow, env and deployment baseline.

## Summary

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 2
- LOW: 2

Release blocker bulunmadı. Production source lint now has 0 errors and 0 warnings for the unsafe type cleanup pass. Remaining lint warnings are limited to existing test/spec mocks.

## Evidence

- `npm run build`: passed
- `npx eslint "{src,apps,libs,test}/**/*.ts"`: 0 errors, 104 warnings, all in spec files
- `npm test -- --runInBand`: 7 suites passed, 37 tests passed
- `npm audit --audit-level=high`: 0 vulnerabilities
- Production cleanup covered auth request typing, logger typing, WebSocket gateway payloads, notification payloads, Prisma JSON fields, and cron error handling

## Completed Checks

- Authentication: bcrypt password hashing; generic login errors; JWT secret required; refresh tokens stored as hashes; refresh rotation/reuse tests exist.
- Authorization: admin routes use `JwtAuthGuard` + `AdminGuard`; family/location access paths use backend ownership checks in service layer.
- Input validation: global `ValidationPipe` uses `whitelist`, `forbidNonWhitelisted`, and `transform`; inline family/user bodies were moved to DTO classes.
- SQL injection: no raw Prisma query usage found in source scan.
- Sensitive data: `UsersService.findOne` returns an explicit user shape and excludes `passwordHash`, reset OTP fields, and refresh token hashes.
- CORS: origins come from `CORS_ORIGINS`; wildcard production origin is not used by default.
- CSRF/cookies: not required for current bearer-token flow; credentials are disabled in CORS.
- Rate limiting: auth/register/login/refresh/password reset endpoints have explicit throttles; global throttler is configured.
- Secrets: real env files ignored; examples contain placeholders only; Docker Compose now requires env values.
- Headers: baseline `nosniff`, frame deny, referrer policy, permissions policy, HSTS, and no-store cache headers are set.
- Dependencies: high-level audit clean.

## Accepted Findings

| Severity | Finding | Risk | Action |
|---|---|---|---|
| MEDIUM | `POST /users/purchase-mock` remains protected but is a production-sensitive mock purchase path. | A normal authenticated user can self-enable premium if this route is reachable in production. | Before production release, replace with real payment/provider flow or environment-gate this endpoint. |
| MEDIUM | External API HTTP calls use low-level request code without a shared timeout/retry policy everywhere. | Provider stalls may hold resources or produce inconsistent failures. | Introduce a small external HTTP client wrapper with timeout and redacted errors. |
| LOW | Test/spec files still use broad mocks with `any`. | Test typing is weaker than production source typing. | Keep build/lint gate green; tighten mocks gradually when touching those specs. |
| LOW | Security review is static/local, not a professional penetration test. | Runtime proxy/firewall/container risks are outside this pass. | Cover in production infrastructure review. |

## Result

Backend Security Review: COMPLETED

Conditions:
- CRITICAL issue = 0
- HIGH issue = 0
- Production source unsafe type warnings cleaned for this pass
- Medium/low risks are tracked in `PROJECT_PROGRESS.md`
