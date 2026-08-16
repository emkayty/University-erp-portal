# V36 — Cross-Layer Verification Plan

Static source inventory is evidence of presence, not proof of runtime wiring.

For each critical workflow:
1. Start at the actual UI action.
2. Capture the exact network request.
3. Identify API handler.
4. Verify authentication and server-side authorization.
5. Verify request schema and business validation.
6. Trace service/domain logic.
7. Verify database transaction and concurrency behavior.
8. Verify audit event.
9. Verify response schema.
10. Verify frontend state/cache invalidation and user-visible result.

Acceptance:
- No client-only business authority.
- No mutation without server authorization.
- No silent validation bypass.
- No duplicate mutation on retry.
- No stale state overwrite.
- No official result/payment state derived from client state.
