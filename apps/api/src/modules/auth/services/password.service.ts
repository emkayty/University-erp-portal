import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { createHash, randomBytes, randomInt } from 'crypto';

import { REDIS_CLIENT } from '../../../common/redis/redis.module';

const OTP_KEY = (email: string) => `otp:password-reset:${email.toLowerCase()}`;
const OTP_LOCK_KEY = (email: string) => `otp:password-reset-lock:${email.toLowerCase()}`;
const OTP_TTL = 600; // 10 minutes in seconds
const BCRYPT_ROUNDS = 12;
const OTP_LOCK_TTL = 5;
const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

/**
 * PasswordService — bcrypt hashing + password reset OTP management.
 *
 * OTP flow:
 *  1. POST /auth/forgot-password  → generateOtp()  → stored as bcrypt hash in Redis
 *  2. POST /auth/reset-password   → verifyOtp()    → atomically deletes key on success
 *
 * The OTP itself is a 6-digit numeric string — familiar format for Nigerian users
 * who receive it via SMS or email.
 */
@Injectable()
export class PasswordService {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── bcrypt ────────────────────────────────────────────────────────────────
  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  }

  /** Timing-safe comparison. Never use === on passwords. */
  async compare(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }

  // ── Password Reset OTP ────────────────────────────────────────────────────
  /**
   * Generates a 6-digit OTP, stores its bcrypt hash in Redis with 10-min TTL.
   * Returns the plaintext OTP for inclusion in the email/SMS.
   *
   * Rate limiting: the /auth/forgot-password endpoint is rate-limited
   * (3 requests per hour per email) — enforced at controller level via ThrottlerGuard.
   */
  async generateOtp(email: string): Promise<string> {
    // Deep-audit fix (Aug 2026): Math.random() is not a CSPRNG — every
    // other token in this class (and this module generally) correctly
    // uses crypto.randomBytes/randomInt; this OTP, which gates full
    // password-reset account takeover, was the one exception.
    // crypto.randomInt(min, max) is the direct, correct replacement for a
    // uniform random integer in a range.
    const otp  = randomInt(100_000, 1_000_000).toString();
    const hash = await bcrypt.hash(otp, 10); // lower cost for OTPs — they're short-lived
    await this.redis.setex(OTP_KEY(email), OTP_TTL, hash);
    return otp;
  }

  /**
   * Verifies a plaintext OTP against the stored hash.
   * Atomically deletes the Redis key on success (single-use enforcement).
   * Returns false if OTP is invalid, expired, or already used.
   */
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();
    const lockKey = OTP_LOCK_KEY(normalizedEmail);
    const lockValue = randomBytes(24).toString('hex');
    const acquired = await this.redis.set(lockKey, lockValue, 'EX', OTP_LOCK_TTL, 'NX');
    if (acquired !== 'OK') return false;

    let result = false;
    let failure: unknown;
    try {
      const hash = await this.redis.get(OTP_KEY(normalizedEmail));
      if (hash) {
        result = await bcrypt.compare(otp, hash);
        if (result) await this.redis.del(OTP_KEY(normalizedEmail));
      }
    } catch (error) {
      failure = error;
    }

    const scriptSha = createHash('sha1').update(RELEASE_LOCK_SCRIPT).digest('hex');
    let releaseFailure: unknown;
    try {
      const evalsha = (this.redis as unknown as { evalsha: (...args: unknown[]) => Promise<unknown> }).evalsha;
      await evalsha.call(this.redis, scriptSha, 1, lockKey, lockValue);
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOSCRIPT')) {
        try {
          const evalScript = (this.redis as unknown as { eval: (...args: unknown[]) => Promise<unknown> }).eval;
          await evalScript.call(this.redis, RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
        } catch (fallbackError) {
          releaseFailure = fallbackError;
        }
      } else {
        releaseFailure = error;
      }
    }
    if (failure) throw failure;
    if (releaseFailure) throw releaseFailure;
    return result;
  }

  /** Checks password strength. Returns error message or null if valid. */
  validatePasswordStrength(password: string): string | null {
    if (password.length < 12)              return 'Password must be at least 12 characters';
    if (!/[A-Z]/.test(password))           return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password))           return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(password))              return 'Password must contain at least one digit';
    const hasSpecialCharacter = /[!@#$%^&*()_+=;':"\\|,.<>/?-]/.test(password)
      || password.includes('[') || password.includes(']');
    if (!hasSpecialCharacter) return 'Password must contain at least one special character';
    return null;
  }
}
