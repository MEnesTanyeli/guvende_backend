# Use Cases

## UC-001 Register And Login

- Actor: Guardian or member.
- Preconditions: User has a reachable email and device.
- Main flow: User requests verification, registers or logs in, receives access/refresh tokens, profile is stored locally.
- Error flow: Invalid credentials, expired/invalid code, locked device, missing env/mail provider.
- Authorization: Public endpoints only until authenticated; private endpoints require JWT.
- Data impact: User, session, verification/reset records.
- Audit/notification: Security-relevant failures should be loggable without exposing secrets.

## UC-002 Create Or Join Family

- Actor: Guardian or member.
- Preconditions: Authenticated user.
- Main flow: Guardian creates family or user joins by invite code; membership is created and frontend refreshes family state.
- Error flow: Invalid invite, duplicate membership, unauthorized role action.
- Authorization: User must own or be member of the family for protected reads/actions.
- Data impact: Family and membership records.
- Audit/notification: Family membership changes may notify affected users.

## UC-003 Track Live Location

- Actor: Mobile client and guardian viewer.
- Preconditions: Authenticated session, location permission, family membership.
- Main flow: Client sends location; backend stores it; WebSocket broadcasts updates to joined family rooms.
- Error flow: Invalid coordinates, unauthorized family/member access, stale token, poor GPS accuracy.
- Authorization: Viewers can only access family members they are allowed to see.
- Data impact: Location records and latest-location queries.
- Audit/notification: High-risk location events may produce alerts.

## UC-004 Review Location History

- Actor: Guardian or admin.
- Preconditions: Authenticated and authorized user.
- Main flow: User requests history for a selected local day; backend converts the local day to UTC query boundaries.
- Error flow: Invalid date, unauthorized target user, empty history.
- Authorization: Family ownership/membership or admin guard.
- Data impact: Read-only.
- Audit/notification: Admin access should be auditable where appropriate.

## UC-005 Manage Safe Zones

- Actor: Guardian.
- Preconditions: Authenticated guardian and family membership.
- Main flow: Guardian creates/lists/removes safe zones; mobile clients receive active zone context.
- Error flow: Invalid radius/coordinates, unauthorized family access.
- Authorization: Backend validates family access and allowed role.
- Data impact: Safe zone records.
- Audit/notification: Zone enter/exit alerts may be generated.

## UC-006 Handle Alerts And Notifications

- Actor: Guardian, member, admin.
- Preconditions: Authenticated user and relevant family/alert relationship.
- Main flow: Alert is created, delivered by WebSocket/push where applicable, shown as unread/unresolved, then marked resolved/read.
- Error flow: Duplicate delivery, unauthorized alert access, stale unread count.
- Authorization: User can only see alerts belonging to allowed families or admin scope.
- Data impact: Alert and notification state.
- Audit/notification: Alert resolution is a business event.

## UC-007 Trigger SOS

- Actor: Member.
- Preconditions: Authenticated session and family relationship.
- Main flow: Member sends SOS; backend records alert; guardians receive notification.
- Error flow: No family, notification provider unavailable, WebSocket disconnected.
- Authorization: Authenticated member only.
- Data impact: SOS alert and notification events.
- Audit/notification: Critical notification path.

## UC-008 Admin Operations

- Actor: Admin.
- Preconditions: Admin-authenticated session.
- Main flow: Admin reviews users/families/alerts/locations and performs allowed support actions.
- Error flow: Non-admin access, missing audit log, destructive action denied.
- Authorization: Admin guard plus explicit service-level checks.
- Data impact: User/family/alert/location administrative changes.
- Audit/notification: Admin actions require audit where available.
