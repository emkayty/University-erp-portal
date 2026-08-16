import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction, RoleName } from '@prisma/client';
import { encryptPii } from '@uniportal/utils';

import { AuditService } from '../../common/audit/audit.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

// ── Shared mock factories ─────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  id:           'user-uuid-1',
  email:        'admin@uniportal.dev',
  phone:        null,
  passwordHash: '$2b$12$hashedpassword',
  isActive:     true,
  mfaEnabled:   false,
  mfaSecret:    null,
  lastLoginAt:  null,
  deletedAt:    null,
  createdAt:    new Date('2024-01-01'),
  updatedAt:    new Date('2024-01-01'),
  mfaBackupCodes: [],
  roles: [{ roleName: RoleName.SUPER_ADMIN, staffScope: null, grantedAt: new Date() }],
  ...overrides,
});

const mockPrismaUser = (overrides = {}) => ({
  findUnique:       jest.fn().mockResolvedValue(makeUser(overrides)),
  findUniqueOrThrow: jest.fn().mockResolvedValue(makeUser(overrides)),
  update:           jest.fn().mockResolvedValue(makeUser(overrides)),
  create:           jest.fn(),
  mfaBackupCode:    { update: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  institutionSettings: { findFirst: jest.fn().mockResolvedValue({ institutionName: 'Test University' }) },
  auditLog:         { create: jest.fn() },
  $transaction:     jest.fn((fn: Function) => fn({ user: { update: jest.fn() }, mfaBackupCode: { update: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() } })),
});

describe('AuthService', () => {
  let service: AuthService;
  let prismaUsers: ReturnType<typeof mockPrismaUser>;
  let tokenService: jest.Mocked<TokenService>;
  let passwordService: jest.Mocked<PasswordService>;
  let auditService: jest.Mocked<AuditService>;
  let mfaService: jest.Mocked<MfaService>;
  let redisMock: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prismaUsers = mockPrismaUser();
    redisMock   = { get: jest.fn(), setex: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService,   useValue: { user: prismaUsers, institutionSettings: prismaUsers.institutionSettings, auditLog: prismaUsers.auditLog, $transaction: prismaUsers.$transaction, mfaBackupCode: prismaUsers.mfaBackupCode } },
        { provide: TokenService,    useValue: { generateAccessToken: jest.fn().mockReturnValue('access.token.here'), issueRefreshToken: jest.fn().mockResolvedValue('raw-refresh-token'), rotateRefreshToken: jest.fn(), revokeRefreshToken: jest.fn(), revokeAllUserSessions: jest.fn().mockResolvedValue(2) } },
        { provide: PasswordService, useValue: { compare: jest.fn(), hash: jest.fn(), generateOtp: jest.fn(), verifyOtp: jest.fn(), validatePasswordStrength: jest.fn().mockReturnValue(null) } },
        { provide: MfaService,      useValue: { verifyTotp: jest.fn(), verifyBackupCode: jest.fn(), generateSetup: jest.fn(), generateBackupCodes: jest.fn() } },
        { provide: AuditService,    useValue: { log: jest.fn() } },
        { provide: ConfigService,   useValue: { get: jest.fn((key: string, def: unknown) => def) } },
        { provide: REDIS_CLIENT,    useValue: redisMock },
      ],
    }).compile();

    service         = module.get<AuthService>(AuthService);
    tokenService    = module.get(TokenService);
    passwordService = module.get(PasswordService);
    auditService    = module.get(AuditService);
    mfaService      = module.get(MfaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── login() ─────────────────────────────────────────────────────────────────
  describe('login()', () => {
    const deviceInfo = { userAgent: 'Jest', ip: '127.0.0.1' };

    it('returns access+refresh tokens on valid credentials', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(true);

      const result = await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.accessToken).toBe('access.token.here');
        expect(result.refreshToken).toBe('raw-refresh-token');
        expect(result.user.email).toBe('admin@uniportal.dev');
      }
    });

    it('throws AUTH_INVALID_CREDENTIALS on wrong password', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(false);

      await expect(service.login('admin@uniportal.dev', 'wrongpass', deviceInfo))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws AUTH_INVALID_CREDENTIALS on unknown email (timing-safe)', async () => {
      prismaUsers.findUnique.mockResolvedValue(null);
      jest.spyOn(passwordService, 'compare').mockResolvedValue(false);

      await expect(service.login('unknown@test.com', 'anypass', deviceInfo))
        .rejects.toThrow(UnauthorizedException);
      // Verify bcrypt.compare was still called (timing-safe)
      expect(passwordService.compare).toHaveBeenCalledTimes(1);
    });

    it('throws AUTH_INVALID_CREDENTIALS on inactive account', async () => {
      prismaUsers.findUnique.mockResolvedValue(makeUser({ isActive: false }));
      jest.spyOn(passwordService, 'compare').mockResolvedValue(true);

      await expect(service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo))
        .rejects.toThrow(UnauthorizedException);
    });

    it('returns mfa_required when user has MFA enabled', async () => {
      prismaUsers.findUnique.mockResolvedValue(makeUser({ mfaEnabled: true }));
      jest.spyOn(passwordService, 'compare').mockResolvedValue(true);
      redisMock.setex.mockResolvedValue('OK');

      const result = await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);

      expect(result.type).toBe('mfa_required');
      if (result.type === 'mfa_required') {
        expect(result.mfaToken).toBeDefined();
        expect(redisMock.setex).toHaveBeenCalledWith(
          expect.stringContaining('mfa:pending:'),
          300,
          makeUser().id,
        );
      }
    });

    // ── AUDIT-C3: mfaMandatoryRoles was stored but never read ──────────────
    describe('mfaMandatoryRoles enforcement', () => {
      it('returns mfa_setup_required for a mandatory-MFA role that has not enrolled', async () => {
        prismaUsers.findUnique.mockResolvedValue(makeUser({ mfaEnabled: false, roles: [
          { roleName: RoleName.SUPER_ADMIN, staffScope: null, grantedAt: new Date() },
        ] }));
        prismaUsers.institutionSettings.findFirst.mockResolvedValueOnce({ mfaMandatoryRoles: ['SUPER_ADMIN', 'BURSAR', 'VC'] });
        jest.spyOn(passwordService, 'compare').mockResolvedValue(true);
        redisMock.setex.mockResolvedValue('OK');

        const result = await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);

        expect(result.type).toBe('mfa_setup_required');
        if (result.type === 'mfa_setup_required') {
          expect(result.setupToken).toBeDefined();
          expect(redisMock.setex).toHaveBeenCalledWith(
            expect.stringContaining('mfa:setup-required:'), 300, makeUser().id,
          );
        }
      });

      it('does NOT require setup for a non-mandatory role (e.g. STAFF)', async () => {
        prismaUsers.findUnique.mockResolvedValue(makeUser({ mfaEnabled: false, roles: [
          { roleName: RoleName.STAFF, staffScope: null, grantedAt: new Date() },
        ] }));
        prismaUsers.institutionSettings.findFirst.mockResolvedValueOnce({ mfaMandatoryRoles: ['SUPER_ADMIN', 'BURSAR', 'VC'] });
        jest.spyOn(passwordService, 'compare').mockResolvedValue(true);

        const result = await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);
        expect(result.type).toBe('success');
      });

      it('a mandatory-role user who HAS already enrolled gets the normal mfa_required gate, not setup', async () => {
        prismaUsers.findUnique.mockResolvedValue(makeUser({ mfaEnabled: true, roles: [
          { roleName: RoleName.BURSAR, staffScope: null, grantedAt: new Date() },
        ] }));
        prismaUsers.institutionSettings.findFirst.mockResolvedValueOnce({ mfaMandatoryRoles: ['SUPER_ADMIN', 'BURSAR', 'VC'] });
        jest.spyOn(passwordService, 'compare').mockResolvedValue(true);
        redisMock.setex.mockResolvedValue('OK');

        const result = await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);
        expect(result.type).toBe('mfa_required');
      });
    });

    it('audit-logs successful login', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(true);
      await service.login('admin@uniportal.dev', 'Admin@123456!', deviceInfo);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN, metadata: expect.objectContaining({ success: true }) }),
        expect.any(String),
      );
    });

    it('audit-logs failed login attempt', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(false);
      await expect(service.login('admin@uniportal.dev', 'bad', deviceInfo)).rejects.toThrow();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN, metadata: expect.objectContaining({ success: false }) }),
      );
    });
  });

  // ── verifyMfa() ──────────────────────────────────────────────────────────────
  describe('verifyMfa()', () => {
    const deviceInfo = { userAgent: 'Jest', ip: '127.0.0.1' };

    it('completes login on valid TOTP code', async () => {
      // P0-17 FIX (this pass — see docs/CHANGELOG.md): this used to
      // hardcode 'v1:encrypted:secret:tag' — a human-readable PLACEHOLDER,
      // not real ciphertext. decryptPii() would fail against it under ANY
      // key, not just because no ENCRYPTION_KEY_HEX was configured for
      // tests before this pass's P0-7 fix — the string was never valid
      // AES-256-GCM output to begin with. Encrypting a real secret with the
      // real encryptPii() here produces ciphertext that actually decrypts
      // correctly against whatever key jest.setup.ts provides, rather than
      // hardcoding a value tied to one specific key.
      redisMock.get.mockResolvedValue('user-uuid-1');
      prismaUsers.findUniqueOrThrow.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: encryptPii('JBSWY3DPEHPK3PXP') }));
      jest.spyOn(mfaService, 'verifyTotp').mockReturnValue(true);

      const result = await service.verifyMfa('mfa-token', '123456', deviceInfo);

      expect(result.type).toBe('success');
      expect(redisMock.del).toHaveBeenCalledWith('mfa:pending:mfa-token');
    });

    it('throws on invalid TOTP code', async () => {
      redisMock.get.mockResolvedValue('user-uuid-1');
      prismaUsers.findUniqueOrThrow.mockResolvedValue(makeUser({ mfaEnabled: true }));
      jest.spyOn(mfaService, 'verifyTotp').mockReturnValue(false);

      await expect(service.verifyMfa('mfa-token', '000000', deviceInfo))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws on expired MFA session token', async () => {
      redisMock.get.mockResolvedValue(null); // Token not in Redis = expired

      await expect(service.verifyMfa('expired-token', '123456', deviceInfo))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── forgotPassword() ──────────────────────────────────────────────────────────
  describe('forgotPassword()', () => {
    it('generates OTP for known email', async () => {
      jest.spyOn(passwordService, 'generateOtp').mockResolvedValue('482951');

      const result = await service.forgotPassword('admin@uniportal.dev');

      expect(result).not.toBeNull();
      expect(result?.otp).toBe('482951');
    });

    it('returns null for unknown email without error (prevents enumeration)', async () => {
      prismaUsers.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('unknown@test.com');

      expect(result).toBeNull();
      expect(passwordService.generateOtp).not.toHaveBeenCalled();
    });
  });

  // ── resetPassword() ──────────────────────────────────────────────────────────
  describe('resetPassword()', () => {
    it('resets password and revokes all sessions on valid OTP', async () => {
      jest.spyOn(passwordService, 'verifyOtp').mockResolvedValue(true);
      jest.spyOn(passwordService, 'hash').mockResolvedValue('$2b$12$newhashedpassword');

      await service.resetPassword('admin@uniportal.dev', '482951', 'NewPass@123456!');

      expect(prismaUsers.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { passwordHash: '$2b$12$newhashedpassword' } }),
      );
      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith(makeUser().id);
      // P0-16 FIX (this pass — see docs/CHANGELOG.md): this
      // previously asserted `undefined` as the actor, matching the
      // implementation's OLD behavior of never passing one — meaning a
      // password reset was logged with no attributable actor at all. The
      // fix passes the resetting user's own id (the natural actor for
      // "I reset my own password via a verified OTP"), matching the
      // convention this file's MFA_DISABLED/revokeAllSessions tests already
      // correctly expected.
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.PASSWORD_CHANGE }),
        makeUser().id,
      );
    });

    it('throws on invalid OTP', async () => {
      jest.spyOn(passwordService, 'verifyOtp').mockResolvedValue(false);

      await expect(service.resetPassword('admin@uniportal.dev', '000000', 'NewPass@123456!'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── changePassword() ──────────────────────────────────────────────────────────
  describe('changePassword()', () => {
    it('changes password and revokes all sessions', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(true);
      jest.spyOn(passwordService, 'hash').mockResolvedValue('$2b$12$newhash');

      await service.changePassword('user-uuid-1', 'OldPass@123456!', 'NewPass@123456!');

      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith('user-uuid-1');
    });

    it('throws on wrong current password', async () => {
      jest.spyOn(passwordService, 'compare').mockResolvedValue(false);

      await expect(service.changePassword('user-uuid-1', 'wrongpass', 'NewPass@123456!'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
