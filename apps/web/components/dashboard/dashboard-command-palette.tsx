"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Command, Search, X } from "lucide-react";
import type { RoleName } from "@uniportal/types";

export type DashboardCommandItem = {
  href: string;
  label: string;
  description: string;
  keywords?: string[];
};

const COMMON: DashboardCommandItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Return to your command centre",
    keywords: ["home", "overview"],
  },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    description: "Review updates and items requiring attention",
    keywords: ["inbox", "alerts"],
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    description: "View university dates and events",
    keywords: ["schedule", "timetable", "dates"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    description: "Open reports available to your role",
    keywords: ["analytics", "data"],
  },
];

const ROLE_ITEMS: Partial<Record<RoleName, DashboardCommandItem[]>> = {
  STUDENT: [
    {
      href: "/dashboard/academic",
      label: "Academic life",
      description: "Registration, progress and graduation readiness",
      keywords: ["courses", "registration", "academic"],
    },
    {
      href: "/dashboard/results",
      label: "Results & transcript",
      description: "View grades and academic history",
      keywords: ["grades", "transcript"],
    },
    {
      href: "/dashboard/fees",
      label: "Fees & payments",
      description: "Review obligations, invoices and receipts",
      keywords: ["finance", "fees", "payment"],
    },
  ],
  REGISTRAR: [
    {
      href: "/dashboard/admissions",
      label: "Admissions",
      description: "Review applications and decisions",
      keywords: ["applicants", "applications"],
    },
    {
      href: "/dashboard/students",
      label: "Student records",
      description: "Manage permitted student records",
      keywords: ["students", "matric"],
    },
    {
      href: "/dashboard/results",
      label: "Results",
      description: "Monitor processing and approvals",
      keywords: ["grades", "approval"],
    },
  ],
  DEAN: [
    {
      href: "/dashboard/academic",
      label: "Faculty academics",
      description: "Review academic activity within your faculty",
      keywords: ["faculty", "academic"],
    },
    {
      href: "/dashboard/results",
      label: "Faculty results",
      description: "Review result activity within your scope",
      keywords: ["grades", "results"],
    },
  ],
  HOD: [
    {
      href: "/dashboard/academic",
      label: "Department academics",
      description: "Coordinate courses and progression",
      keywords: ["department", "courses"],
    },
    {
      href: "/dashboard/results",
      label: "Department results",
      description: "Review results awaiting action",
      keywords: ["grades", "approval"],
    },
    {
      href: "/dashboard/students",
      label: "Department students",
      description: "Find permitted student records",
      keywords: ["students"],
    },
  ],
  BURSAR: [
    {
      href: "/dashboard/fees",
      label: "Fees & payments",
      description: "Monitor financial activity",
      keywords: ["finance", "collections", "payments"],
    },
    {
      href: "/dashboard/reports",
      label: "Financial reports",
      description: "Review finance reporting",
      keywords: ["revenue", "reports"],
    },
  ],
  HR_MANAGER: [
    {
      href: "/dashboard/hr",
      label: "HR",
      description: "Staff records and HR operations",
      keywords: ["employees", "people"],
    },
    {
      href: "/dashboard/payroll",
      label: "Payroll",
      description: "Payroll operations",
      keywords: ["salary", "payroll"],
    },
  ],
  VC: [
    {
      href: "/dashboard/reports",
      label: "Executive reports",
      description: "Decision-ready institutional reporting",
      keywords: ["executive", "analytics"],
    },
    {
      href: "/dashboard/audit-logs",
      label: "Governance",
      description: "Audit and security oversight",
      keywords: ["audit", "security"],
    },
  ],
  SUPER_ADMIN: [
    {
      href: "/dashboard/settings",
      label: "System settings",
      description: "Institutional configuration",
      keywords: ["configuration", "system"],
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit & security",
      description: "Review security-sensitive activity",
      keywords: ["audit", "security"],
    },
  ],
  SUPPORT_STAFF: [
    {
      href: "/dashboard/students",
      label: "Students",
      description: "Find students within your access",
      keywords: ["student", "support"],
    },
  ],
  STAFF: [
    {
      href: "/dashboard/academic",
      label: "Academic life",
      description: "Services available to your scope",
      keywords: ["academic", "courses"],
    },
    {
      href: "/dashboard/results",
      label: "Results & grades",
      description: "Assessment and results",
      keywords: ["grades"],
    },
  ],
};

export function DashboardCommandPalette({
  role,
  items: providedItems,
  groups,
}: {
  role: RoleName;
  items?: DashboardCommandItem[];
  groups?: { label: string; items: DashboardCommandItem[] }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open)
      window.setTimeout(
        () => document.getElementById("uniportal-command-search")?.focus(),
        0,
      );
  }, [open]);

  const items = useMemo(() => {
    const all = providedItems ?? [...COMMON, ...(ROLE_ITEMS[role] ?? [])];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((item) =>
      [item.label, item.description, ...(item.keywords ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [providedItems, query, role]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground shadow-sm hover:bg-muted"
        aria-label="Open UniPortal command search"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search or jump to…</span>
        <kbd className="ml-1 hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] bg-black/40 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-title"
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label="Close command search"
            onClick={() => setOpen(false)}
          />
          <div className="relative mx-auto mt-[8vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Command className="h-5 w-5 text-muted-foreground" />
              <label htmlFor="uniportal-command-search" className="sr-only">
                Search UniPortal
              </label>
              <input
                id="uniportal-command-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search services, tasks and pages…"
                className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              id="command-title"
              className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Available to your role
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {groups && !query.trim() ? (
                groups.map((group) => (
                  <div key={group.label} className="mb-3 last:mb-0">
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={`${item.href}-${item.label}`}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="group flex items-center gap-3 rounded-xl p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {item.label}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {item.description}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[--color-primary]" />
                      </Link>
                    ))}
                  </div>
                ))
              ) : items.length ? (
                items.map((item) => (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="group flex items-center gap-3 rounded-xl p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[--color-primary]" />
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No authorized destination matches that search.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-semibold">
                Esc
              </kbd>{" "}
              to close{" "}
              <span className="ml-auto">
                Only destinations available to your role are shown.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
