/**
 * Jest global test-environment setup.
 *
 * P0-7 FIX (this pass — see docs/CHANGELOG.md): hr.service.spec.ts's
 * PII-encryption tests call the real encryptPii()/decryptPii()
 * (packages/utils/src/encryption.ts) rather than mocking them — a
 * reasonable choice, since round-tripping through the real AES-256-GCM
 * implementation is a stronger test than asserting a mock was called. But
 * getKeys() reads process.env.ENCRYPTION_KEY_HEX at call time and throws if
 * it's unset or not exactly 64 hex characters, and nothing — not
 * jest.config.ts, not a setup file, not the spec file itself — ever set it
 * for the test environment. Every test exercising real PII encryption
 * failed with "Encryption key v1 not found" before this fix, regardless of
 * environment (this is not a sandbox-specific gap).
 *
 * This key is a fixed, publicly-visible placeholder for tests only — never
 * use it, or any value checked into version control, as a real
 * ENCRYPTION_KEY_HEX. Real deployments load this from Secrets Manager (see
 * infra/README.md); nothing here should ever be treated as a credential.
 */
if (!process.env['ENCRYPTION_KEY_HEX']) {
  process.env['ENCRYPTION_KEY_HEX'] =
    '7d7af3df1655e26256a1d75c3e0ab7eeaff1da6ed3bb53ef2d73a01c2912c060';
}

// Fixed test data only; production requires NDPR_PSEUDONYM_SALT from secrets management.
if (!process.env['NDPR_PSEUDONYM_SALT']) {
  process.env['NDPR_PSEUDONYM_SALT'] = 'uniportal-test-only-ndpr-pseudonym-salt';
}

// Unit tests inject PasswordService; this prevents importing it from requiring
// an unavailable sandbox-native bcrypt binding during module resolution.
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));
