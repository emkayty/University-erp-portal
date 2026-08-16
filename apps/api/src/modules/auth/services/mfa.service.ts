import { randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';

export interface MfaSetupResult {
  secret:    string;           // Base32 TOTP secret (store encrypted)
  qrCodeUri: string;           // otpauth:// URI for QR code rendering
  backupCodes: string[];       // 10 plaintext codes — shown ONCE to user
  backupHashes: string[];      // bcrypt hashes of backup codes — store in DB
}

/**
 * MfaService — TOTP lifecycle and backup code management.
 *
 * TOTP standard: RFC 6238 (30-second window, SHA-1, 6 digits)
 * Library: otplib — widely used, well-maintained, RFC-compliant
 *
 * Backup codes: 10 × 8-character alphanumeric codes
 *   - Shown ONCE to user at setup time
 *   - Stored as bcrypt hashes (cost 10) in mfa_backup_codes table
 *   - Single-use: marked usedAt on consumption
 *   - User can generate a new set (invalidates all existing codes)
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly BACKUP_COST = 10;
  private readonly BACKUP_COUNT = 10;
  private readonly BACKUP_LENGTH = 8;
  private readonly WINDOW = 1; // Allow 1 step before/after (±30s tolerance for clock skew)

  constructor() {
    authenticator.options = {
      window:    this.WINDOW,
      digits:    6,
      algorithm: 'sha1' as never,
      step:      30,
    };
  }

  /**
   * Generates a new TOTP secret and backup codes for a user.
   * Call this on POST /auth/mfa/setup.
   * The user must call verifySetup() with a valid code before the secret is stored.
   */
  async generateSetup(
    userEmail: string,
    institutionName: string,
  ): Promise<MfaSetupResult> {
    const secret    = authenticator.generateSecret(20); // 20 bytes = 160-bit secret
    const qrCodeUri = authenticator.keyuri(userEmail, institutionName, secret);

    const { codes, hashes } = await this.generateBackupCodes();

    return {
      secret,
      qrCodeUri,
      backupCodes:  codes,
      backupHashes: hashes,
    };
  }

  /**
   * Verifies a TOTP code against a stored secret.
   * Returns true if valid (within ±WINDOW × 30s window).
   */
  verifyTotp(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
    } catch {
      return false;
    }
  }

  /**
   * Verifies a backup code against stored hashes.
   * Returns the index of the matching hash (caller marks it used), or -1 if invalid.
   */
  async verifyBackupCode(
    plainCode: string,
    storedHashes: Array<{ id: string; codeHash: string; usedAt: Date | null }>,
  ): Promise<string | null> {
    const unusedHashes = storedHashes.filter((h) => h.usedAt === null);

    for (const entry of unusedHashes) {
      const matches = await bcrypt.compare(
        plainCode.trim().toUpperCase(),
        entry.codeHash,
      );
      if (matches) return entry.id;
    }
    return null;
  }

  /** Generates N fresh backup codes and their bcrypt hashes. */
  async generateBackupCodes(): Promise<{ codes: string[]; hashes: string[] }> {
    const codes: string[]  = [];
    const hashes: string[] = [];

    for (let i = 0; i < this.BACKUP_COUNT; i++) {
      const code = randomBytes(Math.ceil(this.BACKUP_LENGTH / 2))
        .toString('hex')
        .toUpperCase()
        .slice(0, this.BACKUP_LENGTH);
      const hash = await bcrypt.hash(code, this.BACKUP_COST);
      codes.push(code);
      hashes.push(hash);
    }

    return { codes, hashes };
  }
}
