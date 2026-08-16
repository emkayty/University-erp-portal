import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, UnauthorizedException,
  Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards, Version,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiCookieAuth, ApiOperation,
  ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto,
  MfaBackupVerifyDto, MfaConfirmMandatorySetupDto, MfaSetupTokenDto,
  MfaVerifyDto, MfaVerifySetupDto, ResetPasswordDto,
} from './dto/auth.dto';
import { TokenService } from './services/token.service';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(RolesGuard)
export class AuthController {
  constructor(
    private readonly authService:  AuthService,
    private readonly tokenService: TokenService,
  ) {}

  // ── POST /auth/login ─────────────────────────────────────────────────────
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful or MFA required' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ip:        req.ip,
    };

    const result = await this.authService.login(dto.email, dto.password, deviceInfo);

    if (result.type === 'mfa_required') {
      return {
        success:           true,
        data: {
          requiresMfa:        true,
          mfaToken:           result.mfaToken,
          mfaTokenExpiresAt:  result.mfaTokenExpiresAt,
        },
      };
    }

    // AUDIT-C3 fix: role requires MFA, not yet enrolled — no session issued.
    if (result.type === 'mfa_setup_required') {
      return {
        success: true,
        data: {
          requiresMfaSetup:    true,
          setupToken:          result.setupToken,
          setupTokenExpiresAt: result.setupTokenExpiresAt,
          message:             result.message,
        },
      };
    }

    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  // ── POST /auth/mfa/verify ─────────────────────────────────────────────────
  @Post('mfa/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code after password login' })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfa(
      dto.mfaToken, dto.totpCode,
      { userAgent: req.headers['user-agent'], ip: req.ip },
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  // ── POST /auth/mfa/verify-backup ─────────────────────────────────────────
  @Post('mfa/verify-backup')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Use a backup code instead of TOTP' })
  async verifyMfaBackup(
    @Body() dto: MfaBackupVerifyDto,
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfa(
      dto.mfaToken, dto.backupCode,
      { userAgent: req.headers['user-agent'], ip: req.ip },
      true, // isBackupCode
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  // ── POST /auth/refresh ────────────────────────────────────────────────────
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 20, ttl: 60000 } }) // H1: rate-limit refresh endpoint
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!rawToken) {
      return { success: false, error: { code: 'AUTH_TOKEN_EXPIRED', message: 'No refresh token' } };
    }

    const result = await this.authService.refresh(rawToken, {
      userAgent: req.headers['user-agent'],
      ip:        req.ip,
    });

    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  // ── POST /auth/logout ─────────────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout — revoke current session' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.authService.logout(rawToken, user.sub);
    this.clearRefreshCookie(res);
  }

  // ── POST /auth/revoke-all ────────────────────────────────────────────────
  @Post('revoke-all')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  async revokeAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.revokeAllSessions(user.sub, user.sub);
    this.clearRefreshCookie(res);
    return { success: true, data: result };
  }

  // ── Admin: revoke any user's sessions ────────────────────────────────────
  @Post('revoke/:userId')
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[SUPER_ADMIN] Revoke all sessions for a specific user' })
  async revokeUserSessions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    const result = await this.authService.revokeAllSessions(userId, actor.sub);
    return { success: true, data: result };
  }

  // ── GET /auth/me ──────────────────────────────────────────────────────────
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user profile and roles' })
  async getMe(@CurrentUser() user: JwtPayload) {
    const profile = await this.authService.getMe(user.sub);
    return { success: true, data: profile };
  }

  // ── MFA setup ─────────────────────────────────────────────────────────────
  // ── AUDIT-C3: mandatory-MFA setup (no session yet — uses setupToken) ─────
  @Post('mfa/setup-mandatory')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Begin TOTP setup for a role where MFA is mandatory but not yet enrolled (spec §3.4 mfaMandatoryRoles)' })
  async setupMandatoryMfa(@Body() dto: MfaSetupTokenDto) {
    const result = await this.authService.setupMandatoryMfa(dto.setupToken);
    return { success: true, data: { secret: result.secret, qrCodeUri: result.qrCodeUri } };
  }

  @Post('mfa/confirm-setup-mandatory')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm mandatory TOTP setup and complete login in one step' })
  async confirmMandatoryMfaSetup(
    @Body() dto: MfaConfirmMandatorySetupDto,
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const setup = await this.authService.resolveMandatoryMfaSecret(dto.setupToken);
    if (dto.secret !== setup.secret) {
      throw new UnauthorizedException({ code: 'AUTH_MFA_SETUP_REQUIRED', message: 'MFA setup secret does not match the issued setup.' });
    }
    const confirmResult = await this.authService.confirmMfaSetup(setup.userId, dto.totpCode, setup.secret);
    const loginResult   = await this.authService.completeLoginAfterMandatorySetup(
      dto.setupToken, { userAgent: req.headers['user-agent'], ip: req.ip },
    );

    this.setRefreshCookie(res, loginResult.refreshToken);
    return {
      success: true,
      data: {
        accessToken: loginResult.accessToken, user: loginResult.user,
        message:     'MFA enabled successfully. Store these backup codes securely — they will not be shown again.',
        backupCodes: confirmResult.backupCodes,
      },
    };
  }

  @Post('mfa/setup')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initiate TOTP MFA setup — returns secret and QR code URI' })
  async setupMfa(@CurrentUser() user: JwtPayload) {
    const result = await this.authService.setupMfa(user.sub);
    // Do NOT return backupCodes here — only after confirmation
    return {
      success: true,
      data: { secret: result.secret, qrCodeUri: result.qrCodeUri },
    };
  }

  @Post('mfa/confirm-setup')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm MFA setup with a valid TOTP code' })
  async confirmMfaSetup(
    @Body() dto: MfaVerifySetupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.authService.confirmMfaSetup(user.sub, dto.totpCode, dto.secret);
    return {
      success: true,
      data: {
        message:     'MFA enabled successfully. Store these backup codes securely — they will not be shown again.',
        backupCodes: result.backupCodes,
      },
    };
  }

  @Delete('mfa/:userId')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR') // Only admins can disable MFA for others; users use PATCH /auth/me for self
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Disable MFA for a user account' })
  async disableMfa(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.authService.disableMfa(userId, actor.sub);
    return { success: true, data: { message: 'MFA disabled. All sessions revoked.' } };
  }

  // ── Password ──────────────────────────────────────────────────────────────
  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 3, ttl: 3600000 } }) // 3 per hour per IP
  @ApiOperation({ summary: 'Request a password reset OTP' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // Always return success to prevent email enumeration
    await this.authService.forgotPassword(dto.email);
    return {
      success: true,
      data: { message: 'If this email is registered, an OTP has been sent.' },
    };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset password using OTP from email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
    return { success: true, data: { message: 'Password reset successfully. Please log in.' } };
  }

  @Patch('change-password')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (requires current password)' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
    this.clearRefreshCookie(res);
    return { success: true, data: { message: 'Password changed. Please log in again.' } };
  }

  // ── Cookie helpers ────────────────────────────────────────────────────────
  private setRefreshCookie(res: Response, token: string): void {
    const isProd = process.env['NODE_ENV'] === 'production';
    res.cookie(REFRESH_COOKIE, token, this.tokenService.getCookieOptions(isProd));
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
