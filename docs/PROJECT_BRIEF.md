# Project Brief

## Product

Guvende is a family safety application for guardians and family members. It focuses on live location visibility, safe-zone awareness, emergency signaling, family membership, notifications, and basic account/session security.

## Problem

Families need a practical way to understand where members are, whether they are inside expected areas, and whether urgent help is needed. The system handles sensitive personal and location data, so the backend must enforce ownership, authorization, environment separation, and careful logging.

## Target Users

| Role | Description |
|---|---|
| Guardian | Creates or manages families, follows members, manages safe zones, receives alerts. |
| Child / Member | Shares location, can trigger SOS, receives warnings or reminders. |
| Admin | Reviews operational data, manages users/families, handles support and moderation actions. |

## Platforms

- Mobile app: Ionic Angular with Capacitor.
- Backend API: NestJS.
- Database: PostgreSQL through Prisma.
- Realtime: Socket.IO WebSocket gateway.
- Notifications: In-app/WebSocket and OneSignal where native push is required.
- Email: Brevo transactional email.

## MVP Scope

- Authentication, refresh tokens, logout.
- Family create/join/leave/member management.
- Live and historical locations.
- Safe zones and related alerts.
- SOS alert flow.
- Notifications and unread state.
- Profile and device permission support.
- Admin operational views.
- Dev/prod environment separation.

## Out of Scope For Current MVP

- Video calling. The feature is temporarily disabled until the signaling, permission, and product contract are redesigned.
- Multi-country timezone personalization. Database stays UTC; display/filtering currently targets Turkey local day rules.
- Payment provider integration. Premium is currently granted by admins; in-app purchase must stay disabled until provider receipt verification is implemented.
- Microservice split. The backend remains a modular monolith.

## Sensitive Data

- Location history.
- Family membership.
- Email, phone, name, gender.
- Session and refresh token state.
- Device identifiers and permission state.

## Approval

Status: ACCEPTED as the current working brief for playbook compliance.
