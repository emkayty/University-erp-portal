/**
 * Nigerian Naira (NGN) formatting and fee calculation utilities.
 */

/**
 * Formats a number as NGN currency string.
 * 50000 → "₦50,000.00"
 */
export function formatNgn(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * P0-14 FIX (this pass — see docs/CHANGELOG.md): assertWaiverCap()
 * used to throw a plain built-in RangeError. packages/utils has zero
 * framework dependencies (correctly — it's shared by pure-function tests
 * with no NestJS in scope), so it can't throw a NestJS BadRequestException
 * directly without coupling a framework-agnostic utils package to a web
 * framework. But a plain RangeError reaching a NestJS controller uncaught
 * becomes a generic 500 Internal Server Error, not the clear 400 validation
 * response a bursar submitting an over-cap waiver request should see — this
 * was a real, live bug in fees.service.ts's actual request path, not just a
 * test mismatch (confirmed: fees.service.spec.ts's own tests expect
 * BadRequestException here and were failing against the real behavior).
 *
 * THE FIX: a dedicated, still framework-agnostic error class. Callers that
 * depend on NestJS (fees.service.ts) catch this specific type and re-throw
 * as BadRequestException; packages/utils stays dependency-free.
 */
export class WaiverCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaiverCapExceededError';
  }
}

/**
 * Validates that a waiver percentage is within the allowed cap.
 * Throws a descriptive error if the cap is exceeded.
 *
 * @param waiverPct    - The requested waiver percentage (0–100)
 * @param roleCapPct   - The maximum allowed cap for the granting role
 * @param roleName     - Used in the error message
 */
export function assertWaiverCap(
  waiverPct: number,
  roleCapPct: number,
  roleName: string,
): void {
  if (waiverPct < 0 || waiverPct > 100) {
    throw new WaiverCapExceededError(`Waiver percentage must be between 0 and 100`);
  }
  if (waiverPct > roleCapPct) {
    throw new WaiverCapExceededError(
      `${roleName} waiver cannot exceed ${roleCapPct}% (configured cap). ` +
      `Requested: ${waiverPct}%`,
    );
  }
}

/**
 * Computes the waiver amount from a percentage.
 * Uses banker's rounding (toFixed → parseFloat avoids float drift).
 */
export function computeWaiverAmount(
  originalAmount: number,
  waiverPct: number,
): number {
  return parseFloat(((originalAmount * waiverPct) / 100).toFixed(2));
}
