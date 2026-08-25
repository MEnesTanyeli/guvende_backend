# Requirements

## Functional Requirements

| ID | Priority | Requirement | Owner Domain |
|---|---|---|---|
| FR-001 | MUST | Users can register, log in, refresh session, log out, and reset password. | Auth |
| FR-002 | MUST | Guardians can create a family and invite or remove members. | Families |
| FR-003 | MUST | Members can join a family using an invite flow. | Families |
| FR-004 | MUST | Mobile clients can send single and bulk location updates. | Locations |
| FR-005 | MUST | Guardians can view latest and historical member locations within owned families. | Locations |
| FR-006 | MUST | Guardians can create, list, and remove safe zones for a family. | Safe Zones |
| FR-007 | MUST | The system records and displays alerts, including unresolved alert counts. | Alerts / Notifications |
| FR-008 | MUST | A member can trigger an SOS alert. | SOS |
| FR-009 | SHOULD | Medication reminders can be created, updated, deleted, and marked as taken. | Medications |
| FR-010 | SHOULD | Battery and app usage telemetry can be submitted and viewed by authorized guardians. | Battery / App Usage |
| FR-011 | MUST | Admin users can review users, families, alerts, latest locations, and audit logs. | Admin |
| FR-012 | SHOULD | Device warning/lock flows must be explicitly controlled and may be disabled if unstable. | Locations / Device |

## Non-Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| NFR-001 | MUST | Production and development environments use separate branches, domains, ports, env files, and databases. |
| NFR-002 | MUST | Secrets and credentials are never committed, logged, or bundled into the client. |
| NFR-003 | MUST | Backend authorization and ownership checks protect family and member resources. |
| NFR-004 | MUST | Location timestamps are stored in UTC; user-facing day boundaries are calculated by backend policy. |
| NFR-005 | MUST | Production schema changes use migrations. |
| NFR-006 | MUST | Backend starts fail-fast when required environment variables are missing. |
| NFR-007 | SHOULD | Build, audit, deploy, and health evidence are written to `PROJECT_PROGRESS.md`. |
| NFR-008 | SHOULD | Console/log noise is reduced so real errors remain visible. |
| NFR-009 | SHOULD | Critical flows have focused tests before being marked completed. |

## Constraints

- Current primary deployment target is the existing Ubuntu server reached through Tailscale SSH.
- Backend dev API is `https://dev-api.guvende.app`.
- Backend production API is `https://api.guvende.app`.
- The app currently targets Turkey-oriented day grouping.
- Native mobile behavior depends on Capacitor plugins and Android build output.

## MVP vs Later

| Later Item | Reason |
|---|---|
| Video calling | Needs a clean WebRTC/signaling/permission product contract. |
| Real payment provider | Needs provider selection, idempotency, audit, and refund/receipt rules. |
| Queue/RabbitMQ | Not needed until background work volume or reliability requirements justify it. |
| Redis cache | Not needed until measured performance or session coordination requires it. |
| Secret manager / CI/CD | Valuable next step, but current manual server env model is documented first. |
