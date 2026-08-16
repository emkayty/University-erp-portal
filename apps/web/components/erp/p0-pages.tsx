import React from "react";
import { PageShell } from "./ui";

function P0Frame({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <PageShell title={title} description={description}>
      <div className="erp-p0-stack">{children}</div>
    </PageShell>
  );
}

export function DashboardP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Dashboard" description="See what needs attention and what you can do next.">{children}</P0Frame>;
}

export function AdmissionsP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Admissions" description="Review applicants, requirements and decisions in one clear workflow.">{children}</P0Frame>;
}

export function StudentP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Student" description="Understand the student's current academic and institutional status.">{children}</P0Frame>;
}

export function CourseRegistrationP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Course Registration" description="Choose eligible courses, resolve conflicts and complete registration.">{children}</P0Frame>;
}

export function ExamsResultsP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Exams & Results" description="Enter, validate, moderate and publish results using configured academic rules.">{children}</P0Frame>;
}

export function FinanceP0({ children }: { children: React.ReactNode }) {
  return <P0Frame title="Finance" description="Understand balances, invoices, payments, receipts and exceptions.">{children}</P0Frame>;
}
