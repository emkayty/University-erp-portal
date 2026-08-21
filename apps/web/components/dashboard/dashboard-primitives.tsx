import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Info,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-red-700 dark:text-red-400",
  info: "text-[--color-primary]",
};

const toneSurfaceClasses: Record<Tone, string> = {
  neutral: "bg-card",
  positive:
    "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20",
  warning:
    "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20",
  danger:
    "border-red-200/80 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20",
  info: "border-blue-200/80 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/20",
};

export function DashboardSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("space-y-3", className)}
      aria-labelledby={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="enterprise-eyebrow">{eyebrow}</p> : null}
          <h2
            id={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`}
            className="mt-1 text-base font-semibold sm:text-lg"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  href,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span className={cn("text-[--color-primary]", toneClasses[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tracking-tight",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {detail ? (
        <p
          className={cn(
            "mt-1 text-xs leading-5",
            tone === "neutral" ? "text-muted-foreground" : toneClasses[tone],
          )}
        >
          {detail}
        </p>
      ) : null}
      {href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[--color-primary]">
          View details <ArrowRight className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "block min-w-0 rounded-2xl border border-border p-4 shadow-sm transition sm:p-5",
    tone === "neutral" ? "bg-card" : toneSurfaceClasses[tone],
    href &&
      "hover:-translate-y-0.5 hover:border-[--color-primary]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]",
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

export type AttentionQueueItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  href?: string;
  tone?: Tone;
};

export function AttentionQueue({
  items,
  emptyTitle = "No action is waiting for you",
  emptyDescription = "The verified data available to your workspace has no outstanding item at the moment.",
}: {
  items: AttentionQueueItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!items.length) {
    return (
      <DashboardEmptyState
        icon={<CheckCircle2 className="h-5 w-5" />}
        title={emptyTitle}
        description={emptyDescription}
        tone="positive"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <ul
        className="divide-y divide-border"
        aria-label="Items requiring attention"
      >
        {items.map((item) => {
          const body = (
            <>
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted",
                  toneClasses[item.tone ?? "warning"],
                )}
              >
                {item.tone === "danger" ? (
                  <CircleAlert className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {item.detail}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold",
                  toneClasses[item.tone ?? "warning"],
                )}
              >
                {item.status}
              </span>
              {item.href ? (
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </>
          );
          return item.href ? (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-16 items-start gap-3 p-4 transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[--color-primary]"
              >
                {body}
              </Link>
            </li>
          ) : (
            <li key={item.id} className="flex min-h-16 items-start gap-3 p-4">
              {body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WorkflowSteps({
  steps,
  current,
}: {
  steps: { label: string; description?: string }[];
  current: number;
}) {
  return (
    <ol
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Workflow progress"
    >
      {steps.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            key={step.label}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              active
                ? "border-[--color-primary]/40 bg-[--color-primary]/5"
                : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                complete
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : active
                    ? "border-[--color-primary] text-[--color-primary]"
                    : "border-border text-muted-foreground",
              )}
            >
              {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-xs font-semibold",
                  active && "text-[--color-primary]",
                )}
              >
                {step.label}
              </span>
              {step.description ? (
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {step.description}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DataFreshness({
  status = "verified",
  label,
  detail = "Live values are shown only when the source service responds.",
}: {
  status?: "verified" | "loading" | "unavailable";
  label?: string;
  detail?: string;
}) {
  const copy =
    label ??
    (status === "verified"
      ? "Verified dashboard data"
      : status === "loading"
        ? "Loading dashboard data"
        : "Dashboard data unavailable");
  const dotClass =
    status === "verified"
      ? "bg-emerald-600"
      : status === "loading"
        ? "bg-amber-500"
        : "bg-red-600";
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[11px] text-muted-foreground"
      title={detail}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
        aria-hidden="true"
      />
      <span className="truncate">{copy}</span>
    </div>
  );
}

export function DashboardEmptyState({
  icon = <Info className="h-5 w-5" />,
  title,
  description,
  tone = "neutral",
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  tone?: Tone;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed p-6",
        tone === "neutral" ? "border-border bg-card" : toneSurfaceClasses[tone],
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted",
          toneClasses[tone],
        )}
      >
        {icon}
      </div>
      <h3 className="mt-3 text-center text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-center text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PermissionNotice({
  title = "Access follows your role and scope",
  description = "Sensitive university information is shown only when your current role and organizational scope permit it.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
