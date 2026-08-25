# Technology Stack Decisions

## Selected Technologies

| Technology | Decision | Reason | Reconsider When |
|---|---|---|---|
| NestJS | ACCEPTED | Modular backend structure, guards, validation pipes, WebSocket support. | Backend complexity or team skill changes materially. |
| Prisma | ACCEPTED | Typed PostgreSQL access and migration workflow. | Query complexity requires a different data access approach. |
| PostgreSQL | ACCEPTED | Reliable relational storage for users, families, locations, alerts, sessions. | Data model becomes non-relational or scale needs change. |
| Ionic Angular | ACCEPTED | Existing mobile app stack with Angular structure and Capacitor support. | Native-only requirements outgrow hybrid approach. |
| Capacitor | ACCEPTED | Native Android bridge for location, device, notifications, kiosk/plugin behavior. | Native code surface becomes dominant. |
| Socket.IO | ACCEPTED | Realtime location, alerts, room join/rejoin behavior. | Protocol needs become simple enough for SSE or complex enough for a broker. |
| OneSignal | ACCEPTED | Native push notification provider. | Push requirements or cost/reliability change. |
| Brevo | ACCEPTED | Transactional email for verification and password reset. | Email deliverability, cost, or compliance requirements change. |
| Docker Compose | ACCEPTED | Current VPS deployment and isolated dev/prod backend services. | CI/CD or orchestration requirements grow. |

## Explicitly Deferred Technologies

| Technology | Status | Reason |
|---|---|---|
| Redis | DEFERRED | No measured caching/session coordination need yet. |
| RabbitMQ / Queue | DEFERRED | Background work volume does not yet justify operation cost. |
| Microservices | DEFERRED | Modular monolith is simpler and sufficient for current scope. |
| API Gateway | DEFERRED | Single backend service is current deployment model. |
| Real payment provider | DEFERRED | Requires product, compliance, idempotency, audit, and provider decision. |
| Video calling stack | DEFERRED | Current feature is disabled pending a clean signaling and UX contract. |

## SOLID / KISS / YAGNI Interpretation

- Do not create interfaces or repositories only for pattern completeness.
- Keep controller logic thin; business rules belong in services/use-cases.
- Keep provider-specific code behind services when there is a real external boundary.
- Add shared abstractions only after at least two real consumers share the same reason to change.
- Avoid optional infrastructure until a concrete problem, simpler alternative, and operating cost are documented.
