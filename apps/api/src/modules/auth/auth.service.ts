import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, RoleName } from '@prisma/client';
import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';

import { decryptPii, encryptPii } from '@uniportal/utils';
import type { JwtPayload, RoleName as RoleNameType, StaffScopeAttribute, UserV1 } from '@uniportal/types';

import { AuditService } from '../../common/audit/audit.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { PrismaService } from '../../database/prisma.service';
import type { MfaSetupResult } from './services/mfa.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { TokenService, type TokenPair } from './services/token.service';

const MFA_TOKEN_KEY = (token: string) => `mfa:pending:${token}`;
const MFA_TOKEN_TTL = 300; // 5 minutes
const MFA_SETUP_TOKEN_KEY = (token: string) => `mfa:setup-required:${token}`;
const MFA_SETUP_SECRET_KEY = (token: string) => `mfa:setup-secret:${token}`;

export interface LoginResult {
  type: 'success';
  accessToken: string;
  refreshToken: string;
  user: UserV1;
}

export interface MfaRequiredResult {
  type: 'mfa_required';
  mfaToken: string;
  mfaTokenExpiresAt: string;
}

/**
 * AUDIT-C3 fix: InstitutionSettings.mfaMandatoryRoles existed and was
 * settable but was never read — a super_admin/bursar/vc account could
 * authenticate with password only, indefinitely, despite spec §3.4 stating
 * MFA is mandatory for exactly those roles. Returned instead of a normal
 * LoginResult when the user's role requires MFA but they haven't enrolled
 * yet — does NOT issue a session token, so login cannot silently succeed
 * without MFA for a mandated role; the client uses `setupToken` to call
 * mfa/setup + mfa/verify-setup, then logs in again.
 */
export interface MfaSetupRequiredResult {
  type: 'mfa_setup_required';
  setupToken: string;
  setupTokenExpiresAt: string;
  message: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly isProd: boolean;

  constructor(
    private readonly prisma:    PrismaService,
    private readonly tokens:    TokenService,
    private readonly mfa:       MfaService,
    private readonly passwords: PasswordService,
    private readonly audit:     AuditService,
    private readonly config:    ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.isProd = config.get('NODE_ENV') === 'production';
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(
    email:      string,
    password:   string,
    deviceInfo: { userAgent?: string; ip?: string },
  ): Promise<LoginResult | MfaRequiredResult | MfaSetupRequiredResult> {
    const user = await this.prisma.user.findUnique({
      where:   { email: email.toLowerCase() },
      include: { roles: true },
    });

    // Timing-safe: always run bcrypt to prevent username enumeration via timing
    const hash       = user?.passwordHash ?? '$2b$12$invaliddummyhashtopreventtiming';
    const passwordOk = await this.passwords.compare(password, hash);

    if (!user || !user.isActive || !passwordOk) {
      await this.audit.log({
        action: AuditAction.LOGIN, targetTable: 'users',
        metadata: { success: false, email },
      });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id }, data: { lastLoginAt: new Date() },
    });

    // AUDIT-C3 fix: enforce mfaMandatoryRoles — previously read nowhere.
    // Checked BEFORE the "already enrolled" gate below: a user whose role
    // requires MFA but who hasn't enrolled yet must not get a normal
    // session, full stop, regardless of what mfaEnabled currently says.
    const activeRoles = user ? this.filterActiveRoles(user.roles) : [];
    const userRoleNames = activeRoles.map((r) => r.roleName);
    const settings = await this.prisma.institutionSettings.findFirst({
      select: { mfaMandatoryRoles: true },
    });
    const mfaMandatoryRoles = settings?.mfaMandatoryRoles ?? [];
    const mfaIsMandatoryForThisUser = userRoleNames.some((r) => mfaMandatoryRoles.includes(r));

    if (mfaIsMandatoryForThisUser && !user.mfaEnabled) {
      const setupToken = uuid();
      const expiresAt   = new Date(Date.now() + MFA_TOKEN_TTL * 1000).toISOString();
      await this.redis.setex(MFA_SETUP_TOKEN_KEY(setupToken), MFA_TOKEN_TTL, user.id);
      await this.audit.log({
        action: AuditAction.LOGIN, targetTable: 'users', targetId: user.id,
        metadata: { success: false, reason: 'mfa_setup_required_for_role', roles: userRoleNames },
      }, user.id); // P0-16 fix — see completeLogin's comment
      return {
        type: 'mfa_setup_required',
        setupToken, setupTokenExpiresAt: expiresAt,
        message: `Multi-factor authentication is mandatory for your role and is not yet set up. Complete setup to continue.`,
      };
    }

    // MFA gate
    if (user.mfaEnabled) {
      const mfaToken  = uuid();
      const expiresAt = new Date(Date.now() + MFA_TOKEN_TTL * 1000).toISOString();
      await this.redis.setex(MFA_TOKEN_KEY(mfaToken), MFA_TOKEN_TTL, user.id);
      return { type: 'mfa_required', mfaToken, mfaTokenExpiresAt: expiresAt };
    }

    return this.completeLogin(user.id, user.roles, false, deviceInfo);
  }

  // ── MFA verify ─────────────────────────────────────────────────────────────
  async verifyMfa(
    mfaToken:     string,
    totpCode:     string,
    deviceInfo:   { userAgent?: string; ip?: string },
    isBackupCode  = false,
  ): Promise<LoginResult> {
    const userId = await this.redis.get(MFA_TOKEN_KEY(mfaToken));
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_MFA_REQUIRED',
        message: 'MFA session expired. Please log in again.',
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where:   { id: userId },
      include: { roles: true, mfaBackupCodes: true },
    });

    if (isBackupCode) {
      const matchedId = await this.mfa.verifyBackupCode(totpCode, user.mfaBackupCodes);
      if (!matchedId) {
        throw new UnauthorizedException({
          code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid backup code',
        });
      }
      await this.prisma.mfaBackupCode.update({
        where: { id: matchedId }, data: { usedAt: new Date() },
      });
    } else {
      // FIX C3: Decrypt the stored TOTP secret before verification.
      // mfaSecret is stored as AES-256-GCM ciphertext (v1:iv:ciphertext:tag).
      // Passing the ciphertext directly to otplib always fails — the HMAC
      // is computed against the raw Base32 secret, not the encrypted string.
      if (!user.mfaSecret) {
        throw new UnauthorizedException({
          code: 'AUTH_MFA_REQUIRED', message: 'MFA not configured for this account',
        });
      }

      let plainSecret: string;
      try {
        plainSecret = decryptPii(user.mfaSecret);
      } catch {
        this.logger.error(`Failed to decrypt MFA secret for user ${user.id}`);
        throw new UnauthorizedException({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'MFA configuration error. Contact IT support.',
        });
      }

      if (!this.mfa.verifyTotp(totpCode, plainSecret)) {
        throw new UnauthorizedException({
          code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired TOTP code',
        });
      }
    }

    await this.redis.del(MFA_TOKEN_KEY(mfaToken));
    return this.completeLogin(user.id, user.roles, true, deviceInfo);
  }

  // ── MFA setup ──────────────────────────────────────────────────────────────
  async setupMfa(userId: string): Promise<Omit<MfaSetupResult, 'backupCodes' | 'backupHashes'>> {
    const user     = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId }, select: { email: true },
    });
    const instName = await this.getInstitutionName();
    const result   = await this.mfa.generateSetup(user.email, instName);
    return { secret: result.secret, qrCodeUri: result.qrCodeUri };
  }

  async setupMandatoryMfa(setupToken: string): Promise<Omit<MfaSetupResult, 'backupCodes' | 'backupHashes'>> {
    const userId = await this.resolveMfaSetupToken(setupToken);
    const result = await this.setupMfa(userId);
    await this.redis.setex(
      MFA_SETUP_SECRET_KEY(setupToken), MFA_TOKEN_TTL,
      JSON.stringify({ userId, secret: result.secret }),
    );
    return result;
  }

  async confirmMfaSetup(
    userId:   string,
    totpCode: string,
    secret:   string,
  ): Promise<{ backupCodes: string[] }> {
    // Verify the TOTP code against the plaintext secret BEFORE encrypting
    if (!this.mfa.verifyTotp(totpCode, secret)) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid TOTP code — MFA setup not confirmed',
      });
    }

    const { codes, hashes } = await this.mfa.generateBackupCodes();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, mfaEnabled: false },
        data:  { mfaSecret: encryptPii(secret), mfaEnabled: true },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException({
          code: 'AUTH_MFA_ALREADY_CONFIGURED',
          message: 'MFA setup has already been completed for this account.',
        });
      }
      await tx.mfaBackupCode.createMany({
        data: hashes.map((h) => ({ userId, codeHash: h })),
      });
    });

    await this.audit.log({
      action: AuditAction.MFA_ENABLED, targetTable: 'users', targetId: userId,
    }, userId); // P0-16 fix — see completeLogin's comment

    return { backupCodes: codes };
  }

  /**
   * AUDIT-C3 fix support: resolves the setupToken issued by login() when a
   * user's role requires MFA but they haven't enrolled yet. Single-use,
   * same TTL/shape as the existing mfaToken pattern (MFA_TOKEN_KEY) —
   * deliberately mirrors it rather than introducing a new convention.
   */
  async resolveMfaSetupToken(setupToken: string): Promise<string> {
    const userId = await this.redis.get(MFA_SETUP_TOKEN_KEY(setupToken));
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'MFA setup token is invalid or has expired — please log in again',
      });
    }
    return userId;
  }

  /** Consumes the setup token atomically after MFA setup is confirmed, then issues a real session. */
  async completeLoginAfterMandatorySetup(setupToken: string, deviceInfo: { userAgent?: string; ip?: string }): Promise<LoginResult> {
    const userId = await this.resolveMfaSetupToken(setupToken);
    const consumed = await this.redis.getdel(MFA_SETUP_TOKEN_KEY(setupToken));
    if (!consumed || consumed !== userId) {
      throw new UnauthorizedException({ code: 'AUTH_TOKEN_EXPIRED', message: 'MFA setup token is invalid or has already been used.' });
    }
    await this.redis.del(MFA_SETUP_SECRET_KEY(setupToken));
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
    return this.completeLogin(user.id, user.roles, true, deviceInfo);
  }

  async resolveMandatoryMfaSecret(setupToken: string): Promise<{ userId: string; secret: string }> {
    const userId = await this.resolveMfaSetupToken(setupToken);
    const raw = await this.redis.get(MFA_SETUP_SECRET_KEY(setupToken));
    if (!raw) throw new UnauthorizedException({ code: 'AUTH_MFA_SETUP_REQUIRED', message: 'Start MFA setup again before confirming it.' });
    const stored = JSON.parse(raw) as { userId: string; secret: string };
    if (stored.userId !== userId) throw new UnauthorizedException({ code: 'AUTH_MFA_SETUP_REQUIRED', message: 'MFA setup context is invalid.' });
    return stored;
  }

  async disableMfa(userId: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId }, data: { mfaSecret: null, mfaEnabled: false },
      });
      await tx.mfaBackupCode.deleteMany({ where: { userId } });
    });
    await this.tokens.revokeAllUserSessions(userId);
    await this.audit.log({
      action: AuditAction.MFA_DISABLED, targetTable: 'users', targetId: userId,
    }, actorId);
  }

  // ── Token refresh ──────────────────────────────────────────────────────────
  async refresh(
    rawRefreshToken: string,
    deviceInfo:      { userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: UserV1 }> {
    const result = await this.tokens.rotateRefreshToken(rawRefreshToken, deviceInfo);
    if (!result) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_EXPIRED', message: 'Session expired. Please log in again.',
      });
    }

    const user       = await this.prisma.user.findUniqueOrThrow({
      where: { id: result.userId }, include: { roles: true, student: { select: { id: true } } },
    });
    const newRefresh = await this.tokens.issueRefreshToken(user.id, {
      sessionId: uuid(), deviceInfo,
    });
    const payload    = await this.buildJwtPayload(user.id, user.roles, user.mfaEnabled);
    const newAccess  = this.tokens.generateAccessToken(payload);

    return {
      accessToken:  newAccess,
      refreshToken: newRefresh,
      user:         this.mapUserToDto(user, user.roles, user.student?.id),
    };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(rawRefreshToken: string | undefined, userId: string): Promise<void> {
    if (rawRefreshToken) await this.tokens.revokeRefreshToken(rawRefreshToken);
    await this.audit.log({ action: AuditAction.LOGOUT, targetTable: 'users', targetId: userId }, userId); // P0-16 fix
  }

  async revokeAllSessions(userId: string, actorId: string): Promise<{ revokedCount: number }> {
    const count = await this.tokens.revokeAllUserSessions(userId);
    await this.audit.log({
      action: AuditAction.LOGOUT, targetTable: 'users', targetId: userId,
      metadata: { revokedAll: true, count },
    }, actorId);
    return { revokedCount: count };
  }

  // ── Password ───────────────────────────────────────────────────────────────
  async forgotPassword(email: string): Promise<{ otp: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }, select: { id: true },
    });
    if (!user) return null; // Prevent email enumeration
    const otp = await this.passwords.generateOtp(email.toLowerCase());
    return { otp };
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const valid = await this.passwords.verifyOtp(email.toLowerCase(), otp);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired OTP',
      });
    }

    const strength = this.passwords.validatePasswordStrength(newPassword);
    if (strength) {
      throw new UnauthorizedException({ code: 'VALIDATION_ERROR', message: strength });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
    });
    const hash = await this.passwords.hash(newPassword);

    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    await this.tokens.revokeAllUserSessions(user.id);
    await this.audit.log({
      action: AuditAction.PASSWORD_CHANGE, targetTable: 'users', targetId: user.id,
    }, user.id); // P0-16 fix — see completeLogin's comment
  }

  async changePassword(
    userId:          string,
    currentPassword: string,
    newPassword:     string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok   = await this.passwords.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS', message: 'Current password is incorrect',
      });
    }

    const strength = this.passwords.validatePasswordStrength(newPassword);
    if (strength) {
      throw new UnauthorizedException({ code: 'VALIDATION_ERROR', message: strength });
    }

    const hash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    await this.tokens.revokeAllUserSessions(userId);
    await this.audit.log({
      action: AuditAction.PASSWORD_CHANGE, targetTable: 'users', targetId: userId,
    }, userId); // P0-16 fix — see completeLogin's comment
  }

  async getMe(userId: string): Promise<UserV1> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId }, include: { roles: true, student: { select: { id: true } } },
    });
    return this.mapUserToDto(user, user.roles, user.student?.id);
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private async completeLogin(
    userId:      string,
    roles:       Array<{ roleName: RoleName; staffScope: unknown; grantedAt: Date; effectiveFrom?: Date; effectiveUntil?: Date | null; revokedAt?: Date | null; grantReason?: string | null }>,
    mfaVerified: boolean,
    deviceInfo:  { userAgent?: string; ip?: string },
  ): Promise<LoginResult> {
    const user      = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId }, include: { roles: true, student: { select: { id: true } } },
    });
    const activeRoles = this.filterActiveRoles(roles);
    if (!activeRoles.length) throw new UnauthorizedException('No active authorization role is assigned to this account');
    const payload   = await this.buildJwtPayload(userId, activeRoles, mfaVerified);
    const access    = this.tokens.generateAccessToken(payload);
    const sessionId = uuid();
    const refresh   = await this.tokens.issueRefreshToken(userId, { sessionId, deviceInfo });

    // P0-16 FIX (this pass — see docs/CHANGELOG.md): this and 5
    // sibling audit.log() calls below (MFA setup/enable, logout, password
    // reset/change) omitted the actorId argument even though the natural
    // actor (the user themselves) was already in scope. AuditService.log()
    // falls back to the REQUEST-scoped user when no override is passed —
    // which doesn't exist yet during login/password-reset flows (there's
    // no authenticated session), so these specific, security-sensitive
    // audit rows were being written with no attributable actor at all,
    // undermining the audit trail for exactly the events it matters most
    // for. Two sibling call sites in this same file (MFA_DISABLED,
    // revokeAllSessions' LOGOUT) already correctly pass an explicit
    // actorId — this brings the rest in line with that established,
    // correct precedent.
    await this.audit.log({
      action: AuditAction.LOGIN, targetTable: 'users', targetId: userId,
      metadata: { success: true },
    }, userId);

    return {
      type:         'success',
      accessToken:  access,
      refreshToken: refresh,
      user:         this.mapUserToDto(user, user.roles, user.student?.id),
    };
  }

  private async buildJwtPayload(
    userId:      string,
    roles:       Array<{ roleName: RoleName; staffScope: unknown }>,
    mfaVerified: boolean,
  ): Promise<Omit<JwtPayload, 'iat' | 'exp' | 'jti'>> {
    const roleNames = roles.map((r) => r.roleName);
    const primaryRole = this.resolvePrimaryRole(roleNames);
    const staffRole   = roles.find((r) => r.roleName === RoleName.STAFF);
    const effectiveScopes = roles.flatMap((role) => {
      const scope = role.staffScope as StaffScopeAttribute | null;
      return scope?.scopes ?? [];
    });

    // M-auth-1 fix: fetch institutionId from InstitutionSettings instead of hardcoding.
    // The hardcoded placeholder UUID '00000000-0000-0000-0000-000000000001' blocked
    // multi-tenant readiness. The settings singleton is cached by SettingsService.
    const settings = await this.prisma.institutionSettings.findFirst({ select: { id: true } });
    const institutionId = settings?.id ?? '00000000-0000-0000-0000-000000000001';

    return {
      sub:           userId,
      role:          primaryRole as RoleNameType,
      roles:         roleNames as RoleNameType[],
      staffScope:    (staffRole?.staffScope as StaffScopeAttribute | null) ?? null,
      effectiveScopes,
      institutionId,
      mfaVerified,
    };
  }

  private filterActiveRoles<T extends { effectiveFrom?: Date; effectiveUntil?: Date | null; revokedAt?: Date | null }>(roles: T[], now = new Date()): T[] {
    return roles.filter((role) =>
      !role.revokedAt &&
      (!role.effectiveFrom || role.effectiveFrom <= now) &&
      (!role.effectiveUntil || role.effectiveUntil > now),
    );
  }

  private resolvePrimaryRole(roles: RoleName[]): RoleName {
    const hierarchy: RoleName[] = [
      RoleName.SUPER_ADMIN, RoleName.VC, RoleName.REGISTRAR, RoleName.BURSAR,
      RoleName.HR_MANAGER, RoleName.DEAN, RoleName.HOD,
      RoleName.STAFF, RoleName.SUPPORT_STAFF, RoleName.STUDENT,
    ];
    for (const r of hierarchy) { if (roles.includes(r)) return r; }
    return RoleName.STUDENT;
  }

  mapUserToDto(
    user:  { id: string; email: string; phone: string | null; isActive: boolean; mfaEnabled: boolean; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date },
    roles: Array<{ roleName: RoleName; staffScope: unknown; grantedAt: Date; effectiveFrom?: Date; effectiveUntil?: Date | null; revokedAt?: Date | null; grantReason?: string | null }>,
    studentId?: string,
  ): UserV1 {
    const activeRoles = this.filterActiveRoles(roles);
    const primaryRole = this.resolvePrimaryRole(activeRoles.map((r) => r.roleName));
    const staffRole   = activeRoles.find((r) => r.roleName === RoleName.STAFF);
    return {
      id:          user.id,
      email:       user.email,
      ...(studentId ? { studentId } : {}),
      phone:       user.phone,
      isActive:    user.isActive,
      mfaEnabled:  user.mfaEnabled,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt:   user.createdAt.toISOString(),
      updatedAt:   user.updatedAt.toISOString(),
      roles:       roles.map((r) => ({
        roleName:  r.roleName as RoleNameType,
        staffScope: (r.staffScope as StaffScopeAttribute | null) ?? null,
        grantedAt: r.grantedAt.toISOString(),
        ...(r.effectiveFrom ? { effectiveFrom: r.effectiveFrom.toISOString() } : {}),
        ...(r.effectiveUntil !== undefined ? { effectiveUntil: r.effectiveUntil?.toISOString() ?? null } : {}),
        ...(r.revokedAt !== undefined ? { revokedAt: r.revokedAt?.toISOString() ?? null } : {}),
        ...(r.grantReason !== undefined ? { grantReason: r.grantReason ?? null } : {}),
      })),
      primaryRole: primaryRole as RoleNameType,
      staffScope:  (staffRole?.staffScope as StaffScopeAttribute | null) ?? null,
    };
  }

  private async getInstitutionName(): Promise<string> {
    const s = await this.prisma.institutionSettings.findFirst({
      select: { institutionName: true },
    });
    return s?.institutionName ?? 'UniPortal';
  }
}
