import { maskPiiFields, pseudonymiseForErasure } from './encryption';

describe('maskPiiFields — field-name coverage (deep-audit fix, Aug 2026)', () => {
  it('masks the actual MedicalRecord/Prescription field names, not the old mismatched ones', () => {
    const masked = maskPiiFields({
      treatmentNotes: 'plaintext treatment detail',
      prescriptionNotes: 'plaintext prescription detail',
      dosageInstructions: 'plaintext dosage detail',
      diagnosis: 'plaintext diagnosis',
    });
    expect(masked.treatmentNotes).toBe('[ENCRYPTED]');
    expect(masked.prescriptionNotes).toBe('[ENCRYPTED]');
    expect(masked.dosageInstructions).toBe('[ENCRYPTED]');
    expect(masked.diagnosis).toBe('[ENCRYPTED]');
  });

  it('masks Patient.allergies and Patient.chronicConditions, previously uncovered under any name', () => {
    const masked = maskPiiFields({
      allergies: 'penicillin',
      chronicConditions: 'asthma',
      bloodGroup: 'O+', // not PII-audit-sensitive — should pass through unchanged
    });
    expect(masked.allergies).toBe('[ENCRYPTED]');
    expect(masked.chronicConditions).toBe('[ENCRYPTED]');
    expect(masked.bloodGroup).toBe('O+');
  });

  it('no longer masks the old, incorrect field names that never matched real columns', () => {
    // 'treatment', 'medication', 'prescription' were the previous (wrong)
    // entries. They should NOT be treated as PII fields now, since no real
    // column is named exactly that — leaving them masked would just hide a
    // future accidental field-name collision rather than catching one.
    const passthrough = maskPiiFields({ treatment: 'x', medication: 'y', prescription: 'z' });
    expect(passthrough).toEqual({ treatment: 'x', medication: 'y', prescription: 'z' });
  });
});

describe('pseudonymiseForErasure — fails closed without a configured salt (deep-audit fix, Aug 2026)', () => {
  const ORIGINAL_SALT = process.env.NDPR_PSEUDONYM_SALT;
  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env.NDPR_PSEUDONYM_SALT;
    else process.env.NDPR_PSEUDONYM_SALT = ORIGINAL_SALT;
  });

  it('throws if NDPR_PSEUDONYM_SALT is not set, rather than falling back to a hardcoded default', () => {
    delete process.env.NDPR_PSEUDONYM_SALT;
    expect(() => pseudonymiseForErasure('user-123', 'email')).toThrow(/NDPR_PSEUDONYM_SALT is not set/);
  });

  it('produces a stable, deterministic pseudonym once a salt is configured', () => {
    process.env.NDPR_PSEUDONYM_SALT = 'test-salt-do-not-use-in-prod';
    const first  = pseudonymiseForErasure('user-123', 'email');
    const second = pseudonymiseForErasure('user-123', 'email');
    expect(first).toBe(second);
    expect(first).toMatch(/^erased-[0-9a-f]{16}$/);
  });

  it('produces a different pseudonym for a different configured salt (proves the old hardcoded default is no longer reachable)', () => {
    process.env.NDPR_PSEUDONYM_SALT = 'salt-one';
    const withSaltOne = pseudonymiseForErasure('user-123', 'email');
    process.env.NDPR_PSEUDONYM_SALT = 'salt-two';
    const withSaltTwo = pseudonymiseForErasure('user-123', 'email');
    expect(withSaltOne).not.toBe(withSaltTwo);
  });
});
