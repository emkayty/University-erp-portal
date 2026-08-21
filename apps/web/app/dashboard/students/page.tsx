"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/erp/confirm-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useMatriculate,
  useStudents,
  useStudent,
  useRegisteredCourses,
  useAcademicHistory,
  useUpdateStudentProfile,
  useUpdateStudentStatus,
  useGraduationEligibility,
  useCreateGraduationCandidate,
  useApproveGraduation,
  useGraduateStudent,
} from "@/hooks/use-students";
import { useAuthStore } from "@/stores/auth.store";
import {
  useRunDegreeAudit,
  useRunProgressionEvaluation,
} from "@/hooks/use-academic";
import { cn, formatDate, formatNgn } from "@/lib/utils";
import { effectiveRolesOf, hasEffectiveRole } from "@/lib/authz";
import type { StudentV1 } from "@uniportal/types";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "badge-success",
  SUSPENDED: "badge-warning",
  WITHDRAWN: "badge-neutral",
  GRADUATED: "badge-info",
  DEFERRED: "badge-warning",
  REPEATING: "badge-neutral",
};

const matricSchema = z.object({
  applicantId: z.string().uuid("Valid applicant UUID required"),
  entryLevel: z.coerce.number().min(100).max(800).optional(),
  temporaryPassword: z.string().min(12).optional().or(z.literal("")),
});
type MatricForm = z.infer<typeof matricSchema>;

const searchSchema = z.object({ query: z.string().min(1) });
type SearchForm = z.infer<typeof searchSchema>;

export default function StudentsPage() {
  const searchParams = useSearchParams();
  const requestedStudentId = searchParams.get("studentId");
  const user = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? "";
  const canManage = hasEffectiveRole(user, "SUPER_ADMIN", "REGISTRAR");
  const canRecommendGraduation = hasEffectiveRole(
    user,
    "SUPER_ADMIN",
    "REGISTRAR",
    "HOD",
    "DEAN",
  );
  const canApproveGraduation = hasEffectiveRole(
    user,
    "SUPER_ADMIN",
    "REGISTRAR",
    "VC",
  );
  const canGraduate = hasEffectiveRole(user, "SUPER_ADMIN", "REGISTRAR");
  const isStudent = hasEffectiveRole(user, "STUDENT");

  const [tab, setTab] = useState<"list" | "profile" | "matriculate">("list");
  const [statusFilter, setStatus] = useState("");
  const [selectedId, setSelId] = useState(
    isStudent ? (user?.studentId ?? "") : (requestedStudentId ?? ""),
  );
  const [showMatric, setMatric] = useState(false);
  const [actionError, setError] = useState("");
  const [pendingStatusAction, setPendingStatusAction] = useState<{
    id: string;
    action: string;
    reason: string;
  } | null>(null);
  const [newMatricInfo, setNewMatric] = useState<{
    matricNo: string;
    tempPwd: string;
  } | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profilePhone, setProfilePhone] = useState("");
  const [pendingGraduationAction, setPendingGraduationAction] = useState<
    "candidate" | "approve" | "graduate" | null
  >(null);

  useEffect(() => {
    if (!isStudent && requestedStudentId) {
      setSelId(requestedStudentId);
      setTab("profile");
    }
  }, [isStudent, requestedStudentId]);

  const { data: students = [], isLoading } = useStudents({
    status: statusFilter || undefined,
    pageSize: 100,
  });
  const { data: student } = useStudent(selectedId);
  const { data: courses = [] } = useRegisteredCourses(selectedId);
  const { data: history = [] } = useAcademicHistory(selectedId);
  const {
    data: graduationEligibility,
    isLoading: graduationEligibilityLoading,
  } = useGraduationEligibility(selectedId);
  const { mutate: matriculate, isPending: matriculating } = useMatriculate();
  const createGraduationCandidate = useCreateGraduationCandidate();
  const approveGraduation = useApproveGraduation();
  const graduateStudent = useGraduateStudent();
  const runDegreeAudit = useRunDegreeAudit();
  const runProgression = useRunProgressionEvaluation();
  const { mutate: updateProfile, isPending: updatingProfile } =
    useUpdateStudentProfile();
  const { mutate: updateStatus, isPending: updatingStatus } =
    useUpdateStudentStatus();

  const matricForm = useForm<MatricForm>({
    resolver: zodResolver(matricSchema),
  });

  const handleMatriculate = matricForm.handleSubmit((data) => {
    setError("");
    matriculate(
      {
        applicantId: data.applicantId,
        entryLevel: data.entryLevel,
        temporaryPassword: data.temporaryPassword || undefined,
      },
      {
        onSuccess: (r) => {
          setNewMatric({
            matricNo: r.student.matricNo,
            tempPwd: r.temporaryPassword,
          });
          matricForm.reset();
          setMatric(false);
        },
        onError: (e) => setError(e.message),
      },
    );
  });

  const handleAction = (id: string, action: string) => {
    const requiresReason = ["SUSPENDED", "WITHDRAWN", "DEFERRED"].includes(
      action,
    );
    if (requiresReason) {
      setPendingStatusAction({ id, action, reason: "" });
      return;
    }
    setError("");
    updateStatus({ id, action }, { onError: (e) => setError(e.message) });
  };

  const confirmStatusAction = () => {
    if (!pendingStatusAction) return;
    const reason = pendingStatusAction.reason.trim();
    if (reason.length < 10) {
      setError(
        "Provide a reason of at least 10 characters before confirming this status change.",
      );
      return;
    }
    setError("");
    updateStatus(
      {
        id: pendingStatusAction.id,
        action: pendingStatusAction.action,
        reason,
      },
      {
        onSuccess: () => setPendingStatusAction(null),
        onError: (e) => setError(e.message),
      },
    );
  };

  const beginProfileEdit = (target: StudentV1) => {
    setProfilePhone(target.phone ?? "");
    setShowProfileEdit(true);
    setError("");
  };

  const saveProfile = () => {
    if (!selectedId) return;
    setError("");
    updateProfile(
      { id: selectedId, phone: profilePhone || undefined },
      {
        onSuccess: () => setShowProfileEdit(false),
        onError: (e) => setError(e.message),
      },
    );
  };

  const confirmGraduationAction = () => {
    if (!selectedId || !pendingGraduationAction) return;
    setError("");
    const onError = (error: Error) => setError(error.message);
    const onSuccess = () => setPendingGraduationAction(null);
    if (pendingGraduationAction === "candidate")
      createGraduationCandidate.mutate(selectedId, { onSuccess, onError });
    if (pendingGraduationAction === "approve")
      approveGraduation.mutate(selectedId, { onSuccess, onError });
    if (pendingGraduationAction === "graduate")
      graduateStudent.mutate(selectedId, { onSuccess, onError });
  };

  const graduationBusy =
    createGraduationCandidate.isPending ||
    approveGraduation.isPending ||
    graduateStudent.isPending ||
    runDegreeAudit.isPending ||
    runProgression.isPending;

  // Student self-view — show own profile immediately
  if (isStudent) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h2 className="text-xl font-semibold">My Academic Profile</h2>
        {student ? (
          <StudentDetailCard
            student={student}
            courses={courses}
            history={history}
          />
        ) : (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded bg-muted" />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          Student Records
        </h2>
        <div className="flex gap-2">
          {["list", "profile", "matriculate"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-[--color-primary] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]"
        >
          {actionError}
        </div>
      )}
      <ConfirmAction
        open={!!pendingStatusAction}
        title={`${pendingStatusAction?.action === "WITHDRAWN" ? "Withdraw" : pendingStatusAction?.action === "SUSPENDED" ? "Suspend" : "Defer"} student record`}
        description="This changes the student’s academic status and will be retained in the audit trail. Provide a clear operational reason before proceeding."
        confirmLabel="Confirm status change"
        destructive
        onCancel={() => setPendingStatusAction(null)}
        onConfirm={confirmStatusAction}
      >
        <label
          htmlFor="student-status-reason"
          className="block text-sm font-medium text-foreground"
        >
          Reason <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="student-status-reason"
          value={pendingStatusAction?.reason ?? ""}
          onChange={(e) =>
            setPendingStatusAction((current) =>
              current ? { ...current, reason: e.target.value } : current,
            )
          }
          minLength={10}
          rows={4}
          placeholder="Explain the operational basis for this decision (minimum 10 characters)."
          className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
        />
      </ConfirmAction>
      <ConfirmAction
        open={Boolean(pendingGraduationAction)}
        title={
          pendingGraduationAction === "candidate"
            ? "Create graduation candidate"
            : pendingGraduationAction === "approve"
              ? "Approve graduation candidate"
              : "Graduate student"
        }
        description={
          pendingGraduationAction === "graduate"
            ? "This will mark the student GRADUATED, close the academic history period, create the alumni record, and retain the decision in the audit trail."
            : "This is a governed academic lifecycle action. Confirm that the eligibility evidence and separation-of-duties requirements have been reviewed."
        }
        confirmLabel={
          pendingGraduationAction === "candidate"
            ? "Create candidate"
            : pendingGraduationAction === "approve"
              ? "Approve candidate"
              : "Graduate student"
        }
        destructive={pendingGraduationAction === "graduate"}
        onCancel={() => setPendingGraduationAction(null)}
        onConfirm={confirmGraduationAction}
      />

      {newMatricInfo && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:bg-green-950/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-200">
            ✓ Matriculation successful
          </p>
          <p className="text-sm text-green-700 mt-1">
            Matric No: <strong>{newMatricInfo.matricNo}</strong>
          </p>
          <p className="text-sm text-green-700">
            Temporary password:{" "}
            <strong className="font-mono">{newMatricInfo.tempPwd}</strong> —
            share securely with student
          </p>
          <button
            onClick={() => setNewMatric(null)}
            className="mt-2 text-xs text-green-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Matriculate tab ──────────────────────────────────────────────── */}
      {tab === "matriculate" && canManage && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Matriculate Applicant</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMatriculate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="applicantId" required>
                  Applicant ID
                </Label>
                <Input
                  id="applicantId"
                  placeholder="UUID of accepted applicant"
                  error={matricForm.formState.errors.applicantId?.message}
                  {...matricForm.register("applicantId")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entryLevel">Entry Level (default: 100)</Label>
                <Input
                  id="entryLevel"
                  type="number"
                  min={100}
                  max={800}
                  step={100}
                  placeholder="100"
                  {...matricForm.register("entryLevel")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temporaryPassword">
                  Temporary Password (optional — auto-generated if blank)
                </Label>
                <Input
                  id="temporaryPassword"
                  type="password"
                  placeholder="Min 12 chars"
                  {...matricForm.register("temporaryPassword")}
                />
              </div>
              <Button type="submit" loading={matriculating}>
                Matriculate Student
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── List tab ─────────────────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Statuses</option>
              {[
                "ACTIVE",
                "SUSPENDED",
                "WITHDRAWN",
                "GRADUATED",
                "DEFERRED",
                "REPEATING",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {[
                      "Matric No",
                      "Name",
                      "Programme",
                      "Level",
                      "CGPA",
                      "Fee",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No students found.
                      </td>
                    </tr>
                  )}
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelId(s.id);
                        setTab("profile");
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">
                        {s.matricNo}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[140px]">
                        {s.programmeCode ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{s.level}</td>
                      <td className="px-4 py-2.5 text-foreground font-medium">
                        {parseFloat(s.cgpa).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            s.feeCleared ? "badge-success" : "badge-danger",
                          )}
                        >
                          {s.feeCleared ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_COLORS[s.status] ?? "badge-neutral",
                          )}
                        >
                          {s.status}
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

      {/* ── Profile tab ──────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="space-y-4">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">
              Select a student from the list to view their profile.
            </p>
          ) : student ? (
            <>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => beginProfileEdit(student)}
                  >
                    Edit contact details
                  </Button>
                  {student.status === "ACTIVE" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={updatingStatus}
                        onClick={() => handleAction(student.id, "SUSPENDED")}
                      >
                        Suspend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={updatingStatus}
                        onClick={() => handleAction(student.id, "DEFERRED")}
                      >
                        Defer
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={updatingStatus}
                        onClick={() => handleAction(student.id, "WITHDRAWN")}
                      >
                        Withdraw
                      </Button>
                    </>
                  )}
                  {["SUSPENDED", "DEFERRED"].includes(student.status) && (
                    <Button
                      size="sm"
                      loading={updatingStatus}
                      onClick={() => handleAction(student.id, "REINSTATED")}
                    >
                      Reinstate
                    </Button>
                  )}
                </div>
              )}
              {canManage && showProfileEdit && (
                <Card className="border-[--color-primary]/30">
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Edit contact details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="student-phone">Phone number</Label>
                      <Input
                        id="student-phone"
                        value={profilePhone}
                        onChange={(event) =>
                          setProfilePhone(event.target.value)
                        }
                        maxLength={15}
                        placeholder="Institutional contact number"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button loading={updatingProfile} onClick={saveProfile}>
                        Save changes
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowProfileEdit(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Graduation readiness and governance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {graduationEligibilityLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Running the academic eligibility check…
                    </p>
                  ) : graduationEligibility ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">CGPA</span>
                          <p
                            className={cn(
                              "font-semibold",
                              graduationEligibility.cgpaOk
                                ? "text-green-700"
                                : "text-red-700",
                            )}
                          >
                            {graduationEligibility.cgpa.toFixed(2)}{" "}
                            {graduationEligibility.cgpaOk
                              ? "· pass"
                              : "· below floor"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Credits</span>
                          <p
                            className={cn(
                              "font-semibold",
                              graduationEligibility.creditUnitsOk
                                ? "text-green-700"
                                : "text-red-700",
                            )}
                          >
                            {graduationEligibility.totalCreditUnitsEarned}/
                            {graduationEligibility.minCreditUnitsRequired}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Compulsory courses
                          </span>
                          <p
                            className={cn(
                              "font-semibold",
                              graduationEligibility.compulsoryCoursesOk
                                ? "text-green-700"
                                : "text-red-700",
                            )}
                          >
                            {graduationEligibility.compulsoryCoursesOk
                              ? "Complete"
                              : `${graduationEligibility.missingCompulsoryCourses.length} missing`}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Academic eligibility
                          </span>
                          <p
                            className={cn(
                              "font-semibold",
                              graduationEligibility.eligible
                                ? "text-green-700"
                                : "text-red-700",
                            )}
                          >
                            {graduationEligibility.eligible
                              ? "Eligible"
                              : "Blocked"}
                          </p>
                        </div>
                      </div>
                      {graduationEligibility.missingCompulsoryCourses.length >
                        0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                          <p className="font-medium">
                            Outstanding compulsory courses
                          </p>
                          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                            {graduationEligibility.missingCompulsoryCourses.map(
                              (course) => (
                                <li key={course.courseId}>
                                  {course.code} · {course.title}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Eligibility evidence is not available for this student.
                    </p>
                  )}
                  {(canRecommendGraduation ||
                    canApproveGraduation ||
                    canGraduate) &&
                    student.status !== "GRADUATED" && (
                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        {canRecommendGraduation && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={graduationBusy}
                              onClick={() =>
                                runDegreeAudit.mutate(student.id, {
                                  onSuccess: () => setError(""),
                                  onError: (error) => setError(error.message),
                                })
                              }
                            >
                              Run degree audit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={graduationBusy}
                              onClick={() =>
                                runProgression.mutate(student.id, {
                                  onSuccess: () => setError(""),
                                  onError: (error) => setError(error.message),
                                })
                              }
                            >
                              Evaluate progression
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={graduationBusy}
                              onClick={() =>
                                setPendingGraduationAction("candidate")
                              }
                            >
                              Create candidate
                            </Button>
                          </>
                        )}
                        {canApproveGraduation && (
                          <Button
                            size="sm"
                            disabled={graduationBusy}
                            onClick={() =>
                              setPendingGraduationAction("approve")
                            }
                          >
                            Approve candidate
                          </Button>
                        )}
                        {canGraduate && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={
                              graduationBusy || !graduationEligibility?.eligible
                            }
                            onClick={() =>
                              setPendingGraduationAction("graduate")
                            }
                          >
                            Graduate student
                          </Button>
                        )}
                      </div>
                    )}
                  <p className="text-xs text-muted-foreground">
                    Academic eligibility is only one half of graduation.
                    Administrative clearance and independent approval remain
                    enforced by the backend before final graduation.
                  </p>
                </CardContent>
              </Card>
              <StudentDetailCard
                student={student}
                courses={courses}
                history={history}
              />
            </>
          ) : (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded bg-muted" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudentDetailCard({
  student,
  courses,
  history,
}: {
  student: StudentV1;
  courses: Array<{
    courseCode?: string;
    courseTitle?: string;
    creditUnits?: number;
    semester?: string;
  }>;
  history: Array<{
    academicYear: string;
    level: number;
    gpa: string | null;
    cgpa: string | null;
    status: string;
  }>;
}) {
  const cgpa = parseFloat(student.cgpa);
  const cgpaClass =
    cgpa >= 4.5
      ? "text-green-600"
      : cgpa >= 3.5
        ? "text-blue-600"
        : cgpa >= 2.4
          ? "text-amber-600"
          : "text-red-600";

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-[--color-primary]/10 text-xl font-bold text-[--color-primary]">
              {student.firstName[0]}
              {student.lastName[0]}
            </div>
            <div className="flex-1 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <strong>
                  {student.firstName} {student.middleName} {student.lastName}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Matric No:</span>{" "}
                <span className="font-mono text-[--color-primary]">
                  {student.matricNo}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Programme:</span>{" "}
                {student.programmeName ?? student.programmeCode}
              </div>
              <div>
                <span className="text-muted-foreground">Level:</span>{" "}
                {student.level}
              </div>
              <div>
                <span className="text-muted-foreground">Entry Year:</span>{" "}
                {student.entryAcademicYear}
              </div>
              <div>
                <span className="text-muted-foreground">Mode:</span>{" "}
                {student.modeOfStudy.replace("_", " ")}
              </div>
              <div>
                <span className="text-muted-foreground">CGPA:</span>{" "}
                <span className={cn("font-bold text-base", cgpaClass)}>
                  {cgpa.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Credit Units:</span>{" "}
                {student.totalCreditUnitsEarned}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_COLORS[student.status] ?? "",
                  )}
                >
                  {student.status}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Fees:</span>{" "}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    student.feeCleared ? "badge-success" : "badge-danger",
                  )}
                >
                  {student.feeCleared ? "Cleared" : "Outstanding"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current courses */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Registered Courses ({courses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No courses registered this semester.
            </p>
          ) : (
            <div className="space-y-1">
              {courses.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0"
                >
                  <span>
                    <span className="font-mono text-xs text-[--color-primary] mr-2">
                      {c.courseCode}
                    </span>
                    {c.courseTitle}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {c.creditUnits} CU · {c.semester}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Academic history */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Academic History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {["Year", "Level", "GPA", "CGPA", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-xs text-muted-foreground uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((h) => (
                    <tr key={`${h.academicYear}-${h.level}`}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {h.academicYear}
                      </td>
                      <td className="px-3 py-2">{h.level}</td>
                      <td className="px-3 py-2 font-medium">
                        {h.gpa ? parseFloat(h.gpa).toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {h.cgpa ? parseFloat(h.cgpa).toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            STATUS_COLORS[h.status] ?? "",
                          )}
                        >
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
