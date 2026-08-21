import type { BaseEntity } from "./common";

// ── Semester ──────────────────────────────────────────────────────────────────
export type SemesterStatus =
  | "PLANNING"
  | "REGISTRATION"
  | "ACTIVE"
  | "EXAMS"
  | "RESULT_ENTRY"
  | "COMPLETED";

export interface SemesterV1 extends BaseEntity {
  academicYear: string;
  semesterNumber: number;
  name: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  classStartDate: string;
  classEndDate: string;
  examStartDate: string;
  examEndDate: string;
  resultDeadline: string;
  isCurrent: boolean;
  status: SemesterStatus;
}

// ── Results ───────────────────────────────────────────────────────────────────
export type ResultStatus =
  | "DRAFT"
  | "HOD_APPROVED"
  | "DEAN_APPROVED"
  | "SENATE_PENDING"
  | "SENATE_PUBLISHED"
  | "WITHHELD"
  | "REJECTED";

export interface StudentResultV1 {
  id: string;
  studentId: string;
  courseOfferingId: string;
  semesterId: string;
  score: string;
  grade: string;
  gradePoint: string;
  creditUnits: number;
  absentFromExam: boolean;
  status: ResultStatus;
  submittedById: string;
  approvedByHodId: string | null;
  hodApprovedAt: string | null;
  senatePendingAt: string | null;
  senatePublishedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  courseOffering?: { course: { code: string; title: string } };
  semester?: { name: string; academicYear: string };
  student?: { matricNo: string; firstName: string; lastName: string };
}

export interface TranscriptV1 {
  student: {
    matricNo: string;
    fullName: string;
    programme: string;
    department: string;
    faculty: string;
    entryYear: string;
    cgpa: number;
    degreeClass: string;
    totalCreditUnitsEarned: number;
  };
  semesters: Array<{
    semesterName: string;
    academicYear: string;
    results: StudentResultV1[];
  }>;
}

// ── Attendance ────────────────────────────────────────────────────────────────
export interface AttendanceRecordV1 {
  id: string;
  studentId: string;
  courseOfferingId: string;
  semesterId: string;
  date: string;
  present: boolean;
  remark: string | null;
  recordedById: string;
  createdAt: string;
  student?: { matricNo: string; firstName: string; lastName: string };
}

export interface AttendanceSummaryV1 {
  total: number;
  present: number;
  absent: number;
  attendancePct: number;
  records: AttendanceRecordV1[];
}

// ── ExamTimetable ─────────────────────────────────────────────────────────────
export interface ExamTimetableV1 extends BaseEntity {
  courseOfferingId: string;
  semesterId: string;
  venue: string;
  examDate: string;
  startTime: string;
  durationMinutes: number;
  invigilatorNotes: string | null;
  courseOffering?: { course: { code: string; title: string } };
}
