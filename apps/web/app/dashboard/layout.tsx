"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Menu,
  X,
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
  Activity,
  BadgeCheck,
  ChevronDown,
} from "lucide-react";

import { useCurrentUser, useLogout } from "@/hooks/use-auth";
import { useModuleCapabilities, usePublicBranding } from "@/hooks/use-settings";
import { useAuthStore } from "@/stores/auth.store";
import { cn, getInitials } from "@/lib/utils";
import {
  effectiveRolesOf,
  effectiveScopesOf,
  MODULE_ACCESS,
} from "@/lib/authz";
import type { RoleName, StaffScope } from "@uniportal/types";
import {
  DashboardCommandPalette,
  type DashboardCommandItem,
} from "@/components/dashboard/dashboard-command-palette";

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
    scope: "admissions",
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
    href: "/dashboard/course-offerings",
    label: "Course Offerings",
    icon: ClipboardCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF"],
  },
  {
    href: "/dashboard/identity-cards",
    label: "Identity Cards",
    icon: BadgeCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "HR_MANAGER", "STAFF", "STUDENT"],
  },
  {
    href: "/dashboard/assessment",
    label: "Assessment",
    icon: ClipboardCheck,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "DEAN", "HOD", "STAFF"],
    scope: "lecturer",
  },
  {
    href: "/dashboard/exams",
    label: "Exams",
    icon: ListChecks,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "STAFF",
      "STUDENT",
    ],
    scope: "timetable",
  },
  {
    href: "/dashboard/enterprise",
    label: "Enterprise Operations",
    icon: Building2,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "HR_MANAGER", "STAFF"],
    scope: "records",
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
    scope: "lecturer",
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
    scope: "records",
  },
  {
    href: "/dashboard/clearance",
    label: "Clearance",
    icon: ClipboardCheck,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "BURSAR",
      "STAFF",
      "STUDENT",
    ],
  },
  {
    href: "/dashboard/fees",
    label: "Fees & Payments",
    icon: WalletCards,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "BURSAR", "STAFF", "STUDENT"],
    scope: "finance_clerk",
  },
  {
    href: "/dashboard/library",
    label: "Library",
    icon: Library,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
    scope: "library",
  },
  {
    href: "/dashboard/lms",
    label: "Learning",
    icon: BookOpen,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
    moduleFlag: "module_lms",
  },
  {
    href: "/dashboard/hr",
    label: "HR",
    icon: Users,
    roles: ["SUPER_ADMIN", "VC", "HR_MANAGER", "STAFF"],
    scope: "hr_clerk",
  },
  {
    href: "/dashboard/payroll",
    label: "Payroll",
    icon: WalletCards,
    roles: MODULE_ACCESS.payroll.navigationRoles,
  },
  {
    href: "/dashboard/hostel",
    label: "Hostel",
    icon: Building2,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF", "STUDENT"],
    scope: "hostel",
  },
  {
    href: "/dashboard/clinic",
    label: "Health",
    icon: HeartPulse,
    roles: ["SUPER_ADMIN", "STAFF", "STUDENT", "SUPPORT_STAFF"],
    requiredScope: "health",
    scope: "health",
    moduleFlag: "module_health",
  },
  {
    href: "/dashboard/transport",
    label: "Transport",
    icon: Bus,
    roles: ["SUPER_ADMIN", "VC", "STAFF", "STUDENT"],
    scope: "transport",
    moduleFlag: "module_transport",
  },
  {
    href: "/dashboard/research",
    label: "Research",
    icon: FlaskConical,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF"],
    scope: "research",
    moduleFlag: "module_research",
  },
  {
    href: "/dashboard/alumni",
    label: "Alumni",
    icon: Users,
    roles: ["SUPER_ADMIN", "VC", "REGISTRAR", "STAFF"],
    scope: "alumni",
    moduleFlag: "module_alumni",
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
    roles: ["SUPER_ADMIN", "STAFF", "SUPPORT_STAFF"],
    requiredScope: "dpo",
    scope: "dpo",
  },
  {
    href: "/dashboard/security-incidents",
    label: "Security Incidents",
    icon: ShieldAlert,
    roles: ["SUPER_ADMIN", "STAFF", "SUPPORT_STAFF"],
    requiredScope: "dpo",
    scope: "dpo",
  },
  {
    href: "/dashboard/users",
    label: "User Administration",
    icon: UserCog,
    roles: [
      "SUPER_ADMIN",
      "VC",
      "REGISTRAR",
      "DEAN",
      "HOD",
      "BURSAR",
      "HR_MANAGER",
    ],
  },
  {
    href: "/dashboard/audit-logs",
    label: "Audit & Security",
    icon: ShieldCheck,
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/dashboard/reliability",
    label: "Reliability Operations",
    icon: Activity,
    roles: ["SUPER_ADMIN"],
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

type NavHref = (typeof ALL_NAV)[number]["href"];

const NAV_GROUPS = [
  {
    id: "home",
    label: "Home",
    description: "Your priorities and updates",
    icon: LayoutDashboard,
    items: ["/dashboard", "/dashboard/notifications"],
  },
  {
    id: "admissions",
    label: "Admissions & Student Lifecycle",
    description: "From application to alumni",
    icon: GraduationCap,
    items: [
      "/dashboard/admissions",
      "/dashboard/students",
      "/dashboard/clearance",
      "/dashboard/identity-cards",
      "/dashboard/alumni",
    ],
  },
  {
    id: "academic",
    label: "Academic Operations",
    description: "The academic lifecycle",
    icon: BookOpen,
    items: [
      "/dashboard/academic",
      "/dashboard/curriculum",
      "/dashboard/course-offerings",
      "/dashboard/assessment",
      "/dashboard/exams",
      "/dashboard/results",
    ],
  },
  {
    id: "learning",
    label: "Teaching & Learning",
    description: "Courses and learning activity",
    icon: BookOpen,
    items: ["/dashboard/lms"],
  },
  {
    id: "finance-people",
    label: "Finance & People",
    description: "Money, staff and operations",
    icon: WalletCards,
    items: [
      "/dashboard/fees",
      "/dashboard/hr",
      "/dashboard/payroll",
      "/dashboard/enterprise",
    ],
  },
  {
    id: "campus",
    label: "Campus Services",
    description: "Everyday university services",
    icon: Building2,
    items: [
      "/dashboard/calendar",
      "/dashboard/library",
      "/dashboard/hostel",
      "/dashboard/clinic",
      "/dashboard/transport",
    ],
  },
  {
    id: "governance",
    label: "Governance & Intelligence",
    description: "Evidence, risk and decisions",
    icon: ShieldCheck,
    items: [
      "/dashboard/reports",
      "/dashboard/research",
      "/dashboard/policies",
      "/dashboard/privacy",
      "/dashboard/security-incidents",
      "/dashboard/smart-operations",
    ],
  },
  {
    id: "platform",
    label: "Administration & Platform",
    description: "Access, configuration and health",
    icon: Settings,
    items: [
      "/dashboard/users",
      "/dashboard/audit-logs",
      "/dashboard/reliability",
      "/dashboard/settings",
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  items: readonly NavHref[];
}[];

function canSee(
  item: (typeof ALL_NAV)[number],
  roles: readonly RoleName[],
  scopes: readonly StaffScope[],
  moduleCapabilities?: Record<string, boolean>,
) {
  const moduleFlag = (item as { moduleFlag?: string }).moduleFlag;
  if (
    moduleFlag &&
    moduleCapabilities &&
    moduleCapabilities[moduleFlag] === false
  )
    return false;
  if (item.roles === "ALL") return true;
  const itemScope = (item as { scope?: StaffScope }).scope;
  const requiredScope = (item as { requiredScope?: StaffScope }).requiredScope;
  const roleAllowed = roles.some((role) =>
    (item.roles as readonly RoleName[]).includes(role),
  );
  const scopedStaffRole =
    roles.includes("STAFF") || roles.includes("SUPPORT_STAFF");
  const scopeAllowed =
    scopedStaffRole && itemScope ? scopes.includes(itemScope) : false;
  if (!roleAllowed && !scopeAllowed) return false;
  if (
    requiredScope &&
    (roles.includes("STAFF") || roles.includes("SUPPORT_STAFF")) &&
    !roles.includes("SUPER_ADMIN")
  ) {
    return scopes.includes(requiredScope);
  }
  return true;
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
  const { data: branding } = usePublicBranding();
  const { data: moduleCapabilities } = useModuleCapabilities({
    enabled: Boolean(user),
  });
  const { isLoading, isError } = useCurrentUser();
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (isError && !isLoading)
      router.replace("/auth/login?reason=session_expired");
  }, [isError, isLoading, router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const effectiveRoles = effectiveRolesOf(user);
  const effectiveScopes = effectiveScopesOf(user);
  const nav = useMemo(
    () =>
      ALL_NAV.filter((item) =>
        canSee(item, effectiveRoles, effectiveScopes, moduleCapabilities),
      ),
    [effectiveRoles, effectiveScopes, moduleCapabilities],
  );
  const groupedNav = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items
          .map((href) => nav.find((item) => item.href === href))
          .filter((item): item is (typeof ALL_NAV)[number] => Boolean(item)),
      })).filter((group) => group.items.length > 0),
    [nav],
  );
  const current = nav.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href)),
  );
  const currentGroup = groupedNav.find((group) =>
    group.items.some((item) => item.href === current?.href),
  );
  const commandItems = useMemo<DashboardCommandItem[]>(
    () =>
      nav.map((item) => ({
        href: item.href,
        label: item.label,
        description: "Available to your role and scope",
        keywords: [item.href],
      })),
    [nav],
  );
  const commandGroups = useMemo(
    () =>
      groupedNav.map((group) => ({
        label: group.label,
        items: group.items.map((item) => ({
          href: item.href,
          label: item.label,
          description: group.description,
          keywords: [group.label, item.href],
        })),
      })),
    [groupedNav],
  );
  const mobileNavItems = useMemo(() => {
    const preferred = [
      "/dashboard",
      "/dashboard/academic",
      "/dashboard/results",
      "/dashboard/fees",
    ] as const;
    const preferredItems = preferred
      .map((href) => nav.find((item) => item.href === href))
      .filter((item): item is (typeof ALL_NAV)[number] => Boolean(item));
    const supplementaryItems = nav.filter(
      (item) => !preferred.includes(item.href as (typeof preferred)[number]),
    );
    return [...preferredItems, ...supplementaryItems].slice(0, 4);
  }, [nav]);
  const mobileMoreActive = Boolean(
    current && !mobileNavItems.some((item) => item.href === current.href),
  );
  const mobileLabel = (href: string, label: string) =>
    ({
      "/dashboard": "Home",
      "/dashboard/academic": "Academic",
      "/dashboard/results": "Results",
      "/dashboard/fees": "Fees",
    })[href] ?? label;
  const effectiveStaffScope = effectiveScopes.length
    ? {
        scopes: effectiveScopes,
        deptId: user?.staffScope?.deptId,
        facultyId: user?.staffScope?.facultyId,
      }
    : user?.staffScope;
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
    <div
      className="min-h-screen bg-background text-foreground"
      style={
        branding?.primaryColor
          ? ({ "--color-primary": branding.primaryColor } as CSSProperties)
          : undefined
      }
    >
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="uniportal-navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-white/10 bg-[--color-sidebar-bg] text-white transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            aria-label={`${branding?.institutionName ?? "UniPortal ERP"} home`}
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-xs font-bold text-white shadow-sm ring-1 ring-white/20">
              {branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                "UP"
              )}
            </span>
            <span>
              <span className="block max-w-[170px] truncate text-sm font-bold">
                {branding?.institutionName ?? "UniPortal ERP"}
              </span>
              <span className="block text-[11px] text-white/65">
                {branding?.institutionType?.replaceAll("_", " ") ??
                  "University workspace"}
              </span>
            </span>
          </Link>
          <button
            className="touch-target inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
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
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/55">
            Workspaces
          </p>
          <div className="space-y-3">
            {groupedNav.map((group) => {
              const GroupIcon = group.icon;
              const groupActive = group.items.some(
                (item) =>
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href)),
              );
              const isExpanded =
                expandedGroups[group.id] ??
                (groupActive || group.id === "home");
              return (
                <section
                  key={group.id}
                  aria-labelledby={`workspace-${group.id}`}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        groupActive
                        ? "bg-white/12 text-white"
                        : "text-white/72 hover:bg-white/10 hover:text-white",
                    )}
                    aria-expanded={isExpanded}
                    aria-controls={`workspace-items-${group.id}`}
                    onClick={() =>
                      setExpandedGroups((current) => ({
                        ...current,
                        [group.id]: !isExpanded,
                      }))
                    }
                  >
                    <GroupIcon
                      className="h-[18px] w-[18px] shrink-0"
                      aria-hidden="true"
                    />
                    <span
                      id={`workspace-${group.id}`}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-xs font-semibold">
                        {group.label}
                      </span>
                      <span className="hidden truncate text-[10px] text-muted-foreground xl:block">
                        {group.description}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isExpanded && (
                    <ul
                      id={`workspace-items-${group.id}`}
                      className="mt-1 space-y-1 border-l border-white/15 pl-3"
                    >
                      {group.items.map((item) => {
                        const active =
                          pathname === item.href ||
                          (item.href !== "/dashboard" &&
                            pathname.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setMobileOpen(false)}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                  active
                                  ? "bg-[--color-primary] font-semibold text-white shadow-sm ring-1 ring-white/15"
                                  : "text-white/72 hover:bg-white/10 hover:text-white",
                              )}
                            >
                              <Icon
                                className="h-4 w-4 shrink-0"
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
                  )}
                </section>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[--color-primary]/10 text-xs font-bold text-[--color-primary]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                {user?.email ?? "—"}
              </p>
              <p className="truncate text-[11px] text-white/75">
                {roleLabel(effectiveRoles[0] ?? user?.primaryRole)}
              </p>
              {scopeLabel(effectiveStaffScope) ? (
                <p className="truncate text-[10px] text-white/60">
                  {scopeLabel(effectiveStaffScope)}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => logout()}
              disabled={loggingOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[280px]">
        <header className="erp-dashboard-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <button
            className="touch-target inline-flex items-center justify-center rounded-lg hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="uniportal-navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 lg:hidden"
            aria-label={`${branding?.institutionName ?? "UniPortal ERP"} home`}
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/15 text-[10px] font-bold text-white ring-1 ring-white/20">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                "UP"
              )}
            </span>
            <span className="hidden max-w-[92px] truncate text-xs font-bold text-white min-[380px]:block">
              {branding?.institutionName ?? "UniPortal ERP"}
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="hidden min-w-0 items-center gap-1 text-[11px] text-muted-foreground lg:flex">
              <span className="shrink-0">UniPortal</span>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {currentGroup?.label ?? "Workspace"}
              </span>
              {currentGroup && current ? (
                <>
                  <ChevronRight
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">{title}</span>
                </>
              ) : null}
            </p>
            <h1 className="truncate text-sm font-semibold text-white sm:text-base lg:text-foreground">
              {title}
            </h1>
          </div>
          <DashboardCommandPalette
            role={effectiveRoles[0] ?? user?.primaryRole ?? "STUDENT"}
            items={commandItems}
            groups={commandGroups}
          />
          <Link
            href="/dashboard/notifications"
            className="touch-target inline-flex items-center justify-center rounded-lg text-white hover:bg-white/10 lg:text-muted-foreground lg:hover:bg-muted"
            aria-label="Open notifications"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Link>
          <span className="hidden rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white sm:inline-flex lg:bg-[--color-primary]/10 lg:text-[--color-primary]">
            {roleLabel(effectiveRoles[0] ?? user?.primaryRole)}
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          {children}
        </main>

        <nav
          className="erp-dashboard-mobile-nav fixed inset-x-0 bottom-0 z-40 grid lg:hidden"
          style={{
            gridTemplateColumns: `repeat(${Math.min(mobileNavItems.length + 1, 5)}, minmax(0, 1fr))`,
          }}
          aria-label="Mobile navigation"
        >
          {mobileNavItems.map((item) => {
            const active = current?.href === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors",
                  active
                    ? "text-[--color-primary]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full truncate">{mobileLabel(item.href, item.label)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open more navigation"
            aria-current={mobileMoreActive ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors",
              mobileMoreActive
                ? "text-[--color-primary]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
