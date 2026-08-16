/**
 * Nigerian academic date utilities.
 * All times are in WAT (West Africa Time = UTC+1).
 */

const WAT_OFFSET_MS = 1 * 60 * 60 * 1000; // UTC+1

/**
 * Returns the current date/time in WAT timezone.
 */
export function nowWat(): Date {
  return new Date(Date.now() + WAT_OFFSET_MS);
}

/**
 * Formats an academic year string from a given date.
 * Academic year starts in September: Sep 2024 → "2024/2025"
 */
export function toAcademicYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

/**
 * Parses an academic year string and returns the start year.
 * "2024/2025" → 2024
 */
export function parseAcademicYear(academicYear: string): number {
  const match = academicYear.match(/^(\d{4})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid academic year format: ${academicYear}`);
  const [, startStr, endStr] = match;
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (end !== start + 1)
    throw new Error(`Academic year end must be start+1: ${academicYear}`);
  return start;
}

/**
 * Checks whether a date falls within a given academic year.
 */
export function isInAcademicYear(date: Date, academicYear: string): boolean {
  const startYear = parseAcademicYear(academicYear);
  const yearStart = new Date(startYear, 8, 1);   // Sep 1
  const yearEnd   = new Date(startYear + 1, 7, 31); // Aug 31
  return date >= yearStart && date <= yearEnd;
}

/**
 * Returns the add/drop window deadline for a given semester start date.
 * Default: 2 weeks after semester start.
 */
export function getAddDropDeadline(semesterStart: Date, weeksWindow = 2): Date {
  const deadline = new Date(semesterStart);
  deadline.setDate(deadline.getDate() + weeksWindow * 7);
  return deadline;
}

/**
 * Nigerian phone number normalisation.
 * Accepts: 08012345678, +2348012345678, 2348012345678
 * Returns: 08012345678 (local format)
 */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13)
    return '0' + digits.slice(3);
  if (digits.startsWith('0') && digits.length === 11)
    return digits;
  throw new Error(`Invalid Nigerian phone number: ${phone}`);
}

/**
 * FIX M1 (Critical Evaluation): Advisory lock key for department+year.
 *
 * The original code used JavaScript string concatenation before sending to SQL:
 *   hashtext(${departmentCode + admissionYear})
 * This means "CSC" + "24" = "CS" + "C24" = "CSC24" — identical strings,
 * causing false lock collisions between different departments.
 *
 * Fix: always compute the lock key in SQL using a separator that cannot
 * appear in a department code or academic year.
 *
 * Usage in AdmissionsService.generateMatricNo() (Phase 3):
 *   await tx.$executeRaw`
 *     SELECT pg_advisory_xact_lock(${buildAdvisoryLockKey(deptCode, year)})
 *   `;
 *
 * This is a bigint computed in application code from the canonical
 * separator-joined string — equivalent to PostgreSQL's hashtext() but
 * computed ahead of the SQL call to keep the query parameterised.
 */
/**
 * Builds a deterministic bigint lock key for pg_advisory_xact_lock from any
 * number of string parts, joined with a separator that cannot appear
 * inside any of the individual parts this codebase uses (letters, digits,
 * and UUIDs — none contain '|'), so e.g. ("CSC","24") and ("CS","C24")
 * never collide (M1 fix).
 *
 * Deep-audit fix (Aug 2026): generalised from a fixed 2-argument
 * (departmentCode, admissionYear) signature — used only by
 * MatricNumberService — to variadic, so the same collision-free hashing
 * can be reused for other sequential-ID generators/locked read-then-write
 * operations (admission application numbers, trip seat booking, grant
 * expenditure totals) that have the exact same PgBouncer/advisory-lock
 * race condition matric numbers already had, fixed with this same
 * mechanism. Existing 2-argument call sites are unaffected — this is a
 * strict widening, not a breaking change.
 */
export function buildAdvisoryLockKey(...parts: string[]): bigint {
  const canonical = parts.join('|');

  // djb2 hash — fast, deterministic, no external dependency
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash) ^ (canonical.charCodeAt(i) & 0xff);
    hash = hash >>> 0; // Keep as unsigned 32-bit
  }

  // Return as BigInt for pg_advisory_xact_lock (accepts bigint)
  return BigInt(hash);
}
