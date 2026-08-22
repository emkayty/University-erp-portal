"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Library,
  ListChecks,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useMyDashboard } from "@/hooks/use-reports";
import type { DashboardSnapshotV1, RoleName } from "@uniportal/types";
import { cn } from "@/lib/utils";
import { effectiveRolesOf } from "@/lib/authz";
import {
  AttentionQueue,
  type AttentionQueueItem,
  DashboardEmptyState,
  DashboardSection,
  DataFreshness,
  MetricCard,
  PermissionNotice,
  WorkflowSteps,
} from "@/components/dashboard/dashboard-primitives";

const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "System Administrator",
  VC: "Vice Chancellor",
  REGISTRAR: "Registrar",
  DEAN: "Dean",
  HOD: "Head of Department",
  BURSAR: "Bursar",
  HR_MANAGER: "HR Manager",
  SUPPORT_STAFF: "Support Staff",
  STAFF: "Staff",
  STUDENT: "Student",
};

const ROLE_COPY: Record<
  RoleName,
  {
    title: string;
    description: string;
    primary: { href: string; label: string };
  }
> = {
  SUPER_ADMIN: {
    title: "System control centre",
    description:
      "Govern the platform, security, configuration and operational health.",
    primary: { href: "/dashboard/settings", label: "Open administration" },
  },
  VC: {
    title: "Executive command centre",
    description:
      "See institutional performance, exceptions and decision-ready signals.",
    primary: { href: "/dashboard/reports", label: "Open executive reports" },
  },
  REGISTRAR: {
    title: "Registry command centre",
    description:
      "Keep admissions, records, results, progression and graduation moving.",
    primary: { href: "/dashboard/admissions", label: "Review admissions" },
  },
  DEAN: {
    title: "Faculty command centre",
    description:
      "Focus on faculty performance, students and decisions within your scope.",
    primary: { href: "/dashboard/academic", label: "Open faculty academics" },
  },
  HOD: {
    title: "Department command centre",
    description:
      "Coordinate courses, students, results and academic decisions for your department.",
    primary: { href: "/dashboard/results", label: "Review results" },
  },
  BURSAR: {
    title: "Finance command centre",
    description:
      "Monitor collections, outstanding obligations and financial exceptions.",
    primary: { href: "/dashboard/fees", label: "Open finance" },
  },
  HR_MANAGER: {
    title: "People operations",
    description:
      "Manage workforce activity, leave and payroll with clear priorities.",
    primary: { href: "/dashboard/hr", label: "Open HR" },
  },
  SUPPORT_STAFF: {
    title: "Support workspace",
    description:
      "Help students and staff resolve operational requests quickly and safely.",
    primary: { href: "/dashboard/students", label: "Find a student" },
  },
  STAFF: {
    title: "Your university workspace",
    description:
      "Access services, tasks and academic information available to your role.",
    primary: { href: "/dashboard/academic", label: "Open academic operations" },
  },
  STUDENT: {
    title: "My university",
    description:
      "A focused view of your academic journey, finances and university services.",
    primary: { href: "/dashboard/academic", label: "Open academic life" },
  },
};

const ACTIONS: Record<
  RoleName,
  { href: string; label: string; description: string; icon: typeof BookOpen }[]
> = {
  STUDENT: [
    {
      href: "/dashboard/academic",
      label: "Academic life",
      description: "Registration, progress and graduation readiness",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/results",
      label: "Results & transcript",
      description: "Grades and academic history",
      icon: FileText,
    },
    {
      href: "/dashboard/calendar",
      label: "Calendar",
      description: "Important academic dates",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/fees",
      label: "Fees & payments",
      description: "Review obligations and receipts",
      icon: WalletCards,
    },
  ],
  REGISTRAR: [
    {
      href: "/dashboard/admissions",
      label: "Admissions",
      description: "Review applications and decisions",
      icon: CheckCircle2,
    },
    {
      href: "/dashboard/students",
      label: "Student records",
      description: "Manage the student lifecycle",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/results",
      label: "Results",
      description: "Monitor processing and approvals",
      icon: FileText,
    },
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Registration and progression",
      icon: BookOpen,
    },
  ],
  DEAN: [
    {
      href: "/dashboard/academic",
      label: "Faculty academics",
      description: "Monitor academic lifecycle activity",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results",
      description: "Review faculty result activity",
      icon: FileText,
    },
    {
      href: "/dashboard/students",
      label: "Students",
      description: "Review permitted academic records",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      description: "Use evidence for decisions",
      icon: LayoutGrid,
    },
  ],
  HOD: [
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Courses, registration and progression",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results & grades",
      description: "Review departmental results",
      icon: FileText,
    },
    {
      href: "/dashboard/students",
      label: "Students",
      description: "Find permitted student records",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/calendar",
      label: "Calendar",
      description: "Teaching and academic dates",
      icon: CalendarDays,
    },
  ],
  BURSAR: [
    {
      href: "/dashboard/fees",
      label: "Fees & payments",
      description: "Monitor financial activity",
      icon: WalletCards,
    },
    {
      href: "/dashboard/reports",
      label: "Financial reports",
      description: "Review finance reporting",
      icon: FileText,
    },
    {
      href: "/dashboard/students",
      label: "Student accounts",
      description: "Support account enquiries",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/clearance",
      label: "Clearance status",
      description: "Review finance-related clearance items",
      icon: ShieldCheck,
    },
  ],
  HR_MANAGER: [
    {
      href: "/dashboard/hr",
      label: "HR",
      description: "Staff records and HR operations",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/payroll",
      label: "Payroll",
      description: "Payroll operations",
      icon: WalletCards,
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      description: "People and payroll reporting",
      icon: FileText,
    },
    {
      href: "/dashboard/enterprise",
      label: "Enterprise operations",
      description: "Review operational workflows",
      icon: ShieldCheck,
    },
  ],
  VC: [
    {
      href: "/dashboard/reports",
      label: "Executive reports",
      description: "Decision-ready reporting",
      icon: FileText,
    },
    {
      href: "/dashboard/academic",
      label: "Academic overview",
      description: "Academic lifecycle",
      icon: BookOpen,
    },
    {
      href: "/dashboard/admissions",
      label: "Admissions",
      description: "Enrollment pipeline",
      icon: CheckCircle2,
    },
    {
      href: "/dashboard/policies",
      label: "University policies",
      description: "Review approved institutional policy",
      icon: ShieldCheck,
    },
  ],
  SUPER_ADMIN: [
    {
      href: "/dashboard/settings",
      label: "System settings",
      description: "Institutional configuration",
      icon: Settings2,
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit & security",
      description: "Security-sensitive activity",
      icon: ShieldCheck,
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      description: "Operational reporting",
      icon: FileText,
    },
    {
      href: "/dashboard/reliability",
      label: "Reliability",
      description: "Service health and failed jobs",
      icon: ListChecks,
    },
  ],
  SUPPORT_STAFF: [
    {
      href: "/dashboard/students",
      label: "Students",
      description: "Find students within your access",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/calendar",
      label: "Calendar",
      description: "Important university dates",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      description: "Available support reporting",
      icon: FileText,
    },
    {
      href: "/dashboard/notifications",
      label: "Notifications",
      description: "Review operational updates",
      icon: Bell,
    },
  ],
  STAFF: [
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Services available to your scope",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results & grades",
      description: "Assessment and results",
      icon: FileText,
    },
    {
      href: "/dashboard/calendar",
      label: "Calendar",
      description: "Important university dates",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      description: "Available operational reports",
      icon: LayoutGrid,
    },
  ],
};

const ACADEMIC_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "VC",
  "REGISTRAR",
  "DEAN",
  "HOD",
  "STAFF",
  "STUDENT",
];

type WorkspaceCard = {
  href: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
};

const WORKSPACE_CARDS: Record<RoleName, WorkspaceCard[]> = {
  STUDENT: [
    {
      href: "/dashboard/academic",
      label: "My academic journey",
      description: "Registration, learning, results and graduation readiness",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/fees",
      label: "My finances",
      description: "Fees, payments, receipts and clearance obligations",
      icon: WalletCards,
    },
    {
      href: "/dashboard/calendar",
      label: "Campus services",
      description: "Calendar, library, health, hostel and transport",
      icon: CalendarDays,
    },
  ],
  HOD: [
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Courses, registration, progression and curriculum",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results governance",
      description: "Review and move departmental results forward",
      icon: FileText,
    },
    {
      href: "/dashboard/students",
      label: "Department students",
      description: "Find permitted records and academic exceptions",
      icon: GraduationCap,
    },
  ],
  DEAN: [
    {
      href: "/dashboard/academic",
      label: "Faculty academics",
      description: "Monitor the faculty academic lifecycle",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Faculty results",
      description: "Review result activity within your scope",
      icon: FileText,
    },
    {
      href: "/dashboard/reports",
      label: "Decision reports",
      description: "Use verified evidence for faculty decisions",
      icon: LayoutGrid,
    },
  ],
  REGISTRAR: [
    {
      href: "/dashboard/admissions",
      label: "Admissions & lifecycle",
      description: "Applications, verification, clearance and matriculation",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Registration, progression and graduation",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results governance",
      description: "Monitor approvals, amendments and publication",
      icon: FileText,
    },
  ],
  BURSAR: [
    {
      href: "/dashboard/fees",
      label: "Finance operations",
      description: "Fees, payments, reconciliation and exceptions",
      icon: WalletCards,
    },
    {
      href: "/dashboard/reports",
      label: "Financial intelligence",
      description: "Review collection and financial reports",
      icon: LayoutGrid,
    },
    {
      href: "/dashboard/clearance",
      label: "Clearance",
      description: "Review finance-related clearance status",
      icon: ShieldCheck,
    },
  ],
  HR_MANAGER: [
    {
      href: "/dashboard/hr",
      label: "People operations",
      description: "Staff records, leave and workforce workflows",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/payroll",
      label: "Payroll",
      description: "Review governed payroll operations",
      icon: WalletCards,
    },
    {
      href: "/dashboard/reports",
      label: "People reports",
      description: "Use verified workforce and payroll evidence",
      icon: LayoutGrid,
    },
  ],
  SUPPORT_STAFF: [
    {
      href: "/dashboard/students",
      label: "Student support",
      description: "Find records within your permitted access",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/calendar",
      label: "University calendar",
      description: "Use current institutional dates and events",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/notifications",
      label: "Updates",
      description: "Review operational messages and follow-ups",
      icon: Bell,
    },
  ],
  STAFF: [
    {
      href: "/dashboard/academic",
      label: "Academic operations",
      description: "Services available to your role and scope",
      icon: BookOpen,
    },
    {
      href: "/dashboard/results",
      label: "Results & grades",
      description: "Assessment and governed result workflows",
      icon: FileText,
    },
    {
      href: "/dashboard/calendar",
      label: "Campus services",
      description: "Use the university services available to you",
      icon: CalendarDays,
    },
  ],
  SUPER_ADMIN: [
    {
      href: "/dashboard/settings",
      label: "Administration",
      description: "Institutional configuration and access",
      icon: Settings2,
    },
    {
      href: "/dashboard/audit-logs",
      label: "Governance & security",
      description: "Audit, incidents, policies and privacy",
      icon: ShieldCheck,
    },
    {
      href: "/dashboard/reliability",
      label: "Platform health",
      description: "Service health, queues and operational recovery",
      icon: ListChecks,
    },
  ],
  VC: [
    {
      href: "/dashboard/reports",
      label: "Executive intelligence",
      description: "Decision-ready institutional reporting",
      icon: LayoutGrid,
    },
    {
      href: "/dashboard/academic",
      label: "Academic lifecycle",
      description: "Academic performance and progression",
      icon: BookOpen,
    },
    {
      href: "/dashboard/admissions",
      label: "Enrollment pipeline",
      description: "Admissions and student lifecycle signals",
      icon: GraduationCap,
    },
  ],
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function SnapshotMetrics({ snapshot }: { snapshot: DashboardSnapshotV1 }) {
  if (snapshot.kind === "student") {
    const d = snapshot.data;
    const outstanding = d.outstandingFees.reduce(
      (sum, fee) => sum + Number(fee.balance),
      0,
    );
    const overdue = d.activeLoans.some(
      (loan) => new Date(loan.dueDate) < new Date(),
    );
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Current CGPA"
          value={String(d.student.cgpa)}
          detail={`${d.student.level} level · ${d.student.status}`}
          href="/dashboard/results"
          tone="positive"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label="Fee status"
          value={d.student.feeCleared ? "Cleared" : formatMoney(outstanding)}
          detail={
            d.student.feeCleared
              ? "No outstanding fee shown"
              : "Outstanding balance"
          }
          href="/dashboard/fees"
          tone={d.student.feeCleared ? "positive" : "warning"}
          icon={<WalletCards className="h-4 w-4" />}
        />
        <MetricCard
          label="Graduation clearance"
          value={d.clearance.allCleared ? "Complete" : "In progress"}
          detail={`${d.clearance.items.length} clearance items`}
          href="/dashboard/clearance"
          tone={d.clearance.allCleared ? "positive" : "warning"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Active library loans"
          value={String(d.activeLoans.length)}
          detail={overdue ? "At least one overdue" : "No overdue item detected"}
          href="/dashboard/library"
          tone={overdue ? "warning" : "positive"}
          icon={<Library className="h-4 w-4" />}
        />
      </div>
    );
  }
  if (snapshot.kind === "executive") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Students"
          value={formatNumber(snapshot.data.students.total)}
          detail={
            snapshot.data.academicCalendar
              ? `${snapshot.data.academicCalendar.academicYear} · ${snapshot.data.academicCalendar.status}`
              : "No active academic calendar"
          }
          href="/dashboard/reports"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label="Collected"
          value={formatMoney(snapshot.data.fees.totalCollected)}
          detail={`${snapshot.data.fees.collectionRate} collection rate`}
          href="/dashboard/fees"
          tone="positive"
          icon={<WalletCards className="h-4 w-4" />}
        />
        <MetricCard
          label="Results pending"
          value={formatNumber(snapshot.data.results.pendingPublication)}
          detail="Awaiting publication workflow"
          href="/dashboard/results"
          tone={
            snapshot.data.results.pendingPublication ? "warning" : "positive"
          }
          icon={<FileText className="h-4 w-4" />}
        />
        <MetricCard
          label="Active payroll runs"
          value={formatNumber(snapshot.data.payroll.activeRuns)}
          href="/dashboard/payroll"
          icon={<ListChecks className="h-4 w-4" />}
        />
      </div>
    );
  }
  if (snapshot.kind === "department") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active students"
          value={formatNumber(snapshot.data.totalActiveStudents)}
          href="/dashboard/students"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label="Courses"
          value={formatNumber(snapshot.data.totalCourses)}
          href="/dashboard/course-offerings"
          icon={<BookOpen className="h-4 w-4" />}
        />
        <MetricCard
          label="Active staff"
          value={formatNumber(snapshot.data.totalActiveStaff)}
          href="/dashboard/hr"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <MetricCard
          label="Results awaiting approval"
          value={formatNumber(snapshot.data.resultsAwaitingHodApproval)}
          detail="Requires review"
          href="/dashboard/results"
          tone={
            snapshot.data.resultsAwaitingHodApproval ? "warning" : "positive"
          }
          icon={<FileText className="h-4 w-4" />}
        />
      </div>
    );
  }
  if (snapshot.kind === "faculty") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active students"
          value={formatNumber(snapshot.data.students)}
          href="/dashboard/students"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label="Departments"
          value={formatNumber(snapshot.data.departments)}
          href="/dashboard/academic"
          icon={<BookOpen className="h-4 w-4" />}
        />
        <MetricCard
          label="Active staff"
          value={formatNumber(snapshot.data.staff)}
          href="/dashboard/hr"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <MetricCard
          label="Pending results"
          value={formatNumber(snapshot.data.pendingResults)}
          detail="Within faculty scope"
          href="/dashboard/results"
          tone={snapshot.data.pendingResults ? "warning" : "positive"}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>
    );
  }
  if (snapshot.kind === "finance") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Outstanding"
          value={formatMoney(snapshot.data.outstanding)}
          detail={`${snapshot.data.invoiceCount.toLocaleString()} invoices`}
          href="/dashboard/fees"
          tone={snapshot.data.outstanding ? "warning" : "positive"}
          icon={<WalletCards className="h-4 w-4" />}
        />
        <MetricCard
          label="Collected"
          value={formatMoney(snapshot.data.collected)}
          detail={`${snapshot.data.collectionRate}% collection rate`}
          href="/dashboard/fees"
          tone="positive"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <MetricCard
          label="Last 7 days"
          value={formatMoney(snapshot.data.last7DaysAmount)}
          detail={`${snapshot.data.last7DaysCount} successful payments`}
          href="/dashboard/reports"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <MetricCard
          label="Reversed payments"
          value={formatNumber(snapshot.data.pendingRefunds)}
          detail="Requires reconciliation review"
          href="/dashboard/fees"
          tone={snapshot.data.pendingRefunds ? "warning" : "positive"}
          icon={<CircleAlert className="h-4 w-4" />}
        />
      </div>
    );
  }
  if (snapshot.kind === "people") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Total staff"
          value={formatNumber(snapshot.data.totalStaff)}
          href="/dashboard/hr"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label="Active payroll runs"
          value={formatNumber(snapshot.data.activePayroll)}
          href="/dashboard/payroll"
          icon={<WalletCards className="h-4 w-4" />}
        />
        <MetricCard
          label="Pending leave"
          value={formatNumber(snapshot.data.pendingLeave)}
          detail="Requires review"
          href="/dashboard/hr"
          tone={snapshot.data.pendingLeave ? "warning" : "positive"}
          icon={<Clock3 className="h-4 w-4" />}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        label="Students"
        value={formatNumber(snapshot.data.students)}
        href="/dashboard/students"
        icon={<GraduationCap className="h-4 w-4" />}
      />
      <MetricCard
        label="Courses"
        value={formatNumber(snapshot.data.courses)}
        href="/dashboard/course-offerings"
        icon={<BookOpen className="h-4 w-4" />}
      />
      <MetricCard
        label="Pending results"
        value={formatNumber(snapshot.data.pendingResults)}
        detail="Within your permitted workspace"
        href="/dashboard/results"
        tone={snapshot.data.pendingResults ? "warning" : "positive"}
        icon={<FileText className="h-4 w-4" />}
      />
    </div>
  );
}

function getAttentionItems(
  snapshot: DashboardSnapshotV1,
): AttentionQueueItem[] {
  if (snapshot.kind === "student") {
    const due = snapshot.data.outstandingFees.reduce(
      (sum, fee) => sum + Number(fee.balance),
      0,
    );
    const items: AttentionQueueItem[] = [];
    if (!snapshot.data.student.feeCleared && due > 0)
      items.push({
        id: "student-fees",
        title: "Fee account needs attention",
        detail: `${formatMoney(due)} is outstanding before finance-gated services.`,
        status: "Review fees",
        href: "/dashboard/fees",
        tone: "warning",
      });
    if (!snapshot.data.clearance.allCleared)
      items.push({
        id: "student-clearance",
        title: "Clearance is in progress",
        detail:
          "Review only the clearance items that apply to your current journey.",
        status: "Continue",
        href: "/dashboard/clearance",
        tone: "warning",
      });
    const overdue = snapshot.data.activeLoans.filter(
      (loan) => new Date(loan.dueDate) < new Date(),
    );
    if (overdue.length)
      items.push({
        id: "student-library",
        title: `${overdue.length} library item${overdue.length === 1 ? "" : "s"} overdue`,
        detail: "Review the loan details and any applicable fine.",
        status: "Review",
        href: "/dashboard/library",
        tone: "danger",
      });
    return items;
  }
  if (snapshot.kind === "executive" && snapshot.data.results.pendingPublication)
    return [
      {
        id: "executive-results",
        title: "Results are awaiting publication",
        detail:
          "Review the publication workflow before the next reporting cycle.",
        status: `${formatNumber(snapshot.data.results.pendingPublication)} pending`,
        href: "/dashboard/results",
        tone: "warning",
      },
    ];
  if (
    snapshot.kind === "department" &&
    snapshot.data.resultsAwaitingHodApproval
  )
    return [
      {
        id: "department-results",
        title: "Departmental results require review",
        detail: "Open the governed approval queue for your department scope.",
        status: `${formatNumber(snapshot.data.resultsAwaitingHodApproval)} pending`,
        href: "/dashboard/results",
        tone: "warning",
      },
    ];
  if (snapshot.kind === "faculty" && snapshot.data.pendingResults)
    return [
      {
        id: "faculty-results",
        title: "Faculty results require attention",
        detail: "Review the pending result activity within your faculty scope.",
        status: `${formatNumber(snapshot.data.pendingResults)} pending`,
        href: "/dashboard/results",
        tone: "warning",
      },
    ];
  if (snapshot.kind === "finance") {
    const items: AttentionQueueItem[] = [];
    if (snapshot.data.outstanding > 0)
      items.push({
        id: "finance-outstanding",
        title: "Outstanding financial balance",
        detail: "Review receivables and reconciliation exceptions.",
        status: formatMoney(snapshot.data.outstanding),
        href: "/dashboard/fees",
        tone: "warning",
      });
    if (snapshot.data.pendingRefunds > 0)
      items.push({
        id: "finance-reversals",
        title: "Payment exceptions require review",
        detail:
          "Reversed or pending payment items are reported by the finance snapshot.",
        status: `${formatNumber(snapshot.data.pendingRefunds)} items`,
        href: "/dashboard/fees",
        tone: "danger",
      });
    return items;
  }
  if (snapshot.kind === "people" && snapshot.data.pendingLeave)
    return [
      {
        id: "people-leave",
        title: "Leave requests require review",
        detail:
          "Open People Operations to review the pending requests within your scope.",
        status: `${formatNumber(snapshot.data.pendingLeave)} pending`,
        href: "/dashboard/hr",
        tone: "warning",
      },
    ];
  if (snapshot.kind === "workspace" && snapshot.data.pendingResults)
    return [
      {
        id: "workspace-results",
        title: "Results require attention",
        detail:
          "Review the pending result activity within your permitted workspace.",
        status: `${formatNumber(snapshot.data.pendingResults)} pending`,
        href: "/dashboard/results",
        tone: "warning",
      },
    ];
  return [];
}

function SmartSummary({
  snapshot,
  role,
}: {
  snapshot: DashboardSnapshotV1;
  role: RoleName;
}) {
  const summary = useMemo(() => {
    if (snapshot.kind === "student") {
      const due = snapshot.data.outstandingFees.reduce(
        (sum, fee) => sum + Number(fee.balance),
        0,
      );
      const overdueLoans = snapshot.data.activeLoans.filter(
        (loan) => new Date(loan.dueDate) < new Date(),
      ).length;
      if (!snapshot.data.student.feeCleared && due > 0)
        return `Your account shows ${formatMoney(due)} outstanding. Review your fee account before registration or other gated services.`;
      if (!snapshot.data.clearance.allCleared)
        return "Your clearance is still in progress. Review the outstanding items and complete only the steps that apply to you.";
      if (overdueLoans)
        return `You have ${overdueLoans} overdue library item${overdueLoans > 1 ? "s" : ""}. Review the loan details to avoid additional fines.`;
      return "You are up to date on the dashboard signals available to you. Check your calendar and academic workspace for what is next.";
    }
    if (snapshot.kind === "executive")
      return snapshot.data.results.pendingPublication
        ? `${formatNumber(snapshot.data.results.pendingPublication)} results are still in the publication workflow. Review the academic exception before the next reporting cycle.`
        : "No result-publication exception is currently reported by the dashboard snapshot.";
    if (snapshot.kind === "department")
      return snapshot.data.resultsAwaitingHodApproval
        ? `${formatNumber(snapshot.data.resultsAwaitingHodApproval)} result records require departmental attention.`
        : "No departmental result-approval backlog is currently reported.";
    if (snapshot.kind === "faculty")
      return snapshot.data.pendingResults
        ? `${formatNumber(snapshot.data.pendingResults)} result records require attention within the faculty scope.`
        : "No faculty result backlog is currently reported.";
    if (snapshot.kind === "finance")
      return snapshot.data.outstanding > 0
        ? `${formatMoney(snapshot.data.outstanding)} remains outstanding across the current fee records. Use reconciliation and account views to investigate exceptions.`
        : "No outstanding fee balance is reported by the current finance snapshot.";
    if (snapshot.kind === "people")
      return snapshot.data.pendingLeave
        ? `${formatNumber(snapshot.data.pendingLeave)} leave request${snapshot.data.pendingLeave > 1 ? "s are" : " is"} awaiting review.`
        : "No pending leave request is reported by the current HR snapshot.";
    return snapshot.data.pendingResults
      ? `${formatNumber(snapshot.data.pendingResults)} result records require attention within your permitted workspace.`
      : `Your ${ROLE_LABELS[role].toLowerCase()} workspace has no result backlog reported by the current snapshot.`;
  }, [snapshot, role]);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Smart summary</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Verified dashboard data
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {summary}
        </p>
      </div>
    </div>
  );
}

function WorkspaceCards({ role }: { role: RoleName }) {
  const workspaces = WORKSPACE_CARDS[role];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {workspaces.map((workspace, index) => {
        const Icon = workspace.icon;
        return (
          <Link
            key={workspace.href}
            href={workspace.href}
            className={cn(
              "group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[--color-primary]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]",
              index === 0 &&
                "border-[--color-primary]/25 bg-[--color-primary]/[0.03]",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <ArrowRight
                className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[--color-primary]"
                aria-hidden="true"
              />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{workspace.label}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {workspace.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function TodayCard({ role }: { role: RoleName }) {
  const [date] = useState(() =>
    new Intl.DateTimeFormat("en-NG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date()),
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="enterprise-eyebrow">Today</p>
          <h2 className="mt-1 text-lg font-bold">{date}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ROLE_LABELS[role]} workspace · live schedules appear here when an
            authoritative source is available.
          </p>
        </div>
        <Clock3 className="h-5 w-5 text-muted-foreground" />
      </div>
      <DashboardEmptyState
        icon={<CalendarDays className="h-5 w-5" />}
        title="No invented schedule"
        description="Timetables, deadlines and appointments come from live university services. This dashboard will not fabricate events when a source is unavailable."
        tone="info"
        action={
          <Link
            href="/dashboard/calendar"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[--color-primary] px-3 text-sm font-semibold text-white"
          >
            Open calendar <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const role = effectiveRolesOf(user)[0] ?? "STUDENT";
  const { data: snapshot, isLoading, isError, refetch } = useMyDashboard();
  const copy = ROLE_COPY[role];
  const quickActions = ACTIONS[role];
  const attentionItems = snapshot ? getAttentionItems(snapshot) : [];
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        `uniportal:dashboard:${role}:hidden`,
      );
      if (stored) setHidden(JSON.parse(stored) as Record<string, boolean>);
    } catch {
      // Preferences are optional and never block dashboard rendering.
    }
  }, [role]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `uniportal:dashboard:${role}:hidden`,
        JSON.stringify(hidden),
      );
    } catch {
      // Preferences are optional.
    }
  }, [hidden, role]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const displayName =
    snapshot?.kind === "student"
      ? snapshot.data.student.firstName
      : user?.email?.split("@")[0]?.replace(/[._-]/g, " ") || "there";
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const showAcademicLifecycle = ACADEMIC_ROLES.includes(role);

  const toggle = (key: string) => {
    const nextHidden = !hidden[key];
    setHidden((current) => ({ ...current, [key]: nextHidden }));
    setFeedback(`${nextHidden ? "Hidden" : "Shown"} dashboard section.`);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-10">
      <header className="glass-accent rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="enterprise-eyebrow">
                {salutation}, {displayName}
              </span>
              <span className="rounded-full bg-[--color-primary]/10 px-2 py-1 text-xs font-semibold">
                {ROLE_LABELS[role]}
              </span>
            </div>
            <h1 className="text-balance mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
            <div className="mt-4">
              <DataFreshness
                status={
                  isError
                    ? "unavailable"
                    : isLoading || !snapshot
                      ? "loading"
                      : "verified"
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
              aria-label="Customize dashboard"
            >
              <Settings2 className="h-4 w-4" />
              Customize
            </button>
            <Link
              href={copy.primary.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[--color-primary] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[--color-primary-dark]"
            >
              {copy.primary.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {snapshot?.kind === "student" ? (
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-3 py-1.5">
              {snapshot.data.student.matricNo}
            </span>
            <span className="rounded-full bg-muted px-3 py-1.5">
              {snapshot.data.student.programme.name}
            </span>
            <span className="rounded-full bg-muted px-3 py-1.5">
              {snapshot.data.student.department.name}
            </span>
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Loading dashboard metrics"
          role="status"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50"
            />
          ))}
        </div>
      ) : null}
      {feedback ? (
        <div
          className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </div>
      ) : null}
      {isError ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">
              Dashboard data is temporarily unavailable
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The interface remains usable, but live metrics were not returned.
              No placeholder figures are shown and no data was changed.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-background px-3 text-sm font-semibold ring-1 ring-border hover:bg-muted"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <DashboardSection
          eyebrow="Priority"
          title="Needs attention"
          description="Only verified obligations, exceptions, or decisions requiring action are shown."
        >
          <AttentionQueue items={attentionItems} />
        </DashboardSection>
      ) : null}
      {snapshot && !hidden.metrics ? (
        <DashboardSection
          eyebrow="At a glance"
          title="Key metrics"
          description="Current values within your permitted role and organizational scope."
        >
          <SnapshotMetrics snapshot={snapshot} />
        </DashboardSection>
      ) : null}
      {snapshot && !hidden.summary ? (
        <DashboardSection
          title="Decision summary"
          description="A short explanation based only on the dashboard snapshot."
        >
          <SmartSummary snapshot={snapshot} role={role} />
        </DashboardSection>
      ) : null}
      {WORKSPACE_CARDS[role].length ? (
        <DashboardSection
          eyebrow="Workspace map"
          title="Your workspaces"
          description="Start with the area of responsibility you want to move forward. Every destination remains filtered by your role and scope."
        >
          <WorkspaceCards role={role} />
        </DashboardSection>
      ) : null}
      {showAcademicLifecycle ? (
        <DashboardSection
          eyebrow="Workflow map"
          title="Academic lifecycle"
          description="A shared map of the stages that connect academic operations. The current stage is shown only when returned by an authoritative workflow."
        >
          <WorkflowSteps
            steps={[
              {
                label: "Curriculum",
                description: "Programmes and course structure",
              },
              { label: "Offering", description: "Courses opened for a period" },
              {
                label: "Registration",
                description: "Student course registration",
              },
              {
                label: "Assessment",
                description: "Continuous assessment and evidence",
              },
              {
                label: "Exams & results",
                description: "Attendance, marks, review and publication",
              },
              {
                label: "Progress & graduation",
                description: "Degree audit and completion",
              },
            ]}
            current={-1}
          />
        </DashboardSection>
      ) : null}
      {!hidden.today ? (
        <DashboardSection
          eyebrow="Planning"
          title="Today and upcoming"
          description="Live dates and schedules are shown only when the responsible university service provides them."
        >
          <TodayCard role={role} />
        </DashboardSection>
      ) : null}
      {!hidden.actions ? (
        <DashboardSection
          eyebrow="Workflow shortcuts"
          title="Next best actions"
          description="Clear entry points for work relevant to your current role."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn(
                    "group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[--color-primary]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]",
                    index === 0 && "attention-card xl:col-span-2 xl:p-6",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[--color-primary]" />
                  </div>
                  <h3
                    className={cn(
                      "mt-4 text-sm font-semibold",
                      index === 0 && "xl:text-base",
                    )}
                  >
                    {action.label}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {action.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </DashboardSection>
      ) : null}
      {!hidden.trust ? (
        <DashboardSection
          eyebrow="Trust and support"
          title="Privacy, access and help"
          description="Use the appropriate university service when you need more detail or assistance."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <PermissionNotice />
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]">
                <HelpCircle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Need help?</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use the relevant service page or contact authorized university
                  support. Never attempt to bypass an access restriction.
                </p>
              </div>
            </div>
          </div>
        </DashboardSection>
      ) : null}

      {customizeOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customize-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="customize-title" className="text-base font-semibold">
                  Customize dashboard
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hide optional sections only. Critical attention items remain
                  visible.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="Close customization"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {[
                ["metrics", "Key metrics"],
                ["summary", "Decision summary"],
                ["today", "Today and upcoming"],
                ["actions", "Next best actions"],
                ["trust", "Privacy, access and help"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-sm hover:bg-muted"
                >
                  <span>{label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-xs font-semibold",
                      hidden[key]
                        ? "bg-muted text-muted-foreground"
                        : "bg-[--color-primary]/10 text-[--color-primary]",
                    )}
                  >
                    {hidden[key] ? "Hidden" : "Shown"}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setHidden({});
                setCustomizeOpen(false);
                setFeedback("Dashboard sections restored.");
              }}
              className="mt-4 min-h-11 w-full rounded-xl bg-[--color-primary] px-4 text-sm font-semibold text-white"
            >
              Reset dashboard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
