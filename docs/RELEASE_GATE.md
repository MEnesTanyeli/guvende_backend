# Release Gate

Date: 2026-08-25

## Current Gate Status

Backend can move toward dev deployment after environment secrets are present on the target server.
Production deployment still requires explicit release evidence.

## Required For Dev Deploy

- Branch: `develop`
- Environment file: `.env.dev` on server only
- Database: dev database only
- Commands before restart:
  - `npm install`
  - `npx prisma generate`
  - migration/deploy step if schema changed
  - `npm run build`
  - `npm test -- --runInBand`
  - `npm audit --audit-level=high`
- Smoke checks:
  - `GET /health`
  - login
  - forgot password mail
  - family list
  - latest location

## Required For Production Deploy

- Branch: `main`
- Environment file: `.env.production` on server only
- Database: production database only
- No copied dev env, dev database URL, trycloudflare URL, or dev mail key
- Commit SHA recorded before deployment
- Migration plan reviewed
- Backup and restore path verified
- Rollback trigger and owner identified
- Smoke checks pass after deployment

## Current Evidence

- Backend build: passed
- Backend lint: passed with 0 errors
- Backend tests: 7 suites, 37 tests passed
- Backend audit high: 0 vulnerabilities
- Frontend build: passed
- Frontend lint: passed with 0 errors
- Frontend tests: 9 tests passed

## Not Done Yet

- Production deployment evidence with commit SHA
- Backup restore test evidence
- Monitoring/dashboard/alert evidence
- In-app premium purchase stays disabled; premium access is granted only through the admin panel until real payment provider verification is implemented
- Separate production OneSignal app id, or documented approval to share the current OneSignal app between dev and production
