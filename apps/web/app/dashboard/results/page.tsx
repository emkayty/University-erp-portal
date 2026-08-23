"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth.store";
import {
  useStudentResults,
  useTranscript,
  useSubmitResult,
  useResultAction,
  useCurrentSemester,
  useSemesters,
  useCourseResults,
  useCourseResultReport,
  useSemesterResultReport,
  useBulkResultAction,
  useAmendResult,
  useWithholdResult,
  useReleaseWithheldResult,
} from "@/hooks/use-results";
import { cn } from "@/lib/utils";
import { hasEffectiveRole } from "@/lib/authz";
import type { StudentResultV1 } from "@uniportal/types";
import { useCourseOfferings } from "@/hooks/use-curriculum";
import { StudentPicker } from "@/components/erp/student-picker";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-neutral",
  HOD_APPROVED: "badge-info",
  DEAN_APPROVED: "badge-info",
  SENATE_PENDING: "badge-warning",
  SENATE_PUBLISHED: "badge-success",
  WITHHELD: "badge-danger",
  REJECTED: "badge-danger",
};
const GRADE_COLORS: Record<string, string> = {
  A: "text-green-600",
  B: "text-blue-600",
  C: "text-amber-600",
  D: "text-orange-600",
  E: "text-red-500",
  F: "text-red-700",
};

export default function ResultsPage() {
  const user = useAuthStore((s) => s.user);
  const isStudent = hasEffectiveRole(user, "STUDENT");
  const isLecturer = hasEffectiveRole(
    user,
    "STAFF",
    "HOD",
    "DEAN",
    "REGISTRAR",
    "SUPER_ADMIN",
  );
  const canApprove = hasEffectiveRole(
    user,
    "HOD",
    "DEAN",
    "REGISTRAR",
    "VC",
    "SUPER_ADMIN",
  );
  const canAmend = hasEffectiveRole(user, "HOD", "DEAN", "SUPER_ADMIN");
  const canWithhold = hasEffectiveRole(user, "REGISTRAR", "SUPER_ADMIN");

  const [tab, setTab] = useState<"my" | "transcript" | "entry" | "approve">(
    "my",
  );
  const [selSemId, setSelSem] = useState("");
  const [actionError, setErr] = useState("");
  const [actionMsg, setMsg] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    action: string;
    label: string;
  } | null>(null);
  const [entryForm, setEntryForm] = useState({
    studentId: "",
    courseOfferingId: "",
    score: "",
  });
  const [queueOfferingId, setQueueOfferingId] = useState("");
  const [queueSelectedIds, setQueueSelectedIds] = useState<string[]>([]);
  const [amendScore, setAmendScore] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [withheldReason, setWithheldReason] = useState("");

  const studentId = isStudent ? (user?.studentId ?? "") : "";
  const { data: semesters = [] } = useSemesters();
  const { data: current } = useCurrentSemester();
  const { data: myResults = [] } = useStudentResults(
    studentId,
    selSemId || undefined,
  );
  const { data: transcript } = useTranscript(studentId);
  const { data: courseOfferings = [] } = useCourseOfferings(undefined, {
    enabled: canApprove,
  });
  const { data: queueResults = [], isLoading: queueLoading } = useCourseResults(
    queueOfferingId,
    selSemId,
    { enabled: canApprove },
  );
  const { data: courseReport } = useCourseResultReport(
    queueOfferingId,
    selSemId,
    { enabled: canApprove && Boolean(queueOfferingId && selSemId) },
  );
  const { data: semesterReport } = useSemesterResultReport(selSemId, {
    enabled: canApprove && Boolean(selSemId) && !queueOfferingId,
  });

  const { mutate: submitResult, isPending: submitting } = useSubmitResult();
  const { mutate: applyAction, isPending: actioning } = useResultAction();
  const { mutate: bulkAction, isPending: bulkActioning } =
    useBulkResultAction();
  const { mutate: amendResult, isPending: amending } = useAmendResult();
  const { mutate: withholdResult, isPending: withholding } =
    useWithholdResult();
  const { mutate: releaseWithheldResult, isPending: releasing } =
    useReleaseWithheldResult();

  const handleAction = (resultId: string, action: string, reason?: string) => {
    setErr("");
    setMsg("");
    applyAction(
      { id: resultId, action, rejectionReason: reason },
      {
        onSuccess: () => {
          setMsg(`✓ Action "${action}" applied`);
          setSelectedResultId("");
          setRejectionReason("");
          setConfirmAction(null);
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  const toggleQueueResult = (resultId: string) => {
    setQueueSelectedIds((current) =>
      current.includes(resultId)
        ? current.filter((id) => id !== resultId)
        : [...current, resultId],
    );
  };

  const handleBulkAction = (action: string) => {
    if (!queueSelectedIds.length)
      return setErr(
        "Select at least one result before applying a bulk action.",
      );
    if (action === "REJECT" && rejectionReason.trim().length < 10)
      return setErr(
        "A rejection reason of at least 10 characters is required.",
      );
    setErr("");
    setMsg("");
    bulkAction(
      {
        resultIds: queueSelectedIds,
        action,
        rejectionReason:
          action === "REJECT" ? rejectionReason.trim() : undefined,
      },
      {
        onSuccess: (result) => {
          setMsg(
            `✓ ${result.processed} result(s) processed; ${result.failed} failed.`,
          );
          setQueueSelectedIds([]);
          setRejectionReason("");
        },
        onError: (error) => setErr(error.message),
      },
    );
  };

  const handleAmend = () => {
    const score = Number(amendScore);
    if (
      !selectedResultId ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      amendReason.trim().length < 10
    ) {
      return setErr(
        "Select a published result, enter a score from 0 to 100, and provide an amendment reason of at least 10 characters.",
      );
    }
    setErr("");
    setMsg("");
    amendResult(
      {
        id: selectedResultId,
        newScore: score,
        amendmentReason: amendReason.trim(),
      },
      {
        onSuccess: () => {
          setMsg(
            "✓ Published result amended and academic records recalculated.",
          );
          setAmendScore("");
          setAmendReason("");
        },
        onError: (error) => setErr(error.message),
      },
    );
  };

  const handleWithhold = () => {
    if (!selectedResultId || withheldReason.trim().length < 10)
      return setErr(
        "Select a published result and provide a withholding reason of at least 10 characters.",
      );
    setErr("");
    setMsg("");
    withholdResult(
      { id: selectedResultId, withheldReason: withheldReason.trim() },
      {
        onSuccess: () => {
          setMsg("✓ Result withheld and excluded from CGPA until released.");
          setWithheldReason("");
        },
        onError: (error) => setErr(error.message),
      },
    );
  };

  const handleRelease = () => {
    if (!selectedResultId) return setErr("Select a withheld result first.");
    setErr("");
    setMsg("");
    releaseWithheldResult(selectedResultId, {
      onSuccess: () =>
        setMsg("✓ Withheld result released and CGPA recalculated."),
      onError: (error) => setErr(error.message),
    });
  };

  const cgpa = transcript?.student.cgpa ?? 0;
  const cgpaColor =
    cgpa >= 4.5
      ? "text-green-600"
      : cgpa >= 3.5
        ? "text-blue-600"
        : cgpa >= 2.4
          ? "text-amber-600"
          : "text-red-600";

  const tabs = [
    isStudent && { key: "my", label: "My Results" },
    isStudent && { key: "transcript", label: "Transcript" },
    isLecturer && { key: "entry", label: "Result Entry" },
    canApprove && { key: "approve", label: "Approve" },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div className="erp-workspace-page">
      <header className="erp-workspace-header flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[--color-primary]">Academic records</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Results</h2>
          <p className="mt-1 text-sm text-muted-foreground">View, enter, review, approve, and publish results within your governed role and scope.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button type="button"
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "bg-[--color-primary] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]"
        >
          {actionError}
        </div>
      )}
      {actionMsg && (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700"
        >
          {actionMsg}
        </div>
      )}

      {/* Semester selector (shared) */}
      {(tab === "my" || tab === "entry" || tab === "approve") && (
        <div className="erp-control-rail flex flex-wrap gap-2 rounded-xl border p-3">
          <div>
            <label htmlFor="results-semester" className="sr-only">
              Semester
            </label>
            <select
              id="results-semester"
              value={selSemId}
              onChange={(e) => {
                setSelSem(e.target.value);
                setQueueSelectedIds([]);
              }}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto"
            >
              <option value="">All Semesters</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {tab === "approve" && (
            <div>
              <label htmlFor="results-offering" className="sr-only">
                Course offering
              </label>
              <select
                id="results-offering"
                value={queueOfferingId}
                onChange={(e) => {
                  setQueueOfferingId(e.target.value);
                  setQueueSelectedIds([]);
                }}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:min-w-64 sm:w-auto"
              >
                <option value="">
                  Semester report / choose course offering
                </option>
                {courseOfferings
                  .filter(
                    (offering) =>
                      !selSemId ||
                      offering.semesterModel?.id === selSemId ||
                      offering.academicYear ===
                        semesters.find((semester) => semester.id === selSemId)
                          ?.academicYear,
                  )
                  .map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.course.code} · {offering.course.title} ·{" "}
                      {offering.sectionCode}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── My Results (Student) ─────────────────────────────────────────── */}
      {tab === "my" && (
        <div className="space-y-3">
          {myResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No results yet for the selected period.
            </p>
          ) : (
                    <div className="erp-data-surface erp-scroll-surface overflow-x-auto rounded-xl border border-border">
              <table className="min-w-[620px] w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {[
                      "Course",
                      "Score",
                      "Grade",
                      "GP",
                      "Credits",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {myResults.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-[--color-primary] mr-2">
                          {r.courseOffering?.course.code}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {r.courseOffering?.course.title}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {r.absentFromExam
                          ? "ABS"
                          : parseFloat(r.score).toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 font-bold text-lg",
                          GRADE_COLORS[r.grade] ?? "",
                        )}
                      >
                        {r.grade}
                      </td>
                      <td className="px-4 py-2.5">{r.gradePoint}</td>
                      <td className="px-4 py-2.5">{r.creditUnits}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            STATUS_COLORS[r.status] ?? "",
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Transcript (Student) ─────────────────────────────────────────── */}
      {tab === "transcript" && transcript && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-6 flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <strong>{transcript.student.fullName}</strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Matric:</span>{" "}
                    <span className="font-mono text-[--color-primary]">
                      {transcript.student.matricNo}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Programme:</span>{" "}
                    {transcript.student.programme}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Faculty:</span>{" "}
                    {transcript.student.faculty}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Entry Year:</span>{" "}
                    {transcript.student.entryYear}
                  </p>
                </div>
                <div className="text-center">
                  <p className={cn("text-5xl font-bold", cgpaColor)}>
                    {cgpa.toFixed(2)}
                  </p>
                  <p className="text-sm font-medium text-muted-foreground mt-1">
                    Cumulative GPA
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {transcript.student.degreeClass}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transcript.student.totalCreditUnitsEarned} credit units
                    earned
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {transcript.semesters.map((sem) => {
            const semCU = sem.results.reduce((s, r) => s + r.creditUnits, 0);
            const semGP = sem.results.reduce(
              (s, r) => s + parseFloat(r.gradePoint) * r.creditUnits,
              0,
            );
            const semGPA = semCU > 0 ? (semGP / semCU).toFixed(2) : "0.00";
            return (
              <Card key={sem.semesterName}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {sem.semesterName}
                    </CardTitle>
                    <span className="text-sm font-semibold text-muted-foreground">
                      GPA: {semGPA}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="erp-data-surface erp-scroll-surface overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-[620px] w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {["Code", "Course", "Score", "Grade", "GP", "CU"].map(
                            (h) => (
                              <th
                                key={h}
                                className="px-3 py-2 text-left text-xs text-muted-foreground uppercase"
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sem.results.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 font-mono text-xs text-[--color-primary]">
                              {r.courseOffering?.course.code}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[160px]">
                              {r.courseOffering?.course.title}
                            </td>
                            <td className="px-3 py-2">
                              {r.absentFromExam
                                ? "ABS"
                                : parseFloat(r.score).toFixed(1)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 font-bold",
                                GRADE_COLORS[r.grade] ?? "",
                              )}
                            >
                              {r.grade}
                            </td>
                            <td className="px-3 py-2">{r.gradePoint}</td>
                            <td className="px-3 py-2">{r.creditUnits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Result Entry (Lecturer) ─────────────────────────────────────── */}
      {tab === "entry" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Submit Result</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Enter scores individually via the form below, or use the API for
              bulk submission.
            </p>
            <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StudentPicker
                value={entryForm.studentId}
                onChange={(studentId) => setEntryForm((current) => ({ ...current, studentId }))}
                filters={{ status: "ACTIVE" }}
                required
              />
              <div className="space-y-1">
                <label htmlFor="courseOfferingId" className="text-xs font-medium text-muted-foreground">
                  Course Offering ID
                </label>
                <input
                  id="courseOfferingId"
                  type="text"
                  placeholder="Paste the authorised course-offering ID"
                  value={entryForm.courseOfferingId}
                  onChange={(e) => setEntryForm((current) => ({ ...current, courseOfferingId: e.target.value }))}
                  aria-describedby="courseOfferingId-hint"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p id="courseOfferingId-hint" className="text-xs text-muted-foreground">
                  Use the identifier from the authorised course-offering workflow.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="score" className="text-xs font-medium text-muted-foreground">
                  Score (0–100)
                </label>
                <input
                  id="score"
                  type="number"
                  placeholder="75.5"
                  value={entryForm.score}
                  onChange={(e) => setEntryForm((current) => ({ ...current, score: e.target.value }))}
                  aria-describedby="score-hint"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p id="score-hint" className="text-xs text-muted-foreground">Enter the verified score only.</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Button
                  size="sm"
                  loading={submitting}
                  onClick={() => {
                    const studentId = entryForm.studentId.trim();
                    const courseOfferingId = entryForm.courseOfferingId.trim();
                    const score = Number(entryForm.score);
                    if (
                      !studentId ||
                      !courseOfferingId ||
                      !Number.isFinite(score)
                    ) {
                      setErr(
                        "Provide the student, course offering, and a valid score.",
                      );
                      return;
                    }
                    if (score < 0 || score > 100) {
                      setErr("Score must be between 0 and 100.");
                      return;
                    }
                    if (!selSemId) {
                      setErr("Select a semester first");
                      return;
                    }
                    setErr("");
                    submitResult(
                      {
                        studentId,
                        courseOfferingId,
                        semesterId: selSemId,
                        score,
                      },
                      {
                        onSuccess: () => {
                          setMsg("✓ Result submitted as DRAFT");
                          setEntryForm({
                            studentId: "",
                            courseOfferingId: "",
                            score: "",
                          });
                        },
                        onError: (e) => setErr(e.message),
                      },
                    );
                  }}
                >
                  Submit Result
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Approval (HOD / Registrar) ─────────────────────────────────── */}
      {tab === "approve" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Review result action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select the result record first. The action is not submitted
                until you review and confirm it.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <label
                    htmlFor="approval-result-id"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Result ID
                  </label>
                  <input
                    id="approval-result-id"
                    value={selectedResultId}
                    onChange={(e) => setSelectedResultId(e.target.value.trim())}
                    placeholder="Paste the result UUID"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose a course offering above to load its result queue, or
                    paste an authorised result UUID for a direct governed
                    action.
                  </p>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="rejection-reason"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Rejection reason (required only for rejection)
                  </label>
                  <textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    placeholder="Explain what must be corrected"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    action: "HOD_APPROVE",
                    label: "HOD Approve",
                    variant: "default",
                  },
                  {
                    action: "DEAN_APPROVE",
                    label: "Dean Approve",
                    variant: "default",
                  },
                  {
                    action: "SUBMIT_SENATE",
                    label: "Submit to Senate",
                    variant: "default",
                  },
                  {
                    action: "SENATE_PUBLISH",
                    label: "Senate Publish",
                    variant: "default",
                  },
                  { action: "REJECT", label: "Reject", variant: "destructive" },
                ].map(({ action, label, variant }) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={variant as "default" | "destructive"}
                    loading={actioning}
                    disabled={
                      !selectedResultId ||
                      (action === "REJECT" &&
                        rejectionReason.trim().length < 10)
                    }
                    onClick={() => setConfirmAction({ action, label })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          {confirmAction && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  <strong>Confirm {confirmAction.label}</strong> for result{" "}
                  <code>{selectedResultId}</code>. This may change the official
                  academic record.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      confirmAction.action === "REJECT"
                        ? "destructive"
                        : "default"
                    }
                    loading={actioning}
                    onClick={() =>
                      handleAction(
                        selectedResultId,
                        confirmAction.action,
                        confirmAction.action === "REJECT"
                          ? rejectionReason.trim()
                          : undefined,
                      )
                    }
                  >
                    Confirm {confirmAction.label}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Result queue and reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selSemId && (
                <p className="text-sm text-muted-foreground">
                  Select a semester to load a governed course queue or semester
                  report.
                </p>
              )}
              {selSemId && !queueOfferingId && semesterReport && (
                <div className="grid gap-3 sm:grid-cols-4 text-sm">
                  <Metric
                    label="Published results"
                    value={String(semesterReport.totalResults)}
                  />
                  <Metric
                    label="Students"
                    value={String(semesterReport.students)}
                  />
                  <Metric
                    label="Average GPA"
                    value={semesterReport.averageGpa.toFixed(2)}
                  />
                  <Metric
                    label="Grade bands"
                    value={String(
                      Object.keys(semesterReport.gradeDistribution).length,
                    )}
                  />
                </div>
              )}
              {selSemId && queueOfferingId && (
                <>
                  {courseReport && (
                    <div className="grid gap-3 sm:grid-cols-4 text-sm">
                      <Metric
                        label="Total"
                        value={String(courseReport.total)}
                      />
                      <Metric
                        label="Published"
                        value={String(courseReport.published)}
                      />
                      <Metric
                        label="Pass rate"
                        value={`${courseReport.passRate}%`}
                      />
                      <Metric
                        label="Mean score"
                        value={courseReport.meanScore.toFixed(2)}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQueueSelectedIds(
                          queueResults.map((result) => result.id),
                        )
                      }
                      disabled={!queueResults.length}
                    >
                      Select all
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setQueueSelectedIds([])}
                      disabled={!queueSelectedIds.length}
                    >
                      Clear selection
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {queueSelectedIds.length} selected
                    </span>
                    <Button
                      size="sm"
                      loading={bulkActioning}
                      disabled={!queueSelectedIds.length}
                      onClick={() => handleBulkAction("HOD_APPROVE")}
                    >
                      Bulk HOD approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={bulkActioning}
                      disabled={!queueSelectedIds.length}
                      onClick={() => handleBulkAction("SUBMIT_SENATE")}
                    >
                      Bulk submit to Senate
                    </Button>
                  </div>
                  {queueLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading result queue…
                    </p>
                  ) : queueResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No result records found for this course offering and
                      semester.
                    </p>
                  ) : (
                    <div className="erp-data-surface erp-scroll-surface overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">
                              <span className="sr-only">Select</span>
                            </th>
                            <th className="px-3 py-2 text-left">Student</th>
                            <th className="px-3 py-2 text-left">Score</th>
                            <th className="px-3 py-2 text-left">Grade</th>
                            <th className="px-3 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {queueResults.map((result) => (
                            <tr
                              key={result.id}
                              className={cn(
                                selectedResultId === result.id &&
                                  "bg-[--color-primary]/10",
                              )}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  aria-label={`Select result ${result.id}`}
                                  checked={queueSelectedIds.includes(result.id)}
                                  onChange={() => toggleQueueResult(result.id)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  className="text-left hover:underline"
                                  onClick={() => setSelectedResultId(result.id)}
                                >
                                  {result.student?.matricNo ??
                                    result.studentId.slice(0, 8)}
                                </button>
                                <div className="text-xs text-muted-foreground">
                                  {result.student
                                    ? `${result.student.firstName} ${result.student.lastName}`
                                    : result.studentId}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {result.absentFromExam
                                  ? "ABS"
                                  : Number(result.score).toFixed(1)}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2 font-semibold",
                                  GRADE_COLORS[result.grade] ?? "",
                                )}
                              >
                                {result.grade}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs",
                                    STATUS_COLORS[result.status] ??
                                      "badge-neutral",
                                  )}
                                >
                                  {result.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {selectedResultId && (canAmend || canWithhold) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Controlled correction and withholding
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-3">
                {canAmend && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-semibold">
                      Amend published result
                    </p>
                    <input
                      aria-label="Amended score"
                      type="number"
                      min="0"
                      max="100"
                      value={amendScore}
                      onChange={(event) => setAmendScore(event.target.value)}
                      placeholder="New score"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                    <textarea
                      aria-label="Amendment reason"
                      value={amendReason}
                      onChange={(event) => setAmendReason(event.target.value)}
                      placeholder="Reason (minimum 10 characters)"
                      className="min-h-20 w-full rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <Button size="sm" loading={amending} onClick={handleAmend}>
                      Amend result
                    </Button>
                  </div>
                )}
                {canWithhold && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-semibold">
                      Withhold published result
                    </p>
                    <textarea
                      aria-label="Withholding reason"
                      value={withheldReason}
                      onChange={(event) =>
                        setWithheldReason(event.target.value)
                      }
                      placeholder="Reason (minimum 10 characters)"
                      className="min-h-20 w-full rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      loading={withholding}
                      onClick={handleWithhold}
                    >
                      Withhold result
                    </Button>
                  </div>
                )}
                {canWithhold && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-semibold">
                      Release withheld result
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The backend will restore the published state and
                      recalculate CGPA.
                    </p>
                    <Button
                      size="sm"
                      loading={releasing}
                      onClick={handleRelease}
                    >
                      Release result
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            <strong>Publication control:</strong> Senate publication updates
            Student.cgpa atomically in the same database transaction. Amendments
            and withholding use separate governed endpoints with recorded
            reasons.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
