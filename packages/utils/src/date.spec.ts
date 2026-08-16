import { buildAdvisoryLockKey } from './date';

describe('buildAdvisoryLockKey — generalised to variadic parts (deep-audit fix, Aug 2026)', () => {
  it('is backward compatible with the original 2-argument (departmentCode, admissionYear) call shape', () => {
    const key = buildAdvisoryLockKey('CSC', '2025');
    expect(typeof key).toBe('bigint');
  });

  it('does not collide across a separator boundary — "CSC"+"24" vs "CS"+"C24" (M1 regression check)', () => {
    const a = buildAdvisoryLockKey('CSC', '24');
    const b = buildAdvisoryLockKey('CS', 'C24');
    expect(a).not.toBe(b);
  });

  it('supports 1 part (e.g. a single trip/grant ID) and 3+ parts (e.g. entity type + id + sub-scope)', () => {
    const one = buildAdvisoryLockKey('trip-abc-123');
    const three = buildAdvisoryLockKey('admission-cycle', '2026-1', 'application-no');
    expect(typeof one).toBe('bigint');
    expect(typeof three).toBe('bigint');
  });

  it('is deterministic — same parts always produce the same key', () => {
    expect(buildAdvisoryLockKey('grant', 'g-001')).toBe(buildAdvisoryLockKey('grant', 'g-001'));
  });

  it('produces different keys for different entities, so locks on unrelated rows never contend', () => {
    expect(buildAdvisoryLockKey('trip', 'trip-1')).not.toBe(buildAdvisoryLockKey('trip', 'trip-2'));
  });
});
