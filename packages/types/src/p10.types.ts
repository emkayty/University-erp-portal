import type { BaseEntity } from './common';

// ── NDPR Data Subject Requests ─────────────────────────────────────────────────
export type DsrRequestType =
  | 'ACCESS' | 'RECTIFICATION' | 'ERASURE' | 'PORTABILITY' | 'RESTRICTION';

export type DsrRequestStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface DataSubjectRequestV1 extends BaseEntity {
  type:          DsrRequestType;
  status:        DsrRequestStatus;
  subjectUserId: string;
  requestedById: string;
  reason:        string | null;
  reportJobId:   string | null;
  vcApprovalId:  string | null;
  legalHoldNote: string | null;
  completedAt:   string | null;
  dueBy:         string;
}

export interface RectifyUserDto {
  email?: string;
  phone?: string;
  reason?: string;
}

export interface ErasureRequestDto {
  /** UUID of a distinct active VC user who approved the erasure. */
  vcApprovalReference: string;
  reason?: string;
}

export interface RestrictProcessingDto {
  reason: string; // mandatory per spec §16.1
}

// ── Security Incidents / Breach Notification ───────────────────────────────────
export type SecurityIncidentType =
  | 'CREDENTIAL_BREACH' | 'DATA_LEAK' | 'UNAUTHORISED_ACCESS'
  | 'MALWARE' | 'PHYSICAL_BREACH' | 'THIRD_PARTY_BREACH' | 'OTHER';

export type SecurityIncidentStatus = 'DETECTED' | 'CONTAINED' | 'NITDA_NOTIFIED' | 'RESOLVED';

export interface SecurityIncidentV1 extends BaseEntity {
  type:            SecurityIncidentType;
  status:          SecurityIncidentStatus;
  description:     string;
  affectedUserIds: string[];
  detectedAt:      string;
  containedAt:     string | null;
  nitdaNotifiedAt: string | null;
  resolvedAt:      string | null;
  reportedById:    string;
  dpoNotes:        string | null;
  /** Derived, not stored: detectedAt + 72h — the NITDA notification deadline. */
  nitdaDeadline:   string;
  /** Derived from the current time and nitdaDeadline. */
  overdue:         boolean;
}

export interface CreateSecurityIncidentDto {
  type:            SecurityIncidentType;
  description:     string;
  affectedUserIds: string[];
}
