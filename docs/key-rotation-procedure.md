# PII Encryption Key Rotation Procedure

> Referenced from `packages/utils/src/encryption.ts`. This document was
> missing from the repository (a dangling reference) prior to this fix —
> see `docs/CHANGELOG.md` item P2-4.

## Background

PII columns (NIN, BVN, medical records, and other fields encrypted via
`encryptPii()`/`decryptPii()`) are stored as AES-256-GCM ciphertext in the
format `v{version}:{base64(iv)}:{base64(ciphertext)}:{base64(authTag)}`. The
version prefix exists specifically so a key can be rotated **without
downtime and without a single big-bang re-encryption migration**: records
encrypted under the old key stay readable (decrypted with the old key) while
new writes use the new key, until a background job re-encrypts everything
onto the new key at whatever pace is safe for production load.

## When to rotate

- On a routine schedule (recommended: annually, tracked as a compliance
  task alongside the NDPR audit cycle).
- Immediately, out of cycle, if the current key is suspected compromised
  (e.g., accidental exposure in a log, a departing engineer who had
  Secrets Manager access, a security incident).

## Procedure

1. **Generate the new key.** 32 random bytes, hex-encoded (64 characters):
   `openssl rand -hex 32`. Store it in Secrets Manager as
   `ENCRYPTION_KEY_HEX_V2` — never in a committed file, never in a chat
   message, never in a ticket.

2. **Deploy with both keys present.** Set `ENCRYPTION_KEY_HEX_V2` in the
   runtime environment alongside the existing `ENCRYPTION_KEY_HEX`
   (implicitly v1). At this point `getKeys()` in `encryption.ts` can decrypt
   both v1 and v2 ciphertext, but `CURRENT_KEY_VERSION` is still `1`, so
   `encryptPii()` still writes new records as v1. Deploy this change alone
   first and confirm the app is healthy before proceeding — this step is
   purely additive and safe to roll back.

3. **Flip `CURRENT_KEY_VERSION` to `2`** in `encryption.ts` and deploy.
   From this point, every new `encryptPii()` call writes v2 ciphertext.
   Existing v1 records are still transparently readable via `decryptPii()`
   (which reads the version prefix and picks the matching key), so this
   step has no user-visible effect on existing data.

4. **Run the re-encryption sweep.** A BullMQ job (see
   `apps/api/src/modules/notifications` / `common/outbox` for the queue
   registration pattern this codebase already uses — a dedicated
   `key-rotation` queue following the same shape is the intended
   implementation, not yet built as of this document) should:
   - Page through every table with an encrypted column (students' NIN/BVN,
     `medical_record`, etc.) in batches.
   - For each v1-prefixed value: `decryptPii()` with the v1 key, then
     `encryptPii()` (now producing v2) and write back.
   - Log progress and be safely resumable/idempotent (re-running it on a
     row already at v2 must be a no-op) — a partial run interrupted by a
     deploy or crash should not leave data in an inconsistent state.
   - Run during low-traffic windows and rate-limit writes to avoid
     saturating the database, given the scale of student/staff PII tables.

5. **Verify.** Query for any remaining `v1:` prefixed values across all
   encrypted columns. Do not proceed to step 6 until this is zero.

6. **Retire the old key.** Once no v1 ciphertext remains anywhere, remove
   `ENCRYPTION_KEY_HEX_V2` naming (promote it to be the only
   `ENCRYPTION_KEY_HEX`) and delete the old key from Secrets Manager.
   Keep a copy of the retired key in a secure, offline location for a
   defined retention window (recommended: 90 days) in case an
   unanticipated v1 record surfaces (e.g., from a restored backup) —
   after that window, destroy it.

## Rollback

Rolling back is safe at every step **except step 6**. If an issue is found
between steps 2–5, both keys remain present and functional, so reverting the
deploy (back to `CURRENT_KEY_VERSION = 1`) loses nothing. Once the old key
is destroyed in step 6, rollback is no longer possible — this is why step 5's
verification must be conclusive (zero remaining v1 records, not "probably
none left") before step 6 proceeds.

## Ownership

This procedure should be run by, or under direct supervision of, whoever
holds Secrets Manager access for the production environment — never as a
routine engineering task without that oversight, given the sensitivity of
the material involved.
