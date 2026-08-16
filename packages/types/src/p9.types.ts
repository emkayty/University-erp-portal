import type { BaseEntity } from './common';

// ── Report Jobs ───────────────────────────────────────────────────────────────
export type ReportType =
  | 'ENROLMENT' | 'REVENUE' | 'CGPA_DISTRIBUTION' | 'RESULTS_STATISTICS'
  | 'PAYROLL_SUMMARY' | 'LIBRARY_USAGE' | 'CLEARANCE_STATUS'
  | 'STAFF_DIRECTORY' | 'AUDIT_EXPORT' | 'CUSTOM';

export type ReportFormat = 'PDF' | 'XLSX' | 'CSV';
export type ReportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ReportJobV1 extends BaseEntity {
  reportType:   ReportType;
  reportFormat: ReportFormat;
  status:       ReportStatus;
  parameters:   Record<string, unknown> | null;
  totalRows:    number | null;
  generatedUrl: string | null;
  urlExpiresAt: string | null;
  errorMessage: string | null;
  triggeredBy:  string;
  startedAt:    string | null;
  completedAt:  string | null;
}

// ── Enrolment ─────────────────────────────────────────────────────────────────
export interface EnrolmentStatsV1 {
  total:    number;
  byStatus: { status: string; count: number }[];
  byLevel:  { level: number; count: number }[];
  byGender: { gender: string; count: number }[];
  byMode:   { mode: string;   count: number }[];
}

// ── Revenue ───────────────────────────────────────────────────────────────────
export interface RevenueReportV1 {
  totalRevenue:       number | string;
  totalTransactions:  number;
  byGateway: { gateway: string; total: number | string; count: number }[];
  byMonth:   { month: string;   total: number;          count: number }[];
}

// ── CGPA Distribution ─────────────────────────────────────────────────────────
export interface CgpaDistributionV1 {
  totalStudents: number;
  averageCgpa:   number | string;
  minCgpa:       number | string;
  maxCgpa:       number | string;
  distribution:  { classification: string; count: number; avgCgpa: number }[];
}

// ── Results Statistics ────────────────────────────────────────────────────────
export interface ResultsStatsV1 {
  totalResults: number;
  passCount:    number;
  failCount:    number;
  passRate:     string;
  averageScore: number | string;
  averageGp:    number | string;
  minScore:     number | string;
  maxScore:     number | string;
  byGrade:      { grade: string | null; count: number }[];
}

// ── Analytics Dashboard ───────────────────────────────────────────────────────
export interface AnalyticsDashboardV1 {
  academicCalendar: { academicYear: string; status: string } | null;
  students: {
    total:    number;
    byStatus: { status: string; count: number }[];
  };
  fees: {
    totalInvoiced:   number;
    totalCollected:  number;
    collectionRate:  string;
    invoiceCount:    number;
    last7DaysAmount: number;
    last7DaysCount:  number;
  };
  results:    { pendingPublication: number };
  payroll:    { activeRuns: number };
  staff: {
    total:    number;
    byStatus: { status: string; count: number }[];
  };
  clearance: {
    total:          number;
    cleared:        number;
    pending:        number;
    completionRate: string;
  };
  admissions: { byStatus: { status: string; count: number }[] };
}

// ── HOD Dashboard ─────────────────────────────────────────────────────────────
export interface HodDashboardV1 {
  totalActiveStudents:            number;
  resultsAwaitingHodApproval:     number;
  totalCourses:                   number;
  totalActiveStaff:               number;
  cgpaDistribution:               { classification: string; count: number }[];
}

// ── Role-aware dashboard snapshot ────────────────────────────────────────────
export type DashboardSnapshotV1 =
  | { kind: 'student'; data: StudentDashboardV1 }
  | { kind: 'executive'; data: AnalyticsDashboardV1 }
  | { kind: 'department'; data: HodDashboardV1 }
  | { kind: 'faculty'; data: { students: number; pendingResults: number; staff: number; departments: number } }
  | { kind: 'finance'; data: { invoiced: number; collected: number; outstanding: number; collectionRate: number; invoiceCount: number; last7DaysAmount: number; last7DaysCount: number; pendingRefunds: number } }
  | { kind: 'people'; data: { totalStaff: number; byStatus: { status: string; count: number }[]; activePayroll: number; pendingLeave: number } }
  | { kind: 'workspace'; data: { students: number; courses: number; pendingResults: number; scope: unknown } };

// ── Student Self-Service Dashboard ───────────────────────────────────────────
export interface StudentDashboardV1 {
  student: {
    userId?: string; matricNo: string; firstName: string; lastName: string;
    cgpa: string; level: number; status: string; feeCleared: boolean;
    programme: { name: string; durationYears: number };
    department: { name: string };
  };
  recentResults: {
    grade: string | null; score: number | null; gradePoint: string | number | null;
    semester: { academicYear: string; semesterNumber: number };
    courseOffering: { course: { code: string; title: string; creditUnits: number } };
  }[];
  clearance: {
    items: { status: string; clearanceItem: { name: string; isRequiredForGraduation: boolean } }[];
    allCleared: boolean;
    administrativelyCleared: boolean;
    graduationEligible: boolean;
  };
  outstandingFees: {
    amount: string | number; amountPaid: string | number; waiverAmount: string | number;
    balance: string | number; status: string;
    feeSchedule: { feeType: string; description: string | null };
  }[];
  activeLoans: {
    dueDate: string; status: string; fineAmount: string | number;
    libraryItem: { title: string };
  }[];
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
export interface AuditLogV1 extends BaseEntity {
  actorId:     string | null;
  action:      string;
  targetTable: string;
  targetId:    string | null;
  oldValues:   Record<string, unknown> | null;
  newValues:   Record<string, unknown> | null;
  ipAddress:   string | null;
  sessionId:   string | null;
  metadata:    Record<string, unknown> | null;
  actor:       { email: string } | null;
}

export interface AuditSummaryV1 {
  totalLast30Days: number;
  recentLogins:    number;
  byAction:        { action: string; count: number }[];
  topTables:       { table: string;  count: number }[];
}

// ── Search Results ────────────────────────────────────────────────────────────
export interface StudentSearchResultV1 {
  id: string; matricNo: string; firstName: string; lastName: string;
  email: string; level: number; status: string; cgpa: string;
  programme: string; department: string;
}

export interface StaffSearchResultV1 {
  id: string; staffId: string; firstName: string; lastName: string;
  email: string; jobTitle: string; employmentStatus: string; department: string;
}

export interface CourseSearchResultV1 {
  id: string; code: string; title: string;
  creditUnits: number; ccmasCategory: string; department: string;
}

export interface LibrarySearchResultV1 {
  id: string; isbn: string | null; title: string; author: string | null;
  category: string; availableCopies: number; totalCopies: number; available: boolean;
}

export interface GlobalSearchResultV1 {
  students: StudentSearchResultV1[];
  courses:  CourseSearchResultV1[];
  staff:    StaffSearchResultV1[];
  library:  LibrarySearchResultV1[];
}
