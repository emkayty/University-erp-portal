import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * AES-256-GCM encryption for PII columns (NIN, BVN, medical records).
 *
 * STORAGE FORMAT: v{version}:{base64(iv)}:{base64(ciphertext)}:{base64(authTag)}
 *
 * FIX H1 (Critical Evaluation): The format includes a key version prefix.
 * Without this, rotating the encryption key requires full-table re-encryption
 * with downtime. The version byte lets us decrypt old records with the old key
 * while encrypting new records with the new key — true zero-downtime rotation.
 *
 * KEY ROTATION PROCEDURE (when ENCRYPTION_KEY_HEX must change):
 *  1. Add new key as ENCRYPTION_KEY_HEX_V2 in Secrets Manager
 *  2. Deploy with both keys loaded (ENCRYPTION_KEY_V1 = old, ENCRYPTION_KEY_V2 = new)
 *  3. Update CURRENT_KEY_VERSION to 2
 *  4. Run BullMQ re-encryption job: reads v1 records, decrypts with v1 key, re-encrypts with v2 key
 *  5. Once all records are v2, remove v1 key
 *
 * See: docs/key-rotation-procedure.md
 */

const ALGORITHM   = 'aes-256-gcm' as const;
const IV_LENGTH   = 12;  // 96-bit IV — GCM standard
const TAG_LENGTH  = 16;  // 128-bit auth tag — maximum for GCM

/** Current key version — bump when rotating encryption keys */
const CURRENT_KEY_VERSION = 1;

interface KeyStore {
  [version: number]: Buffer;
}

function getKeys(): KeyStore {
  const store: KeyStore = {};

  const v1Hex = process.env['ENCRYPTION_KEY_HEX'];
  if (v1Hex && v1Hex.length === 64) {
    store[1] = Buffer.from(v1Hex, 'hex');
  }

  // During key rotation, load v2 from a separate env var:
  const v2Hex = process.env['ENCRYPTION_KEY_HEX_V2'];
  if (v2Hex && v2Hex.length === 64) {
    store[2] = Buffer.from(v2Hex, 'hex');
  }

  if (!store[CURRENT_KEY_VERSION]) {
    throw new Error(
      `Encryption key v${CURRENT_KEY_VERSION} not found. ` +
      `Set ENCRYPTION_KEY_HEX to a 64-character hex string.`,
    );
  }

  return store;
}

/**
 * Encrypts plaintext using the current key version.
 * Output: "v1:base64(iv):base64(ciphertext):base64(authTag)"
 */
export function encryptPii(plaintext: string): string {
  const keys = getKeys();
  const key  = keys[CURRENT_KEY_VERSION];
  const iv   = randomBytes(IV_LENGTH);

  const cipher    = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  return [
    `v${CURRENT_KEY_VERSION}`,
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

/**
 * Decrypts ciphertext. Automatically uses the correct key version from the prefix.
 * Supports decrypting records encrypted by any previous key version.
 */
export function decryptPii(ciphertext: string): string {
  const parts = ciphertext.split(':');

  if (parts.length !== 4) {
    throw new Error(
      `Invalid ciphertext format. Expected "v{n}:iv:ciphertext:tag", got ${parts.length} parts. ` +
      `Legacy data (without version prefix) must be migrated before decryption.`,
    );
  }

  const [versionStr, ivB64, encryptedB64, tagB64] = parts as [string, string, string, string];

  const version = parseInt(versionStr.replace('v', ''), 10);
  if (isNaN(version)) {
    throw new Error(`Invalid key version prefix: ${versionStr}`);
  }

  const keys = getKeys();
  const key  = keys[version];
  if (!key) {
    throw new Error(
      `Encryption key v${version} not available. ` +
      `During key rotation, ensure old key is still loaded as ENCRYPTION_KEY_HEX_V${version}.`,
    );
  }

  const iv        = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const authTag   = Buffer.from(tagB64, 'base64');

  const decipher  = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns the key version of an existing ciphertext without decrypting.
 * Used by the re-encryption migration job to find records needing rotation.
 */
export function getCiphertextKeyVersion(ciphertext: string): number {
  const vPart = ciphertext.split(':')[0] ?? '';
  const v = parseInt(vPart.replace('v', ''), 10);
  return isNaN(v) ? -1 : v;
}

/**
 * Returns true if the ciphertext was encrypted with the current key version.
 * Used by the re-encryption job to skip records that are already up to date.
 */
export function isCurrentKeyVersion(ciphertext: string): boolean {
  return getCiphertextKeyVersion(ciphertext) === CURRENT_KEY_VERSION;
}

/**
 * Masks a PII value for display or audit logs.
 * "12345678901" (BVN) → "1234*****01"
 */
export function maskPii(value: string, visibleStart = 4, visibleEnd = 4): string {
  if (value.length <= visibleStart + visibleEnd) return '*'.repeat(value.length);
  return (
    value.slice(0, visibleStart) +
    '*'.repeat(value.length - visibleStart - visibleEnd) +
    value.slice(-visibleEnd)
  );
}

const PII_AUDIT_FIELDS = new Set([
  'nin', 'bvn', 'passwordHash', 'mfaSecret', 'mfaBackupCodes',
  // Deep-audit fix (Aug 2026): the four names below were previously
  // 'diagnosis', 'treatment', 'medication', 'prescription' — none of which
  // matched the actual Prisma field names on MedicalRecord/Prescription
  // ('treatmentNotes', 'prescriptionNotes', 'dosageInstructions'; there
  // was no field literally called 'medication'). Since those columns hold
  // ciphertext by the time anything reaches the audit log, the mismatch
  // hadn't leaked plaintext there — but 'allergies' and 'chronicConditions'
  // (Patient model, stored as PLAINTEXT — see schema.prisma) were not in
  // this set under ANY name, and clinic.service.ts's updatePatient() used
  // to rely on this set alone to mask them before writing to AuditLog. See
  // docs/CHANGELOG.md finding 1.2/clinic for the full chain.
  'diagnosis', 'treatmentNotes', 'prescriptionNotes', 'dosageInstructions',
  'allergies', 'chronicConditions',
]);

/**
 * Masks PII fields in an object before writing to audit logs.
 * Values are replaced with "[ENCRYPTED]" — original data is never logged.
 */
export function maskPiiFields(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, PII_AUDIT_FIELDS.has(k) ? '[ENCRYPTED]' : v]),
  );
}

/** Timing-safe string comparison — always use for secret comparison. */
export function safeEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

// ── P10: NDPR erasure pseudonymisation (docs/CHANGELOG.md M7) ────────────
// Not reversible without the original plaintext — this is pseudonymisation
// for compliance record-keeping, not encryption. Deterministic per
// (userId, field) so the SAME user gets the SAME pseudonym everywhere an
// erasure touches, keeping cross-table/report consistency without
// retaining real PII.
//
// Deep-audit fix (Aug 2026): this previously fell back to a hardcoded,
// public, guessable default ('uniportal-ndpr-pseudonym') if
// NDPR_PSEUDONYM_SALT wasn't set — unlike getKeys() above, which correctly
// fails closed. A pseudonymisation salt baked into open-source code offers
// no real protection once the source is available (self-hosted, leaked, or
// simply an engineer with repo access), and there's no reason this should
// be less carefully guarded than the encryption key. Now lazily validated
// (same pattern as getKeys()) and throws if unset, rather than silently
// using a public value.
function getPseudonymSalt(): string {
  const salt = process.env['NDPR_PSEUDONYM_SALT'];
  if (!salt) {
    throw new Error(
      'NDPR_PSEUDONYM_SALT is not set. Pseudonymisation for erasure requires ' +
      'a real, secret salt — set NDPR_PSEUDONYM_SALT (Secrets Manager, not a ' +
      'hardcoded default) before calling pseudonymiseForErasure().',
    );
  }
  return salt;
}

export function pseudonymiseForErasure(userId: string, field: string): string {
  const hash = createHash('sha256')
    .update(`${userId}:${field}:${getPseudonymSalt()}`)
    .digest('hex')
    .slice(0, 16);
  return `erased-${hash}`;
}

/**
 * Scrubs PII out of a stored AuditLog row's oldValues/newValues at erasure
 * time. AuditLog is normally APPEND-ONLY (see AuditService doc) — this is
 * the one narrow, VC-sign-off-gated exception the spec itself carves out
 * (§8.3: "Hard deletion exception: Only DPO-approved NDPR erasure
 * requests... Requires VC sign-off and audit_log entry").
 */
export function pseudonymiseAuditPayload(
  payload: Record<string, unknown> | null | undefined,
  userId: string,
): Record<string, unknown> | null {
  if (!payload) return payload ?? null;
  return Object.fromEntries(
    Object.entries(payload).map(([k, v]) => {
      if (!PII_AUDIT_FIELDS.has(k) || typeof v !== 'string') return [k, v];
      return [k, pseudonymiseForErasure(userId, k)];
    }),
  );
}
