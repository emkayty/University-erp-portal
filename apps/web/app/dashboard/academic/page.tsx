"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProgrammes } from "@/hooks/use-curriculum";
import {
  useMyAcademicPlan,
  useMyDegreeAudit,
  useRequestAcademicInterruption,
  useRequestProgrammeTransfer,
  useSubmitAcademicAppeal,
} from "@/hooks/use-academic";

export default function AcademicJourneyPage() {
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
  const { data: latestDegreeAudit } = useMyDegreeAudit();
  const { data: academicPlan } = useMyAcademicPlan();
  const { data, isLoading, error } = useQuery({
    queryKey: ["academic", "me", "journey"],
    queryFn: () => apiClient.get<any>("/academic/me/journey"),
  });

  if (isLoading)
    return <main className="p-6">Loading your academic journey…</main>;
  if (error)
    return (
      <main className="p-6">
        <Card className="p-6">
          Unable to load your academic journey. Please try again.
        </Card>
      </main>
    );
  if (!data) return null;

  const p = data.progress;
  return (
    <main className="space-y-6 p-4 md:p-6">
      <section>
        <p className="text-sm text-muted-foreground">Academic command center</p>
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
          <h2 className="font-semibold">Next actions</h2>
          <div className="mt-4 space-y-3 text-sm">
            {data.outstanding.length ? (
              data.outstanding.map((c: any) => (
                <div key={c.code} className="rounded-xl border p-3">
                  <strong>{c.code}</strong>
                  <div>{c.title}</div>
                  <span className="text-muted-foreground">
                    {c.credits} credits · carryover
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
                  {(latestDegreeAudit as any)?.status ??
                    data.degreeAudit.status}
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
      <Card className="p-5">
        <h2 className="font-semibold">Recommended academic plan</h2>
        {(academicPlan as any)?.items?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(academicPlan as any).items.map((item: any) => (
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
          {data.currentCourses.map((c: any) => (
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
          {data.history.map((h: any) => (
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
