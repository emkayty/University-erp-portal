import type { BaseEntity } from './common';

// ── Admissions ─────────────────────────────────────────────────────────────
export type AdmissionType    = 'UTME'|'DE'|'TRANSFER'|'POSTGRADUATE'|'SANDWICH'|'INTERNATIONAL'|'REMEDIAL';
export type ApplicantStatus  = 'DRAFT'|'SUBMITTED'|'PENDING'|'SCREENED'|'DOCUMENT_REVIEW'|'REVIEW_REQUIRED'|'ELIGIBLE'|'INELIGIBLE'|'OFFERED'|'WAITLISTED'|'ACCEPTED'|'DECLINED'|'REJECTED'|'WITHDRAWN'|'DEFERRED'|'CLEARANCE'|'MATRICULATED';

export interface AdmissionCycleV1 extends BaseEntity {
  academicYear: string; cycleName: string; admissionType: AdmissionType;
  openDate: string; closeDate: string; utmeMinScore: number|null;
  maxApplicants: number|null; isActive: boolean;
  _count?: { applicants: number };
}

export interface ApplicantV1 extends BaseEntity {
  applicationNo: string; firstName: string; lastName: string; middleName: string|null;
  dateOfBirth: string; gender: string; nationality: string; phone: string; email: string;
  admissionType: AdmissionType; admissionCycleId: string; status: ApplicantStatus;
  programmeChoice1Id: string; programmeChoice1Name?: string;
  jambRegNo: string|null; jambScore: number|null; jambVerified: boolean;
  oLevelVerified: boolean; offerDate: string|null; offerDeadline: string|null;
  acceptanceDate: string|null; rejectionDate: string|null; rejectionReason: string|null;
  student?: { id: string; matricNo: string }|null;
  completionPercent?: number;
  programmeChoice2Name?: string; programmeChoice3Name?: string;
  submittedAt?: string|null;
  personId?: string|null;
  application?: { id: string; status: string; completionPercent: number }|null;
}

// ── Students ───────────────────────────────────────────────────────────────
export type StudentStatus = 'ACTIVE'|'SUSPENDED'|'WITHDRAWN'|'GRADUATED'|'DEFERRED'|'REPEATING';
export type ModeOfStudy   = 'FULL_TIME'|'PART_TIME'|'DISTANCE'|'SANDWICH';
export type CourseRegStatus = 'REGISTERED'|'DROPPED'|'COMPLETED';

export interface StudentV1 extends BaseEntity {
  matricNo: string; firstName: string; lastName: string; middleName: string|null;
  dateOfBirth: string; gender: string; phone: string; email: string;
  programmeId: string; programmeName?: string; programmeCode?: string;
  departmentId: string; departmentName?: string; facultyName?: string;
  level: number; modeOfStudy: ModeOfStudy; entryAcademicYear: string;
  cgpa: string; totalCreditUnitsEarned: number;
  status: StudentStatus; feeCleared: boolean;
  passportPhotoUrl: string|null;
}

export interface CourseRegistrationV1 {
  id: string; studentId: string; courseOfferingId: string;
  status: CourseRegStatus; registeredAt: string; droppedAt: string|null;
  courseCode?: string; courseTitle?: string; creditUnits?: number;
  semester?: string; academicYear?: string;
}

export interface AcademicHistoryV1 {
  id: string; studentId: string; academicYear: string; level: number;
  status: StudentStatus; gpa: string|null; cgpa: string|null;
  startDate: string; endDate: string|null; notes: string|null;
}
