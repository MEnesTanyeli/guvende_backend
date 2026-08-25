# Domain Map

## Backend Domains

| Domain | Module Path | Owns | Notes |
|---|---|---|---|
| Auth | `src/auth` | Login, register, refresh, logout, password reset, session security. | Public/private boundary starts here. |
| Users | `src/users` | User profile, premium/mock state, proxy, device permissions. | Must avoid exposing sensitive fields. |
| Families | `src/families` | Family records, membership, invite flow, roles. | Core ownership boundary for most data. |
| Locations | `src/locations` | Location writes, latest/history reads, warning/device signaling. | Uses UTC storage and local-day query policy. |
| Safe Zones | `src/safe-zones` | Family geofences. | Depends on family ownership and location context. |
| Alerts | `src/alerts` | Alert listing and resolution. | Should align unread/resolved language with frontend. |
| Notifications | `src/notifications` | Notification delivery/state. | Push provider details should stay behind service boundary. |
| SOS | `src/sos` | Emergency alert trigger. | Critical flow. |
| Medications | `src/medications` | Medication reminders and taken state. | Notification integration may apply. |
| Battery | `src/battery` | Battery telemetry. | Sensitive operational telemetry. |
| App Usage | `src/app-usage` | App usage telemetry. | Guardian access must be ownership checked. |
| Admin | `src/admin` | Operational support and administration. | Requires audit and strict authorization. |
| Mail | `src/mail` | Brevo email delivery. | External provider, no secret logging. |
| Common | `src/common` | Cross-cutting logger, guards, decorators where applicable. | Domain rules should not drift into common. |

## Frontend Domains

| Area | Path | Responsibility |
|---|---|---|
| Auth pages/services | `src/app/pages/login`, `src/app/pages/register`, `src/app/services/auth.service.ts` | Session and account flows. |
| Main tabs | `src/app/tabs`, `src/app/tab1..tab4` | Tracking, safe zones, notifications, profile. |
| Member profile | `src/app/pages/member-profile` | Per-member map/history/detail view. |
| Services | `src/app/services` | API, socket, location, family refresh, native integration. |
| Shared components | `src/app/components` | Reusable UI only when genuinely shared. |

## Ownership Rules

- Family membership is the main tenant boundary.
- Backend checks are authoritative; frontend guards and hidden buttons are UX only.
- Admin actions are separate from normal family ownership and require audit awareness.
- Sensitive location and telemetry data should not be returned unless the user has a clear relationship to the target member.
