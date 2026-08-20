/**
 * Standard API response envelope — all API responses use this shape.
 * SUCCESS responses: { success: true, data: T, meta?: PaginationMeta }
 * ERROR responses:   { success: false, error: ApiError }
 */

// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CursorPaginationQuery {
  cursor?: string;
  pageSize?: number;
}

// ─── API Envelopes ───────────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    details?: ValidationDetail[];
  };
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Validation ──────────────────────────────────────────────────────────────
export interface ValidationDetail {
  field: string;
  message: string;
  value?: unknown;
}

// ─── Error Codes ─────────────────────────────────────────────────────────────
export type ErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'RBAC_FORBIDDEN'
  | 'RBAC_SCOPE_FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'DUPLICATE_RESOURCE'
  | 'BUSINESS_RULE_FEE_UNPAID'
  | 'BUSINESS_RULE_PREREQUISITE'
  | 'BUSINESS_RULE_CALENDAR_INACTIVE'
  | 'BUSINESS_RULE_INVALID_STATE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'EXTERNAL_API_UNAVAILABLE'
  | 'INTERNAL_ERROR';

// ─── Shared Enums ─────────────────────────────────────────────────────────────
export type RoleName =
  | 'SUPER_ADMIN'
  | 'VC'
  | 'REGISTRAR'
  | 'DEAN'
  | 'HOD'
  | 'STAFF'
  | 'BURSAR'
  | 'HR_MANAGER'
  | 'SUPPORT_STAFF'
  | 'STUDENT';

export type StaffScope =
  | 'admissions'
  | 'admissions_corrections'
  | 'finance_clerk'
  | 'hr_clerk'
  | 'lecturer'
  | 'library'
  | 'hostel'
  | 'health'
  | 'transport'
  | 'research'
  | 'alumni'
  | 'timetable'
  | 'records'
  | 'dpo';

export interface StaffScopeAttribute {
  scopes: StaffScope[];
  deptId?: string;
  facultyId?: string;
}

// ─── Base Entity ──────────────────────────────────────────────────────────────
export interface BaseEntity {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface SoftDeleteEntity extends BaseEntity {
  deletedAt: string | null;
}
