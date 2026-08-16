/**
 * Pure decision logic for the soft-delete Prisma Client Extension.
 *
 * P0-1 FIX (replaces the $use()-based middleware — see docs/CHANGELOG.md):
 * Prisma removed `$use()` entirely in v6.14.0, and classes can no longer
 * `extend PrismaClient` at all from that version onward — this project's
 * lockfile resolves to 6.19.3, well past both changes. The replacement is a
 * Prisma Client Extension (`$extends`), wired up in prisma.service.ts.
 *
 * The functions below are deliberately kept free of any Prisma import or
 * live client reference, so they can be unit-tested with plain objects in
 * Jest without needing a generated PrismaClient (`prisma generate` requires
 * network access to binaries.prisma.sh, which is unavailable in some CI/
 * sandbox environments — see soft-delete.util.spec.ts and
 * docs/CHANGELOG.md for why that matters here specifically).
 */

// Same model list PrismaService.SOFT_DELETE_MODELS held before this fix.
// Update this one place — buildSoftDeleteModelOverrides() in prisma.service.ts
// and the read-filter below both derive from it, so it can't drift between
// the delete-redirect and the read-filter the way two hand-maintained lists
// could.
export const SOFT_DELETE_MODELS = new Set([
  'User',           // P1
  'Applicant',      // P3
  'Student',        // P3
  'Staff',          // P6
  'LeaveRequest',   // P6
  'LibraryLoan',    // P7 — soft-deleted via deletedAt
  'RoomAllocation', // P7 — soft-deleted via deletedAt
  // P8: ResearchProject, ResearchOutput, Grant
]);

export const SOFT_DELETE_READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow',
  'findFirst', 'findFirstOrThrow',
  'findMany', 'count',
  'aggregate', 'groupBy',
]);

/** PascalCase schema model name -> camelCase Prisma Client property name. */
export function toClientPropertyName(model: string): string {
  return model.length ? model.charAt(0).toLowerCase() + model.slice(1) : model;
}

/**
 * For delete/deleteMany on a soft-delete model, returns the operation that
 * should actually run against the database instead. Returns null for every
 * other model/operation combination (including delete/deleteMany on models
 * that aren't soft-deletable, which must run as real deletes).
 */
export function softDeleteRedirectOperation(
  model: string | undefined,
  operation: string,
): 'update' | 'updateMany' | null {
  if (!model || !SOFT_DELETE_MODELS.has(model)) return null;
  if (operation === 'delete') return 'update';
  if (operation === 'deleteMany') return 'updateMany';
  return null;
}

/**
 * For read operations on a soft-delete model, returns the args object that
 * should actually be sent to the database, with `deletedAt: null` injected
 * into `where` — unless the caller already specified their own `deletedAt`
 * filter (e.g. an admin recovery tool explicitly querying deleted records),
 * in which case the caller's intent is left alone.
 *
 * Returns the exact same object reference when no change is needed, so
 * callers can use `result === args` to detect a no-op cheaply.
 */
export function applySoftDeleteReadFilter(
  model: string | undefined,
  operation: string,
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!model || !SOFT_DELETE_MODELS.has(model)) return args;
  if (!SOFT_DELETE_READ_OPS.has(operation)) return args;

  const where = ((args ?? {}) as Record<string, unknown>)['where'] as
    | Record<string, unknown>
    | undefined;

  if (where && where['deletedAt'] !== undefined) return args; // caller opted in explicitly

  return { ...(args ?? {}), where: { ...(where ?? {}), deletedAt: null } };
}
