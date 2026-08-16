import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '@uniportal/types';

/**
 * Deep-audit fix (Aug 2026). Ten routes across fees, payments, exams,
 * results, and students controllers self-scope a STUDENT caller to their
 * own record with a `u.role === 'STUDENT' ? u.sub : id` pattern — but
 * u.sub is the User.id, and every one of those routes queries by
 * Student.id, a separately-generated UUID linked only via
 * Student.userId. Passing u.sub through as if it were a Student.id meant
 * every student's "my results" / "my transcript" / "my fees" / "my exam
 * timetable" / "my registered courses" / "my academic history" request
 * either 404'd or came back empty. See docs/CHANGELOG.md —
 * found during the fix pass, not the original audit.
 *
 * u.studentId is resolved and cached once per (Redis, 1hr TTL) request by
 * JwtStrategy.validate() for STUDENT-role callers — see that file. This
 * helper is the one place that reads it, so the resolution and the error
 * behaviour for a STUDENT token with no linked Student row stay
 * consistent everywhere it's used, rather than tolerating ten slightly
 * different inline implementations.
 *
 * @param user     The authenticated caller.
 * @param paramId  The :id/:studentId route param — used as-is for any
 *                 non-STUDENT caller (staff/registrar/etc. acting on a
 *                 specific student).
 */
export function resolveSelfOrTargetStudentId(user: JwtPayload, paramId: string): string {
  if (user.role !== 'STUDENT') return paramId;

  if (!user.studentId) {
    // A STUDENT-role token with no linked Student row — e.g. account
    // provisioned before matriculation completed. Fail clearly rather
    // than silently querying with `undefined` and returning an
    // unhelpful empty result or 404.
    throw new ForbiddenException({
      code: 'NO_STUDENT_RECORD',
      message: 'No student record is linked to this account',
    });
  }
  return user.studentId;
}
