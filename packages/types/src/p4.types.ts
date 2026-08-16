import type { BaseEntity } from './common';

export type FeeType = 'TUITION'|'ACCEPTANCE'|'ACCOMMODATION'|'LIBRARY'|'MEDICAL'|'SPORTS'|'ICT'|'EXAM_FEE'|'LATE_REG'|'OTHER';
export type FeeStatus = 'PENDING'|'PARTIAL'|'PAID'|'WAIVED'|'OVERDUE';
export type PaymentProvider = 'REMITA'|'PAYSTACK'|'TSA_MANUAL'|'BANK_TRANSFER';
export type PaymentStatus = 'PENDING'|'SUCCESS'|'FAILED'|'REVERSED';
export type WaiverStatus = 'PENDING'|'APPROVED'|'REJECTED';

export interface FeeScheduleV1 extends BaseEntity {
  programmeId: string | null; programmeName?: string; programmeCode?: string;
  level: number | null; academicYear: string; feeType: FeeType;
  amount: string; description: string | null; isActive: boolean; dueDate: string | null;
}

export interface FeeWaiverV1 {
  id: string; studentFeeId: string; requestedById: string; approvedById: string | null;
  waiverPct: string; waiverAmount: string; reason: string;
  status: WaiverStatus; createdAt: string; decidedAt: string | null;
  studentFee?: { invoiceNo: string; amount: string; academicYear: string; student: { matricNo: string; firstName: string; lastName: string } };
}

export interface PaymentV1 {
  id: string; studentFeeId: string; studentId: string; amount: string;
  provider: PaymentProvider; providerRef: string; status: PaymentStatus;
  paidAt: string | null; channel: string | null; createdAt: string;
  studentFee?: { invoiceNo: string; academicYear: string };
}

export interface StudentFeeV1 extends BaseEntity {
  studentId: string; feeScheduleId: string; academicYear: string;
  amount: string; amountPaid: string; waiverAmount: string;
  status: FeeStatus; dueDate: string | null; invoiceNo: string;
  feeSchedule?: { feeType: FeeType; description: string | null };
  payments?: PaymentV1[]; waivers?: FeeWaiverV1[];
  student?: { matricNo: string; firstName: string; lastName: string };
}

export interface PaymentInitResultV1 {
  paymentId: string; providerRef: string; provider: PaymentProvider;
  reference: string; amount: string;
}

export interface ConfirmPaymentResultV1 {
  alreadyProcessed: boolean; paymentId: string; feeStatus: FeeStatus; feeCleared: boolean;
}
