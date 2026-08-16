# Contributing to UniPortal ERP

> Referenced from the root `README.md` ("added in P1") — this document was
> missing from the repository (a dangling reference) prior to this fix. See
> `docs/CHANGELOG.md` item P2-4 for context, and
> `docs/key-rotation-procedure.md` for the other doc fixed alongside it.

Branch strategy and commit message format are documented in the root
`README.md`'s Contributing section — this file covers everything else:
local setup, testing conventions, and the patterns this codebase expects
new code to follow.

## Getting started

Follow the root `README.md`'s Quick Start end to end, including step 5.5
(`pnpm db:bootstrap-roles`) — a fresh clone cannot authenticate to its own
database without it. Before opening a PR, all four of these should pass
locally:

```bash
pnpm type-check   # tsc --noEmit — full cross-file type safety
pnpm test         # Jest unit suite
pnpm lint
pnpm build
```

`type-check` and `test` are deliberately separate steps (see
`apps/api/jest.config.ts`'s `isolatedModules` note) — a passing `test` run
does not by itself guarantee the codebase type-checks, and vice versa. CI
runs both; so should you, locally, before pushing.

## Patterns this codebase expects you to follow

These aren't arbitrary style preferences — each one exists because an
earlier version of this codebase got it wrong in a way an audit had to
catch. Deviating from them reintroduces a specific, previously-fixed class
of bug.

### Reading/writing FORCE-RLS models

Seven tables (`Student`, `StudentResult`, `Payment`, `Payslip`,
`CourseRegistration`, `DataSubjectRequest`, `SecurityIncident`) are under
`FORCE ROW LEVEL SECURITY` (migration `0011`). Any service touching one of
these must route through `PrismaService`:

- **Reads / simple writes:** `this.prisma.forRequest(this.rlsContext).student.findMany(...)`
  — never `this.prisma.student.findMany(...)` directly.
- **Transactions:** `this.prisma.runExclusive(this.rlsContext, async (tx) => { ... })`
  — never `this.prisma.$transaction(...)` directly. `runExclusive` reuses
  the request's already-open RLS transaction instead of opening a second
  connection.

Both require injecting `RlsContextService` into the service's constructor.
See `results.service.ts` or `students.service.ts` for a complete example,
and `infra/README.md`'s RLS cutover warning for what happens if this is
skipped: not an error, just silently empty results once `DATABASE_URL`
points at the restricted `uniportal_app` role.

### Concurrency: lock before you read-then-validate-then-write

If a method reads some aggregate state (e.g., "sum of a student's existing
course registrations"), validates a new change against it, and then writes
— it needs a `pg_advisory_xact_lock` around the read, not just a
transaction. A transaction alone does not stop two concurrent requests from
each reading the "before" state and both passing validation independently.
See `results.service.ts`'s `recomputeAndApplyCgpa()` or
`students.service.ts`'s `registerCourses()` for the established pattern —
acquire the lock via `tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(${key}))\``
as the *first* statement inside the transaction, before the read. If the
lock needs to survive across separate transactions or bypass RLS for a
genuine system-level (not per-user) operation, use `DirectPrismaService`
instead — see its docblock for exactly when that's appropriate and when it
isn't.

### Audit logging

`AuditService.log(entry, actorId?)` — always pass `actorId` explicitly when
one exists in scope, even during flows that happen before an authenticated
session exists (login, password reset via OTP). The second parameter only
falls back to the current request's user when omitted, which doesn't exist
yet during those flows — omitting it there means the audit row has no
attributable actor at all, for exactly the events an audit trail matters
most for.

### Soft delete

Models in `SOFT_DELETE_MODELS` (`database/soft-delete.util.ts`) get
delete/deleteMany transparently redirected to an update setting
`deletedAt`, and reads transparently filtered to exclude soft-deleted rows
— both via `PrismaService`'s Client Extension. You don't need to do
anything to get this behavior; you also can't opt out of it per-query
except by explicitly filtering on `deletedAt` yourself (which the read
filter treats as intentional and leaves alone).

## Tests

Prefer real behavior over asserting a mock was called wherever practical —
see `rls-context.service.spec.ts`'s concurrent-context isolation test or
`results.service.spec.ts`'s advisory-lock ordering tests for the standard
this codebase holds itself to: proving the mechanism actually does the
thing, not just that a function was invoked. If you add a new
`FakeDecimal`-style test double, make sure every arithmetic method
consistently unwraps a same-type argument (`n instanceof FakeDecimal ? n.value : n`)
— an inconsistent one silently produces wrong results via JavaScript's
default string-coercion behavior rather than throwing, which is exactly
the kind of bug that stays invisible until the exact wrong input is used
at the exact wrong argument position.
