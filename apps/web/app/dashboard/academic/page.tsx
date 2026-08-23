"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProgrammes } from "@/hooks/use-curriculum";
import { effectiveRolesOf, hasEffectiveRole } from "@/lib/authz";
import { useCurrentUser, useIsLoading } from "@/stores/auth.store";
import {
  useAcademicJourney,
  useMyAcademicPlan,
  useMyDegreeAudit,
  useRequestAcademicInterruption,
  useRequestProgrammeTransfer,
  useSubmitAcademicAppeal,
} from "@/hooks/use-academic";
import { useStudentClearance } from "@/hooks/use-clearance";

export default function AcademicJourneyPage() {
  const user = useCurrentUser();
  const authLoading = useIsLoading();
  const isStudent = hasEffectiveRole(user, "STUDENT");
  const [appealType, setAppealType] = useState("RESULT_REVIEW");
  const [appealReason, setAppealReason] = useState("");
  const [transferProgrammeId, setTransferProgrammeId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [interruptionType, setInterruptionType] = useState("DEFERMENT");
  const [interruptionStart, setInterruptionStart] = useState("");
  const [interruptionEnd, setInterruptionEnd] = useState("");
  const [interruptionReason, setInterruptionReason] = useState("");
  const { mutate: submitAppeal, isPending: submittingAppeal } =
    useSubmitAcademicAppeal();
  const { mutate: requestTransfer, isPending: requestingTransfer } =
    useRequestProgrammeTransfer();
  const { mutate: requestInterruption, isPending: requestingInterruption } =
    useRequestAcademicInterruption();
  const { data: programmes = [] } = useProgrammes();
  const { data: latestDegreeAudit } = useMyDegreeAudit({ enabled: isStudent });
  const { data: academicPlan } = useMyAcademicPlan({ enabled: isStudent });
  const { data, isLoading, error, refetch } = useAcademicJourney({
    enabled: isStudent,
  });
  const { data: clearance, isLoading: clearanceLoading, isError: clearanceError } =
    useStudentClearance(data?.student.id ?? "");
  const clearanceItems = clearance?.checklist ?? [];
  const clearanceCompleted = clearanceItems.filter(
    ({ clearance: record }) => record.status === "CLEARED" || record.status === "WAIVED",
  ).length;
  const clearanceBlocked = clearanceItems.filter(
    ({ clearance: record }) => record.status === "BLOCKED",
  ).length;

  if (authLoading)
    return <main className="p-6">Loading your academic access…</main>;
  if (!isStudent) {
    const roles = effectiveRolesOf(user).join(", ");
    return (
      <main className="erp-workspace-page p-4 md:p-6">
        <Card className="erp-workspace-header p-6">
          <p className="text-sm text-muted-foreground">Academic operations</p>
          <h1 className="mt-1 text-2xl font-semibold">
            Academic Life is student self-service
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            This view is reserved for authenticated students. Your current role
            {roles ? ` (${roles})` : ""} uses governed academic operations
            instead of a personal academic journey.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <a
              className="rounded-md border px-3 py-2 hover:bg-muted"
              href="/dashboard/students"
            >
              Open student records
            </a>
            <a
              className="rounded-md border px-3 py-2 hover:bg-muted"
              href="/dashboard/results"
            >
              Open results governance
            </a>
            <a
              className="rounded-md border px-3 py-2 hover:bg-muted"
              href="/dashboard/curriculum"
            >
              Open curriculum
            </a>
          </div>
        </Card>
      </main>
    );
  }
  if (isLoading)
    return (
      <main className="erp-workspace-page p-4 md:p-6" aria-busy="true">
        <Card className="erp-workspace-header p-6">
          <p className="enterprise-eyebrow">Academic command centre</p>
          <h1 className="mt-2 text-2xl font-semibold">Loading your academic journey…</h1>
          <p className="mt-2 text-sm text-muted-foreground">Checking your published academic record and current study plan.</p>
        </Card>
      </main>
    );
  if (error)
    return (
      <main className="erp-workspace-page p-4 md:p-6">
        <Card className="erp-workspace-header p-6" role="alert">
          <p className="enterprise-eyebrow">Academic command centre</p>
          <h1 className="mt-2 text-2xl font-semibold">Your academic journey is temporarily unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">No academic record was changed. Check your connection and try again.</p>
          <Button className="mt-5 min-h-11" type="button" onClick={() => void refetch()}>Try again</Button>
        </Card>
      </main>
    );
  if (!data) return null;

  const p = data.progress;
  return (
    <main className="erp-workspace-page p-4 md:p-6">
      <section className="erp-workspace-header">
        <p className="enterprise-eyebrow">Academic command centre</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          My Academic Journey
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.programme.code} · {data.programme.name} ·{" "}
          {data.curriculum.academicYear} curriculum v{data.curriculum.version}
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="CGPA" value={p.cgpa.toFixed(2)} />
        <Metric
          label="Credits"
          value={`${p.creditsEarned}/${p.creditsRequired}`}
        />
        <Metric label="Completion" value={`${p.percent}%`} />
        <Metric label="Outstanding" value={String(p.outstandingCourses)} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Journey readiness</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The system shows what can be verified from the current academic record.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${data.readiness?.status === "READY" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {data.readiness?.status ?? "ATTENTION"}
            </span>
          </div>
          {data.readiness?.warnings?.length ? (
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {data.readiness.warnings.map((warning: string) => (
                <li key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              The current journey evidence is complete enough for guided planning.
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Next legitimate actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recommendations are advisory; approvals remain with authorized academic officers.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            {data.nextActions?.length ? data.nextActions.map((action) => (
              <div key={action.code} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <strong>{action.title}</strong>
                  {action.requiresApproval && <span className="text-xs text-amber-700">Approval required</span>}
                </div>
                <p className="mt-1 text-muted-foreground">{action.reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">Responsible role: {action.ownerRole}</p>
              </div>
            )) : (
              <p className="text-muted-foreground">No additional action is currently recommended.</p>
            )}
          </div>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Next actions</h2>
          <div className="mt-4 space-y-3 text-sm">
            {data.outstanding.length ? (
              data.outstanding.map((c) => (
                <div key={c.code} className="rounded-xl border p-3">
                  <strong>{c.code}</strong>
                  <div>{c.title}</div>
                  <span className="text-muted-foreground">
                    {c.creditUnits} credits · carryover
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">
                No outstanding failed courses detected from published results.
              </p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Degree audit</h2>
          <div className="mt-4 text-sm">
            {latestDegreeAudit || data.degreeAudit ? (
              <>
                <div className="font-medium">
                  Status:{" "}
                  {latestDegreeAudit?.status ?? data.degreeAudit?.status}
                </div>
                <p className="mt-2 text-muted-foreground">
                  Audit generated from the assigned curriculum and published
                  academic record.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                No official degree audit has been generated yet.
              </p>
            )}
          </div>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="erp-data-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Administrative clearance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A read-only view of required operational sign-offs. It is not a graduation decision.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${clearance?.administrativelyCleared ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {clearance?.administrativelyCleared ? "Complete" : "Attention"}
            </span>
          </div>
          {clearanceLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Checking clearance records…</p>
          ) : clearanceError ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              Clearance status is temporarily unavailable; your academic record was not changed.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Metric label="Completed" value={`${clearanceCompleted}/${clearanceItems.length}`} />
              <Metric label="Blocked" value={String(clearanceBlocked)} />
              <Metric label="Required" value={String(clearanceItems.filter(({ item }) => item.isRequiredForGraduation).length)} />
            </div>
          )}
        </Card>
        <Card className="erp-data-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Published results</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only results published through the governed academic workflow are shown here.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
              {data.results.length} shown
            </span>
          </div>
          {data.results.length ? (
            <div className="mt-4 divide-y">
              {data.results.slice(-5).reverse().map((result) => (
                <div key={result.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{result.code} · {result.title}</div>
                    <div className="text-muted-foreground">{result.semester} · {result.academicYear}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{result.grade}</div>
                    <div className="text-xs text-muted-foreground">{result.score} score</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              No published results are available for progress verification yet.
            </p>
          )}
        </Card>
      </section>
      <Card className="p-5">
        <h2 className="font-semibold">Recommended academic plan</h2>
        {academicPlan?.items?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {academicPlan.items.map((item) => (
              <div key={item.id} className="rounded-xl border p-4">
                <div className="font-medium">
                  {item.course?.code ?? "Course"}
                </div>
                <div className="text-sm">
                  {item.course?.title ?? "Recommended curriculum item"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {item.targetPeriod ?? "Planned period"} ·{" "}
                  {item.status ?? "RECOMMENDED"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No active plan is available yet. An authorised academic officer can
            run a degree audit when new results or curriculum evidence are
            available.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Current courses</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.currentCourses.map((c) => (
            <div key={c.id} className="rounded-xl border p-4">
              <div className="font-medium">{c.code}</div>
              <div className="text-sm">{c.title}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {c.credits} credits · {c.semester}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Academic history</h2>
        <div className="mt-4 divide-y">
          {data.history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <div>
                <div className="font-medium">
                  {h.academicYear} · Level {h.level}
                </div>
                <div className="text-muted-foreground">{h.status}</div>
              </div>
              <div className="text-right">
                <div>GPA {h.gpa == null ? "—" : Number(h.gpa).toFixed(2)}</div>
                <div className="text-muted-foreground">
                  CGPA {h.cgpa == null ? "—" : Number(h.cgpa).toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Academic requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a structured request to the appropriate academic authority.
          Decisions and evidence requirements remain controlled by the
          Registrar, Dean, HOD, and Super Admin workflow.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!appealReason.trim()) return;
              submitAppeal(
                { appealType, reason: appealReason.trim() },
                { onSuccess: () => setAppealReason("") },
              );
            }}
          >
            <div>
              <h3 className="font-medium">Academic appeal</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                For result review, grading concern, or another academic
                decision.
              </p>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Appeal type
              <select
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                value={appealType}
                onChange={(event) => setAppealType(event.target.value)}
              >
                <option value="RESULT_REVIEW">Result review</option>
                <option value="COURSE_RESULT">Course result</option>
                <option value="ACADEMIC_DECISION">Academic decision</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <textarea
              className="min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm"
              placeholder="Explain the issue and the resolution you are requesting"
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
              required
            />
            <Button
              type="submit"
              loading={submittingAppeal}
              disabled={!appealReason.trim()}
            >
              Submit appeal
            </Button>
          </form>
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!transferProgrammeId) return;
              requestTransfer(
                {
                  toProgrammeId: transferProgrammeId,
                  reason: transferReason.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setTransferProgrammeId("");
                    setTransferReason("");
                  },
                },
              );
            }}
          >
            <div>
              <h3 className="font-medium">Programme transfer</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the target programme and explain the academic reason.
              </p>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Target programme
              <select
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                value={transferProgrammeId}
                onChange={(event) => setTransferProgrammeId(event.target.value)}
                required
              >
                <option value="">Select programme</option>
                {programmes.map((programme) => (
                  <option key={programme.id} value={programme.id}>
                    {programme.code} · {programme.name}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm"
              placeholder="Reason for transfer (optional)"
              value={transferReason}
              onChange={(event) => setTransferReason(event.target.value)}
            />
            <Button
              type="submit"
              loading={requestingTransfer}
              disabled={!transferProgrammeId}
            >
              Request transfer
            </Button>
          </form>
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!interruptionStart) return;
              requestInterruption(
                {
                  type: interruptionType,
                  startDate: interruptionStart,
                  endDate: interruptionEnd || undefined,
                  reason: interruptionReason.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setInterruptionStart("");
                    setInterruptionEnd("");
                    setInterruptionReason("");
                  },
                },
              );
            }}
          >
            <div>
              <h3 className="font-medium">Interruption or deferment</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Request an approved pause to your academic programme.
              </p>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Request type
              <select
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                value={interruptionType}
                onChange={(event) => setInterruptionType(event.target.value)}
              >
                <option value="DEFERMENT">Deferment</option>
                <option value="INTERRUPTION">Interruption</option>
                <option value="MEDICAL">Medical interruption</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Interruption start date"
                value={interruptionStart}
                onChange={(event) => setInterruptionStart(event.target.value)}
                required
              />
              <Input
                type="date"
                aria-label="Interruption end date"
                value={interruptionEnd}
                onChange={(event) => setInterruptionEnd(event.target.value)}
              />
            </div>
            <textarea
              className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm"
              placeholder="Reason (optional)"
              value={interruptionReason}
              onChange={(event) => setInterruptionReason(event.target.value)}
            />
            <Button
              type="submit"
              loading={requestingInterruption}
              disabled={!interruptionStart}
            >
              Request interruption
            </Button>
          </form>
        </div>
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
