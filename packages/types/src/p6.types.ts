import type { BaseEntity } from './common';

export type EmploymentType   = 'FULL_TIME'|'PART_TIME'|'CONTRACT'|'ADJUNCT'|'VISITING';
export type EmploymentStatus = 'ACTIVE'|'ON_LEAVE'|'SUSPENDED'|'RETIRED'|'TERMINATED';
export type PayrollStatus    = 'DRAFT'|'COMPUTED'|'APPROVED'|'DISBURSED';
export type LeaveType        = 'ANNUAL'|'SICK'|'MATERNITY'|'PATERNITY'|'STUDY'|'COMPASSIONATE'|'SABBATICAL';
export type LeaveStatus      = 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';
export type AllowanceType    = 'ALLOWANCE'|'DEDUCTION'|'LOAN_REPAYMENT'|'UNION_DUES';

export interface SalaryGradeV1 extends BaseEntity {
  gradeLevel: string; basicSalary: string; step: number;
  housingAllowancePct: string; transportAllowancePct: string; medicalAllowancePct: string; isActive: boolean;
}

export interface StaffV1 extends BaseEntity {
  userId: string; employeeNo: string; ippisNo: string|null;
  firstName: string; lastName: string; middleName: string|null;
  dateOfBirth: string; gender: string; phone: string; email: string;
  designation: string; departmentId: string; departmentName?: string;
  salaryGradeId: string; gradeLevel?: string;
  employmentType: EmploymentType; employmentStatus: EmploymentStatus;
  appointmentDate: string; confirmationDate: string|null; retirementDate: string|null;
  bankName: string|null; accountName: string|null; bankCode: string|null;
  isHod: boolean;
}

export interface PayrollRunV1 extends BaseEntity {
  periodMonth: number; periodYear: number; label: string;
  status: PayrollStatus; staffCount: number;
  totalGross: string; totalNet: string; totalDeductions: string;
  initiatedById: string; approvedById: string|null;
  approvedAt: string|null; disbursedAt: string|null;
  ippisExportedAt: string|null; pencomExportedAt: string|null;
  notes: string|null; _count?: { payslips: number };
}

export interface PayslipV1 {
  id: string; staffId: string; payrollRunId: string;
  basicSalary: string; housingAllowance: string; transportAllowance: string;
  medicalAllowance: string; otherAllowances: string; grossPay: string;
  payeeTax: string; pensionEmployee: string; pensionEmployer: string;
  nhfDeduction: string; nhisDeduction: string; otherDeductions: string;
  totalDeductions: string; netPay: string; gradeLevel: string; createdAt: string;
  staff?: { firstName: string; lastName: string; employeeNo: string };
  payrollRun?: { label: string; periodMonth: number; periodYear: number };
}

export interface LeaveRequestV1 extends BaseEntity {
  staffId: string; leaveType: LeaveType; startDate: string; endDate: string;
  daysRequested: number; reason: string; status: LeaveStatus;
  approvedById: string|null; approvedAt: string|null; rejectionNote: string|null;
  staff?: { firstName: string; lastName: string; employeeNo: string; designation: string };
}
