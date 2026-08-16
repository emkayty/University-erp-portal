import type { BaseEntity } from "./common";

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export type GradingSystem = "NIGERIAN_5_POINT" | "US_4_POINT";
export type InstitutionType =
  | "UNIVERSITY"
  | "POLYTECHNIC"
  | "COLLEGE_OF_EDUCATION"
  | "SPECIALIST_INSTITUTION";
export type CourseRepeatPolicy = "REPLACE" | "INCLUDE" | "BEST";

export interface SettingsV1 {
  id: string;
  institutionName: string;
  institutionCode: string | null;
  institutionType: InstitutionType;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tsaEnabled: boolean;
  defaultCurrency: string;
  feeWaiverCapHodPct: string; // Decimal string
  feeWaiverCapBursarPct: string;
  deanApprovalRequired: boolean;
  gradingSystem: GradingSystem;
  minCreditUnitsPerSem: number;
  maxCreditUnitsPerSem: number;
  mfaMandatoryRoles: string[];
  primaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  featureFlags: Record<string, boolean>;
  courseRepeatPolicy: CourseRepeatPolicy;
  assessmentFinalExamWeight: string;
  assessmentContinuousAssessmentWeight: string;
  gradePolicyVersion: number;
  enableLiveGradebook: boolean;
  requireResultValidation: boolean;
  sesRateLimitPerSecond: number;
  resultNotifConcurrency: number;
  updatedAt: string;
}

export interface UpdateSettingsDto {
  institutionName?: string;
  institutionCode?: string;
  institutionType?: InstitutionType;
  websiteUrl?: string;
  defaultCurrency?: string;
  logoUrl?: string;
  faviconUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  tsaEnabled?: boolean;
  feeWaiverCapHodPct?: number;
  feeWaiverCapBursarPct?: number;
  deanApprovalRequired?: boolean;
  gradingSystem?: GradingSystem;
  minCreditUnitsPerSem?: number;
  maxCreditUnitsPerSem?: number;
  mfaMandatoryRoles?: string[];
  primaryColor?: string;
  courseRepeatPolicy?: CourseRepeatPolicy;
  assessmentFinalExamWeight?: number;
  assessmentContinuousAssessmentWeight?: number;
  enableLiveGradebook?: boolean;
  requireResultValidation?: boolean;
  sesRateLimitPerSecond?: number;
  resultNotifConcurrency?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════

export type CalendarStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "COMPLETED";
export type CalendarEventType =
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSE"
  | "EXAM_START"
  | "EXAM_END"
  | "RESULT_RELEASE"
  | "GRADUATION"
  | "ORIENTATION"
  | "HOLIDAY"
  | "ADMINISTRATIVE"
  | "OTHER";

export interface CalendarEventV1 {
  id: string;
  name: string;
  eventType: CalendarEventType;
  startDate: string; // ISO date
  endDate: string | null;
  isPublic: boolean;
  description: string | null;
  createdAt: string;
}

export interface CalendarV1 extends BaseEntity {
  academicYear: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: CalendarStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  resumedAt: string | null;
  activatedAt: string | null;
  events: CalendarEventV1[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURRICULUM
// ═══════════════════════════════════════════════════════════════════════════════

export type DegreeType =
  | "BSC"
  | "BA"
  | "BENG"
  | "BTECH"
  | "HND"
  | "ND"
  | "MASTERS"
  | "PHD"
  | "DIPLOMA"
  | "PGDIP"
  | "OTHER";
export type CcmasCategory = "CORE" | "ELECTIVE" | "GENERAL_STUDIES";
export type Semester = "FIRST" | "SECOND" | "SUMMER";

export interface FacultyV1 extends BaseEntity {
  name: string;
  code: string;
  isActive: boolean;
  departmentCount: number;
}

export interface DepartmentV1 extends BaseEntity {
  name: string;
  code: string;
  facultyId: string;
  facultyName: string;
  isActive: boolean;
  programmeCount: number;
  courseCount: number;
}

export interface PrerequisiteV1 {
  courseId: string;
  courseCode: string;
  minGrade: string;
}

export interface CourseV1 extends BaseEntity {
  code: string;
  title: string;
  creditUnits: number;
  departmentId: string;
  departmentCode: string;
  ccmasCategory: CcmasCategory;
  description: string | null;
  isActive: boolean;
  prerequisites: PrerequisiteV1[];
}

export interface ProgrammeCourseV1 {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  creditUnits: number;
  level: number;
  semester: Semester;
  isCompulsory: boolean;
  ccmasCategory: CcmasCategory;
}

export interface ProgrammeV1 extends BaseEntity {
  name: string;
  code: string;
  departmentId: string;
  departmentName: string;
  facultyName: string;
  degreeType: DegreeType;
  durationYears: number;
  minCreditUnits: number;
  maxCreditUnits: number;
  isActive: boolean;
  courses?: ProgrammeCourseV1[];
}

export interface CcmasComplianceV1 {
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  totalUnits: number;
  coreUnits: number;
  electiveUnits: number;
  generalUnits: number;
  corePct: number;
  isCompliant: boolean; // corePct >= 70
}

export interface CourseOfferingV1 extends BaseEntity {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  academicCalendarId: string;
  academicYear: string;
  semester: Semester;
  lecturerId: string | null;
  maxStudents: number | null;
  isActive: boolean;
  enrolledCount: number;
}
