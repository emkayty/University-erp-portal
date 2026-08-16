import type { BaseEntity, RoleName, StaffScopeAttribute } from './common';

// ─── User Identity ────────────────────────────────────────────────────────────
export interface UserRoleDto {
  roleName: RoleName;
  staffScope: StaffScopeAttribute | null;
  grantedAt: string;
}

export interface UserV1 extends BaseEntity {
  email: string;
  phone: string | null;
  /** Resolved Student.id for STUDENT users; absent for other roles. */
  studentId?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  roles: UserRoleDto[];
  // Derived — primary role (highest privilege)
  primaryRole: RoleName;
  staffScope: StaffScopeAttribute | null;
}

// ─── Auth Requests ────────────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
}

export interface MfaVerifyRequest {
  mfaToken: string; // Short-lived token issued after password success
  totpCode: string; // 6-digit TOTP code
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ─── Auth Responses ───────────────────────────────────────────────────────────
export interface LoginResponse {
  accessToken: string;
  user: UserV1;
  requiresMfa: false;
}

export interface MfaRequiredResponse {
  requiresMfa: true;
  mfaToken: string;
  mfaTokenExpiresAt: string;
}

export interface MfaSetupRequiredResponse {
  requiresMfaSetup: true;
  setupToken: string;
  setupTokenExpiresAt: string;
  message: string;
}

export type LoginResult = LoginResponse | MfaRequiredResponse | MfaSetupRequiredResponse;

export interface MfaSetupResponse {
  secret: string;
  qrCodeUri: string; // otpauth:// URI for authenticator apps
}

export interface SessionDto extends BaseEntity {
  deviceInfo: {
    userAgent: string | null;
    ip: string | null;
    platform: string | null;
  } | null;
  createdAt: string;
  expiresAt: string;
  isCurrentSession: boolean;
}

// ─── JWT Payload (decoded access token) ──────────────────────────────────────
export interface JwtPayload {
  sub: string;           // userId
  iat: number;           // issued at (unix timestamp)
  exp: number;           // expires at (unix timestamp)
  jti: string;           // unique token id
  role: RoleName;        // primary role
  staffScope: StaffScopeAttribute | null;
  institutionId: string;
  mfaVerified: boolean;
  /**
   * Deep-audit fix (Aug 2026): resolved Student.id for STUDENT-role users,
   * attached by JwtStrategy.validate() (NOT part of the signed JWT itself
   * — resolved fresh per-request, Redis-cached, from Student.userId — see
   * that file for why). Ten call sites across fees/exams/results/students
   * controllers previously did `u.role === 'STUDENT' ? u.sub : id` to
   * self-scope a student to their own record, but u.sub is the USER id,
   * not the Student id — two independently-generated UUIDs linked only via
   * Student.userId. Every one of those self-service reads (view my
   * results, my transcript, my fees, my exam timetable, my registered
   * courses, my academic history) would 404 or return empty for every
   * student, every time. Undefined for non-STUDENT callers.
   * See docs/CHANGELOG.md — this was found during the fix
   * pass, not in the original audit.
   */
  studentId?: string;
}
