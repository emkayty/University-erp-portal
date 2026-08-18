"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Menu,
  X,
  Search,
  Bell,
  ChevronRight,
  LogOut,
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  ClipboardCheck,
  ListChecks,
  ShieldAlert,
  UserCog,
  Users,
  WalletCards,
  BarChart3,
  BookOpen,
  CalendarDays,
  Building2,
  ShieldCheck,
  Library,
  HeartPulse,
  Bus,
  FlaskConical,
  Settings,
  FileText,
  Sparkles,
} from "lucide-react";

import { useCurrentUser, useLogout } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth.store";
import { cn, getInitials } from "@/lib/utils";
import type { RoleName, StaffScope } from "@uniportal/types";

const ALL_NAV = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: "ALL",
  },
  {
    href: "/dashboard/admissions",
    label: "Admissions",
    icon: ClipboardList,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF"],
  },
  {
    href: "/dashboard/students",
    label: "Students",
    icon: GraduationCap,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "STAFF",
      "STUDENT",
    ],
  },
  {
    href: "/dashboard/academic",
    label: "Academic Life",
    icon: BookOpen,
    roles: "ALL",
  },
  {
    href: "/dashboard/assessment",
    label: "Assessment",
    icon: ClipboardCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF"],
  },
  {
    href: "/dashboard/exams",
    label: "Exams",
    icon: ListChecks,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/enterprise",
    label: "Enterprise Operations",
    icon: Building2,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "HR_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: Bell,
    roles: "ALL",
  },
  {
    href: "/dashboard/smart-operations",
    label: "Smart Operations",
    icon: Sparkles,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF"],
  },
  {
    href: "/dashboard/results",
    label: "Results & Grades",
    icon: BarChart3,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "STAFF",
      "STUDENT",
    ],
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    icon: CalendarDays,
    roles: "ALL",
  },
  {
    href: "/dashboard/curriculum",
    label: "Curriculum",
    icon: FileText,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF"],
  },
  {
    href: "/dashboard/clearance",
    label: "Clearance",
    icon: ClipboardCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "BURSAR", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/fees",
    label: "Fees & Payments",
    icon: WalletCards,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "BURSAR", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/library",
    label: "Library",
    icon: Library,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/lms",
    label: "Learning",
    icon: BookOpen,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/hr",
    label: "HR",
    icon: Users,
    roles: ["SUPER_ADMIN", "VC", "HR_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/payroll",
    label: "Payroll",
    icon: WalletCards,
    roles: ["SUPER_ADMIN", "VC", "BURSAR", "HR_MANAGER"],
  },
  {
    href: "/dashboard/hostel",
    label: "Hostel",
    icon: Building2,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/clinic",
    label: "Health",
    icon: HeartPulse,
    roles: ["SUPER_ADMIN", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/transport",
    label: "Transport",
    icon: Bus,
    roles: ["SUPER_ADMIN", "VC", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/research",
    label: "Research",
    icon: FlaskConical,
    roles: ["SUPER_ADMIN", "VC", "STAFF"],
  },
  {
    href: "/dashboard/alumni",
    label: "Alumni",
    icon: Users,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: BarChart3,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "BURSAR",
      "HR_MANAGER",
      "STAFF",
    ],
  },
  {
    href: "/dashboard/privacy",
    label: "Privacy Operations",
    icon: ShieldAlert,
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/dashboard/security-incidents",
    label: "Security Incidents",
    icon: ShieldAlert,
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/dashboard/users",
    label: "User Administration",
    icon: UserCog,
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/dashboard/audit-logs",
    label: "Audit & Security",
    icon: ShieldCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR"],
  },
  {
    href: "/dashboard/policies",
    label: "University Policies",
    icon: FileText,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR"],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    roles: ["SUPER_ADMIN", "VC"],
  },
] as const;

function canSee(item: (typeof ALL_NAV)[number], role?: RoleName) {
  return (
    item.roles === "ALL" ||
    (!!role && (item.roles as readonly RoleName[]).includes(role))
  );
}

function roleLabel(role?: RoleName) {
  return (
    role
      ?.replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "User"
  );
}

function scopeLabel(
  scope?: { scopes: StaffScope[]; deptId?: string; facultyId?: string } | null,
) {
  if (!scope?.scopes?.length) return "";
  return scope.scopes.map((s) => s.replace(/_/g, " ")).join(" · ");
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { isLoading, isError } = useCurrentUser();
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (isError && !isLoading)
      router.replace("/auth/login?reason=session_expired");
  }, [isError, isLoading, router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = useMemo(
    () => ALL_NAV.filter((item) => canSee(item, user?.primaryRole)),
    [user?.primaryRole],
  );
  const current = nav.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href)),
  );
  const title = current?.label ?? "Dashboard";
  const initials = user
    ? getInitials(user.email.split("@")[0]?.replace(/[._-]/g, " ") ?? "")
    : "?";

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="flex flex-col items-center gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[--color-primary] border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Preparing your workspace…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-card transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            aria-label="UniPortal ERP home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[--color-primary] text-xs font-bold text-white shadow-sm">
              UP
            </span>
            <span>
              <span className="block text-sm font-bold">UniPortal ERP</span>
              <span className="block text-[11px] text-muted-foreground">
                University workspace
              </span>
            </span>
          </Link>
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          className="flex-1 overflow-y-auto px-3 py-4"
          aria-label="Main navigation"
        >
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <ul className="space-y-1">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-[--color-primary] font-semibold text-white shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <ChevronRight className="ml-auto h-4 w-4 opacity-70" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[--color-primary]/10 text-xs font-bold text-[--color-primary]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {user?.email ?? "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {roleLabel(user?.primaryRole)}
              </p>
            </div>
            <button
              onClick={() => logout()}
              disabled={loggingOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[280px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              UniPortal / {title}
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {title}
            </h1>
          </div>
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground sm:flex"
            aria-label="Open quick search"
          >
            <Search className="h-4 w-4" />
            Search{" "}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
          <span className="hidden rounded-full bg-[--color-primary]/10 px-2.5 py-1 text-[11px] font-semibold text-[--color-primary] sm:inline-flex">
            {roleLabel(user?.primaryRole)}
          </span>
        </header>

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>

      {commandOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/30 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Quick navigation"
          onMouseDown={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                className="h-14 flex-1 bg-transparent text-sm outline-none"
                placeholder="Go to a workspace…"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCommandOpen(false);
                }}
              />
              <kbd className="rounded border bg-muted px-2 py-1 text-[10px]">
                ESC
              </kbd>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setCommandOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-[--color-primary]" />
                    {item.label}
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
